// src/core/agent-config.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentInfo, DeployOptions } from "./types.js";

/**
 * Alloy 推荐的 Claude Code 权限白名单——allow 安全命令,deny 危险命令。
 * 目标:alloy 执行期间减少用户确认,同时保留对危险操作的拦截。
 *
 * 语法适用:Claude Code / CodeBuddy / Pi(均支持 `Bash(cmd *)` 模式匹配)
 */
export const ALLOY_PERMISSIONS: {
  allow: string[];
  deny: string[];
} = {
  allow: [
    // alloy / openspec CLI
    "Bash(alloy *)",
    "Bash(openspec *)",
    // git 安全子集(读 + 安全写)
    "Bash(git add *)",
    "Bash(git commit *)",
    "Bash(git checkout *)",
    "Bash(git branch *)",
    "Bash(git log *)",
    "Bash(git status *)",
    "Bash(git diff *)",
    "Bash(git merge --squash *)",
    "Bash(git worktree *)",
    "Bash(git rev-parse *)",
    "Bash(git rev-list *)",
    "Bash(git remote *)",
    "Bash(git tag *)",
    "Bash(git pull --ff-only *)",
    "Bash(git fetch *)",
    "Bash(git show *)",
    "Bash(git config *)",
    "Bash(git symbolic-ref *)",
    "Bash(git ls-files *)",
    "Bash(git common-dir *)",
    "Bash(git check-ignore *)",
    // 文件系统读
    "Bash(ls *)",
    "Bash(find *)",
    "Bash(cat *)",
    "Bash(head *)",
    "Bash(tail *)",
    "Bash(grep *)",
    "Bash(sort *)",
    "Bash(wc *)",
    "Bash(basename *)",
    "Bash(dirname *)",
    "Bash(realpath *)",
    "Bash(pwd)",
    "Bash(echo *)",
    "Bash(stat *)",
    "Bash(which *)",
    "Bash(env)",
    "Bash(test *)",
    "Bash(date *)",
    // 文件系统写(安全)
    "Bash(mkdir *)",
    "Bash(touch *)",
    "Bash(cd *)",
    // 执行 alloy 相关脚本(skill-precheck 等)
    "Bash(bash .claude/commands/*)",
    "Bash(bash commands/*)",
    "Bash(sh .claude/commands/*)",
    "Bash(sh commands/*)",
    // 文件读写(alloy 工作区)
    "Read(~/.claude/**)",
    "Edit(openspec/**)",
  ],
  deny: [
    // 危险命令(永远拒绝)
    "Bash(git push --force *)",
    "Bash(git push --force-with-lease *)",
    "Bash(git reset --hard *)",
    "Bash(git checkout . *)",
    "Bash(git restore . *)",
    "Bash(git stash drop *)",
    "Bash(git merge --abort *)",
    "Bash(git clean -fd *)",
    "Bash(rm -rf *)",
    "Bash(rm -fr *)",
    // 危险 git 操作(应需确认)
    "Bash(git rebase *)",
    "Bash(git push *)",
  ],
};

/**
 * 支持项目级 permissions 的 agent 配置——alloy init 可项目级注入。
 * 语法:Claude Code / Pi 支持 `Bash(cmd *)` 模式,格式一致(permissions.allow/deny)。
 *
 * 不含的 agent:
 * - OpenCode:工具级权限(非命令模式),不够精确,不自动配置
 * - Codex:全局配置,非项目级
 */
const ALLOY_PERMISSION_CONFIGS: Record<string, string> = {
  "claude-code": ".claude/settings.json",
  "pi": ".pi/permissions.json",
};

/** 返回支持项目级 permissions 的 agent id 列表 */
export function getPermissionSupportedAgents(): string[] {
  return Object.keys(ALLOY_PERMISSION_CONFIGS);
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

export async function injectAgentConfigs(opts: DeployOptions): Promise<void> {
  if (opts.targetAgents.length === 0) return;

  // 注入专有配置（每个 agent 各自的 settingsFile，如 .claude/settings.json 的 worktree.baseRef）
  for (const agent of opts.targetAgents) {
    await injectSettingsFile(opts.projectPath, agent);
  }
}

/** 检测指定 agent 是否已有 permissions.allow 配置 */
export async function hasPermissionsConfig(projectPath: string, agentId: string): Promise<boolean> {
  const settingsFile = ALLOY_PERMISSION_CONFIGS[agentId];
  if (!settingsFile) return false;

  const settingsPath = join(projectPath, settingsFile);
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    const permissions = settings.permissions;
    return !!(permissions && Array.isArray(permissions.allow) && permissions.allow.length > 0);
  } catch {
    return false;
  }
}

/** 写入 alloy 推荐的 permissions 到指定 agent 的配置文件(幂等合并,不覆盖用户自定义条目) */
export async function writePermissionsConfig(projectPath: string, agentId: string): Promise<boolean> {
  const settingsFile = ALLOY_PERMISSION_CONFIGS[agentId];
  if (!settingsFile) return false;

  const settingsPath = join(projectPath, settingsFile);
  let settings: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // 文件不存在或解析失败
  }

  // 幂等合并 permissions.allow / permissions.deny
  const existingPermissions = (settings.permissions ?? {}) as { allow?: string[]; deny?: string[] };
  const existingAllow = existingPermissions.allow ?? [];
  const existingDeny = existingPermissions.deny ?? [];

  // 合并:去重(用户自定义条目保留,alloy 推荐条目补充)
  const mergedAllow = Array.from(new Set([...existingAllow, ...ALLOY_PERMISSIONS.allow]));
  const mergedDeny = Array.from(new Set([...existingDeny, ...ALLOY_PERMISSIONS.deny]));

  settings.permissions = { allow: mergedAllow, deny: mergedDeny };

  const dir = join(settingsPath, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return true;
}

// --- PreToolUse hook 配置(alloy _hook-guard) ---

import { getPackageRoot } from "../utils/fs.js";

/**
 * 支持 PreToolUse hook 的 agent 配置--alloy init 可项目级注入。
 * Claude Code / Codex 共用同款协议(外部脚本 + exit 2 阻断)。
 */
const ALLOY_HOOK_CONFIGS: Record<string, string> = {
  "claude-code": ".claude/settings.json",
  "codex": ".codex/settings.json",
};

const ALLOY_HOOK_MATCHER = "Write|Edit";

/**
 * hook command 用绝对路径,不依赖 PATH/alias。
 * 原因:Claude Code 的 hook 执行环境(/bin/sh)不加载用户 shell alias,
 * 若用户用 alias 指向开发版 alloy,hook 会找到 PATH 里的旧版 alloy(无 _hook-guard 命令)。
 * 绝对路径确保 hook 总是调用当前 alloy 包的 CLI。
 */
function getHookCommand(): string {
  const alloyCliPath = join(getPackageRoot(), "dist", "cli", "index.js");
  return `node ${alloyCliPath} _hook-guard`;
}

/** 返回支持 hook 闸门的 agent id 列表(claude-code/codex 用 settings.json,pi 用扩展,opencode 用 custom tool) */
export function getHookSupportedAgents(): string[] {
  return ["claude-code", "codex", "pi", "opencode"];
}

/** 返回 agent 的 hook 配置路径描述(用于 init 执行清单显示) */
export function getHookConfigPath(agentId: string): string {
  switch (agentId) {
    case "claude-code": return ".claude/settings.json (hooks.PreToolUse)";
    case "codex": return ".codex/settings.json (hooks.PreToolUse)";
    case "pi": return ".pi/extensions/alloy-guard.ts (tool_call 扩展)";
    case "opencode": return ".opencode/tools/write.ts+edit.ts (custom tool)";
    default: return "";
  }
}

interface PreToolUseEntry {
  matcher?: string;
  hooks?: { type: string; command: string }[];
}

/** 检测指定 agent 是否已装 alloy hook(claude-code/codex 查 settings.json,pi 查扩展,opencode 查 tools) */
export async function hasHookConfig(projectPath: string, agentId: string): Promise<boolean> {
  if (agentId === "pi") return hasPiHookExtension(projectPath);
  if (agentId === "opencode") return hasOpenCodeHookTools(projectPath);

  const settingsFile = ALLOY_HOOK_CONFIGS[agentId];
  if (!settingsFile) return false;

  const settingsPath = join(projectPath, settingsFile);
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    const preToolUse = settings?.hooks?.PreToolUse;
    if (!Array.isArray(preToolUse)) return false;

    const hookCommand = getHookCommand();
    return preToolUse.some((entry: PreToolUseEntry) =>
      entry?.matcher === ALLOY_HOOK_MATCHER &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((h) => h?.command === hookCommand)
    );
  } catch {
    return false;
  }
}

/**
 * 写入 alloy hook 到指定 agent(幂等)。
 * claude-code/codex:settings.json 的 PreToolUse
 * pi:.pi/extensions/alloy-guard.ts
 * opencode:.opencode/tools/write.ts + edit.ts
 */
export async function writeHookConfig(projectPath: string, agentId: string): Promise<boolean> {
  if (agentId === "pi") return writePiHookExtension(projectPath);
  if (agentId === "opencode") return writeOpenCodeHookTools(projectPath);

  const settingsFile = ALLOY_HOOK_CONFIGS[agentId];
  if (!settingsFile) return false;

  const settingsPath = join(projectPath, settingsFile);
  let settings: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // 文件不存在
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const preToolUse: PreToolUseEntry[] = Array.isArray(hooks.PreToolUse)
    ? [...hooks.PreToolUse] as PreToolUseEntry[]
    : [];

  const hookCommand = getHookCommand();

  // 找同 matcher 的 entry
  let entry = preToolUse.find((e) => e?.matcher === ALLOY_HOOK_MATCHER);
  if (!entry) {
    entry = { matcher: ALLOY_HOOK_MATCHER, hooks: [] };
    preToolUse.push(entry);
  }
  if (!Array.isArray(entry.hooks)) entry.hooks = [];

  // 检测是否已有绝对路径版本
  const hasExactCommand = entry.hooks.some((h) => h?.command === hookCommand);
  if (!hasExactCommand) {
    // 移除旧的 _hook-guard 命令(可能是 `alloy _hook-guard` 无绝对路径,旧版不生效)
    entry.hooks = entry.hooks.filter((h) => !h?.command?.includes("_hook-guard"));
    // 追加绝对路径版本
    entry.hooks.push({ type: "command", command: hookCommand });
  }

  hooks.PreToolUse = preToolUse;
  settings.hooks = hooks;

  const dir = join(settingsPath, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return true;
}

// --- Stop hook 配置(alloy _stop-guard,检测文本输出代替 AskUserQuestion) ---

/**
 * 支持 Stop hook 的 agent 配置。
 * 仅 Claude Code 已确认支持 Stop hook + last_assistant_message。
 * OpenCode/Codex/Pi 的 Stop hook 能力待确认(确认后加入此处)。
 */
const ALLOY_STOP_HOOK_CONFIGS: Record<string, string> = {
  "claude-code": ".claude/settings.json",
};

function getStopHookCommand(): string {
  const alloyCliPath = join(getPackageRoot(), "dist", "cli", "index.js");
  return `node ${alloyCliPath} _stop-guard`;
}

/** 返回支持 Stop hook 的 agent id 列表 */
export function getStopHookSupportedAgents(): string[] {
  return Object.keys(ALLOY_STOP_HOOK_CONFIGS);
}

interface StopHookEntry {
  hooks?: { type: string; command: string }[];
}

/** 检测指定 agent 是否已装 alloy _stop-guard */
export async function hasStopHookConfig(projectPath: string, agentId: string): Promise<boolean> {
  const settingsFile = ALLOY_STOP_HOOK_CONFIGS[agentId];
  if (!settingsFile) return false;

  const settingsPath = join(projectPath, settingsFile);
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    const stop = settings?.hooks?.Stop;
    if (!Array.isArray(stop)) return false;

    const hookCommand = getStopHookCommand();
    return stop.some((entry: StopHookEntry) =>
      Array.isArray(entry?.hooks) &&
      entry.hooks.some((h) => h?.command === hookCommand)
    );
  } catch {
    return false;
  }
}

/**
 * 写入 alloy _stop-guard 到指定 agent 的 Stop hook(幂等)。
 * 仅 claude-code(其他 agent 待确认 Stop hook 能力后适配)。
 *
 * Stop hook 无 matcher(不针对特定工具),与 PreToolUse 的 Write|Edit matcher 不同。
 * 与 writeHookConfig 写同一个 settings.json,先后调用互不影响(各自维护 hooks.Stop / hooks.PreToolUse)。
 */
export async function writeStopHookConfig(projectPath: string, agentId: string): Promise<boolean> {
  const settingsFile = ALLOY_STOP_HOOK_CONFIGS[agentId];
  if (!settingsFile) return false;

  const settingsPath = join(projectPath, settingsFile);
  let settings: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // 文件不存在
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const stop: StopHookEntry[] = Array.isArray(hooks.Stop)
    ? [...hooks.Stop] as StopHookEntry[]
    : [];

  const hookCommand = getStopHookCommand();

  // Stop hook 无 matcher,用第一个 entry
  let entry = stop[0];
  if (!entry) {
    entry = { hooks: [] };
    stop.push(entry);
  }
  if (!Array.isArray(entry.hooks)) entry.hooks = [];

  const hasExactCommand = entry.hooks.some((h) => h?.command === hookCommand);
  if (!hasExactCommand) {
    entry.hooks = entry.hooks.filter((h) => !h?.command?.includes("_stop-guard"));
    entry.hooks.push({ type: "command", command: hookCommand });
  }

  hooks.Stop = stop;
  settings.hooks = hooks;

  const dir = join(settingsPath, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return true;
}

// --- Pi hook 扩展(.pi/extensions/alloy-guard.ts) ---

const PI_EXTENSION_FILE = ".pi/extensions/alloy-guard.ts";

function generatePiExtensionContent(alloyCliPath: string): string {
  return [
    "// Alloy hook-guard 扩展:订阅 tool_call 事件,拦截非 apply 阶段写源码",
    "// 由 alloy init 自动生成。待验证:Pi tool_call 事件 API(field 名/block 方式)",
    'import { execSync } from "node:child_process";',
    "",
    "export default function alloyGuard(pi: any) {",
    '  pi.on("tool_call", async (event: any) => {',
    "    const toolName = event?.tool ?? event?.name;",
    '    if (toolName !== "write" && toolName !== "edit") return;',
    "",
    "    const filePath = event?.args?.path ?? event?.args?.file_path;",
    "    if (!filePath) return;",
    "",
    "    const stdin = JSON.stringify({",
    '      tool_name: toolName === "write" ? "Write" : "Edit",',
    "      tool_input: { file_path: filePath },",
    "    });",
    "",
    "    try {",
    `      execSync("node ${alloyCliPath} _hook-guard", {`,
    "        input: stdin,",
    '        stdio: ["pipe", "ignore", "pipe"],',
    "      });",
    "    } catch (err: any) {",
    '      const stderr = err.stderr?.toString() ?? "alloy hook 拦截";',
    "      return { block: true, reason: stderr };",
    "    }",
    "  });",
    "}",
    "",
  ].join("\n");
}

/** 检测 Pi 是否已装 alloy hook 扩展 */
export async function hasPiHookExtension(projectPath: string): Promise<boolean> {
  const extPath = join(projectPath, PI_EXTENSION_FILE);
  try {
    const content = await readFile(extPath, "utf-8");
    return content.includes("_hook-guard");
  } catch {
    return false;
  }
}

/** 写入 Pi hook 扩展(.pi/extensions/alloy-guard.ts) */
export async function writePiHookExtension(projectPath: string): Promise<boolean> {
  const alloyCliPath = join(getPackageRoot(), "dist", "cli", "index.js");
  const extPath = join(projectPath, PI_EXTENSION_FILE);
  const content = generatePiExtensionContent(alloyCliPath);
  await mkdir(join(extPath, ".."), { recursive: true });
  await writeFile(extPath, content, "utf-8");
  return true;
}

// --- OpenCode hook 工具(.opencode/tools/write.ts + edit.ts) ---

const OPENCODE_TOOLS_DIR = ".opencode/tools";

function generateOpenCodeWriteToolContent(alloyCliPath: string): string {
  return [
    "// Alloy hook-guard write 工具:覆盖内置 write,调 alloy _hook-guard 判定",
    "// 由 alloy init 自动生成。待验证:OpenCode custom tool API + 能否调原内置 write",
    'import { tool } from "@opencode-ai/plugin";',
    'import fs from "node:fs/promises";',
    'import { execSync } from "node:child_process";',
    "",
    "export default tool({",
    '  description: "Alloy-gated write (overrides built-in)",',
    "  args: {",
    "    path: tool.schema.string(),",
    "    content: tool.schema.string(),",
    "  },",
    "  async execute(args: { path: string; content: string }, context: any) {",
    "    const stdin = JSON.stringify({",
    '      tool_name: "Write",',
    "      tool_input: { file_path: args.path },",
    "    });",
    "",
    "    try {",
    `      execSync("node ${alloyCliPath} _hook-guard", {`,
    "        input: stdin,",
    '        stdio: ["pipe", "ignore", "pipe"],',
    "      });",
    "      await fs.writeFile(args.path, args.content);",
    "      return `written: ${args.path}`;",
    "    } catch (err: any) {",
    '      const stderr = err.stderr?.toString() ?? "alloy hook 拦截";',
    "      return `blocked: ${stderr}`;",
    "    }",
    "  },",
    "});",
    "",
  ].join("\n");
}

function generateOpenCodeEditToolContent(alloyCliPath: string): string {
  return [
    "// Alloy hook-guard edit 工具:覆盖内置 edit,调 alloy _hook-guard 判定",
    "// 由 alloy init 自动生成。待验证:OpenCode edit 工具参数(old_string/new_string)",
    'import { tool } from "@opencode-ai/plugin";',
    'import fs from "node:fs/promises";',
    'import { execSync } from "node:child_process";',
    "",
    "export default tool({",
    '  description: "Alloy-gated edit (overrides built-in)",',
    "  args: {",
    "    path: tool.schema.string(),",
    "    old_string: tool.schema.string(),",
    "    new_string: tool.schema.string(),",
    "  },",
    "  async execute(args: { path: string; old_string: string; new_string: string }, context: any) {",
    "    const stdin = JSON.stringify({",
    '      tool_name: "Edit",',
    "      tool_input: { file_path: args.path },",
    "    });",
    "",
    "    try {",
    `      execSync("node ${alloyCliPath} _hook-guard", {`,
    "        input: stdin,",
    '        stdio: ["pipe", "ignore", "pipe"],',
    "      });",
    '      const content = await fs.readFile(args.path, "utf-8");',
    "      const updated = content.replace(args.old_string, args.new_string);",
    "      await fs.writeFile(args.path, updated);",
    "      return `edited: ${args.path}`;",
    "    } catch (err: any) {",
    '      const stderr = err.stderr?.toString() ?? "alloy hook 拦截";',
    "      return `blocked: ${stderr}`;",
    "    }",
    "  },",
    "});",
    "",
  ].join("\n");
}

/** 检测 OpenCode 是否已装 alloy hook 工具 */
export async function hasOpenCodeHookTools(projectPath: string): Promise<boolean> {
  const writePath = join(projectPath, OPENCODE_TOOLS_DIR, "write.ts");
  try {
    const content = await readFile(writePath, "utf-8");
    return content.includes("_hook-guard");
  } catch {
    return false;
  }
}

/** 写入 OpenCode hook 工具(.opencode/tools/write.ts + edit.ts) */
export async function writeOpenCodeHookTools(projectPath: string): Promise<boolean> {
  const alloyCliPath = join(getPackageRoot(), "dist", "cli", "index.js");
  const toolsDir = join(projectPath, OPENCODE_TOOLS_DIR);
  await mkdir(toolsDir, { recursive: true });
  await writeFile(join(toolsDir, "write.ts"), generateOpenCodeWriteToolContent(alloyCliPath), "utf-8");
  await writeFile(join(toolsDir, "edit.ts"), generateOpenCodeEditToolContent(alloyCliPath), "utf-8");
  return true;
}
