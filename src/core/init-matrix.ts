// src/core/init-matrix.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import semver from "semver";
import { detectAlloySkillsVersion } from "./skills.js";
import {
  hasHookConfig,
  getHookSupportedAgents,
  hasPermissionsConfig,
  getPermissionSupportedAgents,
} from "./agent-config.js";
import { detectSkill } from "./detect-installations.js";
import { getPackageRoot } from "../utils/fs.js";
import type { AgentInfo } from "./types.js";

/** 单个 agent 的 5 类产物状态 */
export interface AgentProductStatus {
  agentId: string;
  agentLabel: string;
  alloySkills: {
    installed: boolean;
    version: string | null;
    canUpgrade: boolean;
    breaking: boolean;
  };
  opsxCommands: { installed: boolean };
  hook: { installed: boolean };
  permissions: { installed: boolean | null };
  superpowers: {
    installed: boolean;
    version: string | null;
    canUpgrade: boolean;
    breaking: boolean;
  };
}

/** init 矩阵:所有目标 agent 的产物状态集合 */
export interface InitMatrix {
  agents: AgentProductStatus[];
}

/** 读取当前 alloy 包版本(从 package.json) */
export function readPackageVersion(): string {
  const pkgPath = join(getPackageRoot(), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.version as string;
}

/**
 * 检测 init 矩阵:每个 agent 的 5 类产物状态。
 *
 * - alloySkills: 通过 .alloy-version 检测版本,判断升级/breaking
 * - opsxCommands: 检测 <base>/<agentBase>/commands/opsx 目录
 * - hook: 检测 PreToolUse hook 配置(仅支持 hook 的 agent)
 * - permissions: 检测 permissions.allow 配置(仅支持项目级 permissions 的 agent)
 * - superpowers: 检测 brainstorming skill(detectSkill 仅对 claude-code 有效)
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
    const skillsVersion = await detectAlloySkillsVersion(projectPath, agent, scope);
    const alloyInstalled = skillsVersion !== null;
    const alloyCanUpgrade =
      alloyInstalled && semver.lt(skillsVersion!, currentAlloyVersion);
    // 0.x 版本任何升级都是 breaking(semver 0.x 约定);1.x+ 仅跨 major 为 breaking
    const alloyBreaking =
      alloyCanUpgrade &&
      (semver.major(skillsVersion!) !== semver.major(currentAlloyVersion) ||
        semver.lt(skillsVersion!, "1.0.0"));

    // --- Superpowers 检测 ---
    // detectSkill 内部仅对 claude-code 有效,其他 agent 返回 NOT_FOUND
    const superpowersDetected = detectSkill("brainstorming", agent, projectPath);
    const spInstalled = superpowersDetected.found;
    const spVersion = superpowersDetected.version;
    // 5.x -> 6.x 是 breaking 升级(跨 major)
    const spCanUpgrade =
      spInstalled && spVersion !== null ? semver.lt(spVersion, "6.0.0") : false;
    const spBreaking = spCanUpgrade;

    // --- hook 检测(仅对支持 hook 闸门的 agent) ---
    const hookInstalled = hookSupportedAgents.includes(agent.id)
      ? await hasHookConfig(projectPath, agent.id)
      : false;

    // --- permissions 检测(仅对支持项目级 permissions 的 agent;不支持返回 null 显示"-") ---
    const permInstalled = permSupportedAgents.includes(agent.id)
      ? await hasPermissionsConfig(projectPath, agent.id)
      : null;

    // --- opsx commands 检测(claude-code 是 opsx/ 目录,opencode 等是 opsx-*.md 扁平文件) ---
    const commandsDir = join(base, agentBase, "commands");
    const opsxInstalled = existsSync(join(commandsDir, "opsx")) ||
      existsSync(join(commandsDir, "opsx-explore.md"));

    agents.push({
      agentId: agent.id,
      agentLabel: agent.label,
      alloySkills: {
        installed: alloyInstalled,
        version: skillsVersion,
        canUpgrade: alloyCanUpgrade,
        breaking: alloyBreaking,
      },
      opsxCommands: { installed: opsxInstalled },
      hook: { installed: hookInstalled },
      permissions: { installed: permInstalled },
      superpowers: {
        installed: spInstalled,
        version: spVersion,
        canUpgrade: spCanUpgrade,
        breaking: spBreaking,
      },
    });
  }
  return { agents };
}

/**
 * 判断版本变更是否为 breaking。
 *
 * semver 约定:
 * - major 变更(1.x -> 2.x)视为 breaking
 * - 0.x 阶段任何 minor 变更(0.3 -> 0.4)视为 breaking(0.x 约定)
 * - 同 major(>=1) 下 minor/patch 变更兼容
 *
 * @param oldVersion 旧版本号
 * @param newVersion 新版本号
 */
export function isBreakingChange(oldVersion: string, newVersion: string): boolean {
  const oldMajor = semver.major(oldVersion);
  const newMajor = semver.major(newVersion);
  if (oldMajor !== newMajor) return true;
  if (oldMajor === 0) return true; // 0.x 约定 breaking
  return false;
}

/**
 * 生成 breaking change 提示消息。
 *
 * @param oldVersion 旧版本号
 * @param newVersion 新版本号
 */
export function getBreakingChangeMessage(oldVersion: string, newVersion: string): string {
  if (semver.major(oldVersion) === 0 && semver.major(newVersion) === 0) {
    return `⚠️ breaking: ${oldVersion} -> ${newVersion}(semver 0.x 约定,breaking change)`;
  }
  return `⚠️ breaking: ${oldVersion} -> ${newVersion}(major 版本变更)`;
}

/**
 * 格式化单个版本化产物单元(alloySkills / superpowers)为单元格内容。
 *
 * 显示规则:
 * - 未安装: ✗
 * - 可升级且 breaking: ⚠️ {version}(breaking)
 * - 可升级非 breaking: ⚠️ {version}(可升级)
 * - 已装当前版本: ✓ {version}(version 为 null 时仅 ✓)
 *
 * @param status 版本化产物状态
 */
function formatCell(status: {
  installed: boolean;
  version: string | null;
  canUpgrade: boolean;
  breaking: boolean;
}): string {
  if (!status.installed) return "✗";
  if (status.canUpgrade) {
    return status.breaking
      ? `⚠️ ${status.version}(breaking)`
      : `⚠️ ${status.version}(可升级)`;
  }
  return `✓ ${status.version ?? ""}`.trim();
}

/**
 * 格式化 init 矩阵为多行显示(markdown 表格)。
 *
 * 输出结构:
 * 1. 标题行: "agent 级产物状态:"
 * 2. 表头行: 6 列(agent + 5 类产物)
 * 3. 分隔行
 * 4+. 每个 agent 一行
 *
 * 产物列单元格格式见 formatCell;opsx/hook/permissions 仅显示 ✓/✗。
 *
 * @param matrix init 矩阵
 * @returns 多行字符串数组
 */
/** 计算字符串显示宽度(中文/全角占 2,英文占 1) */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1;
  }
  return w;
}

/** 按显示宽度 padEnd(中文补偿) */
function padEndDisplay(s: string, width: number): string {
  const pad = width - displayWidth(s);
  return pad > 0 ? s + " ".repeat(pad) : s;
}

export function formatInitMatrix(matrix: InitMatrix): string[] {
  const lines: string[] = [];
  lines.push("agent 级产物当前状态:");

  const headers = ["agent", "alloy skills", "opsx commands", "hook", "permissions", "Superpowers"];
  const rows = matrix.agents.map(a => [
    a.agentLabel,
    formatCell(a.alloySkills),
    a.opsxCommands.installed ? "✓" : "✗",
    a.hook.installed ? "✓" : "✗",
    a.permissions.installed === null ? "-" : (a.permissions.installed ? "✓" : "✗"),
    formatCell(a.superpowers),
  ]);

  // 计算每列最大显示宽度
  const colWidths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map(r => displayWidth(r[i])), 0);
    return Math.max(displayWidth(h), maxRow);
  });

  lines.push("| " + headers.map((h, i) => padEndDisplay(h, colWidths[i])).join(" | ") + " |");
  lines.push("| " + colWidths.map(w => "-".repeat(w)).join(" | ") + " |");
  for (const row of rows) {
    lines.push("| " + row.map((cell, i) => padEndDisplay(cell, colWidths[i])).join(" | ") + " |");
  }
  return lines;
}
