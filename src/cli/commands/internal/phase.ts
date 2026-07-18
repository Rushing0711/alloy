// src/cli/commands/internal/phase.ts
import { realpathSync } from "node:fs";
import { basename, relative } from "node:path";
import { execSync } from "node:child_process";
import { readState, writeState } from "../../utils/state.js";
import type { AlloyState, PhaseTimings } from "../../../core/types.js";

const PHASE_START_TARGETS: Record<string, string> = {
  start: "starting",
  plan: "planning",
  apply: "applying",
  archive: "archiving",
  finish: "finishing",
};

const PHASE_COMPLETE_TARGETS: Record<string, string> = {
  start: "started",
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

/** 写 phase_timings.<phase>.completed_at（writeState 自动刷新 updated_at）。
 *  前置校验:started_at 必须已存在——_phase complete 前必须先 _phase start。
 *  缺失时 PRECONDITION_FAIL,避免 started_at 退化为空字符串污染时间线。 */
async function writeCompletedAt(changeDir: string, phase: string, completedAt: string): Promise<void> {
  const state = await readState(changeDir);
  const timings = (state.phase_timings ?? {}) as PhaseTimings;
  const phaseKey = phase as keyof PhaseTimings;
  const existing = timings[phaseKey];

  if (!existing?.started_at) {
    console.error(`⛔ [PRECONDITION_FAIL] ${phase} 阶段未执行 _phase start,拒绝写 completed_at`);
    console.error(`  phase_timings.${phase}.started_at 缺失——_phase complete 前必须先 _phase start。`);
    console.error(`  可能原因:agent 跳过了阶段入口的 _phase start 调用。`);
    console.error(`  修复:先运行 alloy _phase start ${changeDir} ${phase},再运行 _phase complete。`);
    process.exit(1);
    return; // 测试 mock process.exit 时不真退出,此处防御继续执行
  }

  timings[phaseKey] = {
    started_at: existing.started_at,
    completed_at: completedAt,
  };
  state.phase_timings = timings;
  await writeState(changeDir, state);
}

/** finish 阶段额外写顶层 completed_at（全周期完成时间） */
async function writeTopLevelCompletedAt(changeDir: string, completedAt: string): Promise<void> {
  const state = await readState(changeDir);
  state.completed_at = completedAt;
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

  if (!(phase in PHASE_START_TARGETS)) {
    console.error(`无效的 phase: ${phase} (支持: ${Object.keys(PHASE_START_TARGETS).join(", ")})`);
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

  // 进入新阶段时,检查上阶段的 phase-complete gate 是否已通过(在 gate_history)。
  // 原因:SKILL.md 要求阶段转换前设 phase-complete gate + 用户确认(问答工具 clear -> gate_history),
  // 但实测 agent 会跳过 phase-complete gate 直接 _phase start <next>,剥夺用户决策权。
  // CLI 层硬约束:上阶段 phase-complete gate 必须在 gate_history,否则 HARD_STOP。
  // 覆盖阶段:plan(检查 start:phase-complete)/ apply(plan) / archive(apply) / finish(archive)。
  // start 无上阶段,不检查。
  const prevPhaseMap: Record<string, string> = {
    plan: "start",
    apply: "plan",
    archive: "apply",
    finish: "archive",
  };
  const prevPhase = prevPhaseMap[phase];
  if (prevPhase) {
    try {
      const state = await readState(changeDir);
      const prevGate = `${prevPhase}:phase-complete`;
      const history = state.gate_history ?? [];
      if (!history.includes(prevGate)) {
        console.error(`⛔ [HARD_STOP] 进入 ${phase} 阶段前未通过 ${prevGate} gate`);
        console.error("");
        console.error("  原因:agent 可能跳过了上阶段 phase-complete gate,直接 _phase start");
        console.error("  SKILL.md 要求阶段转换前设 phase-complete gate + 问答工具确认,用户需确认进入下一阶段");
        console.error("");
        console.error("  合法路径:");
        console.error(`    1. alloy _guard user-gate require ${changeDir} ${prevGate}`);
        console.error("    2. 问答工具确认(Claude Code AskUserQuestion / OpenCode question / Pi alloy-question)");
        console.error("       -> hook-guard 检测到问答工具调用,自动 clear pending_gate + 加入 gate_history");
        console.error(`    3. alloy _phase start ${changeDir} ${phase}`);
        console.error("");
        console.error("  违反字面 = 违反精神:哪怕'用户已口头同意'、'流程很顺不用确认',也算违反--");
        console.error("  phase-complete gate 必须用问答工具物理确认,口头同意不算授权。");
        return process.exit(1);
      }
      // 上阶段 phase-complete gate 已通过,如果 pending_gate 残留是 prevGate,自动 clear(防御性)
      if (state.pending_gate === prevGate) {
        const { setPendingGate } = await import("../../utils/state.js");
        await setPendingGate(changeDir, null);
        console.log(`ℹ️ 自动 clear 残留 gate: ${prevGate}(已通过 gate_history,但 pending_gate 未 clear)`);
      }
    } catch {
      // state 读失败让后续 ensureStartedAt 报错,这里不重复报
    }
  }

  // 幂等写 started_at（已存在不覆盖）
  const startedAt = await ensureStartedAt(changeDir, phase, at);

  // 推进 phase 到 -ing（进行中态）
  const target = PHASE_START_TARGETS[phase];
  await advancePhase(changeDir, target);

  // git add 限路径 + commit
  const changeName = basename(changeDir);
  const addPath = gitRoot.relPath === "." ? "." : `${gitRoot.relPath}/.alloy.yaml`;
  gitAddAndCommit(gitRoot, addPath, `chore(${changeName}): 记录 ${phase} 阶段开始时间，推进到 ${target}`, `${phase}: started_at=${startedAt} → ${target}`);
}


/**
 * gate 下沉检查:_phase complete 前验证当前阶段无未 clear 的 pending_gate。
 *
 * pending_gate 格式 <phase>:<action>(如 start:phase-complete / plan:lock-proposal)。
 * 如果 pending_gate 以当前 phase 开头,说明 agent 设了 gate 但没调问答工具就
 * 试图推进阶段--拒绝推进,强制 agent 先调问答工具(AskUserQuestion/question/
 * alloy-question)或手动 `alloy _guard user-gate pass` 降级。
 *
 * 这是"主动闸门下沉为被动检查"的核心:无论 agent 是否主动调 user-gate require,
 * 只要推进阶段就必须 clear gate,接近 100% 强制。
 */
async function checkPendingGateBeforeComplete(changeDir: string, phase: string): Promise<boolean> {
  let state;
  try {
    state = await readState(changeDir);
  } catch {
    return true; // state 读失败(目录不存在等),让后续逻辑报错
  }

  const pendingGate = state.pending_gate;
  if (!pendingGate) return true; // 无 pending_gate,放行

  // 检查 pending_gate 是否属于当前阶段(格式 <phase>:<action>)
  const expectedPrefix = `${phase}:`;
  if (pendingGate.startsWith(expectedPrefix)) {
    console.error(`⛔ [HARD_STOP] ${phase} 阶段有未通过的 USER_GATE: ${pendingGate}`);
    console.error("");
    console.error("  阶段完成前必须先通过 USER_GATE--agent 可能跳过了问答工具。");
    console.error("");
    console.error("  合法路径(任一):");
    console.error("    1. 调用平台原生问答工具(Claude Code AskUserQuestion / OpenCode question / Pi alloy-question)");
    console.error("       -> hook-guard 检测到问答工具调用,自动 clear pending_gate");
    console.error("    2. 手动降级(无问答工具的 agent / 调试场景):");
    console.error(`       alloy _guard user-gate pass ${changeDir}`);
    console.error("");
    console.error("  违反字面 = 违反精神:哪怕'用户已口头同意'、'流程很顺不用确认',也算违反--");
    console.error("  USER_GATE 必须用问答工具物理确认,口头同意不算授权。");
    return false;
  }
  // pending_gate 属于其他阶段(残留),不阻塞当前阶段完成,但提示
  console.error(`⚠️  [WARN] 检测到其他阶段的残留 pending_gate: ${pendingGate}(当前阶段 ${phase})`);
  console.error("  建议排查:可能是上一阶段未正确 clear。继续推进,但请留意。");
  return true;
}

async function phaseComplete(args: string[]): Promise<void> {
  const changeDir = args[0];
  const phase = args[1];

  if (!changeDir || !phase) {
    console.error("用法: alloy _phase complete <change-dir> <phase>");
    return process.exit(1);
  }

  if (!(phase in PHASE_COMPLETE_TARGETS)) {
    console.error(`无效的 phase: ${phase} (支持: ${Object.keys(PHASE_COMPLETE_TARGETS).join(", ")})`);
    return process.exit(1);
  }

  // gate 下沉检查:完成阶段前,检查当前阶段是否有未 clear 的 pending_gate
  const gatePassed = await checkPendingGateBeforeComplete(changeDir, phase);
  if (!gatePassed) {
    return process.exit(1);
  }

  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    return process.exit(1);
  }

  const completedAt = formatTimestamp();
  const target = PHASE_COMPLETE_TARGETS[phase];

  // 1. 写 completed_at（writeState 自动刷新 updated_at）
  await writeCompletedAt(changeDir, phase, completedAt);

  // finish 阶段额外写顶层 completed_at（全周期完成）
  if (phase === "finish") {
    await writeTopLevelCompletedAt(changeDir, completedAt);
  }

  // 2. 推进 phase 到 -ed（已完成态）
  await advancePhase(changeDir, target);

  // 3. git add 限路径 + commit
  const changeName = basename(changeDir);
  const addPath = gitRoot.relPath === "." ? "." : `${gitRoot.relPath}/.alloy.yaml`;
  gitAddAndCommit(gitRoot, addPath, `chore(${changeName}): 记录 ${phase} 阶段完成时间，推进到 ${target}`, `${phase}: completed_at=${completedAt} → ${target}`);
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

  if (!(phase in PHASE_START_TARGETS)) {
    console.error(`无效的 phase: ${phase} (支持: ${Object.keys(PHASE_START_TARGETS).join(", ")})`);
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
