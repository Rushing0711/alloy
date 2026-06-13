import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { readState, writeState, readProjectConfig } from "../../utils/state.js";
import { computeArtifactHash, ARTIFACT_FILES } from "../../../core/artifacts.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  started: ["planned"],
  planned: ["applied"],
  applied: ["archived"],
  archived: ["finished"],
};

const ARTIFACT_CHECKS: Record<string, string[]> = {
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
    const failMatch = content.match(/^- \[x\].*(?:❌\s*)?FAIL/mi);
    if (failMatch) {
      console.log("FAIL");
      return process.exit(1);
    }

    const warnMatch = content.match(/^- \[x\].*(?:⚠️\s*)?WARNING/mi);
    if (warnMatch) {
      console.log("WARNING");
      return; // exit(0)
    }

    console.log("PASS");
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
