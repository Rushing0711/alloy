// src/cli/commands/internal/phase.ts
import { realpathSync } from "node:fs";
import { basename, relative } from "node:path";
import { execSync } from "node:child_process";
import { readState, writeState } from "../../utils/state.js";
import type { AlloyState, PhaseTimings } from "../../../core/types.js";

const PHASE_TARGETS: Record<string, string | null> = {
  start: null, // start 完成 phase 保持 started，plan 完成才推进到 planned
  plan: "planned",
  apply: "applied",
  archive: "archived",
  finish: "finished",
};

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 找到 changeDir 所在的 git 仓库根目录，返回 {root, relPath}；非 git 仓库返回 null */
function findGitRoot(changeDir: string): { root: string; relPath: string } | null {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd: changeDir,
      encoding: "utf-8",
    }).trim();
    const realChangeDir = realpathSync(changeDir);
    let rel = relative(root, realChangeDir);
    if (rel === "") rel = ".";
    return { root, relPath: rel };
  } catch {
    return null;
  }
}

/** 写 phase_timings.<phase>.completed_at（writeState 自动刷新 updated_at） */
async function writeCompletedAt(changeDir: string, phase: string, completedAt: string): Promise<void> {
  const state = await readState(changeDir);
  const timings = (state.phase_timings ?? {}) as PhaseTimings;
  const phaseKey = phase as keyof PhaseTimings;
  const existing = timings[phaseKey];
  timings[phaseKey] = {
    started_at: existing?.started_at ?? "",
    completed_at: completedAt,
  };
  state.phase_timings = timings;
  await writeState(changeDir, state);
}

/** 推进 phase（内联 guard 的 --apply 逻辑，避免子进程调用开销） */
async function advancePhase(changeDir: string, targetPhase: string): Promise<void> {
  const state = await readState(changeDir);
  state.phase = targetPhase as AlloyState["phase"];
  await writeState(changeDir, state);
}

/** 幂等写 phase_timings.<phase>.started_at——已存在则不覆盖，返回当前值。
 *  at 传入实际开始时间（补录场景：技能在 change 目录创建前执行，started_at 只能补录） */
async function ensureStartedAt(changeDir: string, phase: string, at?: string): Promise<string> {
  const state = await readState(changeDir);
  const timings = (state.phase_timings ?? {}) as PhaseTimings;
  const phaseKey = phase as keyof PhaseTimings;
  const existing = timings[phaseKey];

  if (existing?.started_at) {
    return existing.started_at;
  }

  const now = at || formatTimestamp();
  timings[phaseKey] = {
    started_at: now,
    completed_at: existing?.completed_at ?? null,
  };
  state.phase_timings = timings;
  await writeState(changeDir, state); // 自动刷新 updated_at
  return now;
}

/** git add 限路径 + commit（无变更跳过） */
function gitAddAndCommit(gitRoot: { root: string; relPath: string }, addPath: string, commitMsg: string, logPrefix: string): void {
  try {
    execSync(`git add "${addPath}"`, { cwd: gitRoot.root, stdio: "pipe" });
  } catch (e) {
    const err = e as { stderr?: Buffer; message: string };
    const stderr = err.stderr?.toString() ?? "";
    console.error(`[FAIL] git add 失败: ${err.message}${stderr ? `\n${stderr}` : ""}`);
    process.exit(1);
  }

  let hasStagedChanges = false;
  try {
    execSync("git diff --cached --quiet", { cwd: gitRoot.root, stdio: "pipe" });
  } catch {
    hasStagedChanges = true;
  }

  if (!hasStagedChanges) {
    console.log(`✓ ${logPrefix} (无文件变更，跳过 commit)`);
    return;
  }

  try {
    execSync(`git commit -m "${commitMsg}"`, { cwd: gitRoot.root, stdio: "pipe" });
    console.log(`✓ ${logPrefix} 已 commit`);
  } catch (e) {
    const err = e as { stderr?: Buffer; message: string };
    const stderr = err.stderr?.toString() ?? "";
    console.error(`[FAIL] git commit 失败: ${err.message}${stderr ? `\n${stderr}` : ""}`);
    process.exit(1);
  }
}

/**
 * alloy _phase <complete|start|reset> <change-dir> <phase>
 *
 *   start    — 阶段开始：幂等写 started_at + git add 限路径 + commit（独立"阶段开始"commit）
 *   complete — 阶段完成：写 completed_at + 推进 phase + git add 限路径 + commit
 *   reset    — 阶段回溯：删除 phase_timings.<phase> 整个 key + git add 限路径 + commit（回溯清理专用）
 */
export async function phaseCommand(args: string[]): Promise<void> {
  const action = args[0];

  if (!action) {
    console.error("用法: alloy _phase <start|complete|reset> <change-dir> <phase>");
    return process.exit(1);
  }

  if (action === "complete") {
    return phaseComplete(args.slice(1));
  }

  if (action === "start") {
    return phaseStart(args.slice(1));
  }

  if (action === "reset") {
    return phaseReset(args.slice(1));
  }

  console.error(`未知操作: ${action} (支持: start, complete, reset)`);
  return process.exit(1);
}

async function phaseStart(args: string[]): Promise<void> {
  const changeDir = args[0];
  const phase = args[1];

  if (!changeDir || !phase) {
    console.error("用法: alloy _phase start <change-dir> <phase> [--at <timestamp>]");
    return process.exit(1);
  }

  if (!(phase in PHASE_TARGETS)) {
    console.error(`无效的 phase: ${phase} (支持: ${Object.keys(PHASE_TARGETS).join(", ")})`);
    return process.exit(1);
  }

  // 解析可选 --at 参数（补录场景：技能在 change 目录创建前执行，started_at 只能补录）
  let at: string | undefined;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--at" && i + 1 < args.length) {
      at = args[++i];
    }
  }

  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    return process.exit(1);
  }

  // 幂等写 started_at（已存在不覆盖）
  const startedAt = await ensureStartedAt(changeDir, phase, at);

  // git add 限路径 + commit
  const changeName = basename(changeDir);
  const addPath = gitRoot.relPath === "." ? "." : `${gitRoot.relPath}/.alloy.yaml`;
  gitAddAndCommit(gitRoot, addPath, `chore(${changeName}): 记录 ${phase} 阶段开始时间`, `${phase}: started_at=${startedAt}`);
}

async function phaseComplete(args: string[]): Promise<void> {
  const changeDir = args[0];
  const phase = args[1];

  if (!changeDir || !phase) {
    console.error("用法: alloy _phase complete <change-dir> <phase>");
    return process.exit(1);
  }

  if (!(phase in PHASE_TARGETS)) {
    console.error(`无效的 phase: ${phase} (支持: ${Object.keys(PHASE_TARGETS).join(", ")})`);
    return process.exit(1);
  }

  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    return process.exit(1);
  }

  const completedAt = formatTimestamp();
  const target = PHASE_TARGETS[phase];

  // 1. 写 completed_at（writeState 自动刷新 updated_at）
  await writeCompletedAt(changeDir, phase, completedAt);

  // 2. 推进 phase（start 除外——start 完成 phase 保持 started）
  if (target) {
    await advancePhase(changeDir, target);
  }

  // 3. git add 限路径 + commit
  const changeName = basename(changeDir);
  const addPath = gitRoot.relPath === "." ? "." : `${gitRoot.relPath}/.alloy.yaml`;
  const commitMsg = target
    ? `chore(${changeName}): 记录 ${phase} 阶段完成时间，推进到 ${target}`
    : `chore(${changeName}): 记录 ${phase} 阶段完成时间`;
  gitAddAndCommit(gitRoot, addPath, commitMsg, `${phase}: completed_at=${completedAt}${target ? ` → ${target}` : ""}`);
}

/** 删除 phase_timings.<phase> 整个 key（回溯清理专用，writeState 自动刷新 updated_at）。返回是否实际删除。 */
async function removePhaseTiming(changeDir: string, phase: string): Promise<boolean> {
  const state = await readState(changeDir);
  const timings = (state.phase_timings ?? {}) as PhaseTimings;
  const phaseKey = phase as keyof PhaseTimings;
  if (!(phaseKey in timings)) {
    return false; // key 不存在，幂等跳过
  }
  delete timings[phaseKey];
  state.phase_timings = timings;
  await writeState(changeDir, state);
  return true;
}

async function phaseReset(args: string[]): Promise<void> {
  const changeDir = args[0];
  const phase = args[1];

  if (!changeDir || !phase) {
    console.error("用法: alloy _phase reset <change-dir> <phase>");
    return process.exit(1);
  }

  if (!(phase in PHASE_TARGETS)) {
    console.error(`无效的 phase: ${phase} (支持: ${Object.keys(PHASE_TARGETS).join(", ")})`);
    return process.exit(1);
  }

  // 删除 phase_timings.<phase>（不存在则幂等跳过，不 commit）
  const removed = await removePhaseTiming(changeDir, phase);
  if (!removed) {
    console.log(`✓ ${phase}: timing 不存在，跳过`);
    return;
  }

  // git add 限路径 + commit
  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    return process.exit(1);
  }
  const changeName = basename(changeDir);
  const addPath = gitRoot.relPath === "." ? "." : `${gitRoot.relPath}/.alloy.yaml`;
  gitAddAndCommit(gitRoot, addPath, `chore(${changeName}): 回溯——清除 ${phase} 阶段时间记录`, `${phase}: timing 已清除`);
}
