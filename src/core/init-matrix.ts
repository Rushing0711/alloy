// src/core/init-matrix.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import semver from "semver";
import { detectAlloySkillsVersion } from "./skills.js";
import { getSkillTargetDir } from "./agents.js";
import {
  hasHookConfig,
  getHookSupportedAgents,
  hasPermissionsConfig,
  getPermissionSupportedAgents,
} from "./agent-config.js";
import { detectSkill } from "./detect-installations.js";
import { loadCompat } from "./compat.js";
import { getPackageRoot } from "../utils/fs.js";
import type { AgentInfo } from "./types.js";

/** 单个 agent 的 4 类产物状态(opsx 为项目级资源,不按 agent 维度展示) */
export interface AgentProductStatus {
  agentId: string;
  agentLabel: string;
  alloySkills: {
    installed: boolean;
    version: string | null;
    location: "project" | "global" | null;
    path: string | null;
    canUpgrade: boolean;
    breaking: boolean;
  };
  hook: { installed: boolean };
  permissions: { installed: boolean | null };
  superpowers: {
    installed: boolean;
    version: string | null;
    location: "project-skill" | "user-skill" | "user-plugin" | null;
    path: string | null;
    canUpgrade: boolean;
    breaking: boolean;
  };
}

/** init 矩阵:所有目标 agent 的产物状态集合 + 项目级 opsx 汇总 */
export interface InitMatrix {
  agents: AgentProductStatus[];
  opsxCommands: { installed: boolean; paths: string[] };
}

/** 读取当前 alloy 包版本(从 package.json) */
export function readPackageVersion(): string {
  const pkgPath = join(getPackageRoot(), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.version as string;
}

/**
 * 检测 init 矩阵:每个 agent 的 4 类产物状态 + 项目级 opsx 汇总。
 *
 * - alloySkills: 通过 .alloy-version 检测版本,判断升级/breaking
 * - hook: 检测 PreToolUse hook 配置(仅支持 hook 的 agent)
 * - permissions: 检测 permissions.allow 配置(仅支持项目级 permissions 的 agent)
 * - superpowers: 检测 brainstorming skill。所有 agent 都读 ~/.agents/skills/(共享),
 *   Claude Code 额外通过 ~/.claude/skills/ 符号链接读取。~/.agents/skills/ 存在时
 *   所有 agent 都算"已装"(显示"✓ 全局共享"),详见 docs/reference/agent-instruction-files.md §7 FAQ
 * - opsxCommands(项目级汇总): 所有目标 agent 的 opsx 路径都存在才算 installed。
 *   OpenSpec CLI 不支持 global,alloy 用 targetPath=home 模拟;Pi 的全局路径
 *   ~/.pi/prompts/ 非 Pi 实际读取的 ~/.pi/agent/prompts/,是已知限制
 *
 * scope=global 时,opsx 检测 base 为 HOME;hook/permissions 始终检测 projectPath(项目级配置)。
 *
 * @param projectPath 项目根路径
 * @param targetAgents 目标 agent 列表
 * @param scope 安装范围(global 读 HOME,project 读 projectPath)
 */
export async function detectInitMatrix(
  projectPath: string,
  targetAgents: AgentInfo[],
  scope: "global" | "project"
): Promise<InitMatrix> {
  const currentAlloyVersion = readPackageVersion();
  // 读取 compat.yaml(alloy 包根目录),用于 breaking 判断
  const compat = await loadCompat(getPackageRoot());
  const alloyConstraint = compat.compatible.alloy;        // ">=0.3.0"
  const spConstraint = compat.compatible.superpowers;     // ">=5.0.0 <7.0.0"
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const base = scope === "global" ? home : projectPath;
  const hookSupportedAgents = getHookSupportedAgents();
  const permSupportedAgents = getPermissionSupportedAgents();

  const agents: AgentProductStatus[] = [];
  for (const agent of targetAgents) {
    const agentBase =
      scope === "global" && agent.globalBase
        ? agent.globalBase
        : agent.commandsDir.split("/")[0];

    // --- alloy skills 版本检测 ---
    // 严格按 scope 检测:project 只查项目级,global 只查全局(不 fallback)
    // 理由:scope 选择决定安装位置,检测也应按 scope;即使另一处已装,仍按本次 scope 安装(版本可能不同)
    const skillsVersion = await detectAlloySkillsVersion(projectPath, agent, scope);
    const alloyLocation: "project" | "global" | null =
      skillsVersion !== null ? (scope === "global" ? "global" : "project") : null;
    const alloyPath: string | null =
      skillsVersion !== null ? getSkillTargetDir(agent, scope, projectPath) : null;
    const alloyInstalled = skillsVersion !== null;
    const alloyCanUpgrade =
      alloyInstalled && semver.lt(skillsVersion!, currentAlloyVersion);
    // breaking:已装版本不满足 compat.yaml 的 alloy 约束(废弃 0.x 约定/跨 major 判断)
    const alloyBreaking =
      alloyInstalled && !semver.satisfies(skillsVersion!, alloyConstraint);

    // --- Superpowers 检测 ---
    // 所有 agent 都读 ~/.agents/skills/(共享),Claude Code 额外读 ~/.claude/skills/(符号链接)
    // scope=global 时只查用户级路径(传 scope 给 detectSkill 跳过项目级)
    const superpowersDetected = detectSkill("brainstorming", agent, projectPath, scope);
    const spInstalled = superpowersDetected.found;
    const spVersion = superpowersDetected.version;
    // canUpgrade:已装版本低于当前 install.superpowers 目标版本(6.x)
    const spCanUpgrade =
      spInstalled && spVersion !== null ? semver.lt(spVersion, "6.0.0") : false;
    // breaking:已装版本不满足 compat.yaml 的 superpowers 约束(含低于最低和高于最高)
    const spBreaking =
      spInstalled && spVersion !== null ? !semver.satisfies(spVersion, spConstraint) : false;

    // --- hook 检测(仅对支持 hook 闸门的 agent) ---
    const hookInstalled = hookSupportedAgents.includes(agent.id)
      ? await hasHookConfig(projectPath, agent.id)
      : false;

    // --- permissions 检测(仅对支持项目级 permissions 的 agent;不支持返回 null 显示"-") ---
    const permInstalled = permSupportedAgents.includes(agent.id)
      ? await hasPermissionsConfig(projectPath, agent.id)
      : null;

    agents.push({
      agentId: agent.id,
      agentLabel: agent.label,
      alloySkills: {
        installed: alloyInstalled,
        version: skillsVersion,
        location: alloyLocation,
        path: alloyPath,
        canUpgrade: alloyCanUpgrade,
        breaking: alloyBreaking,
      },
      hook: { installed: hookInstalled },
      permissions: { installed: permInstalled },
      superpowers: {
        installed: spInstalled,
        version: spVersion,
        location: superpowersDetected.location,
        path: superpowersDetected.path,
        canUpgrade: spCanUpgrade,
        breaking: spBreaking,
      },
    });
  }
  // 项目级 opsx 汇总:所有目标 agent 的 opsx 路径都存在才算 installed
  const opsxCommands = detectOpsxCommands(targetAgents, base, home);
  return { agents, opsxCommands };
}

/**
 * 项目级 opsx commands 汇总检测。
 *
 * OpenSpec CLI 一次性给所有目标 agent 装 commands(`openspec init --tools a,b,c,d`),
 * 所以 opsx 不是 per-agent 产物,而是项目级资源。检测逻辑:所有目标 agent 的 opsx 路径
 * 都存在才算 installed(任一缺失则 action=install,重跑 openspec init 覆盖安装)。
 *
 * 路径推导(与 OpenSpec CLI adapter 对齐): * - Claude Code: <base>/.claude/commands/opsx/ 或 <base>/.claude/commands/opsx-explore.md
 * - OpenCode: <base>/.opencode/commands/opsx-*.md
 * - Pi: <base>/.pi/prompts/opsx-*.md(scope=global 时 base=home,但 Pi 实际读 ~/.pi/agent/prompts/,已知限制)
 *
 * @param targetAgents 目标 agent 列表
 * @param base 检测 base(scope=global 时为 home,project 时为 projectPath)
 * @param home HOME 路径
 */
function detectOpsxCommands(
  targetAgents: AgentInfo[],
  base: string,
  home: string
): { installed: boolean; paths: string[] } {
  if (targetAgents.length === 0) {
    return { installed: false, paths: [] };
  }
  const paths: string[] = [];
  let allInstalled = true;
  for (const agent of targetAgents) {
    let opsxPath: string | null = null;
    let opsxInstalled: boolean;
    const agentBase = agent.commandsDir.split("/")[0];
    const commandsSubdir = agent.commandsDir.split("/")[1] || "commands";
    const commandsDir = join(base, agentBase, commandsSubdir);
    const opsxDir = join(commandsDir, "opsx");
    const opsxFile = join(commandsDir, "opsx-explore.md");
    if (existsSync(opsxDir)) {
      opsxInstalled = true;
      opsxPath = opsxDir;
    } else if (existsSync(opsxFile)) {
      opsxInstalled = true;
      opsxPath = opsxFile;
    } else {
      opsxInstalled = false;
    }
    if (opsxInstalled && opsxPath) {
      paths.push(opsxPath);
    } else {
      allInstalled = false;
    }
  }
  return { installed: allInstalled, paths };
}

