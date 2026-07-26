// src/cli/commands/internal/hook-guard.ts
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, relative, isAbsolute, resolve, dirname } from "node:path";
import { guardCheck } from "../../../core/hook-guard.js";
import { detectAgent, KNOWN_AGENTS } from "../../../core/agents.js";
import type { AgentId } from "../../../core/types.js";
import { readProjectConfig } from "../../utils/state.js";

interface HookInput {
  tool_name: string;
  tool_input: {
    file_path?: string;
    command?: string;
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
 * 列出所有 git worktree 路径(含主仓)。
 * 非 git 仓库或 git 命令失败时返回 [projectRoot]。
 *
 * 用于 hook-guard 兜底扫描 worktree 内的 .alloy.yaml:
 * OpenCode hook-guard 在主仓执行(cwd=主仓),但 worktree 内 .alloy.yaml 可能与主仓不同步
 * (worktree state 只在 worktree 分支写,主仓 .alloy.yaml 的 worktree 字段为 null)。
 * 只扫主仓会漏 worktree 内的 pending_gate / phase / worktree 路径。
 */
function listGitWorktrees(projectRoot: string): string[] {
  try {
    const output = execSync("git worktree list --porcelain", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const paths: string[] = [];
    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        const wt = line.slice("worktree ".length).trim();
        if (wt) paths.push(wt);
      }
    }
    return paths.length > 0 ? paths : [projectRoot];
  } catch {
    return [projectRoot];
  }
}

/**
 * 扫描所有 change 目录(主仓 + 所有 git worktree)。
 *
 * 原因:OpenCode hook-guard 在主仓执行,但 worktree 内 .alloy.yaml 可能与主仓不同步
 * (worktree state 只在 worktree 分支写,主仓 .alloy.yaml 的 worktree 字段为 null)。
 * 只扫主仓会漏 worktree 内的 pending_gate / phase / worktree 路径,
 * 导致 hook-guard 判定错误(漏 clear pending_gate / 漏拦截 write/edit / phase 判定错)。
 *
 * 多 agent 影响:
 * - Claude Code:hook-guard 在 worktree 内执行,git worktree list 仍列出所有 worktree(含主仓),
 *   扫描范围从"只扫当前 worktree"扩展为"扫所有 worktree",能 clear 其他 worktree 残留 gate
 * - OpenCode:hook-guard 在主仓执行,git worktree list 列出所有 worktree,补全 worktree 内 .alloy.yaml
 * - Pi:不支持 worktree,git worktree list 只返回主仓,等同于原 scanChangeDirs
 */
function scanAllChangeDirs(projectRoot: string): string[] {
  const allDirs = new Set<string>();
  for (const wtPath of listGitWorktrees(projectRoot)) {
    if (!existsSync(wtPath)) continue;
    for (const changeDir of scanChangeDirs(wtPath)) {
      allDirs.add(changeDir);
    }
  }
  return Array.from(allDirs);
}

/**
 * 从 .alloy.yaml 内容读 phase(去引号),用于跳过 finished change。
 * 已完成(phase=finished)的 change 不应影响 alloy--不再收集其 phase/pending_gate/worktree,
 * 也不再被 clearAllPendingGates 改写。
 */
function readPhase(content: string): string | null {
  const match = content.match(/^phase:\s*(.+)$/m);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * 扫描所有 change(活跃 + 归档,主仓 + 所有 worktree)的 .alloy.yaml,收集所有 phase。
 * 非 alloy 项目(无 openspec/changes/)返回空数组。
 * 含 archive/ 下的 archived/finishing phase(finished 默认跳过--已完成 change 不影响 alloy)。
 *
 * includeFinished=true 时含 finished:仅 pre-commit-check 用--finish 阶段 squash merge commit
 * 发生在 _phase complete finish 后(phase=finished),git commit 触发 pre-commit,需放行 staged src/。
 * PreToolUse hook(hook-guard)用默认值(false),已完成 change 不放行新写源码。
 */
export function collectPhases(projectRoot: string, includeFinished = false): string[] {
  const phases: string[] = [];
  for (const changeDir of scanAllChangeDirs(projectRoot)) {
    const stateFile = join(changeDir, ".alloy.yaml");
    try {
      const content = readFileSync(stateFile, "utf-8");
      const phase = readPhase(content);
      if (!phase) continue;
      if (!includeFinished && phase === "finished") continue; // 已完成 change 不影响 alloy(PreToolUse 跳过)
      phases.push(phase);
    } catch {
      // 文件不存在,跳过
    }
  }
  return phases;
}

/**
 * 扫描所有 change(活跃 + 归档,主仓 + 所有 worktree)的 .alloy.yaml,收集所有未通过的 user-gate。
 * pending_gate 为 null/空/不存在 -> 跳过。
 */
export function collectPendingGates(projectRoot: string): string[] {
  const gates: string[] = [];
  for (const changeDir of scanAllChangeDirs(projectRoot)) {
    const stateFile = join(changeDir, ".alloy.yaml");
    try {
      const content = readFileSync(stateFile, "utf-8");
      if (readPhase(content) === "finished") continue; // 已完成 change 不影响 alloy
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
 *
 * 返回的路径已归一化为绝对路径:
 * - .alloy.yaml 中 worktree 字段可能是绝对路径(agent 按 worktree.md 标准写入)或相对路径
 *   (agent 误用 SKILL.md 文档示例字面字符串 / OpenCode `_worktree-create` 写入 `.worktrees/<name>`)
 * - 相对路径以主仓 root 为基准解析(EnterWorktree 与 _worktree-create 都基于主仓创建 worktree,
 *   `.worktrees/<name>` 和 `.claude/worktrees/<name>` 都是相对于主仓 root)
 * - 主仓 root 通过 `git rev-parse --git-common-dir` 获取(在任何 worktree 内都返回主仓 .git 路径)
 *   非 git 项目或 git 命令失败时回退到 projectRoot
 *
 * 不归一化会导致 line 311 `absFilePath.startsWith(wt + "/")` 用绝对路径比对相对路径字符串,永远 false,
 * 误拦 worktree 模式下所有 Write/Edit(agent 被迫用 bash heredoc 绕过)。
 */
export function collectWorktreePaths(projectRoot: string): string[] {
  const paths: string[] = [];
  const mainRoot = getMainRepoRoot(projectRoot);
  for (const changeDir of scanAllChangeDirs(projectRoot)) {
    const stateFile = join(changeDir, ".alloy.yaml");
    try {
      const content = readFileSync(stateFile, "utf-8");
      if (readPhase(content) === "finished") continue; // 已完成 change 不影响 alloy
      const match = content.match(/^worktree:\s*(.+)$/m);
      if (match) {
        const wt = match[1].trim().replace(/^["']|["']$/g, "");
        if (wt && wt !== "null" && wt !== "skipped") {
          // 归一化为绝对路径:绝对路径直接用,相对路径以主仓 root 为基准解析
          const absWt = isAbsolute(wt) ? wt : resolve(mainRoot, wt);
          paths.push(absWt);
        }
      }
    } catch {
      // 文件不存在,跳过
    }
  }
  return paths;
}

/**
 * 获取 git 仓库主仓 root(用于相对路径归一化)。
 *
 * 实现:`git rev-parse --git-common-dir` 在任何 worktree 内都返回主仓 .git 路径,
 * 主仓 root = dirname(.git path)。git 命令失败或非 git 项目时回退到 cwd。
 *
 * 与 listGitWorktrees 一致:try/catch + 回退,确保测试环境(mock execSync)不抛错。
 */
function getMainRepoRoot(cwd: string): string {
  try {
    const gitCommonDir = execSync("git rev-parse --git-common-dir", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const absGitDir = isAbsolute(gitCommonDir) ? gitCommonDir : resolve(cwd, gitCommonDir);
    return dirname(absGitDir);
  } catch {
    return cwd;
  }
}

/**
 * 清除所有 change(活跃 + 归档,主仓 + 所有 worktree)的 pending_gate(问答工具调用后自动触发)。
 *
 * 实现细节:
 * - 用 setPendingGate 精准替换 pending_gate 行,不触发 writeState 全量重写
 *   原因:writeState 全量重序列化会破坏 worktree_created_at 等字段引号格式
 * - 扫描主仓 + 所有 git worktree(用 `git worktree list` 兜底,不依赖主仓 .alloy.yaml 的 worktree 字段)
 *   原因:OpenCode hook-guard 在主仓执行,主仓 .alloy.yaml 的 worktree 字段可能为 null
 *   (worktree state 只在 worktree 分支写),依赖主仓 worktree 字段定位会漏扫 worktree 内 .alloy.yaml,
 *   导致 worktree 内 pending_gate 永远不被 clear,agent 无法推进阶段
 */
export async function clearAllPendingGates(projectRoot: string): Promise<void> {
  const { setPendingGate, addClearedGate } = await import("../../utils/state.js");
  const allDirs = scanAllChangeDirs(projectRoot);
  for (const changeDir of allDirs) {
    const stateFile = join(changeDir, ".alloy.yaml");
    try {
      const content = readFileSync(stateFile, "utf-8");
      if (readPhase(content) === "finished") continue; // 已完成 change 不被改写--alloy 不影响它
      const match = content.match(/^pending_gate:\s*(.+)$/m);
      if (match) {
        const gate = match[1].trim().replace(/^["']|["']$/g, "");
        if (gate && gate !== "null") {
          await setPendingGate(changeDir, null);
          // 把 cleared gate 加入 gate_history,供 _guard user-gate require 前置检查 + _phase complete 检查
          await addClearedGate(changeDir, gate);
          // 不主动 commit:gate_history 改动随下一次 _artifact commit / _state write --commit 落地
          // 原因:主动 commit 会产生 `chore: clear USER_GATE <gate>` 污染历史(违反 d4b5db4 规范)
          // worktree 场景(EnterWorktree 从 HEAD 创建)的 gate_history 同步由 _worktree-create 负责
        }
      }
    } catch (e) {
      // 不阻断 hook exit code(hook 不能因 .alloy.yaml 损坏阻塞工具调用),
      // 但输出 stderr 提示:可能是 .alloy.yaml 有 YAML 语法错误(重复键等),需 agent 排查
      // 旧实现静默吞 YAMLParseError,让 bug 沿时间线传播,最后在 readState 时才暴露,定位困难
      process.stderr.write(`⚠️ hook-guard clearAllPendingGates 失败 (${changeDir}): ${e}\n`);
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
  if (!agent) return "问答工具(AskUserQuestion/question)";
  const agentInfo = KNOWN_AGENTS.find(a => a.id === agent);
  return agentInfo?.askToolDisplay ?? "问答工具(AskUserQuestion/question)";
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
  worktreePaths?: string[],
  currentBranch?: string,
  mainBranch?: string
): { exitCode: number; message?: string; clearPendingGates?: boolean; checkUnlockedArtifact?: boolean } {
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

  // 拦截 Bash 危险命令(P0:cat heredoc 写文件 + git 自救命令)
  // Claude Code matcher 已扩展到 Bash;OpenCode/Pi 的 plugin/extension 已拦截所有工具
  if (input.tool_name === "Bash") {
    const command = input.tool_input?.command ?? "";
    if (!command) return { exitCode: 0 };

    // P0: cat heredoc 写文件(应改用 Write/Edit 工具)
    // 只拦 heredoc(cat << / <<EOF),不拦重定向(> file / >> file)
    // 原因:重定向可能是合法操作(git log > file 输出重定向 / echo > /dev/null 丢弃输出 /
    // .git/squash-merge-msg.txt 等),误拦会阻断正常流程
    // heredoc 是明确的"用 bash 写多行文件",应改用 Write/Edit
    if (/cat\s+<<|<<\s*EOF\b/.test(command)) {
      const message = [
        `⛔ [alloy hook] 检测到 cat heredoc 写文件:`,
        `  ${command.slice(0, 200)}`,
        "",
        "  应改用 Write/Edit 工具写文件,避免 heredoc + 变量展开问题(Claude Code Bash 用 eval 触发 command too long)。",
        "  详见 alloy-shared/references/cli-reference.md _chore-commit 章节(用 -F 文件方式提交)。",
        "",
        "  如确需绕过(仅限修复畸形状态),设置 ALLOY_FORCE_WRITE=1。",
      ].join("\n");
      return { exitCode: 2, message };
    }

    // P0: git 自救命令(permissions deny 已拦截,hook 是双保险)
    // 检测:git reset --hard / git checkout . / git restore . / git stash drop / git merge --abort / git clean -fd / git branch -D
    // 不用末尾 \b:因为 `.` / `--hard` 等后是非单词字符,\b 不匹配
    // 要求 git 前是行首或命令分隔符(;&|()` 换行),排除 echo 字符串内的 "git reset --hard" 等文本
    // 实测踩坑:finish SKILL.md 的 git pull 块 echo "禁止:agent 自动运行 git reset --hard ..."
    // 被旧正则 \bgit\s+ 误匹配,整段 bash 被拦
    // branch -D 拦截:agent 不应自动强删分支,应下沉到 alloy _finish-cleanup(含变量校验 + USER_GATE 前置)
    const selfRescueRe = /(?:^|[;&|()`\n]+\s*)git\s+(reset\s+--hard|checkout\s+\.|restore\s+\.|restore\s+--staged\s+\.|stash\s+drop|merge\s+--abort|clean\s+-fd|branch\s+-D)/;
    if (selfRescueRe.test(command)) {
      const message = [
        `⛔ [alloy hook] 检测到 git 自救命令(已由 permissions deny + 本 hook 双保险拦截):`,
        `  ${command.slice(0, 200)}`,
        "",
        "  这些命令会丢失用户已 stage 的工作,退出 skill 让用户处理是唯一合法路径。",
        "  详见 alloy-shared/references/git-self-rescue-ban.md。",
        "",
        "  如确需绕过(仅限修复畸形状态),设置 ALLOY_FORCE_WRITE=1。",
      ].join("\n");
      return { exitCode: 2, message };
    }

    // P1: git commit 时检查制品未锁(staged 制品文件不在 records)
    // 实际检查在 hookGuardCommand 里(需要执行 git diff + 读 records)
    // 这里只返回标记,由 hookGuardCommand 调 checkUnlockedArtifactCommit
    if (/\bgit\s+commit\b/.test(command)) {
      return { exitCode: 0, checkUnlockedArtifact: true };
    }

    return { exitCode: 0 };
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

  // 调 guardCheck(传 pendingGates + isAlloyProject + currentBranch/mainBranch;undefined 时 guardCheck 内部默认)
  const result = guardCheck({ filePath: relPath, phases, pendingGates: gates, isAlloyProject, currentBranch, mainBranch });

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

  // 获取当前 git 分支 + main_branch 配置(用于 main 分支检测)
  // 非 git 项目或 git 命令失败时 currentBranch=undefined,跳过 main 分支检测
  let currentBranch: string | undefined;
  let mainBranch: string | undefined;
  try {
    const branch = execSync("git branch --show-current", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (branch) currentBranch = branch;
  } catch {
    // 非 git 项目或 git 命令失败,跳过 main 分支检测
  }
  if (currentBranch) {
    try {
      const config = await readProjectConfig(projectRoot);
      mainBranch = config.alloy?.main_branch ?? "main";
    } catch {
      // config 读取失败,默认 main
      mainBranch = "main";
    }
  }

  const result = evaluateHook(raw, phases, process.env as Record<string, string>, projectRoot, pendingGates, isAlloy, worktreePaths, currentBranch, mainBranch);

  if (result.clearPendingGates) {
    await clearAllPendingGates(projectRoot);
  }

  // P1: git commit 时检查制品未锁(staged 制品文件不在 records)
  if (result.checkUnlockedArtifact) {
    const unlockedResult = checkUnlockedArtifact(projectRoot);
    if (unlockedResult.exitCode !== 0) {
      console.error(unlockedResult.message);
      process.exit(unlockedResult.exitCode);
      return;
    }
  }

  if (result.message) {
    console.error(result.message);
  }
  process.exit(result.exitCode);
}

/**
 * P1: 检查 staged 制品文件是否未锁(不在 records)
 *
 * agent 直接用 git commit 提交制品文件(绕过 _artifact commit)时,制品 hash 未锁定,
 * records 不含该 artifact。本函数检测这种情况,exit 2 拦截。
 *
 * _artifact commit 内部的 git commit 通过 execSync 调用(不触发 Bash hook),不受影响。
 *
 * 逻辑:
 * 1. git diff --cached --name-only 获取 staged 文件
 * 2. 匹配 openspec/changes/<name>/{proposal,design,tasks,plans,verify,retrospective}.md
 * 3. 读该 change 的 .alloy.yaml,检查 records 是否含该 artifact
 * 4. records 不含 -> exit 2(未锁制品)
 */
function checkUnlockedArtifact(projectRoot: string): { exitCode: number; message?: string } {
  let stagedFiles: string[] = [];
  try {
    const output = execSync("git diff --cached --name-only", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    stagedFiles = output ? output.split("\n") : [];
  } catch {
    return { exitCode: 0 }; // git diff 失败,放行
  }

  if (stagedFiles.length === 0) return { exitCode: 0 };

  // 制品文件模式:openspec/changes/<name>/{proposal,design,tasks,plans,verify,retrospective}.md
  // 归档路径:openspec/changes/archive/<date>-<name>/...
  const artifactPattern = /^openspec\/changes\/(?:archive\/\d{4}-\d{2}-\d{2}-)?([^/]+)\/(proposal|design|tasks|plans|verify|retrospective)\.md$/;

  for (const file of stagedFiles) {
    const match = file.match(artifactPattern);
    if (!match) continue;

    const [, changeName, artifact] = match;

    // 找该 change 的 .alloy.yaml(活跃或归档)
    const activeStateFile = join(projectRoot, "openspec", "changes", changeName, ".alloy.yaml");
    const archiveStateFile = join(projectRoot, "openspec", "changes", "archive", `${new Date().toISOString().slice(0, 10)}-${changeName}`, ".alloy.yaml");

    let content: string | null = null;
    for (const stateFile of [activeStateFile, archiveStateFile]) {
      try {
        content = readFileSync(stateFile, "utf-8");
        break;
      } catch {
        // 文件不存在,试下一个
      }
    }

    if (!content) {
      // .alloy.yaml 不存在,放行(可能不是 alloy change)
      continue;
    }

    // 检查 records 是否含该 artifact
    const artifactRegex = new RegExp(`artifact:\\s*${artifact}\\b`);
    if (!artifactRegex.test(content)) {
      return {
        exitCode: 2,
        message: [
          `⛔ [alloy hook] 检测到未锁定的制品 commit:`,
          `  ${file}`,
          `  制品 ${artifact} 不在 records(未通过 alloy _artifact commit 锁定)。`,
          `  请用 alloy _artifact commit <change-dir> ${artifact} 完成锁定 + commit。`,
          `  如确需绕过(仅限修复畸形状态),设置 ALLOY_FORCE_WRITE=1。`,
        ].join("\n"),
      };
    }
  }

  return { exitCode: 0 };
}
