import { join } from "node:path";
import { existsSync } from "node:fs";
import type { AgentInfo } from "./types.js";

export const KNOWN_AGENTS: AgentInfo[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    supportsColonCommands: true,
    commandsDir: ".claude/commands/",
  },
  {
    id: "codebuddy",
    label: "CodeBuddy",
    supportsColonCommands: true,
    commandsDir: ".codebuddy/commands/",
  },
  {
    id: "qoder",
    label: "Qoder",
    supportsColonCommands: true,
    commandsDir: ".qoder/commands/",
  },
  {
    id: "cursor",
    label: "Cursor",
    supportsColonCommands: false,
    commandsDir: ".cursor/commands/",
  },
  {
    id: "opencode",
    label: "OpenCode",
    supportsColonCommands: false,
    commandsDir: ".opencode/commands/",
  },
  {
    id: "codex",
    label: "Codex",
    supportsColonCommands: false,
    commandsDir: ".codex/prompts/",
    globalOnly: true,
  },
  {
    id: "trae",
    label: "Trae",
    supportsColonCommands: false,
    commandsDir: ".trae/commands/",
  },
  {
    id: "pi",
    label: "Pi",
    supportsColonCommands: false,
    commandsDir: ".pi/prompts/",
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

/** 反向推导：检查哪些 agent 已有 alloy command 部署 */
export function detectDeployedAgents(
  scope: "global" | "project",
  projectPath: string
): AgentInfo[] {
  const base = basePath(scope, projectPath);

  return KNOWN_AGENTS.filter((agent) => {
    const dir = join(base, agent.commandsDir);

    if (agent.supportsColonCommands) {
      const alloyDir = join(dir, "alloy");
      return existsSync(alloyDir) && existsSync(join(alloyDir, "start.md"));
    }

    return existsSync(join(dir, "alloy-start.md"));
  });
}

/** 获取 agent command 部署的目标路径 */
export function getCommandTargetDir(
  agent: AgentInfo,
  scope: "global" | "project",
  projectPath: string
): string {
  const base = basePath(scope, projectPath);
  if (agent.supportsColonCommands) {
    return join(base, agent.commandsDir, "alloy");
  }
  return join(base, agent.commandsDir);
}

export { COMMAND_IDS };
