import { join } from "node:path";
import { existsSync } from "node:fs";
import type { AgentInfo } from "./types.js";

export const KNOWN_AGENTS: AgentInfo[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    supportsColonCommands: true,
    commandsDir: ".claude/commands/",
    interactiveTool: "askuserquestion",
    settingsFile: ".claude/settings.json",
    settingsContent: { worktree: { baseRef: "head" } },
    tier: "stable",
  },
  {
    id: "codex",
    label: "Codex",
    supportsColonCommands: false,
    commandsDir: ".codex/prompts/",
    globalOnly: true,
    interactiveTool: "none",
    tier: "experimental",
  },
  {
    id: "opencode",
    label: "OpenCode",
    supportsColonCommands: false,
    commandsDir: ".opencode/commands/",
    globalBase: ".config/opencode",
    interactiveTool: "question",
    tier: "experimental",
  },
  {
    id: "pi",
    label: "Pi",
    supportsColonCommands: false,
    commandsDir: ".pi/prompts/",
    globalBase: ".pi/agent",
    interactiveTool: "none",
    tier: "experimental",
  },
];

const COMMAND_IDS = [
  "start", "plan", "apply", "archive",
  "finish", "fix", "discard", "status",
];

function basePath(scope: "global" | "project", projectPath: string): string {
  if (scope === "global") {
    return process.env.HOME || process.env.USERPROFILE || "~";
  }
  return projectPath;
}

/** 获取 agent 的 base 目录:global scope 用 globalBase(如有),project 用 commandsDir 第一段 */
function getAgentBase(agent: AgentInfo, scope: "global" | "project"): string {
  if (scope === "global" && agent.globalBase) return agent.globalBase;
  return agent.commandsDir.split("/")[0];
}

/** 反向推导：检查哪些 agent 已有 alloy skill 部署 */
export function detectDeployedAgents(
  scope: "global" | "project",
  projectPath: string
): AgentInfo[] {
  const base = basePath(scope, projectPath);

  return KNOWN_AGENTS.filter((agent) => {
    const agentBase = getAgentBase(agent, scope);
    const skillFile = join(base, agentBase, "skills", "alloy-start", "SKILL.md");
    return existsSync(skillFile);
  });
}

/** 获取 agent skill 部署的目标路径（<agentBase>/skills/） */
export function getSkillTargetDir(
  agent: AgentInfo,
  scope: "global" | "project",
  projectPath: string
): string {
  const base = basePath(scope, projectPath);
  return join(base, getAgentBase(agent, scope), "skills");
}

export { COMMAND_IDS };

/**
 * Claude Code agent 单例引用(供 health.ts 等模块复用,避免重复定义)。
 * 直接引用 KNOWN_AGENTS 中的对象,agents.ts 配置变化时自动同步。
 */
const claudeCodeAgent = KNOWN_AGENTS.find((a) => a.id === "claude-code");
if (!claudeCodeAgent) {
  throw new Error("KNOWN_AGENTS 中未找到 claude-code agent,请检查 agents.ts 配置");
}
export const CLAUDE_CODE_AGENT = claudeCodeAgent;

/**
 * 运行时检测当前 agent 类型(通过环境变量)。
 * 用于 hook 适配:_stop-guard 等命令需要知道当前是哪个 agent,决定检测逻辑。
 *
 * 优先级:
 * 1. AI_AGENT 环境变量(格式 <agent-id>_<version>_agent,多 agent 工具通用规范)
 * 2. 各 agent 专属环境变量回退(已确认的 agent)
 *
 * 已确认的环境变量标记:
 * - Claude Code: AI_AGENT=claude-code_*_agent, CLAUDECODE=1
 *
 * 待确认(预计格式一致,但未实测):
 * - Codex / OpenCode / Pi: 需在各自环境跑 `env | grep -i agent` 确认
 */
export function detectAgent(): string {
  const aiAgent = process.env.AI_AGENT;
  if (aiAgent) {
    // 格式: claude-code_2-1-153_agent
    const match = aiAgent.match(/^(.+?)_[\d-]+_agent$/);
    if (match) return match[1];
    return aiAgent;
  }
  if (process.env.CLAUDECODE === "1") return "claude-code";
  return "unknown";
}
