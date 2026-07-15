// src/core/precheck.ts
// Skill/Command 预检纯逻辑:检测指定 cmd 和 skill 是否在目标 agent 的路径里就绪。
// 多 agent 适配:按 targetAgents 遍历,每个 agent 用各自的 commands/skills 路径检测。
//
// cmd 名归一化:
// - 声明格式 opsx/explore(斜杠,Claude Code 子目录风格)
// - 实际文件名可能是 opsx/explore.md(Claude Code 子目录)或 opsx-explore.md(横线,所有 agent 通用)
// - 两种格式都查,任一存在即视为就绪
//
// 被 alloy _precheck 命令调用,也被 skill md 里的 bash 预检脚本替代(原 skill-precheck.md 写死 .claude/ 路径,不支持多 agent)。
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentInfo } from "./types.js";
import { getCommandsTargetDir, getSkillTargetDir } from "./agents.js";
import { detectSkill } from "./detect-installations.js";

export interface PrecheckInput {
  /** 要检测的 cmd 列表(声明格式,如 "opsx/explore"、"opsx/new") */
  cmds: string[];
  /** 要检测的 skill 列表(如 "brainstorming"、"writing-plans") */
  skills: string[];
  /** 项目路径 */
  projectPath: string;
  /** 目标 agent 列表(从 openspec/config.yaml 的 target_agents 读) */
  targetAgents: AgentInfo[];
}

export interface PrecheckResult {
  /** exit code:0=全部就绪,1=有缺失 */
  exitCode: number;
  /** 缺失项(按 agent 分组) */
  missing: { agent: string; cmds: string[]; skills: string[] }[];
  /** 已就绪项(按 agent 分组,供输出 ✓ 清单) */
  found: { agent: string; cmds: string[]; skills: string[] }[];
  /** openspec CLI 是否就绪 */
  openspecCliReady: boolean;
}

/** 把 cmd 声明名(opsx/explore)转为可能的目标文件名候选:
 * - 横线格式:opsx-explore.md(所有 agent 通用)
 * - 斜杠格式:opsx/explore.md(Claude Code 子目录风格)
 * 两种都查,任一存在即视为就绪。 */
function cmdFileCandidates(cmd: string): string[] {
  const normalized = cmd.replace(/^\//, "").replace(/\/$/, "");
  const hyphenName = normalized.replace(/\//g, "-") + ".md";
  const slashName = normalized + ".md";
  return [hyphenName, slashName];
}

/** 把 cmd 声明名(opsx/explore)转为 skill 名候选(delivery=both 时 OpenSpec CLI 装的 skill)。
 * OpenSpec CLI 的 skill 命名规律:openspec-<workflow>[-change]
 * - opsx/explore -> openspec-explore
 * - opsx/new -> openspec-new-change
 * - opsx/continue -> openspec-continue-change
 * - opsx/verify -> openspec-verify-change
 * - opsx/archive -> openspec-archive-change
 * 这里返回可能的 skill 目录名,任一存在即视为就绪。 */
function cmdSkillDirCandidates(cmd: string): string[] {
  const normalized = cmd.replace(/^\//, "").replace(/\/$/, "");
  const workflow = normalized.replace(/\//g, "-"); // opsx/explore -> opsx-explore
  // 映射 opsx-<wf> -> openspec-<wf>[-change]
  // OpenSpec CLI 的命名不统一(explore 无 -change,其他有),两种都查
  if (workflow.startsWith("opsx-")) {
    const wf = workflow.slice(5); // explore / new / continue / verify / archive ...
    return [`openspec-${wf}`, `openspec-${wf}-change`];
  }
  return [];
}

/** 检测单个 cmd 在指定 agent + scope 下是否就绪。
 * 查 project 级 + global 级(HOME)的 commands 目录 + skills 目录(delivery=both 时 skill 也装)。 */
function isCmdReady(cmd: string, agent: AgentInfo, projectPath: string): boolean {
  const fileCandidates = cmdFileCandidates(cmd);
  const skillCandidates = cmdSkillDirCandidates(cmd);

  // project 级 commands
  const projectCommandsDir = getCommandsTargetDir(agent, "project", projectPath);
  for (const name of fileCandidates) {
    if (existsSync(join(projectCommandsDir, name))) return true;
  }
  // project 级 skills(delivery=both)
  const projectSkillsDir = getSkillTargetDir(agent, "project", projectPath);
  for (const name of skillCandidates) {
    if (existsSync(join(projectSkillsDir, name, "SKILL.md"))) return true;
  }
  // global 级 commands(HOME)
  const globalCommandsDir = getCommandsTargetDir(agent, "global", projectPath);
  for (const name of fileCandidates) {
    if (existsSync(join(globalCommandsDir, name))) return true;
  }
  // global 级 skills
  const globalSkillsDir = getSkillTargetDir(agent, "global", projectPath);
  for (const name of skillCandidates) {
    if (existsSync(join(globalSkillsDir, name, "SKILL.md"))) return true;
  }
  return false;
}

/** 检测 openspec CLI 是否可用(opsx 命令依赖 openspec 二进制) */
function isOpenspecCliReady(): boolean {
  try {
    execSync("command -v openspec", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** 预检纯逻辑:遍历 targetAgents,检测每个 agent 的 cmd + skill 就绪状态。
 * 不输出到 stdout,不 exit--由命令层负责。 */
export function evaluatePrecheck(input: PrecheckInput): PrecheckResult {
  const { cmds, skills, projectPath, targetAgents } = input;
  const missing: { agent: string; cmds: string[]; skills: string[] }[] = [];
  const found: { agent: string; cmds: string[]; skills: string[] }[] = [];
  const openspecCliReady = isOpenspecCliReady();

  for (const agent of targetAgents) {
    const agentMissing: { agent: string; cmds: string[]; skills: string[] } = { agent: agent.id, cmds: [], skills: [] };
    const agentFound: { agent: string; cmds: string[]; skills: string[] } = { agent: agent.id, cmds: [], skills: [] };

    // 检测 cmds
    for (const cmd of cmds) {
      if (isCmdReady(cmd, agent, projectPath)) {
        agentFound.cmds.push(cmd);
      } else {
        agentMissing.cmds.push(cmd);
      }
    }

    // 检测 skills(复用 detectSkill,已多 agent 适配)
    for (const skill of skills) {
      const detected = detectSkill(skill, agent, projectPath);
      if (detected.found) {
        agentFound.skills.push(skill);
      } else {
        agentMissing.skills.push(skill);
      }
    }

    found.push(agentFound);
    if (agentMissing.cmds.length > 0 || agentMissing.skills.length > 0) {
      missing.push(agentMissing);
    }
  }

  const hasMissing = missing.length > 0 || !openspecCliReady;
  return {
    exitCode: hasMissing ? 1 : 0,
    missing,
    found,
    openspecCliReady,
  };
}

/** 格式化预检结果为可读文本(供命令层输出) */
export function formatPrecheckResult(result: PrecheckResult): string {
  const lines: string[] = [];

  // openspec CLI
  if (result.openspecCliReady) {
    lines.push("  ✓ openspec CLI");
  } else {
    lines.push("  ✗ openspec CLI - 未安装");
    lines.push("    安装: npm install -g @fission-ai/openspec@1");
  }

  // 按 agent 输出
  for (const f of result.found) {
    const agent = f.agent;
    // cmds
    for (const cmd of f.cmds) {
      lines.push(`  ✓ ${agent}: ${cmd}`);
    }
    for (const cmd of result.missing.find(m => m.agent === agent)?.cmds ?? []) {
      lines.push(`  ✗ ${agent}: ${cmd} - 未找到`);
    }
    // skills
    for (const skill of f.skills) {
      lines.push(`  ✓ ${agent}: ${skill}`);
    }
    for (const skill of result.missing.find(m => m.agent === agent)?.skills ?? []) {
      lines.push(`  ✗ ${agent}: ${skill} - 未找到`);
    }
  }

  // 引导信息
  if (result.exitCode !== 0) {
    lines.push("");
    lines.push("  需要先完成环境初始化。请运行: alloy init");
  }

  return lines.join("\n");
}
