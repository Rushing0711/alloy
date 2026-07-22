import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename, dirname, resolve, isAbsolute } from "node:path";
import { execSync } from "node:child_process";
import { readState, writeState, readProjectConfig, setPendingGate, addClearedGate, removeClearedGate } from "../../utils/state.js";
import { assertInWorktree } from "../../utils/worktree-guard.js";
import { computeArtifactHash, ARTIFACT_FILES } from "../../../core/artifacts.js";
import { parseVerifyDecision } from "../../utils/verify.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  started: ["planned"],
  planned: ["applied"],
  applied: ["archived"],
  archived: ["finished"],
};

export const ARTIFACT_CHECKS: Record<string, string[]> = {
  "started->planned": ["proposal.md", "design.md", "specs", "tasks.md", "plans.md"],
  "planned->applied": ["plans.md"],
  "applied->archived": ["verify.md"],
  "archived->finished": ["retrospective.md"],
};

export async function guardCommand(args: string[]): Promise<void> {
  // 子命令路由
  const subCommand = args[0];
  if (subCommand === "branch-position") {
    return branchPositionGuard(args.slice(1));
  }
  if (subCommand === "verify-passed") {
    return verifyPassedGuard(args.slice(1));
  }
  if (subCommand === "precheck") {
    return precheckGuard(args.slice(1));
  }
  if (subCommand === "worktree-status") {
    return worktreeStatusGuard(args.slice(1));
  }
  if (subCommand === "user-gate") {
    return userGateGuard(args.slice(1));
  }
  if (subCommand === "main-clean") {
    return mainCleanGuard(args.slice(1));
  }
  if (subCommand === "parallel-phase") {
    return parallelPhaseGuard(args.slice(1));
  }
  if (subCommand === "dirty-check") {
    return dirtyCheckGuard(args.slice(1));
  }

  // 原有 phase 转换校验逻辑
  const changeDir = args[0];
  const targetPhase = args[1];
  const apply = args.includes("--apply");

  if (!changeDir || !targetPhase) {
    console.error("用法: alloy _guard <change-dir> <target-phase> [--apply]");
    process.exit(1);
  }

  const state = await readState(changeDir);
  const currentPhase = state.phase;

  // 1. 校验 phase 转换合法性
  const allowed = VALID_TRANSITIONS[currentPhase];
  if (!allowed || !allowed.includes(targetPhase)) {
    console.error(`[HARD STOP] 不允许的 phase 转换: ${currentPhase} → ${targetPhase}`);
    console.error("  允许的转换: started→planned, planned→applied, applied→archived, archived→finished");
    console.error("  (-ing 进行中态由 _phase start/complete 推进,不通过 _guard --apply)");
    process.exit(1);
  }

  // 2. 制品完整性检查
  const transition = `${currentPhase}->${targetPhase}`;
  const checks = ARTIFACT_CHECKS[transition];
  if (checks) {
    const missing: string[] = [];
    for (const c of checks) {
      const p = join(changeDir, c);
      if (!existsSync(p)) missing.push(`  ${c}`);
    }
    if (missing.length > 0) {
      console.error(`[HARD STOP] 以下制品缺失，无法进入 ${targetPhase} 阶段:`);
      console.error(missing.join("\n"));
      process.exit(1);
    }
  }

  // 3. hash 一致性校验（started→planned、planned→applied、applied→archived）
  if (transition === "started->planned" || transition === "planned->applied" || transition === "applied->archived") {
    const records = state.records || [];
    const mismatches: string[] = [];
    for (const record of records) {
      const currentHash = await computeArtifactHash(changeDir, record.artifact);
      if (currentHash === null) {
        mismatches.push(`  ${record.artifact}: 文件不存在（记录 hash=${record.hash}）`);
      } else if (currentHash !== record.hash) {
        mismatches.push(`  ${record.artifact}: 记录=${record.hash} 当前=${currentHash}`);
      }
    }
    if (mismatches.length > 0) {
      console.error(`[HARD STOP] hash 一致性校验失败:`);
      console.error(mismatches.join("\n"));
      process.exit(1);
    }
  }

  // started→planned 额外检查：change 目录必须已提交
  if (transition === "started->planned") {
    try {
      execSync("git rev-parse --git-dir", { stdio: "pipe" });
      const relPath = `openspec/changes/${basename(changeDir)}`;
      const status = execSync(`git status --porcelain "${relPath}"`, {
        stdio: "pipe",
        cwd: process.cwd(),
      }).toString();
      if (status.trim()) {
        console.error("[HARD STOP] Change 目录有未提交的变更，请先执行 git add + git commit:");
        console.error(status);
        process.exit(1);
      }
    } catch {
      // 不在 git 仓库中，跳过 git 检查
    }
  }

  // 4. --apply: 更新 phase
  if (apply) {
    state.phase = targetPhase as typeof state.phase;
    await writeState(changeDir, state);
    console.log(`✓ phase: ${currentPhase} → ${targetPhase}`);
  }
}

// --- 子命令实现 ---

/** 获取当前 git 分支名 */
function getCurrentBranch(): string | null {
  try {
    return execSync("git branch --show-current", { stdio: "pipe" }).toString().trim();
  } catch {
    return null;
  }
}

/** 获取本地分支列表 */
function getLocalBranches(): string[] {
  try {
    return execSync("git branch --list --format=%(refname:short)", { stdio: "pipe" })
      .toString()
      .trim()
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** 获取 main 分支名 */
async function getMainBranch(): Promise<string | null> {
  try {
    const config = await readProjectConfig(process.cwd());
    return config.alloy?.main_branch ?? null;
  } catch {
    return null;
  }
}

/** 猜测主分支名（config 无记录时从本地分支推断） */
async function guessMainBranch(): Promise<string | null> {
  const candidates = ["main", "master"];
  const localBranches = getLocalBranches();
  for (const c of candidates) {
    if (localBranches.includes(c)) return c;
  }
  return null;
}

/**
 * alloy _guard branch-position <change-dir>
 * 输出: on-feature|on-main|feature-missing|on-other:<current>|feature-lost:<feature>
 * 退出码: 0=位置正确(on-feature), 1=位置不正确
 */
async function branchPositionGuard(args: string[]): Promise<void> {
  const changeDir = args[0];
  if (!changeDir) {
    console.error("用法: alloy _guard branch-position <change-dir>");
    return process.exit(1);
  }

  let state;
  try {
    state = await readState(changeDir);
  } catch {
    console.error(`无法读取状态: ${changeDir}`);
    return process.exit(1);
  }
  const featureBranch = state.feature_branch ?? null;
  const currentBranch = getCurrentBranch();
  const mainBranch = await getMainBranch();

  console.log(`current=${currentBranch}  main=${mainBranch}  feature=${featureBranch}`);

  // mainBranch 未配置时，尝试常见默认值
  const effectiveMain = mainBranch ?? (await guessMainBranch());

  if (effectiveMain && currentBranch === effectiveMain) {
    console.log("on-main");
    return process.exit(1);
  }

  if (featureBranch === null) {
    console.log("feature-missing");
    return process.exit(1);
  }

  if (currentBranch === featureBranch) {
    console.log("on-feature");
    return; // exit(0)
  }

  const localBranches = getLocalBranches();
  if (!localBranches.includes(featureBranch)) {
    console.log(`feature-lost:${featureBranch}`);
    return process.exit(1);
  }

  console.log(`on-other:${currentBranch}`);
  return process.exit(1);
}

/**
 * alloy _guard verify-passed <change-dir>
 * 输出: PASS|FAIL|WARNING
 * 退出码: 0=通过(PASS/WARNING), 1=不通过(FAIL)
 */
async function verifyPassedGuard(args: string[]): Promise<void> {
  const changeDir = args[0];
  if (!changeDir) {
    console.error("用法: alloy _guard verify-passed <change-dir>");
    return process.exit(1);
  }

  const verifyPath = join(changeDir, "verify.md");
  if (!existsSync(verifyPath)) {
    console.log("FAIL");
    return process.exit(1);
  }

  try {
    const content = readFileSync(verifyPath, "utf-8");
    const decision = parseVerifyDecision(content);
    console.log(decision);
    if (decision === "FAIL") {
      return process.exit(1);
    }
    return; // exit(0)
  } catch {
    console.log("FAIL");
    return process.exit(1);
  }
}

/**
 * alloy _guard precheck <change-dir> <expected-phase>
 * 输出: PASS:<phase>|FAIL:<reason>
 * 退出码: 0=通过, 1=不通过
 */
async function precheckGuard(args: string[]): Promise<void> {
  const changeDir = args[0];
  const expectedPhase = args[1];

  if (!changeDir || !expectedPhase) {
    console.error("用法: alloy _guard precheck <change-dir> <expected-phase>");
    return process.exit(1);
  }

  if (!existsSync(changeDir)) {
    console.log(`FAIL:directory not found`);
    return process.exit(1);
  }

  try {
    const state = await readState(changeDir);
    // 支持多阶段值（逗号分隔），如 "planned,applied"
    const allowedPhases = expectedPhase.split(",").map((p) => p.trim());
    if (allowedPhases.includes(state.phase)) {
      console.log(`PASS:${state.phase}`);
      return; // exit(0)
    }
    console.log(`FAIL:phase=${state.phase} expected=${expectedPhase}`);
    return process.exit(1);
  } catch {
    console.log("FAIL:state read error");
    return process.exit(1);
  }
}

/**
 * alloy _guard worktree-status <change-dir>
 * 输出: done:<path>:<branch>|stale:<path>|skipped|pending
 * 退出码: 始终 0（查询命令）
 */
async function worktreeStatusGuard(args: string[]): Promise<void> {
  const changeDir = args[0];
  if (!changeDir) {
    console.error("用法: alloy _guard worktree-status <change-dir>");
    return process.exit(1);
  }

  // Pi 不支持 worktree:强制返回 skipped(双重保险,配合 apply SKILL.md 的 Pi 检测)
  // 原因:Pi bash 工具无 cwd 参数,session cwd 不解绑到 worktree,
  // 创建 worktree 后 agent 仍在主仓操作,commit 落 feature 分支破坏隔离。
  // 详见 docs/reference/agent-instruction-files.md 第 11 章 Worktree。
  if (process.env.PI_CODING_AGENT === "true") {
    console.log("skipped");
    return;
  }

  const state = await readState(changeDir);
  const worktree = state.worktree;

  if (worktree === null || worktree === "null") {
    console.log("pending");
    return; // exit(0)
  }

  if (worktree === "skipped") {
    console.log("skipped");
    return; // exit(0)
  }

  // 有效路径
  if (existsSync(worktree)) {
    const branch = state.worktree_branch ?? "unknown";
    console.log(`done:${worktree}:${branch}`);
    return; // exit(0)
  }

  console.log(`stale:${worktree}`);
  return; // exit(0)
}

/**
 * alloy _guard user-gate <require|pass|reset> <change-dir> [<gate-id>]
 *
 * USER_GATE 闸门:配合 hook-guard 拦截 agent 跳过用户确认。
 * - require:设置 pending_gate,后续 Write/Edit 非白名单被 hook 拦截,直到问答工具调用或手动 pass
 * - pass:清除 pending_gate(手动降级 / 无问答工具的 agent)
 * - reset:把 gate 从 gate_history 移除 + 重新设为 pending_gate(用户选"暂停/取消"后恢复 gate 状态)
 *
 * hook-guard 检测到 AskUserQuestion/question/alloy-question 工具调用时,自动 clear 所有 pending_gate
 * + 加入 gate_history。但用户选"暂停/取消"本意是拒绝通过 gate,hook-guard 无条件 clear 把语义吞了。
 * agent 在用户选"暂停/取消"后调 reset,把 gate 从 gate_history 移除 + 重新设为 pending_gate,
 * 恢复"等待用户确认"状态。用户"继续"时,agent 调 require(幂等)+ 问答工具重新询问。
 *
 * 实现细节(2026-07-17 修复):
 * - 用 setPendingGate 精准替换 pending_gate 行,不触发 writeState 全量重写
 *   原因:writeState 全量重序列化会破坏 agent 手动加的 worktree_created_at 引号格式,
 *   产生 diff 噪音;且 readState + writeState 会读错文件(worktree 内执行但读主仓)
 * - require/pass/reset 不自动 commit,pending_gate 作为临时状态留在工作区 dirty
 *   原因:USER_GATE 独占 commit 噪音大(chore: 设 USER_GATE xxx);pending_gate 由下一个
 *   _artifact commit / _phase complete 等命令的 git add .alloy.yaml 一起 commit,
 *   合并到有意义的 commit(如 artifact 锁定 / 阶段推进)
 */
async function userGateGuard(args: string[]): Promise<void> {
  const action = args[0];
  const changeDir = args[1];

  if (action === "require") {
    const gateId = args[2];
    if (!changeDir || !gateId) {
      console.error("用法: alloy _guard user-gate require <change-dir> <gate-id>");
      process.exit(1);
      return;
    }
    // Pi 下两个 apply gate 无意义,CLI 层硬约束自动通过 + 输出路径引导
    // SKILL.md 不再为 Pi 做软约束(避免 Claude Code/OpenCode 多读 Pi 分支 + 多调 _detect agent)
    // - apply:worktree-choice:Pi 不支持 worktree(bash 无 cwd 参数,session cwd 不解绑),强制 skipped
    // - apply:sdd-ep-choice:Pi 无原生 subagent(README "skips sub agents"),强制 EP
    if (process.env.PI_CODING_AGENT === "true" && (gateId === "apply:worktree-choice" || gateId === "apply:sdd-ep-choice")) {
      if (gateId === "apply:worktree-choice") {
        console.log(`✓ user-gate 自动通过(Pi 不支持 worktree): ${gateId} (${changeDir})`);
        console.log("  -> 走 skipped 路径:alloy _state write <change-dir> worktree skipped + commit");
        console.log("  详见 docs/reference/agent-instruction-files.md 第 11 章 Worktree");
      } else {
        console.log(`✓ user-gate 自动通过(Pi 不支持 SDD): ${gateId} (${changeDir})`);
        console.log("  -> 走 EP 路径:加载 executing-plans skill,在当前 session 顺序执行");
        console.log("  详见 docs/reference/agent-instruction-files.md 第 12 章 Subagent");
      }
      // Pi 自动通过也写入 gate_history,供后续 gate 前置检查(如 sdd-ep-choice 检查 worktree-choice)
      try {
        await addClearedGate(changeDir, gateId);
      } catch {
        // .alloy.yaml 不存在或读写失败,不阻断--后续命令会报错
      }
      return;
    }
    // 前置 gate 检查:防止 agent 跳过前置 gate 直接设后续 gate
    // 规则:后续 gate require 时,前置 gate 必须已在 gate_history(已通过)
    // 覆盖:apply:sdd-ep-choice 检查 apply:worktree-choice(SKILL.md L227 HARD_STOP 但 agent 仍跳过)
    if (gateId === "apply:sdd-ep-choice") {
      try {
        const state = await readState(changeDir);
        const history = state.gate_history ?? [];
        if (!history.includes("apply:worktree-choice")) {
          console.error("⛔ [HARD_STOP] 前置 gate 未通过:apply:worktree-choice");
          console.error(`  当前 gate: ${gateId}`);
          console.error("  原因:apply 阶段必须先让用户确认 worktree 选择(创建/跳过),再设执行策略 gate");
          console.error("  SKILL.md L227 HARD_STOP 要求 worktree-choice gate 必跑,但 agent 可能跳过");
          console.error("  修复:先调 alloy _guard user-gate require <change-dir> apply:worktree-choice + 问答工具确认,再设 sdd-ep-choice");
          process.exit(1);
          return;
        }
      } catch {
        // state 读失败,让后续 assertInWorktree / setPendingGate 报错
      }
    }
    // worktree cwd 守卫:worktree 模式下必须在 worktree 内执行
    // 否则 pending_gate 写到主仓 .alloy.yaml,且 .alloy.yaml/制品 commit 进 feature 分支,破坏 worktree 隔离
    await assertInWorktree(changeDir);
    // 精准替换 pending_gate 行,不触发 writeState 全量重写(保留 worktree_created_at 等字段格式)
    // 不自动 commit:pending_gate 作为临时状态,由下一个 _artifact commit / _phase complete 一起 commit
    await setPendingGate(changeDir, gateId);
    console.log(`✓ user-gate 已设: ${gateId} (${changeDir})`);
    console.log("  hook-guard 将拦截非白名单写入,直到问答工具调用或 alloy _guard user-gate pass");
    return;
  }

  if (action === "pass") {
    if (!changeDir) {
      console.error("用法: alloy _guard user-gate pass <change-dir>");
      process.exit(1);
      return;
    }
    // worktree cwd 守卫:worktree 模式下必须在 worktree 内执行(与 require 对称)
    await assertInWorktree(changeDir);
    const state = await readState(changeDir);
    const cleared = state.pending_gate ?? null;
    // cleared=null 时无 gate 需清:跳过 setPendingGate 调用。
    // setPendingGate(null) 在 pending_gate 已是 null 时虽已是 no-op,
    // 但仍触发文件 IO,且早期版本的 setPendingGate 在此场景会产生重复键 bug。
    // 此处跳过既避免无意义 IO,也消除 bug 边界场景。
    if (cleared) {
      await setPendingGate(changeDir, null);
      // 把 cleared gate 加入 gate_history,供后续 gate 前置检查 + _phase complete 检查
      try {
        await addClearedGate(changeDir, cleared);
      } catch (e) {
        // gate_history 写失败不阻断 pass(pending_gate 已 clear),
        // 但输出 stderr 提示:可能是 .alloy.yaml 已损坏(YAMLParseError),需排查
        console.error(`⚠️ addClearedGate 失败 (${changeDir}): ${e}`);
      }
    }
    console.log(`✓ user-gate 已通过: ${cleared ?? "(无)"} (${changeDir})`);
    return;
  }

  if (action === "reset") {
    const gateId = args[2];
    if (!changeDir || !gateId) {
      console.error("用法: alloy _guard user-gate reset <change-dir> <gate-id>");
      process.exit(1);
      return;
    }
    // worktree cwd 守卫:worktree 模式下必须在 worktree 内执行(与 require 对称)
    await assertInWorktree(changeDir);
    // 把 gate 从 gate_history 移除(hook-guard 自动 clear 时误加入的)
    try {
      await removeClearedGate(changeDir, gateId);
    } catch {
      // gate_history 读写失败不阻断 reset(pending_gate 仍可设)
    }
    // 重新设为 pending_gate,恢复"等待用户确认"状态
    await setPendingGate(changeDir, gateId);
    console.log(`✓ user-gate 已 reset: ${gateId} (${changeDir})`);
    console.log("  gate 已从 gate_history 移除 + 重新设为 pending_gate");
    console.log("  用途:用户选暂停/取消后恢复 gate 状态,用户'继续'时重新询问");
    return;
  }

  console.error(`未知操作: ${action} (支持: require, pass, reset)`);
  process.exit(1);
}

/**
 * alloy _guard parallel-phase <phase1,phase2,...> [--exclude <name>]
 *
 * 扫描所有 change(活跃 + 归档),统计 phase 在指定列表中的 change 数量。
 * 用于多 change 并行检测(alloy-plan/archive/finish 都有此检查)。
 *
 * 行为:
 * - 0 个 -> 输出 "none"
 * - 1 个 -> 输出 "single:<name>"
 * - >1 个 -> 输出 "parallel:N" + 列出所有 change 名
 * - --exclude <name>:排除指定 change(用于 alloy-archive 排除当前 change)
 * - exit 0 始终(WARN 不阻断,由 SKILL.md 决定是否继续)
 */
async function parallelPhaseGuard(args: string[]): Promise<void> {
  let targetPhases: string[] = [];
  let excludeName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--exclude") {
      excludeName = args[++i];
    } else if (targetPhases.length === 0) {
      targetPhases = a.split(",").map(p => p.trim()).filter(Boolean);
    }
  }

  if (targetPhases.length === 0) {
    console.error("用法: alloy _guard parallel-phase <phase1,phase2,...> [--exclude <name>]");
    console.error("  扫描所有 change,统计指定 phase 的数量(用于多 change 并行检测)");
    console.error("  --exclude <name>:排除指定 change(用于排除当前 change)");
    console.error("  输出: none / single:<name> / parallel:N + 列表");
    process.exit(1);
    return;
  }

  const projectRoot = process.cwd();
  const changesDir = join(projectRoot, "openspec", "changes");

  const matching: string[] = [];

  const scanDir = (dir: string, skipArchive: boolean) => {
    if (!existsSync(dir)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (skipArchive && entry.name === "archive") continue;
      const changeDir = join(dir, entry.name);
      const stateFile = join(changeDir, ".alloy.yaml");
      try {
        const content = readFileSync(stateFile, "utf-8");
        const match = content.match(/^phase:\s*(.+)$/m);
        if (match) {
          const phase = match[1].trim().replace(/^["']|["']$/g, "");
          if (targetPhases.includes(phase)) {
            // 剥离 archive 日期前缀(YYYY-MM-DD-<name>)
            const changeName = entry.name.replace(/^\d{4}-\d{2}-\d{2}-/, "");
            if (excludeName && changeName === excludeName) continue;
            matching.push(changeName);
          }
        }
      } catch {
        // .alloy.yaml 不存在或读取失败,跳过
      }
    }
  };

  scanDir(changesDir, true); // 活跃 change
  scanDir(join(changesDir, "archive"), false); // 归档 change

  if (matching.length === 0) {
    console.log("none");
    return;
  }

  if (matching.length === 1) {
    console.log(`single:${matching[0]}`);
    return;
  }

  console.log(`parallel:${matching.length}`);
  for (const name of matching) {
    console.log(`  - ${name}`);
  }
}

/**
 * alloy _guard main-clean <change-dir>
 *
 * 检查主仓 git status 是否 clean(worktree 模式下,主仓应 clean)。
 * 用于 alloy-apply Step 2 完成前主仓清洁度校验 + EnterWorktree 前主仓 clean 校验。
 *
 * 行为:
 * - 读 .alloy.yaml 的 worktree 字段
 * - worktree=skipped/null -> 输出 "skipped(worktree 模式未启用,不检查主仓 clean)"
 * - worktree 模式 -> 检查主仓 git status --porcelain
 *   - 非空 -> exit 1 + 输出 dirty 文件列表 + 修复路径
 *   - 空 -> 输出 "✓ 主仓 clean(worktree 模式校验通过)"
 */
async function mainCleanGuard(args: string[]): Promise<void> {
  const changeDir = args[0];
  if (!changeDir) {
    console.error("用法: alloy _guard main-clean <change-dir>");
    console.error("  检查主仓 git status 是否 clean(worktree 模式下,主仓应 clean)");
    process.exit(1);
    return;
  }

  let worktree: string = "null";
  try {
    const state = await readState(changeDir);
    worktree = state.worktree ?? "null";
  } catch {
    // .alloy.yaml 不存在或解析失败,跳过(worktree 字段默认 null)
  }

  if (worktree === "skipped" || worktree === "null" || !worktree) {
    console.log("skipped(worktree 模式未启用,不检查主仓 clean)");
    return;
  }

  let mainRoot: string;
  try {
    const gitCommonDir = execSync("git rev-parse --git-common-dir", {
      cwd: changeDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (isAbsolute(gitCommonDir)) {
      // worktree 模式:git-common-dir 返回主仓 .git 绝对路径(/path/to/main/.git)
      mainRoot = dirname(gitCommonDir);
    } else {
      // 主仓模式:git-common-dir 返回相对路径(如 .git 或 ../../.git)
      // 用 show-toplevel 获取主仓 root(绝对路径)
      mainRoot = execSync("git rev-parse --show-toplevel", {
        cwd: changeDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    }
  } catch {
    console.error("⛔ [PRECONDITION_FAIL] 非 git 仓库或 git 命令失败");
    process.exit(1);
    return;
  }

  let dirty: string = "";
  try {
    dirty = execSync("git status --porcelain", {
      cwd: mainRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    console.log("WARN: git status 失败,跳过主仓 clean 校验");
    return;
  }

  if (dirty) {
    console.error("⛔ [PRECONDITION_FAIL] 主仓工作目录有未提交变更(worktree 模式下应全部落在 worktree 分支)");
    console.error("");
    console.error(dirty);
    console.error("");
    console.error("  可能原因:子 agent 用主仓绝对路径 Edit 了文件,绕过 worktree 隔离");
    console.error("  修复路径:");
    console.error("    1) 确认 worktree 分支已有正确版本(git log worktree-<name> --oneline)");
    console.error("    2) 丢弃主仓误改:git checkout -- <误改文件>");
    console.error("  禁止:agent 自动 git checkout -- 丢弃变更--必须用户确认 worktree 分支版本正确后手动丢弃。");
    process.exit(1);
    return;
  }

  console.log("✓ 主仓 clean(worktree 模式校验通过)");
}

/**
 * git add .alloy.yaml + commit(无变更跳过)。
 * 用于 user-gate require/pass 后自动提交 pending_gate 修改,避免 worktree 内 .alloy.yaml dirty。
 * 在 changeDir 下执行(cwd=changeDir),git 自动找仓库根,git add .alloy.yaml 限路径。
 *
 * 2026-07-17:已停用。pending_gate 作为临时状态不独占 commit,由下一个 _artifact commit /
 * _phase complete 等命令的 git add .alloy.yaml 一起 commit,合并到有意义的 commit。
 * 保留函数定义以防未来需要,但 userGateGuard 不再调用。
 */
function commitPendingGateChange(_changeDir: string, _commitMsg: string): void {
  void _changeDir; void _commitMsg;
}

/**
 * alloy _guard dirty-check [cwd]
 *
 * 检查工作目录 git status 是否 clean。
 * 用于 alloy-start L99 / alloy-plan L296-308 的 dirty 检测(替代手写 git status --porcelain)。
 *
 * 行为:
 * - dirty -> exit 1 + 输出 dirty 文件列表
 * - clean -> 输出 "✓ 工作目录 clean"
 * - 非 git 仓库 -> exit 1 + PRECONDITION_FAIL
 */
async function dirtyCheckGuard(args: string[]): Promise<void> {
  const cwd = args[0] || process.cwd();
  let dirty = "";
  try {
    dirty = execSync("git status --porcelain", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    console.error("⛔ [PRECONDITION_FAIL] 非 git 仓库或 git 命令失败: " + cwd);
    process.exit(1);
    return;
  }
  if (dirty) {
    console.error("⛔ [HARD_STOP] 工作目录有未提交变更:");
    console.error(dirty);
    console.error("");
    console.error("  修复:先 commit 或 stash,再继续。");
    console.error("  详见 alloy-shared/references/git-self-rescue-ban.md(禁自动 reset --hard / checkout . 清场)。");
    process.exit(1);
    return;
  }
  console.log("✓ 工作目录 clean");
}
