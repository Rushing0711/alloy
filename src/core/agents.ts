import { join } from "node:path";
import { existsSync } from "node:fs";
import type { AgentInfo } from "./types.js";

// supportsColonCommands 字段判定依据：
// - true  表示该 agent 支持子目录冒号命名（.xxx/commands/alloy/start.md → /alloy:start）
// - false 表示该 agent 仅支持文件名横线命名（.xxx/commands/alloy-start.md → /alloy-start）
//
// 判定来源（2026-06 核实）：
// - OpenSpec adapters（@fission-ai/openspec 的 command-generation/adapters/*.js）的 getFilePath 实现
// - 各 agent 官方文档（见每条注释）
// - 无动态探测：agent 的命令命名规则是平台固定的，硬编码维护
//
// 注意：Cursor 实际上两种格式都支持（子目录冒号 + 文件名横线），此处选 false 是
// Alloy 的统一风格选择（横线版 agent 一律用文件名命名），非能力限制。
export const KNOWN_AGENTS: AgentInfo[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    supportsColonCommands: true,  // 原生支持冒号命名空间，子目录结构 .claude/commands/alloy/start.md → /alloy:start
    commandsDir: ".claude/commands/",
  },
  {
    id: "codebuddy",
    label: "CodeBuddy",
    supportsColonCommands: true,  // 仿 Claude Code 机制，子目录冒号命名（依据：OpenSpec adapter）
    commandsDir: ".codebuddy/commands/",
  },
  {
    id: "qoder",
    label: "Qoder",
    supportsColonCommands: true,  // 仿 Claude Code 机制，子目录冒号命名（依据：OpenSpec adapter）
    commandsDir: ".qoder/commands/",
  },
  {
    id: "cursor",
    label: "Cursor",
    supportsColonCommands: false,  // 两种格式都支持，Alloy 统一选横线（依据：cursor.com/docs 确认子目录冒号机制存在）
    commandsDir: ".cursor/commands/",
  },
  {
    id: "opencode",
    label: "OpenCode",
    supportsColonCommands: false,  // 支持自定义命令，但命名规则是文件名直接映射（test.md → /test），无子目录冒号机制（依据：opencode.ai/docs/commands）
    commandsDir: ".opencode/commands/",
  },
  {
    id: "codex",
    label: "Codex",
    supportsColonCommands: false,  // 内置命令均横线，自定义命令文档未覆盖冒号（依据：OpenSpec adapter + developers.openai.com/codex）
    commandsDir: ".codex/prompts/",
    globalOnly: true,
  },
  {
    id: "trae",
    label: "Trae",
    supportsColonCommands: false,  // 无明确官方文档，沿用横线（依据：经验判断，待官方文档确认）
    commandsDir: ".trae/commands/",
  },
  {
    id: "pi",
    label: "Pi",
    supportsColonCommands: false,  // OpenSpec adapter 用横线，body 内 /opsx: 引用转为 /opsx-（依据：OpenSpec adapter）
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
