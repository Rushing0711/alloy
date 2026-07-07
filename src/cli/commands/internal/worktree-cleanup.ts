// src/cli/commands/internal/worktree-cleanup.ts
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readState, writeState } from "../../utils/state.js";

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

function parseArgs(args: string[]): {
  archiveDir?: string;
  worktreePath?: string;
  featureBranch?: string;
  worktreeBranch?: string;
} {
  const out: { archiveDir?: string; worktreePath?: string; featureBranch?: string; worktreeBranch?: string } = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--archive-dir") out.archiveDir = args[++i];
    else if (a === "--worktree-path") out.worktreePath = args[++i];
    else if (a === "--feature-branch") out.featureBranch = args[++i];
    else if (a === "--worktree-branch") out.worktreeBranch = args[++i];
  }
  return out;
}

/**
 * alloy _worktree-cleanup --archive-dir <path> --worktree-path <path> --feature-branch <branch> --worktree-branch <branch>
 *
 * 原子完成 worktree 清理：merge worktree 分支到 feature + remove worktree + branch -d + worktree_merged_at 记录。
 * 前置：agent 已 ExitWorktree 回主仓（CLI 在主仓执行）。
 * state 字段（worktree/feature_branch/worktree_branch）由 agent 在 worktree 里读取后通过参数传入——
 *   不从 archive-dir 读 state，因为 archive-dir 在 worktree 分支 commit，主仓 feature 分支还没 merge 时读不到。
 * agent 禁自行 git merge / worktree remove / branch -d 模拟——本命令是唯一合法路径。
 */
export async function worktreeCleanupCommand(args: string[]): Promise<void> {
  const opts = parseArgs(args);

  if (!opts.archiveDir || !opts.worktreePath || !opts.featureBranch || !opts.worktreeBranch) {
    console.error("用法: alloy _worktree-cleanup --archive-dir <path> --worktree-path <path> --feature-branch <branch> --worktree-branch <branch>");
    console.error("");
    console.error("  state 字段（worktree/feature_branch/worktree_branch）由 agent 在 worktree 里读取后传入。");
    console.error("  不从 archive-dir 读 state——archive-dir 在 worktree 分支，主仓 feature 分支未 merge 时读不到。");
    process.exit(1);
    return;
  }

  const { archiveDir, worktreePath, featureBranch, worktreeBranch } = opts;

  // silent fallback 检测：worktree 目录不存在（可能已清理过）
  if (!existsSync(worktreePath)) {
    const wtList = gitExec("git worktree list --porcelain").stdout;
    if (!wtList.includes(worktreePath)) {
      console.log(`ℹ️ worktree 目录不存在: ${worktreePath}（可能已清理）`);
      console.log("  仅记录 worktree_merged_at");
      const mergedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
      try {
        const state = await readState(archiveDir);
        state.worktree_merged_at = mergedAt;
        await writeState(archiveDir, state);
        gitExec(`git add "${archiveDir}/.alloy.yaml" && git diff --cached --quiet || git commit -m "chore: 记录 worktree 合并时间"`);
        console.log("✓ worktree_merged_at 已记录");
      } catch {
        console.error(`⚠️ 无法读取 state: ${archiveDir}/.alloy.yaml（merge 后再试）`);
      }
      return;
    }
  }

  // 1. 校验当前在主仓（不在 worktree 内）
  const gitDir = gitExec("git rev-parse --git-dir").stdout;
  const gitCommonDir = gitExec("git rev-parse --git-common-dir").stdout;
  if (gitDir !== gitCommonDir) {
    console.error("⛔ [PRECONDITION_FAIL] 当前在 worktree 内，禁止执行 worktree 清理");
    console.error(`  git-dir: ${gitDir}`);
    console.error(`  git-common-dir: ${gitCommonDir}`);
    console.error("  必须先 ExitWorktree 回主仓，再调用 alloy _worktree-cleanup");
    console.error("  原因：merge/worktree remove/branch -d 都需要在主仓执行，worktree 内执行会失败");
    process.exit(1);
    return;
  }

  // 2. 校验当前分支 = feature_branch
  const currentBranch = gitExec("git branch --show-current").stdout;
  if (currentBranch !== featureBranch) {
    console.error(`⛔ [PRECONDITION_FAIL] 当前分支 ${currentBranch} ≠ feature 分支 ${featureBranch}`);
    console.error("  merge 必须在 feature 分支上执行");
    console.error(`  请手动 git checkout ${featureBranch} 后重试`);
    process.exit(1);
    return;
  }

  // 3. git merge worktree 分支到 feature
  console.log(`ℹ️ merge worktree 分支 ${worktreeBranch} → feature 分支 ${featureBranch}`);
  const mergeResult = gitExec(`git merge ${worktreeBranch} --no-edit`);
  if (!mergeResult.ok) {
    console.error("⛔ [HARD_STOP] git merge 失败——worktree 工作未合入 feature 分支");
    console.error("  冲突现场：");
    console.error(gitExec("git status --short").stdout);
    console.error("");
    console.error("  合法路径：");
    console.error("    1) 用户手动解决冲突后 git add + git commit，再重新运行 /alloy:archive");
    console.error("    2) 用户决定放弃 worktree 工作（确认无未保存改动后）");
    console.error("");
    console.error("  禁止：agent 自动运行 git merge --abort / git reset --hard / git checkout . / git stash（§3.5.1）");
    process.exit(1);
    return;
  }

  // 4. git worktree remove
  console.log(`ℹ️ 删除 worktree 目录: ${worktreePath}`);
  const removeResult = gitExec(`git worktree remove "${worktreePath}"`);
  if (!removeResult.ok) {
    const status = gitExec(`cd "${worktreePath}" && git status --porcelain`).stdout;
    const lines = status.split("\n").filter((l) => l.trim());

    if (lines.length > 0) {
      // 检查未提交修改是否仅含 archive-dir/.alloy.yaml
      const alloyYamlPath = `${archiveDir}/.alloy.yaml`;
      const onlyAlloyYaml = lines.every((l) => l.endsWith(alloyYamlPath));

      if (onlyAlloyYaml) {
        // 仅 .alloy.yaml 未提交修改——merge 已合入 commit 版本,worktree 内的修改冗余,强制 remove
        console.log(`ℹ️ worktree 内仅 ${alloyYamlPath} 有未提交修改(merge 已合入 commit 版本),强制 remove`);
        const forceRemove = gitExec(`git worktree remove --force "${worktreePath}"`);
        if (!forceRemove.ok) {
          console.error("⛔ [HARD_STOP] git worktree remove --force 失败");
          console.error(`  ${forceRemove.stderr}`);
          console.error("  禁止：agent 自动 git clean -fd / rm -rf（§3.5.1）");
          process.exit(1);
          return;
        }
      } else {
        // 有其他未提交修改——HARD_STOP(可能是用户代码,不能强制删)
        console.error("⛔ [HARD_STOP] worktree 目录有未提交修改,git worktree remove 拒绝执行");
        console.error("  未提交修改:");
        console.error(status);
        console.error("");
        console.error("  禁止：agent 自动 git clean -fd / rm -rf（§3.5.1）");
        console.error("  必须：用户确认后手动 git worktree remove --force,或退出 skill 处理");
        process.exit(1);
        return;
      }
    } else {
      console.error("⛔ [HARD_STOP] git worktree remove 失败");
      console.error(`  ${removeResult.stderr}`);
      console.error("  禁止：agent 自动 git clean -fd / rm -rf（§3.5.1）");
      process.exit(1);
      return;
    }
  }

  // 5. git branch -d worktree 分支（失败不强制 -D）
  console.log(`ℹ️ 删除 worktree 分支: ${worktreeBranch}`);
  const branchResult = gitExec(`git branch -d ${worktreeBranch}`);
  if (!branchResult.ok) {
    console.error("⛔ [HARD_STOP] git branch -d 失败——worktree 分支可能未完全合并");
    console.error(`  worktree 分支: ${worktreeBranch}`);
    console.error(`  feature 分支: ${featureBranch}`);
    console.error(`  ${branchResult.stderr}`);
    console.error("");
    console.error("  禁止：agent 自动 git branch -D 强制删除——会丢失未合并 commit");
    console.error("  必须：用户手动检查后 -D，或排查 merge 问题");
    process.exit(1);
    return;
  }

  // 6. 记录 worktree_merged_at + commit（merge 后 archive-dir 在 feature 分支存在）
  const mergedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  try {
    const state = await readState(archiveDir);
    state.worktree_merged_at = mergedAt;
    await writeState(archiveDir, state);
    gitExec(`git add "${archiveDir}/.alloy.yaml" && git diff --cached --quiet || git commit -m "chore: 记录 worktree 合并时间"`);
  } catch {
    console.error(`⚠️ 无法读取 state: ${archiveDir}/.alloy.yaml（merge 后路径应存在，请检查）`);
    console.error("  worktree 已清理，但 worktree_merged_at 未记录——请手动检查");
    process.exit(1);
    return;
  }

  console.log("✓ worktree 清理完成：");
  console.log(`  ✓ merge ${worktreeBranch} → ${featureBranch}`);
  console.log(`  ✓ worktree remove: ${worktreePath}`);
  console.log(`  ✓ branch -d: ${worktreeBranch}`);
  console.log(`  ✓ worktree_merged_at: ${mergedAt}`);
}
