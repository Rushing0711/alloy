// src/core/agent-config.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentInfo, DeployOptions } from "./types.js";

export const INJECTION_MARKER_START = "<!-- ALLOY-WORKFLOW:START -->";
export const INJECTION_MARKER_END = "<!-- ALLOY-WORKFLOW:END -->";

export type InjectDepth = "low" | "medium" | "high";

function buildCommandList(agent: AgentInfo, isSharedFile: boolean): string {
  // 共享指令文件被多个 agent 使用，命令名风格可能不一致（冒号 vs 横线）。
  // 双行并列两种风格，让 agent 按自己实际部署的命令名识别可用那个。
  if (isSharedFile) {
    return [
      "常用命令：",
      `- /alloy:start 或 /alloy-start [topic] - 智能入口`,
      `- /alloy:plan 或 /alloy-plan [name] - 制品规划`,
      `- /alloy:apply 或 /alloy-apply [name] - 执行实现`,
      `- /alloy:archive 或 /alloy-archive [name] - 归档与收尾`,
      `- /alloy:finish 或 /alloy-finish [name] - 独立收尾`,
      `- /alloy:fix 或 /alloy-fix - Bug 修复`,
      `- /alloy:status 或 /alloy-status [name] - 查看状态`,
    ].join("\n");
  }
  const sep = agent.supportsColonCommands ? ":" : "-";
  return [
    "常用命令：",
    `- /alloy${sep}start [topic] - 智能入口`,
    `- /alloy${sep}plan [name] - 制品规划`,
    `- /alloy${sep}apply [name] - 执行实现`,
    `- /alloy${sep}archive [name] - 归档与收尾`,
    `- /alloy${sep}finish [name] - 独立收尾`,
    `- /alloy${sep}fix - Bug 修复`,
    `- /alloy${sep}status [name] - 查看状态`,
  ].join("\n");
}

function buildInteractionRule(agent: AgentInfo, isSharedFile: boolean): string {
  if (isSharedFile) {
    return "USER_GATE 节点优先用交互选择工具，不支持则用纯文本列表让用户回复";
  }
  switch (agent.interactiveTool) {
    case "askuserquestion":
      return "USER_GATE 节点必须用交互选择工具（AskUserQuestion），禁纯文本 (a)(b)(c)";
    case "question":
      return "USER_GATE 节点必须用交互选择工具（question），禁纯文本 (a)(b)(c)";
    case "partial":
      return 'USER_GATE 节点优先用"提问"工具，若不支持选项则用纯文本列表让用户回复';
    case "none":
    default:
      return "USER_GATE 节点用纯文本列出选项让用户回复（该 agent 无专用交互选择工具）";
  }
}

function buildIronLaws(agent: AgentInfo, depth: InjectDepth, isSharedFile: boolean): string[] {
  const laws: string[] = [buildInteractionRule(agent, isSharedFile)];
  if (depth === "medium" || depth === "high") {
    laws.push("阶段转换必须通过 `alloy _guard` 校验，禁手动改 phase");
    laws.push("禁止直接编辑制品文件，必须用 `alloy _artifact commit`");
  }
  if (depth === "high") {
    laws.push("禁 `git reset --hard` / `git checkout .` / `git stash` / `git clean -fd`");
    laws.push("`git add` 限路径，禁 `-A`/`-a`/`.`");
  }
  return laws;
}

function buildPhaseFlow(): string {
  return [
    "",
    "### 阶段流转",
    "started → planned → applied → archived → finished",
  ].join("\n");
}

export function buildInjectionContent(
  agent: AgentInfo,
  depth: InjectDepth,
  isSharedFile: boolean
): string {
  const lines: string[] = [
    INJECTION_MARKER_START,
    "## Alloy 工作流",
    "",
    "本项目使用 [Alloy](https://github.com/Rushing0711/alloy) 管理开发工作流。",
    "",
    buildCommandList(agent, isSharedFile),
    "",
    "### 核心规则",
  ];
  for (const law of buildIronLaws(agent, depth, isSharedFile)) {
    lines.push(`- ${law}`);
  }
  if (depth === "high") {
    lines.push(buildPhaseFlow());
  }
  lines.push(INJECTION_MARKER_END);
  return lines.join("\n");
}

function buildMdcFrontmatter(): string {
  return [
    "---",
    "description: Alloy 开发工作流规则",
    'globs: ["**/*"]',
    "alwaysApply: true",
    "---",
  ].join("\n");
}

function replaceInjectionBlock(content: string, newBlock: string): string {
  if (content.includes(INJECTION_MARKER_START)) {
    const startIdx = content.indexOf(INJECTION_MARKER_START);
    const endIdx = content.indexOf(INJECTION_MARKER_END);
    if (endIdx > startIdx) {
      return (
        content.slice(0, startIdx) +
        newBlock +
        content.slice(endIdx + INJECTION_MARKER_END.length)
      );
    }
  }
  // 不存在标记，追加到末尾
  const prefix = content && !content.endsWith("\n") ? "\n" : "";
  return content + prefix + newBlock + "\n";
}

async function injectInstructionFile(
  projectPath: string,
  agent: AgentInfo,
  depth: InjectDepth,
  isSharedFile: boolean
): Promise<void> {
  const filePath = join(projectPath, agent.instructionFile);
  let content = "";
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    // 文件不存在
  }

  const block = buildInjectionContent(agent, depth, isSharedFile);

  if (agent.instructionFormat === "mdc") {
    // Cursor mdc：需保证 frontmatter 存在
    if (!content.startsWith("---")) {
      content = buildMdcFrontmatter() + "\n" + content;
    }
  }

  const newContent = replaceInjectionBlock(content, block);

  // 确保目录存在（.cursor/rules/ 等子目录）
  const dir = join(filePath, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, newContent, "utf-8");
}

async function injectSettingsFile(
  projectPath: string,
  agent: AgentInfo
): Promise<void> {
  if (!agent.settingsFile || !agent.settingsContent) return;

  const settingsPath = join(projectPath, agent.settingsFile);
  let settings: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // 文件不存在或解析失败
  }

  // 幂等深合并：把 settingsContent 合并到现有 settings
  for (const [key, value] of Object.entries(agent.settingsContent)) {
    const existing = settings[key];
    if (existing && typeof existing === "object" && !Array.isArray(existing) &&
        value && typeof value === "object" && !Array.isArray(value)) {
      settings[key] = { ...(existing as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      settings[key] = value;
    }
  }

  const dir = join(settingsPath, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

export async function injectAgentConfigs(
  opts: DeployOptions,
  depth: InjectDepth
): Promise<void> {
  if (opts.targetAgents.length === 0) return;

  // 按 instructionFile 路径分组，统计每个路径被多少 agent 使用
  const pathToAgents = new Map<string, AgentInfo[]>();
  for (const agent of opts.targetAgents) {
    const path = agent.instructionFile;
    if (!pathToAgents.has(path)) {
      pathToAgents.set(path, []);
    }
    pathToAgents.get(path)!.push(agent);
  }

  // 注入指令文件（每个路径只写一次）
  for (const [path, agents] of pathToAgents) {
    const isSharedFile = agents.length >= 2;
    // 用第一个 agent 作为代表（命令名风格、格式以它为准）
    // 共享文件时 isSharedFile=true，交互条款取最宽松措辞
    const representative = agents[0];
    await injectInstructionFile(opts.projectPath, representative, depth, isSharedFile);
  }

  // 注入专有配置（每个 agent 各自的 settingsFile）
  for (const agent of opts.targetAgents) {
    await injectSettingsFile(opts.projectPath, agent);
  }
}
