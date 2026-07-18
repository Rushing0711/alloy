// src/cli/utils/worktree-guard.ts
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { readState } from "./state.js";

/**
 * 检测当前进程是否在 worktree 内执行(非主仓)。
 * 用 git-dir vs git-common-dir 区分:worktree 内 git-dir != git-common-dir。
 */
function isInWorktree(cwd: string): boolean {
  try {
    const gitDir = execSync("git rev-parse --git-dir", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
    const gitCommonDir = execSync("git rev-parse --git-common-dir", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
    return gitDir !== gitCommonDir;
  } catch {
    return false;
  }
}

/**
 * 获取当前 cwd 所在的 git 仓库根目录。
 */
function getGitRoot(cwd: string): string | null {
  try {
    return execSync("git rev-parse --show-toplevel", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

/**
 * 检测 git worktree list 是否有 worktree-<change-name> 分支对应的工作树存在。
 *
 * 用途:assertInWorktree 的盲区补救。
 * - agent 在 worktree 内 _state write worktree 字段后,worktree state 只 commit 到 worktree 分支
 * - 主仓 feature 分支的 .alloy.yaml worktree 字段仍是 null(_state write 守卫拦截了主仓写入)
 * - agent 回主仓执行 user-gate require 时,assertInWorktree 读主仓 state worktree=null,守卫误判放行
 * - 增强:检查 git worktree list 是否有 worktree-<change-name> 分支,有则判定 worktree 模式
 */
function hasActiveWorktree(changeDir: string, projectRoot: string): boolean {
  const changeName = basename(changeDir);
  const worktreeBranch = `worktree-${changeName}`;
  try {
    const output = execSync("git worktree list --porcelain", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: "pipe",
    });
    const lines = output.split("\n");
    let currentWorktreePath: string | null = null;
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        currentWorktreePath = line.slice("worktree ".length).trim();
      } else if (line.startsWith("branch ")) {
        const branch = line.slice("branch ".length).trim();
        if (branch === `refs/heads/${worktreeBranch}` && currentWorktreePath) {
          if (existsSync(currentWorktreePath)) {
            return true;
          }
        }
      }
    }
  } catch {
    // git 命令失败,忽略
  }
  return false;
}

/**
 * worktree cwd 守卫:apply 阶段 worktree 模式下,关键 alloy 命令必须在 worktree 内执行。
 *
 * 背景:Claude Code 的 EnterWorktree 会自动解绑 session cwd 到 worktree;OpenCode 走 `alloy _worktree-create`
 * (agent 传 bash workdir 参数进入 worktree);Pi 不支持 worktree(强制 skipped,不进 worktree 模式)。
 * OpenCode session cwd 不解绑,agent 需传 workdir 或显式 cd,否则 .alloy.yaml/制品 commit 进 feature 分支
 * 而非 worktree 分支,破坏 worktree 隔离。
 *
 * 校验逻辑:
 * 1. 读 state 的 worktree 字段,如果有值(非 null/skipped) -> worktree 模式
 * 2. 盲区补救:state worktree=null 时,检查 git worktree list 是否有 worktree-<change-name> 分支
 *    (主仓 state 可能没同步 worktree 分支的 state)
 * 3. worktree 模式下:当前在 worktree 内 -> 放行;当前在主仓 -> HARD_STOP
 *
 * 盲区补救(2026-07-17):
 * - agent 在 worktree 内 _state write worktree 字段后,worktree state 只 commit 到 worktree 分支
 * - 主仓 feature 分支 .alloy.yaml worktree 字段仍是 null(被 _state write 守卫拦截)
 * - agent 回主仓执行 user-gate require 时,只读 state worktree=null 会误判放行
 * - 增强:检查 git worktree list 是否有 worktree-<change-name> 分支,有则判定 worktree 模式
 *
 * 用于 _artifact commit / _skill log / _state write(受管字段) / _guard user-gate require/pass 等写 .alloy.yaml 的命令。
 */
export async function assertInWorktree(changeDir: string): Promise<void> {
  // 逃生阀:ALLOY_FORCE_WORKTREE=1 绕过(仅限修复畸形状态,如 worktree 已删除但 state 未更新)
  if (process.env.ALLOY_FORCE_WORKTREE === "1") {
    return;
  }

  let state;
  try {
    state = await readState(changeDir);
  } catch {
    return; // state 读失败让后续逻辑报错,这里不重复报
  }

  const worktree = state.worktree;
  let isWorktreeMode = false;
  if (worktree && worktree !== "null" && worktree !== "skipped") {
    isWorktreeMode = true;
  }

  // 盲区补救:主仓 state worktree=null 但 git worktree list 有 worktree-<change-name> 分支
  if (!isWorktreeMode) {
    const currentCwd = process.cwd();
    const gitRoot = getGitRoot(currentCwd);
    if (gitRoot && hasActiveWorktree(changeDir, gitRoot)) {
      isWorktreeMode = true;
    }
  }

  if (!isWorktreeMode) {
    return; // 非 worktree 模式,放行
  }

  // worktree 模式:校验当前 cwd 是否在 worktree 内
  const currentCwd = process.cwd();
  if (isInWorktree(currentCwd)) {
    return; // 已在 worktree 内,放行
  }

  // 在主仓执行,但判定为 worktree 模式 -> 违规
  const gitRoot = getGitRoot(currentCwd);
  const changeName = basename(changeDir);
  const worktreePath = worktree && worktree !== "null" && worktree !== "skipped"
    ? worktree
    : `.worktrees/${changeName}`;
  console.error(`⛔ [HARD_STOP] worktree 模式下,此命令必须在 worktree 内执行,当前在主仓`);
  console.error(`  change-dir: ${changeDir}`);
  console.error(`  state.worktree: ${worktree}`);
  console.error(`  git worktree list 检测到 worktree-${changeName} 分支存在`);
  console.error(`  当前 cwd: ${currentCwd}`);
  if (gitRoot) {
    console.error(`  主仓根: ${gitRoot}`);
  }
  console.error("");
  console.error("  原因:Claude Code 的 EnterWorktree 自动解绑 session cwd 到 worktree;");
  console.error("        OpenCode 走 `alloy _worktree-create`,session cwd 不解绑(agent 传 workdir),仍在主仓。");
  console.error("        在主仓执行此命令会导致 .alloy.yaml/制品 commit 进 feature 分支,破坏 worktree 隔离。");
  console.error("");
  console.error("  修复:先 cd 到 worktree 再执行此命令:");
  console.error(`    cd "${worktreePath}"`);
  console.error(`    <重新执行原命令>`);
  console.error("");
  console.error("  逃生阀:ALLOY_FORCE_WORKTREE=1 绕过(仅限修复畸形状态,如 worktree 已删除但 state 未更新)。");
  process.exit(1);
}
