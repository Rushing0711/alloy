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
    // 交互工具(alloy USER_GATE 依赖 AskUserQuestion)
    "AskUserQuestion",
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
 */
const ALLOY_PERMISSION_CONFIGS: Record<string, string> = {
  "claude-code": ".claude/settings.json",
  "pi": ".pi/permissions.json",
  "opencode": "opencode.json",
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

/** 检测指定 agent 是否已有 permissions 配置(claude-code/pi:permissions.allow;opencode:permission.bash) */
export async function hasPermissionsConfig(projectPath: string, agentId: string): Promise<boolean> {
  const settingsFile = ALLOY_PERMISSION_CONFIGS[agentId];
  if (!settingsFile) return false;

  const settingsPath = join(projectPath, settingsFile);
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    if (agentId === "opencode") {
      const bash = settings?.permission?.bash;
      return !!(bash && typeof bash === "object" && Object.keys(bash).length > 0);
    }
    const permissions = settings.permissions;
    return !!(permissions && Array.isArray(permissions.allow) && permissions.allow.length > 0);
  } catch {
    return false;
  }
}

/** 把 alloy 的 Bash(cmd *) allow/deny 转为 opencode 的 { "cmd *": "allow"|"deny" } 格式 */
function toOpenCodeBashPermissions(allow: string[], deny: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of allow) {
    const match = entry.match(/^Bash\((.+)\)$/);
    if (match) result[match[1]] = "allow";
  }
  for (const entry of deny) {
    const match = entry.match(/^Bash\((.+)\)$/);
    if (match) result[match[1]] = "deny";
  }
  return result;
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

  if (agentId === "opencode") {
    // $schema: OpenCode 运行时会自动补这个字段(为 IDE 提供 JSON Schema 补全/校验)。
    // alloy init 主动写,避免 init 后 OpenCode 第一次运行时补 $schema 导致 working tree 脏 + 补充提交。
    // 幂等:已有 $schema 不覆盖(尊重用户可能自定义的 URL)。新建时放第一行(OpenCode 惯例)。
    if (!settings.$schema) {
      const newSettings: Record<string, unknown> = { $schema: "https://opencode.ai/config.json" };
      for (const key of Object.keys(settings)) {
        newSettings[key] = settings[key];
      }
      settings = newSettings;
    }
    const alloyBashPerms = toOpenCodeBashPermissions(ALLOY_PERMISSIONS.allow, ALLOY_PERMISSIONS.deny);
    const existingPerm = (settings.permission ?? {}) as { bash?: Record<string, string> };
    const existingBash = existingPerm.bash ?? {};
    const mergedBash = { ...alloyBashPerms, ...existingBash };
    settings.permission = { ...existingPerm, bash: mergedBash };
  } else {
    const existingPermissions = (settings.permissions ?? {}) as { allow?: string[]; deny?: string[] };
    const existingAllow = existingPermissions.allow ?? [];
    const existingDeny = existingPermissions.deny ?? [];
    const mergedAllow = Array.from(new Set([...existingAllow, ...ALLOY_PERMISSIONS.allow]));
    const mergedDeny = Array.from(new Set([...existingDeny, ...ALLOY_PERMISSIONS.deny]));
    settings.permissions = { allow: mergedAllow, deny: mergedDeny };
  }

  const dir = join(settingsPath, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return true;
}

// --- PreToolUse hook 配置(alloy _hook-guard) ---

import { getPackageRoot } from "../utils/fs.js";

/**
 * 支持 PreToolUse hook 的 agent 配置--alloy init 可项目级注入。
 * Claude Code 用同款协议(外部脚本 + exit 2 阻断)。
 */
const ALLOY_HOOK_CONFIGS: Record<string, string> = {
  "claude-code": ".claude/settings.json",
};

// matcher 含 AskUserQuestion:问答工具调用时触发 hook-guard,自动 clearAllPendingGates。
// 旧 matcher 只有 Write|Edit,问答工具不触发 -> pending_gate 残留。alloy init/update 升级到新 matcher。
const LEGACY_HOOK_MATCHER = "Write|Edit";
const ALLOY_HOOK_MATCHER = "Write|Edit|AskUserQuestion";

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

/** 返回支持 hook 闸门的 agent id 列表(claude-code 用 settings.json,pi 用扩展,opencode 用 plugin) */
export function getHookSupportedAgents(): string[] {
  return ["claude-code", "pi", "opencode"];
}

/** 返回 agent 的 hook 配置路径描述(用于 init 执行清单显示) */
export function getHookConfigPath(agentId: string): string {
  switch (agentId) {
    case "claude-code": return ".claude/settings.json (hooks.PreToolUse)";
    case "pi": return ".pi/extensions/alloy-guard.ts (tool_call + agent_settled 扩展)";
    case "opencode": return ".opencode/plugins/alloy-guard.ts (tool.execute.before + session.idle 插件)";
    default: return "";
  }
}

interface PreToolUseEntry {
  matcher?: string;
  hooks?: { type: string; command: string }[];
}

/** 检测指定 agent 是否已装 alloy hook(claude-code 查 settings.json,pi 查扩展,opencode 查 plugin) */
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
    // 兼容旧 matcher(Write|Edit)和新 matcher(Write|Edit|AskUserQuestion)
    return preToolUse.some((entry: PreToolUseEntry) =>
      (entry?.matcher === ALLOY_HOOK_MATCHER || entry?.matcher === LEGACY_HOOK_MATCHER) &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((h) => h?.command === hookCommand)
    );
  } catch {
    return false;
  }
}

/**
 * 写入 alloy hook 到指定 agent(幂等)。
 * claude-code:settings.json 的 PreToolUse
 * pi:.pi/extensions/alloy-guard.ts
 * opencode:.opencode/plugins/alloy-guard.ts
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

  // 找同 matcher 的 entry(兼容旧 matcher,升级到新 matcher)
  let entry = preToolUse.find((e) => e?.matcher === ALLOY_HOOK_MATCHER || e?.matcher === LEGACY_HOOK_MATCHER);
  if (!entry) {
    entry = { matcher: ALLOY_HOOK_MATCHER, hooks: [] };
    preToolUse.push(entry);
  } else if (entry.matcher === LEGACY_HOOK_MATCHER) {
    // 旧 matcher 升级为含 AskUserQuestion 的新 matcher
    entry.matcher = ALLOY_HOOK_MATCHER;
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
 * Claude Code 用同款协议(外部脚本 + exit 2,settings.json 的 hooks.Stop)。
 * Pi 用 extension agent_settled 事件(与 PreToolUse 的 tool_call 同一个 .pi/extensions/alloy-guard.ts)。
 * OpenCode 用 plugin session.idle(与 PreToolUse 的 tool.execute.before 同一个 .opencode/plugins/alloy-guard.ts)。
 */
const ALLOY_STOP_HOOK_CONFIGS: Record<string, string> = {
  "claude-code": ".claude/settings.json",
  "pi": ".pi/extensions/alloy-guard.ts",
  "opencode": ".opencode/plugins/alloy-guard.ts",
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
  // Pi: Stop hook 在 extension(与 PreToolUse 同一个文件),查 _stop-guard 标记
  if (agentId === "pi") {
    try {
      const content = await readFile(join(projectPath, PI_EXTENSION_FILE), "utf-8");
      return content.includes("_stop-guard");
    } catch {
      return false;
    }
  }
  // OpenCode: Stop hook 在 plugin(与 PreToolUse 同一个文件),查 _stop-guard 标记
  if (agentId === "opencode") {
    try {
      const content = await readFile(join(projectPath, OPENCODE_PLUGIN_FILE), "utf-8");
      return content.includes("_stop-guard");
    } catch {
      return false;
    }
  }

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
  // Pi: Stop hook 合并到 PreToolUse 的 extension(同一文件加 agent_settled 事件)
  // writePiHookExtension 生成含 tool_call + agent_settled 的完整 extension
  if (agentId === "pi") {
    return writePiHookExtension(projectPath);
  }
  // OpenCode: Stop hook 合并到 PreToolUse 的 plugin(同一文件加 session.idle hook)
  // writeOpenCodeHookTools 生成含 tool.execute.before + session.idle 的完整 plugin
  if (agentId === "opencode") {
    return writeOpenCodeHookTools(projectPath);
  }

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
    "// Alloy hook-guard 扩展:订阅 tool_call(PreToolUse) + agent_settled(Stop) 事件",
    "// 由 alloy init 自动生成。",
    "// Pi tool_call 事件参数:event.toolName(工具名) + event.input(工具输入,可变)",
    "// 证据:https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md",
    'import { execSync } from "node:child_process";',
    "",
    "export default function alloyGuard(pi: any) {",
    "  // PreToolUse:拦截非白名单写入(Write/Edit) + 检测 alloy-question 工具调用",
    '  pi.on("tool_call", async (event: any) => {',
    "    const toolName = event?.toolName;",
    "",
    "    // 检测 alloy-question 工具调用 -> 触发 _hook-guard clearAllPendingGates",
    "    // _hook-guard 内部检测到问答工具(ASK_TOOLS)会自动 clear pending_gate",
    '    if (toolName === "alloy-question") {',
    "      try {",
    '        const stdin = JSON.stringify({ tool_name: "alloy-question" });',
    `        execSync("node ${alloyCliPath} _hook-guard", {`,
    "          input: stdin,",
    '          stdio: ["pipe", "ignore", "pipe"],',
    "        });",
    "      } catch {",
    "        // clear 失败不阻断问答",
    "      }",
    "      return;",
    "    }",
    "",
    '    if (toolName !== "write" && toolName !== "edit") return;',
    "",
    "    // Pi write 工具参数名:input.path(主)/input.file_path(兼容);edit:input.filePath/input.file_path",
    "    const input = event?.input ?? {};",
    '    const filePath = input.path ?? input.filePath ?? input.file_path;',
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
    "",
    "  // Stop:agent 完全停止后调 _stop-guard(检测文本输出代替 AskUserQuestion)",
    '  pi.on("agent_settled", async () => {',
    "    try {",
    `      execSync("node ${alloyCliPath} _stop-guard", {`,
    '        stdio: ["pipe", "ignore", "pipe"],',
    "      });",
    "    } catch {",
    "      // _stop-guard 检测到问题时 exit 1,这里忽略(已在 stderr 提示)",
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

// --- Pi question 扩展(.pi/extensions/alloy-question.ts) ---
// 注册 alloy-question 工具,LLM 调用时弹出 SelectList TUI 让用户选选项(USER_GATE)
// 解决 Pi 无原生交互工具导致 SKILL.md 里 USER_GATE 无法触发的问题

const PI_QUESTION_EXTENSION_FILE = ".pi/extensions/alloy-question.ts";

function generatePiQuestionExtensionContent(): string {
  return [
    "// Alloy question 扩展:注册 alloy-question 工具,LLM 调用时弹出 TUI 让用户选选项",
    "// 由 alloy init 自动生成。解决 Pi 无原生交互工具(USER_GATE)的问题。",
    "// 按键:用 ctx.ui.custom 注入的 keybindings 参数(官方推荐),不调 getKeybindings()",
    "// 颜色:ANSI truecolor 绕过 theme(标题亮白/内容普通白/选中深蓝)",
    'import { Type } from "typebox";',
    'import { DynamicBorder } from "@earendil-works/pi-coding-agent";',
    'import { Container, Text, matchesKey, Key, truncateToWidth } from "@earendil-works/pi-tui";',
    "",
    "// ANSI truecolor(绕过 Pi theme 的 accent 浅蓝限制)",
    "// 亮白 \\x1b[97m / 普通白 \\x1b[37m / 深蓝 #4A9EFF / reset前景 \\x1b[39m / bold \\x1b[1m / reset bold \\x1b[22m",
    "const BRIGHT_WHITE = \"\\x1b[97m\";",
    "const NORMAL_WHITE = \"\\x1b[37m\";",
    "const DEEP_BLUE = \"\\x1b[38;2;74;158;255m\";",
    "const DIM_GRAY = \"\\x1b[90m\";",
    "const RESET_FG = \"\\x1b[39m\";",
    "const BOLD = \"\\x1b[1m\";",
    "const RESET_BOLD = \"\\x1b[22m\";",
    "function brightWhite(text: string): string { return `${BRIGHT_WHITE}${text}${RESET_FG}`; }",
    "function normalWhite(text: string): string { return `${NORMAL_WHITE}${text}${RESET_FG}`; }",
    "function deepBlue(text: string): string { return `${DEEP_BLUE}${text}${RESET_FG}`; }",
    "function bold(text: string): string { return `${BOLD}${text}${RESET_BOLD}`; }",
    "",
    "",
    "export default function alloyQuestion(pi: any) {",
    "  pi.registerTool({",
    '    name: "alloy-question",',
    '    label: "Alloy Question",',
    '    description: "Ask user a question with options (USER_GATE). Use for decisions requiring user input. Returns selected option label(s).",',
    '    promptSnippet: "Ask user a question with options (USER_GATE)",',
    "    promptGuidelines: [",
    '      "Use alloy-question for USER_GATE decisions instead of text output. Pass question + options[{label, description}] + multiple?",',
    "    ],",
    "    parameters: Type.Object({",
    '      question: Type.String({ description: "Question text to display" }),',
    "      options: Type.Array(Type.Object({",
    '        label: Type.String({ description: "Short option label" }),',
    '        description: Type.String({ description: "Longer explanation of the option" }),',
    "      })),",
    '      multiple: Type.Optional(Type.Boolean({ description: "Allow multiple selections (default: false)" })),',
    "    }),",
    "    async execute(_toolCallId: string, params: any, _signal: any, _onUpdate: any, ctx: any) {",
    "      let options = params.options.map((o: any) => ({ label: o.label, description: o.description }));",
    "",
    "      // 单选项自动转 confirm:追加\"取消\"选项变成 2 选项",
    "      // 原因:单选项 = 确认场景(非选择),select TUI 展示单选项用户只能 enter 或 esc,失去\"选择\"意义",
    "      // 自动补\"取消\"= 确认/取消 2 选项,正好是 confirm 语义,用 select TUI 呈现保持一致性",
    "      // 用户选\"取消\"(追加项)返回 null,agent 收到退出流程",
    "      let isConfirmMode = false;",
    "      if (!params.multiple && options.length === 1) {",
    "        isConfirmMode = true;",
    "        options = [...options, { label: \"取消\", description: \"退出当前操作\" }];",
    "      }",
    "",
    "      if (params.multiple) {",
    "        const selected = await showMultiSelect(ctx, params.question, options);",
    "        const labels = selected.map(i => options[i].label);",
    "        return {",
    "          content: [{ type: \"text\", text: labels.length ? labels.join(\", \") : \"用户取消\" }],",
    "          details: { selected, cancelled: labels.length === 0 },",
    "        };",
    "      } else {",
    "        const choice = await showSingleSelect(ctx, params.question, options);",
    "        // confirm 模式:选\"取消\"追加项(index = options.length - 1)视为用户取消",
    "        if (choice === null || (isConfirmMode && choice === options.length - 1)) {",
    "          return { content: [{ type: \"text\", text: \"用户取消\" }], details: { cancelled: true } };",
    "        }",
    "        return { content: [{ type: \"text\", text: options[choice].label }], details: { selected: choice } };",
    "      }",
    "    },",
    "  });",
    "}",
    "",
    "// 自定义选项列表组件",
    "// 按键:keybindings.matches(data, 'tui.select.up/down/confirm/cancel')(注入的 keybindings)",
    "// 颜色:非选中普通白,选中深蓝+bold;序号 1./2./3.;多选 checkbox [ ]/[x]",
    "class OptionList {",
    "  private options: { label: string; description: string }[];",
    "  private selected: number = 0;",
    "  private checked: Set<number> = new Set();",
    "  private multiple: boolean;",
    "  private maxVisible: number;",
    "  private scrollTop: number = 0;",
    "  private keybindings: any;",
    "  public onConfirm?: (selected: number[]) => void;",
    "  public onCancel?: () => void;",
    "",
    "  constructor(options: { label: string; description: string }[], multiple: boolean, keybindings: any) {",
    "    this.options = options;",
    "    this.multiple = multiple;",
    "    this.keybindings = keybindings;",
    "    this.maxVisible = Math.min(options.length, 8);",
    "  }",
    "",
    "  invalidate(): void {}",
    "",
    "  private ensureVisible(): void {",
    "    if (this.selected < this.scrollTop) this.scrollTop = this.selected;",
    "    if (this.selected >= this.scrollTop + this.maxVisible) this.scrollTop = this.selected - this.maxVisible + 1;",
    "  }",
    "",
    "  render(width: number): string[] {",
    "    this.ensureVisible();",
    "    const lines: string[] = [];",
    "    const end = Math.min(this.scrollTop + this.maxVisible, this.options.length);",
    "    for (let i = this.scrollTop; i < end; i++) {",
    "      const opt = this.options[i];",
    "      const isSelected = i === this.selected;",
    "      const isChecked = this.checked.has(i);",
    "      // 序号:1./2./3. 统一 3 字符宽",
    "      const num = `${i + 1}.`.padEnd(3);",
    "      // checkbox(多选)或空(单选),统一 4 字符宽",
    "      const marker = this.multiple ? (isChecked ? \"[x] \" : \"[ ] \") : \"\";",
    "      const label = truncateToWidth(opt.label, width - 8);",
    "      let labelLine = `${num}${marker}${label}`;",
    "      if (isSelected) {",
    "        // 选中:深蓝 + 加粗",
    "        labelLine = deepBlue(bold(labelLine));",
    "      } else {",
    "        // 非选中:普通白",
    "        labelLine = normalWhite(labelLine);",
    "      }",
    "      lines.push(labelLine);",
    "      // description:缩进对齐 label 起始(序号 3 + checkbox 4 = 7;单选无 checkbox = 3)",
    "      // 选中/非选中都用暗灰(description 是辅助信息,不随选中变色)",
    "      if (opt.description) {",
    "        const descIndent = this.multiple ? \"       \" : \"   \";",
    "        const desc = truncateToWidth(opt.description, width - 8);",
    "        lines.push(`${DIM_GRAY}${descIndent}${desc}${RESET_FG}`);",
    "      }",
    "    }",
    "    if (this.options.length > this.maxVisible) {",
    "      lines.push(`  (${this.selected + 1}/${this.options.length})`);",
    "    }",
    "    return lines;",
    "  }",
    "",
    "  handleInput(data: string): void {",
    "    const kb = this.keybindings;",
    "    // 用注入的 keybindings(和 SelectList 一致,官方推荐方式)",
    "    if (kb.matches(data, \"tui.select.up\")) {",
    "      this.selected = this.selected === 0 ? this.options.length - 1 : this.selected - 1;",
    "    } else if (kb.matches(data, \"tui.select.down\")) {",
    "      this.selected = this.selected === this.options.length - 1 ? 0 : this.selected + 1;",
    "    } else if (kb.matches(data, \"tui.select.confirm\")) {",
    "      if (this.multiple) {",
    "        // 多选:enter 确认所有选中(空选中则确认当前高亮)",
    "        const result = this.checked.size > 0 ? Array.from(this.checked).sort((a,b) => a-b) : [this.selected];",
    "        this.onConfirm?.(result);",
    "      } else {",
    "        this.onConfirm?.([this.selected]);",
    "      }",
    "    } else if (kb.matches(data, \"tui.select.cancel\")) {",
    "      this.onCancel?.();",
    "    } else if (matchesKey(data, Key.space)) {",
    "      // space:多选切换",
    "      if (this.multiple) {",
    "        if (this.checked.has(this.selected)) this.checked.delete(this.selected);",
    "        else this.checked.add(this.selected);",
    "      }",
    "    }",
    "  }",
    "}",
    "",
    "// 单选 TUI",
    "async function showSingleSelect(ctx: any, question: string, options: { label: string; description: string }[]): Promise<number | null> {",
    "  return ctx.ui.custom<number | null>((tui: any, _theme: any, keybindings: any, done: (v: number | null) => void) => {",
    "    const container = new Container();",
    "    container.addChild(new DynamicBorder((s: string) => deepBlue(s)));",
    "    // 标题:亮白 + 加粗",
    "    container.addChild(new Text(brightWhite(bold(`❓ ${question}`)), 1, 0));",
    "    container.addChild(new Text(\"\", 0, 0));",
    "    const list = new OptionList(options, false, keybindings);",
    "    list.onConfirm = (sel) => done(sel[0]);",
    "    list.onCancel = () => done(null);",
    "    container.addChild(list);",
    "    container.addChild(new Text(\"\", 0, 0));",
    "    container.addChild(new Text(normalWhite(\"  ↑↓ navigate   enter select   esc cancel\"), 0, 0));",
    "    container.addChild(new DynamicBorder((s: string) => deepBlue(s)));",
    "    return {",
    "      render: (w: number) => container.render(w),",
    "      invalidate: () => container.invalidate(),",
    "      handleInput: (data: string) => { list.handleInput(data); tui.requestRender(); },",
    "    };",
    "  });",
    "}",
    "",
    "// 多选 TUI",
    "async function showMultiSelect(ctx: any, question: string, options: { label: string; description: string }[]): Promise<number[]> {",
    "  return ctx.ui.custom<number[]>((tui: any, _theme: any, keybindings: any, done: (v: number[]) => void) => {",
    "    const container = new Container();",
    "    container.addChild(new DynamicBorder((s: string) => deepBlue(s)));",
    "    container.addChild(new Text(brightWhite(bold(`❓ ${question}`)), 1, 0));",
    "    container.addChild(new Text(normalWhite(\"  (space 切换选择,enter 确认所有选中)\"), 0, 0));",
    "    container.addChild(new Text(\"\", 0, 0));",
    "    const list = new OptionList(options, true, keybindings);",
    "    list.onConfirm = (sel) => done(sel);",
    "    list.onCancel = () => done([]);",
    "    container.addChild(list);",
    "    container.addChild(new Text(\"\", 0, 0));",
    "    container.addChild(new Text(normalWhite(\"  ↑↓ navigate   space toggle   enter confirm   esc cancel\"), 0, 0));",
    "    container.addChild(new DynamicBorder((s: string) => deepBlue(s)));",
    "    return {",
    "      render: (w: number) => container.render(w),",
    "      invalidate: () => container.invalidate(),",
    "      handleInput: (data: string) => { list.handleInput(data); tui.requestRender(); },",
    "    };",
    "  });",
    "}",
    "",
  ].join("\n");
}

/** 检测 Pi 是否已装 alloy-question 扩展 */
export async function hasPiQuestionExtension(projectPath: string): Promise<boolean> {
  const extPath = join(projectPath, PI_QUESTION_EXTENSION_FILE);
  try {
    const content = await readFile(extPath, "utf-8");
    return content.includes("alloy-question") && content.includes("registerTool");
  } catch {
    return false;
  }
}

/** 写入 Pi question 扩展(.pi/extensions/alloy-question.ts) */
export async function writePiQuestionExtension(projectPath: string): Promise<boolean> {
  const extPath = join(projectPath, PI_QUESTION_EXTENSION_FILE);
  const content = generatePiQuestionExtensionContent();
  await mkdir(join(extPath, ".."), { recursive: true });
  await writeFile(extPath, content, "utf-8");
  return true;
}

/** 返回需要装 question 扩展的 agent id 列表(仅 Pi,因 Claude Code/OpenCode 有原生交互工具) */
export function getQuestionSupportedAgents(): string[] {
  return ["pi"];
}

/** 返回 agent 的 question 配置路径描述(用于 init 执行清单显示) */
export function getQuestionConfigPath(agentId: string): string {
  switch (agentId) {
    case "pi": return ".pi/extensions/alloy-question.ts (alloy-question 工具)";
    default: return "";
  }
}

/** 检测指定 agent 是否已装 question 配置 */
export async function hasQuestionConfig(projectPath: string, agentId: string): Promise<boolean> {
  if (agentId === "pi") return hasPiQuestionExtension(projectPath);
  return false;
}

/** 写入 question 配置到指定 agent(幂等)。仅 pi 需要。 */
export async function writeQuestionConfig(projectPath: string, agentId: string): Promise<boolean> {
  if (agentId === "pi") return writePiQuestionExtension(projectPath);
  return false;
}

// --- OpenCode hook 插件(.opencode/plugins/alloy-guard.ts) ---

const OPENCODE_PLUGIN_FILE = ".opencode/plugins/alloy-guard.ts";

function generateOpenCodePluginContent(alloyCliPath: string): string {
  return [
    "// Alloy hook-guard 插件:tool.execute.before(PreToolUse) + session.idle(Stop)",
    "// 由 alloy init 自动生成。plugin 方案替代早期 custom tool 覆盖--可拦截所有工具(含 question),消除盲区",
    'import { execSync } from "node:child_process";',
    "",
    "export const AlloyGuard = async (ctx: any) => {",
    "  return {",
    "    // PreToolUse:工具执行前拦截。throw 阻止工具运行。",
    '    "tool.execute.before": async (input: any, output: any) => {',
    "      const toolName = input?.tool;",
    "      const args = output?.args ?? input?.args ?? {};",
    "",
    "      // 检测问答工具(question) -> 通过 _hook-guard 触发 clearAllPendingGates",
    "      // _hook-guard 内部检测到问答工具(ASK_TOOLS)会自动 clear,无需单独子命令",
    '      if (toolName === "question") {',
    "        try {",
    '          const stdin = JSON.stringify({ tool_name: "question" });',
    `          execSync("node ${alloyCliPath} _hook-guard", {`,
    "            input: stdin,",
    '            stdio: ["pipe", "ignore", "pipe"],',
    "          });",
    "        } catch {",
    "          // clear 失败不阻断问答",
    "        }",
    "        return;",
    "      }",
    "",
    "      // 只拦截 write/edit",
    '      if (toolName !== "write" && toolName !== "edit") return;',
    "",
    "      // OpenCode write/edit 工具参数名是 filePath(驼峰),优先取;兼容 path/file_path",
    "      const filePath = args?.filePath ?? args?.path ?? args?.file_path;",
    "      if (!filePath) return;",
    "",
    "      const stdin = JSON.stringify({",
    '        tool_name: toolName === "write" ? "Write" : "Edit",',
    "        tool_input: { file_path: filePath },",
    "      });",
    "",
    "      try {",
    `        execSync("node ${alloyCliPath} _hook-guard", {`,
    "          input: stdin,",
    '          stdio: ["pipe", "ignore", "pipe"],',
    "        });",
    "      } catch (err: any) {",
    '        const stderr = err.stderr?.toString() ?? "alloy hook 拦截";',
    "        throw new Error(stderr);",
    "      }",
    "    },",
    "",
    "    // Stop:session 空闲时调 _stop-guard(检测文本输出代替问答)",
    '    "session.idle": async () => {',
    "      try {",
    `        execSync("node ${alloyCliPath} _stop-guard", {`,
    '          stdio: ["pipe", "ignore", "pipe"],',
    "        });",
    "      } catch {",
    "        // _stop-guard 检测到问题时 exit 1,这里忽略(已在 stderr 提示)",
    "      }",
    "    },",
    "  };",
    "};",
    "",
  ].join("\n");
}

/** 检测 OpenCode 是否已装 alloy hook 插件 */
export async function hasOpenCodeHookTools(projectPath: string): Promise<boolean> {
  const pluginPath = join(projectPath, OPENCODE_PLUGIN_FILE);
  try {
    const content = await readFile(pluginPath, "utf-8");
    return content.includes("_hook-guard");
  } catch {
    return false;
  }
}

/** 写入 OpenCode hook 插件(.opencode/plugins/alloy-guard.ts) */
export async function writeOpenCodeHookTools(projectPath: string): Promise<boolean> {
  const alloyCliPath = join(getPackageRoot(), "dist", "cli", "index.js");
  const pluginPath = join(projectPath, OPENCODE_PLUGIN_FILE);
  const content = generateOpenCodePluginContent(alloyCliPath);
  await mkdir(join(pluginPath, ".."), { recursive: true });
  await writeFile(pluginPath, content, "utf-8");
  return true;
}
