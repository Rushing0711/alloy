import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { AgentId, AgentInfo } from "./types.js";

export const KNOWN_AGENTS: AgentInfo[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    supportsColonCommands: true,
    commandsDir: ".claude/commands/",
    interactiveTool: "askuserquestion",
    settingsFile: ".claude/settings.json",
    settingsContent: { worktree: { baseRef: "head" } },
  },
  {
    id: "opencode",
    label: "OpenCode",
    supportsColonCommands: false,
    commandsDir: ".opencode/commands/",
    globalBase: ".config/opencode",
    interactiveTool: "question",
  },
  {
    id: "pi",
    label: "Pi",
    supportsColonCommands: false,
    commandsDir: ".pi/prompts/",
    globalBase: ".pi/agent",
    interactiveTool: "alloy-question",
  },
];

/**
 * 检测当前 alloy CLI 被哪个 agent 调用。
 *
 * 优先级:
 * 0. AI_AGENT 环境变量(格式 <agent-id>_<version>_agent,多 agent 工具通用规范)--最优先
 * 1. agent 运行时自注入 env--Claude Code/OpenCode/Pi 三个 agent 启动时给子进程注入标识 env
 *
 * 兜底:无法确定时返回 null(调用方按工具参数名兼容取 file_path ?? filePath ?? path)。
 *
 * 证据见 docs/reference/agent-instruction-files.md §14。
 */
export function detectAgent(env: Record<string, string | undefined> = process.env): AgentId | null {
  // 0 层:AI_AGENT 通用规范(格式 <agent-id>_<version>_agent)
  const aiAgent = env.AI_AGENT;
  if (aiAgent) {
    const match = aiAgent.match(/^(.+?)_[\d-]+_agent$/);
    const id = match ? match[1] : aiAgent;
    if (id === "claude-code" || id === "opencode" || id === "pi") return id;
    // AI_AGENT 是已知 3 个 agent 之外的值,无法识别,走兜底
  }
  // A 层:agent 运行时自注入 env(优先,最可靠)
  if (env.CLAUDECODE === "1") return "claude-code";
  if (env.OPENCODE === "1") return "opencode";
  if (env.PI_CODING_AGENT === "true") return "pi";
  // 兜底:无法确定
  return null;
}

const COMMAND_IDS = [
  "start", "plan", "apply", "archive",
  "finish", "fix", "discard", "status",
];

function basePath(scope: "global" | "project", projectPath: string): string {
  if (scope === "global") {
    return homedir();
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

/** 获取 agent commands 部署的目标路径（<agentBase>/<commandsSubdir>/）
 * 与 getSkillTargetDir 对称,用于部署 command wrapper 等命令文件。
 * commandsSubdir 取 commandsDir 的第二段(如 .opencode/commands/ -> commands) */
export function getCommandsTargetDir(
  agent: AgentInfo,
  scope: "global" | "project",
  projectPath: string
): string {
  const base = basePath(scope, projectPath);
  const commandsSubdir = agent.commandsDir.split("/")[1] || "commands";
  return join(base, getAgentBase(agent, scope), commandsSubdir);
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
