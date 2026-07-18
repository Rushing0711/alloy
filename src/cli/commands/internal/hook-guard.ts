// src/cli/commands/internal/hook-guard.ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { guardCheck } from "../../../core/hook-guard.js";
import { detectAgent } from "../../../core/agents.js";
import type { AgentId } from "../../../core/types.js";

interface HookInput {
  tool_name: string;
  tool_input: {
    file_path?: string;
    [key: string]: unknown;
  };
}

/**
 * 判断是否 alloy 项目(有 openspec/changes/ 目录)。
 * alloy init 会创建此目录。即使所有 change 都归档(只剩 archive/),目录仍存在。
 * 用于区分"真非 alloy 项目(放行)"和"alloy 项目但无活跃 change(拦截)"。
 */
export function isAlloyProject(projectRoot: string): boolean {
  const changesDir = join(projectRoot, "openspec", "changes");
  return existsSync(changesDir);
}

/**
 * 收集所有 change 目录路径(活跃 + 归档)。
 * 活跃:openspec/changes/<entry>/(跳过 archive/ 子目录)
 * 归档:openspec/changes/archive/<entry>/(含 archived/finishing/finished change)
 *
 * 扫描 archive/ 是为了让 guardCheck 知道 finish 阶段的 change(phase=finishing/finished),
 * 从而放行 finish 阶段合入 main 的 squash merge commit。
 */
function scanChangeDirs(projectRoot: string): string[] {
  const dirs: string[] = [];
  const changesDir = join(projectRoot, "openspec", "changes");
  if (!existsSync(changesDir)) return dirs;

  collectChangeDirsFromDir(changesDir, dirs, true);
  const archiveDir = join(changesDir, "archive");
  if (existsSync(archiveDir)) {
    collectChangeDirsFromDir(archiveDir, dirs, false);
  }
  return dirs;
}

function collectChangeDirsFromDir(dir: string, dirs: string[], skipArchive: boolean): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (skipArchive && entry.name === "archive") continue;
    dirs.push(join(dir, entry.name));
  }
}

/**
 * 扫描所有 change(活跃 + 归档)的 .alloy.yaml,收集所有 phase。
 * 非 alloy 项目(无 openspec/changes/)返回空数组。
 * 含 archive/ 下的 archived/finishing/finished phase(用于 guardCheck 放行 finish 阶段合入)。
 */
export function collectPhases(projectRoot: string): string[] {
  const phases: string[] = [];
  for (const changeDir of scanChangeDirs(projectRoot)) {
    const stateFile = join(changeDir, ".alloy.yaml");
    try {
      const content = readFileSync(stateFile, "utf-8");
      const match = content.match(/^phase:\s*(.+)$/m);
      if (match) {
        phases.push(match[1].trim().replace(/^["']|["']$/g, ""));
      }
    } catch {
      // 文件不存在,跳过
    }
  }
  return phases;
}

/**
 * 扫描所有 change(活跃 + 归档)的 .alloy.yaml,收集所有未通过的 user-gate。
 * pending_gate 为 null/空/不存在 -> 跳过。
 */
export function collectPendingGates(projectRoot: string): string[] {
  const gates: string[] = [];
  for (const changeDir of scanChangeDirs(projectRoot)) {
    const stateFile = join(changeDir, ".alloy.yaml");
    try {
      const content = readFileSync(stateFile, "utf-8");
      const match = content.match(/^pending_gate:\s*(.+)$/m);
      if (match) {
        const gate = match[1].trim().replace(/^["']|["']$/g, "");
        if (gate && gate !== "null") {
          gates.push(gate);
        }
      }
    } catch {
      // 文件不存在,跳过
    }
  }
  return gates;
}

/**
 * 收集所有 worktree 模式 change 的 worktree 路径(实际值,非 null/skipped)。
 * 用于 write/edit 路径拦截:worktree 模式下,write/edit 必须用 worktree 绝对路径,
 * 不能用相对路径或主仓绝对路径(会落主仓污染 feature 分支)。
 */
export function collectWorktreePaths(projectRoot: string): string[] {
  const paths: string[] = [];
  for (const changeDir of scanChangeDirs(projectRoot)) {
    const stateFile = join(changeDir, ".alloy.yaml");
    try {
      const content = readFileSync(stateFile, "utf-8");
      const match = content.match(/^worktree:\s*(.+)$/m);
      if (match) {
        const wt = match[1].trim().replace(/^["']|["']$/g, "");
        if (wt && wt !== "null" && wt !== "skipped") {
          paths.push(wt);
        }
      }
    } catch {
      // 文件不存在,跳过
    }
  }
  return paths;
}

/**
 * 清除所有 change(活跃 + 归档)的 pending_gate(问答工具调用后自动触发)。
 *
 * 实现细节(2026-07-17 修复):
 * - 用 setPendingGate 精准替换 pending_gate 行,不触发 writeState 全量重写
 *   原因:writeState 全量重序列化会破坏 worktree_created_at 等字段引号格式
 * - 扫描主仓 change 目录 + worktree 内 change 目录(从 state.worktree 字段读路径)
 *   原因:agent 在 worktree 内 user-gate require 写 worktree 内 .alloy.yaml,
 *   hook-guard 在主仓执行(cwd=主仓),只扫主仓会漏 worktree 内的 pending_gate,
 *   导致 worktree 内 pending_gate 永远不被 clear,agent 无法推进阶段
 */
export async function clearAllPendingGates(projectRoot: string): Promise<void> {
  const { setPendingGate } = await import("../../utils/state.js");
  const mainChangeDirs = scanChangeDirs(projectRoot);
  // 收集所有需要扫描的目录(主仓 + worktree 路径)
  const allDirs = new Set(mainChangeDirs);
  for (const changeDir of mainChangeDirs) {
    const stateFile = join(changeDir, ".alloy.yaml");
    try {
      const content = readFileSync(stateFile, "utf-8");
      // 读 worktree 字段,如果存在且目录存在,扫描 worktree 内的 change 目录
      const worktreeMatch = content.match(/^worktree:\s*(.+)$/m);
      if (worktreeMatch) {
        const worktreePath = worktreeMatch[1].trim().replace(/^["']|["']$/g, "");
        if (worktreePath && worktreePath !== "null" && worktreePath !== "skipped") {
          const absWorktreePath = isAbsolute(worktreePath)
            ? worktreePath
            : join(projectRoot, worktreePath);
          if (existsSync(absWorktreePath)) {
            // worktree 内的 change 目录路径与主仓相同(changeDir 相对 projectRoot)
            const relChangeDir = relative(projectRoot, changeDir);
            const worktreeChangeDir = join(absWorktreePath, relChangeDir);
            if (existsSync(join(worktreeChangeDir, ".alloy.yaml"))) {
              allDirs.add(worktreeChangeDir);
            }
          }
        }
      }
    } catch {
      // 文件不存在,跳过
    }
  }
  // 扫描所有目录,精准替换 pending_gate 为 null
  for (const changeDir of allDirs) {
    const stateFile = join(changeDir, ".alloy.yaml");
    try {
      const content = readFileSync(stateFile, "utf-8");
      const match = content.match(/^pending_gate:\s*(.+)$/m);
      if (match) {
        const gate = match[1].trim().replace(/^["']|["']$/g, "");
        if (gate && gate !== "null") {
          await setPendingGate(changeDir, null);
        }
      }
    } catch {
      // 文件不存在或读错误,跳过
    }
  }
}

/** 从 stdin(fd 0)读 JSON */
function readStdin(): string {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

/** 问答工具名(Claude Code 的 AskUserQuestion / OpenCode 的 question / Pi 的 alloy-question) */
const ASK_TOOLS = new Set(["AskUserQuestion", "question", "ask", "alloy-question"]);

/** 根据 agent 返回 USER_GATE 应用的交互工具提示 */
function getAgentToolHint(agent: AgentId | null): string {
  switch (agent) {
    case "claude-code": return "AskUserQuestion";
    case "opencode": return "question";
    case "pi": return "ctx.ui select(alloy ask-question 扩展)";
    default: return "问答工具(AskUserQuestion/question)";
  }
}

/**
 * 纯逻辑判定:给定 stdin + phases + env,返回 exitCode + message。
 * 不涉及 process.exit / process.cwd,便于测试。
 */
export function evaluateHook(
  rawStdin: string,
  phases: string[],
  env: Record<string, string>,
  projectRoot?: string,
  pendingGates?: string[],
  isAlloyProject?: boolean,
  worktreePaths?: string[]
): { exitCode: number; message?: string; clearPendingGates?: boolean } {
  const gates = pendingGates ?? [];
  const wtPaths = worktreePaths ?? [];

  // 逃生阀
  if (env.ALLOY_FORCE_WRITE === "1") {
    return { exitCode: 0 };
  }

  // 空 stdin:非 hook 场景,放行
  if (!rawStdin.trim()) {
    return { exitCode: 0 };
  }

  // 解析 JSON
  let input: HookInput;
  try {
    input = JSON.parse(rawStdin);
  } catch {
    return { exitCode: 0 };
  }

  // 检测问答工具 -> clear pending gates
  if (ASK_TOOLS.has(input.tool_name)) {
    return { exitCode: 0, clearPendingGates: gates.length > 0 };
  }

  // 只拦截 Write/Edit
  if (input.tool_name !== "Write" && input.tool_name !== "Edit") {
    return { exitCode: 0 };
  }

  const filePath = input.tool_input?.file_path;
  if (!filePath) {
    return { exitCode: 0 };
  }

  // 转相对路径
  let relPath: string;
  if (isAbsolute(filePath)) {
    const root = projectRoot ?? process.cwd();
    relPath = relative(root, filePath);
  } else {
    relPath = filePath;
  }

  // worktree 路径校验:worktree 模式下,write/edit 必须用 worktree 绝对路径
  // 原因:OpenCode 的 write/edit 工具与 bash 独立进程,不共享 cwd。
  // bash 里传 workdir 不影响 write/edit,相对路径按 session cwd(主仓)解析,文件落主仓。
  // Pi 不支持 worktree,不会进 worktree 模式,不触发本校验。
  // 解决:有 worktree 模式 change 时,write/edit 源码/制品路径必须是 worktree 绝对路径。
  if (wtPaths.length > 0 && isAlloyProject !== false) {
    const absFilePath = isAbsolute(filePath) ? filePath : join(projectRoot ?? process.cwd(), filePath);
    const isInWorktree = wtPaths.some(wt => absFilePath.startsWith(wt + "/") || absFilePath === wt);
    if (!isInWorktree) {
      // 路径不在任何 worktree 内,检查是否是源码/制品路径(需要隔离的)
      const sourcePattern = /^(scripts\/|src\/|openspec\/changes\/[^/]+\/(?!.*\.alloy\.yaml))/;
      if (sourcePattern.test(relPath)) {
        const message = [
          `⛔ [alloy hook] worktree 模式下,write/edit 必须用 worktree 绝对路径`,
          `  当前路径: ${filePath}`,
          `  worktree 路径: ${wtPaths.join(", ")}`,
          "",
          "  原因:OpenCode 的 write/edit 工具与 bash 独立进程,不共享 cwd。",
          "  bash 里传 workdir 不影响 write/edit,相对路径按 session cwd(主仓)解析,文件落主仓。",
          "",
          "  修复:用 worktree 绝对路径前缀:",
          ...wtPaths.map(wt => `    ${wt}/${relPath}`),
          "",
          "  逃生阀:ALLOY_FORCE_WRITE=1 绕过(仅限修复畸形状态)。",
        ].join("\n");
        return { exitCode: 2, message };
      }
    }
  }

  // 调 guardCheck(传 pendingGates + isAlloyProject;undefined 时 guardCheck 内部默认 true)
  const result = guardCheck({ filePath: relPath, phases, pendingGates: gates, isAlloyProject });

  if (result.allowed) {
    return { exitCode: 0 };
  }

  // 拦截:自适应消息(user-gate vs 无活跃 change vs 非 apply)
  const agent = detectAgent(env);
  const toolHint = getAgentToolHint(agent);
  const message = result.reason.includes("user-gate")
    ? [
        `⛔ [alloy hook] ${result.reason}`,
        `  请先用 ${toolHint} 与用户确认,`,
        "  或调 alloy _guard user-gate pass <change-dir> 手动降级。",
        "  如确需紧急绕过,设置 ALLOY_FORCE_WRITE=1。",
      ].join("\n")
    : phases.length === 0
      ? [
          `⛔ [alloy hook] ${result.reason}`,
          "  alloy 项目无活跃 change,禁止直接写源码。",
          "  请先调 /alloy-start <topic> 创建 change 并走完 plan -> apply 流程。",
          "  如确需紧急绕过,设置 ALLOY_FORCE_WRITE=1。",
        ].join("\n")
      : [
          `⛔ [alloy hook] ${result.reason}`,
          "  当前阶段不允许写源码。请先进入 apply 阶段:",
          "    alloy _phase start <change-dir> apply",
          "  如确需紧急修复畸形状态,设置 ALLOY_FORCE_WRITE=1 绕过。",
        ].join("\n");

  return { exitCode: 2, message };
}

/**
 * alloy _hook-guard
 *
 * PreToolUse hook 适配器(Claude Code 用)。
 * 从 stdin 读 JSON,判定是否允许 Write/Edit,exit 0(放行)/ 2(拦截)。
 *
 * Claude Code 的 settings.json 配置:
 *   hooks.PreToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: "alloy _hook-guard" }] }]
 */
export async function hookGuardCommand(args: string[]): Promise<void> {
  const raw = readStdin();
  const projectRoot = process.cwd();
  const phases = collectPhases(projectRoot);
  const pendingGates = collectPendingGates(projectRoot);
  const isAlloy = isAlloyProject(projectRoot);
  const worktreePaths = collectWorktreePaths(projectRoot);
  const result = evaluateHook(raw, phases, process.env as Record<string, string>, projectRoot, pendingGates, isAlloy, worktreePaths);

  if (result.clearPendingGates) {
    await clearAllPendingGates(projectRoot);
  }
  if (result.message) {
    console.error(result.message);
  }
  process.exit(result.exitCode);
}
