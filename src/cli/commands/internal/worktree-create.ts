// src/cli/commands/internal/worktree-create.ts
// alloy _worktree-create <change-dir>
//
// 原子完成 worktree 创建:① 校验主仓清洁 + feature 分支 ② git worktree add .worktrees/<name> -b worktree-<name>
// ③ _state write worktree/worktree_branch/worktree_created_at 三字段 ④ git add + commit
//
// 替代 agent 手动 git worktree add + _state write + commit 的不可靠步骤:
// - agent 误用 feature 分支名建 worktree(git worktree add .worktrees/feature/x -b feature/x -> fatal: branch exists)
// - agent 漏写 worktree_created_at 字段
// - agent 在主仓写 state(被 _state write 守卫拦截)或在 worktree 写但没 commit
//
// 约定:worktree 分支名 = worktree-<change-name>(不是 feature 分支),路径 .worktrees/<change-name>
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path, { join, basename } from "node:path";
import { readState, formatTimestamp } from "../../utils/state.js";

function gitExec(cmd: string, opts: { cwd?: string } = {}): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, { encoding: "utf-8", stdio: "pipe", ...opts });
    return { ok: true, stdout: stdout.trim(), stderr: "" };
  } catch (e) {
    const err = e as { stderr?: Buffer; stdout?: Buffer; message: string };
    return {
      ok: false,
      stdout: err.stdout?.toString().trim() ?? "",
      stderr: err.stderr?.toString().trim() ?? "",
    };
  }
}

/**
 * alloy _worktree-create <change-dir>
 *
 * 原子完成 worktree 创建(OpenCode 用,Claude Code 用 EnterWorktree 工具,Pi 不支持 worktree 不调本命令):
 * 1. 校验当前在主仓(不在 worktree 内)
 * 2. 校验当前分支 = feature_branch
 * 3. 校验主仓工作目录清洁(避免 worktree 创建后状态混乱)
 * 4. 校验 .worktrees/ 已在 .gitignore(alloy init 写入)
 * 5. git worktree add .worktrees/<change-name> -b worktree-<change-name>
 * 6. _state write worktree / worktree_branch / worktree_created_at 三字段(worktree 内执行)
 * 7. git add .alloy.yaml + commit(worktree 内)
 *
 * agent 禁自行 git worktree add / _state write worktree 字段 / mkdir .worktrees 模拟--本命令是唯一合法路径(OpenCode)。
 * Claude Code agent 必须用 EnterWorktree 工具,不调本命令。Pi 不支持 worktree(bash 无 cwd 参数,session cwd 不解绑),禁调本命令。
 */
export async function worktreeCreateCommand(args: string[]): Promise<void> {
  const changeDir = args.find((a) => !a.startsWith("--"));
  const recordOnly = args.includes("--record-only");
  if (!changeDir) {
    console.error("用法: alloy _worktree-create <change-dir>");
    console.error("");
    console.error("  原子完成 worktree 创建(git worktree add + state write 三字段 + commit)。");
    console.error("  OpenCode 用;Claude Code 用 EnterWorktree 工具;Pi 不支持 worktree,不调本命令。");
    console.error("  前置:已在 feature 分支,主仓工作目录清洁。");
    process.exit(1);
    return;
  }

  if (recordOnly) {
    return worktreeRecordOnly(args, changeDir);
  }

  const changeName = basename(changeDir);
  const worktreeBranch = `worktree-${changeName}`;
  const worktreePath = `.worktrees/${changeName}`;

  // 1. 校验当前在主仓(不在 worktree 内)
  const gitDir = gitExec("git rev-parse --git-dir").stdout;
  const gitCommonDir = gitExec("git rev-parse --git-common-dir").stdout;
  if (gitDir !== gitCommonDir) {
    console.error("⛔ [PRECONDITION_FAIL] 当前已在 worktree 内,禁止重复创建");
    console.error(`  git-dir: ${gitDir}`);
    console.error(`  git-common-dir: ${gitCommonDir}`);
    console.error("  必须先回主仓(OpenCode: cd 主仓路径;Claude Code: ExitWorktree)再调用");
    process.exit(1);
    return;
  }

  // 2. 校验当前分支 = feature_branch
  let featureBranch: string;
  try {
    const state = await readState(changeDir);
    featureBranch = state.feature_branch ?? "";
  } catch {
    console.error(`⛔ [PRECONDITION_FAIL] 无法读 state: ${changeDir}/.alloy.yaml`);
    console.error("  可能原因:change 目录不存在 / .alloy.yaml 缺失");
    process.exit(1);
    return;
  }
  if (!featureBranch) {
    console.error(`⛔ [PRECONDITION_FAIL] state.feature_branch 为空`);
    console.error("  先运行 alloy _start bootstrap 写入 feature_branch");
    process.exit(1);
    return;
  }
  const currentBranch = gitExec("git branch --show-current").stdout;
  if (currentBranch !== featureBranch) {
    console.error(`⛔ [PRECONDITION_FAIL] 当前分支 ${currentBranch} ≠ feature 分支 ${featureBranch}`);
    console.error(`  请手动 git checkout ${featureBranch} 后重试`);
    process.exit(1);
    return;
  }

  // 3. 校验主仓工作目录清洁(避免 worktree 创建后状态混乱)
  const dirtyResult = gitExec("git status --porcelain");
  if (dirtyResult.stdout.trim() !== "") {
    console.error("⛔ [HARD_STOP] 主仓工作目录不清洁,拒绝创建 worktree");
    console.error("  原因:worktree 创建会基于当前 HEAD,dirty 状态会导致 worktree 内文件不一致");
    console.error("  未 commit 文件:");
    console.error(dirtyResult.stdout);
    console.error("  修复:先 commit 或 stash,再运行 alloy _worktree-create");
    process.exit(1);
    return;
  }

  // 4. 校验 .worktrees/ 已在 .gitignore
  const gitignoreCheck = gitExec("grep -q '^.worktrees/' .gitignore").ok;
  if (!gitignoreCheck) {
    console.error("⛔ [PRECONDITION_FAIL] .gitignore 缺少 .worktrees/ 规则");
    console.error("  alloy init 应写入此规则,可能 init 未完成或 .gitignore 被改");
    console.error("  修复:运行 alloy init 或手动在 .gitignore 加 .worktrees/");
    process.exit(1);
    return;
  }

  // 5. 校验 worktree 分支不存在(避免重复创建)
  const branchCheck = gitExec(`git rev-parse --verify ${worktreeBranch} 2>/dev/null`);
  if (branchCheck.ok) {
    console.error(`⛔ [PRECONDITION_FAIL] worktree 分支 ${worktreeBranch} 已存在`);
    console.error(`  可能原因:之前创建过 worktree 但未清理(state.worktree 可能残留)`);
    console.error("  修复:运行 alloy _worktree-cleanup 清理,或检查 state.worktree 字段");
    process.exit(1);
    return;
  }

  // 6. git worktree add .worktrees/<change-name> -b worktree-<change-name>
  console.log(`ℹ️ 创建 worktree: ${worktreePath} (分支 ${worktreeBranch})`);
  const addResult = gitExec(`git worktree add "${worktreePath}" -b ${worktreeBranch}`);
  if (!addResult.ok) {
    console.error("⛔ [HARD_FAIL] git worktree add 失败");
    console.error(`  ${addResult.stderr}`);
    console.error("  可能原因:.worktrees/ 目录权限问题 / 磁盘空间不足 / git 版本过低");
    process.exit(1);
    return;
  }
  console.log(`✓ worktree 已创建: ${worktreePath}`);

  // 7. 在 worktree 内写 state 三字段(worktree/worktree_branch/worktree_created_at)
  // 用绝对路径执行(worktree 内执行 _state write,守卫放行)
  const absWorktreePath = join(gitExec("git rev-parse --show-toplevel").stdout, worktreePath);
  const worktreeChangeDir = join(absWorktreePath, changeDir);
  const createdAt = formatTimestamp();

  // _state write worktree 字段(worktree 内执行,守卫放行)
  const stateWrites = [
    `alloy _state write "${changeDir}" worktree "${worktreePath}"`,
    `alloy _state write "${changeDir}" worktree_branch "${worktreeBranch}"`,
    `alloy _state write "${changeDir}" worktree_created_at "${createdAt}"`,
  ];
  for (const cmd of stateWrites) {
    const r = gitExec(cmd, { cwd: absWorktreePath });
    if (!r.ok) {
      console.error(`⛔ [HARD_FAIL] _state write 失败(worktree 内): ${cmd}`);
      console.error(`  ${r.stderr}`);
      console.error("  worktree 已创建但 state 未完整写入,需手动修复");
      process.exit(1);
      return;
    }
  }

  // 8. git add .alloy.yaml + commit(worktree 内)
  const commitResult = gitExec(
    `git add openspec/changes/${changeName}/.alloy.yaml && git diff --cached --quiet || git commit -m "chore(${changeName}): 记录 worktree 状态"`,
    { cwd: absWorktreePath }
  );
  if (!commitResult.ok) {
    console.error("⚠️  worktree state 已写入但 commit 失败(不致命,后续命令会 commit)");
    console.error(`  ${commitResult.stderr}`);
  } else {
    console.log(`✓ worktree state 已 commit (worktree 分支 ${worktreeBranch})`);
  }

  console.log("");
  console.log("✓ worktree 创建完成:");
  console.log(`  ✓ worktree add: ${worktreePath} (分支 ${worktreeBranch})`);
  console.log(`  ✓ state 三字段已写入: worktree / worktree_branch / worktree_created_at`);
  console.log(`  ✓ worktree_created_at: ${createdAt}`);
  console.log("");
  console.log("  下一步(OpenCode:后续 bash 命令传 workdir=<worktree> 进入 worktree):");
  console.log(`    worktree 路径: ${worktreePath}`);
  console.log("    <继续 apply 阶段后续步骤,OpenCode bash 传 workdir 参数>");
}

/**
 * alloy _worktree-create --record-only <change-dir> --path <worktree-path> --branch <worktree-branch>
 *
 * Claude Code EnterWorktree 后,仅记录 state 三字段 + commit,不创建 worktree。
 * Claude Code 用 EnterWorktree 工具创建 worktree(不是本命令),但需要记录 state。
 * --record-only 模式跳过 git worktree add + 校验,直接写 state + commit。
 */
async function worktreeRecordOnly(args: string[], changeDir: string): Promise<void> {
  const changeName = basename(changeDir);
  const pathIdx = args.indexOf("--path");
  const branchIdx = args.indexOf("--branch");
  const worktreePath = pathIdx >= 0 ? args[pathIdx + 1] : "";
  const worktreeBranch = branchIdx >= 0 ? args[branchIdx + 1] : "";

  if (!worktreePath || !worktreeBranch) {
    console.error("用法: alloy _worktree-create --record-only <change-dir> --path <worktree-path> --branch <worktree-branch>");
    console.error("  --record-only: Claude Code EnterWorktree 后,仅记录 state 三字段 + commit,不创建 worktree");
    console.error("  --path: worktree 路径(EnterWorktree 创建的,如 .claude/worktrees/<name>)");
    console.error("  --branch: worktree 分支(EnterWorktree 创建的,如 worktree-<name>)");
    process.exit(1);
    return;
  }

  const createdAt = formatTimestamp();

  // 写 state 三字段(在 worktree 内执行,cwd 是 worktree)
  const stateWrites = [
    `alloy _state write "${changeDir}" worktree "${worktreePath}"`,
    `alloy _state write "${changeDir}" worktree_branch "${worktreeBranch}"`,
    `alloy _state write "${changeDir}" worktree_created_at "${createdAt}"`,
  ];
  for (const cmd of stateWrites) {
    const r = gitExec(cmd);
    if (!r.ok) {
      console.error(`⛔ [HARD_FAIL] _state write 失败: ${cmd}`);
      console.error(`  ${r.stderr}`);
      process.exit(1);
      return;
    }
  }

  // git add .alloy.yaml + commit(在 worktree 内)
  const commitResult = gitExec(
    `git add openspec/changes/${changeName}/.alloy.yaml && git diff --cached --quiet || git commit -m "chore(${changeName}): 记录 worktree 状态(--record-only)"`
  );
  if (!commitResult.ok) {
    console.error(`⚠️ worktree state 已写入但 commit 失败: ${commitResult.stderr}`);
  } else {
    console.log(`✓ worktree state 已 commit (worktree 分支 ${worktreeBranch})`);
  }

  console.log("");
  console.log("✓ worktree 记录完成(--record-only 模式):");
  console.log(`  ✓ worktree 路径: ${worktreePath}`);
  console.log(`  ✓ worktree 分支: ${worktreeBranch}`);
  console.log("  ✓ state 三字段已写入: worktree / worktree_branch / worktree_created_at");
  console.log(`  ✓ worktree_created_at: ${createdAt}`);
}
