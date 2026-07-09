// src/cli/commands/internal/worktree-cleanup.ts
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
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

/**
 * alloy _worktree-cleanup <change-dir>
 *
 * 原子完成 worktree 清理：merge worktree 分支到 feature + remove worktree + branch -d + worktree_merged_at 记录。
 * 前置：agent 已 ExitWorktree 回主仓（CLI 在主仓执行）。
 * 自己从 worktree 分支读 state(worktree/feature_branch),不依赖 agent 传参--
 *   worktree 分支名约定为 worktree-<change-name>,用 git show 读其 .alloy.yaml。
 *   解决:agent 在 feature 分支读 state 为 null 的问题(state 写在 worktree 分支)。
 * agent 禁自行 git merge / worktree remove / branch -d 模拟--本命令是唯一合法路径。
 */
export async function worktreeCleanupCommand(args: string[]): Promise<void> {
  // 解析 change-dir(位置参数,第一个不以 -- 开头的)
  const changeDir = args.find((a) => !a.startsWith("--"));
  if (!changeDir) {
    console.error("用法: alloy _worktree-cleanup <change-dir>");
    console.error("");
    console.error("  原子完成 worktree 清理(merge + remove + branch -d + 记录 merged_at)。");
    console.error("  自己从 worktree 分支(worktree-<change-name>)读 state,不依赖 agent 传参。");
    console.error("  前置:agent 已 ExitWorktree 回主仓,当前在 feature 分支。");
    process.exit(1);
    return;
  }

  // 从 change-dir 提取 change name
  const changeName = path.basename(changeDir);

  // worktree 分支名(约定:worktree-<change-name>)
  const worktreeBranch = `worktree-${changeName}`;

  // 校验 worktree 分支存在
  const branchCheck = gitExec(`git rev-parse --verify ${worktreeBranch} 2>/dev/null`);
  if (!branchCheck.ok) {
    console.error(`⛔ [PRECONDITION_FAIL] worktree 分支 ${worktreeBranch} 不存在`);
    console.error(`  change-dir: ${changeDir}`);
    console.error("  可能原因:未使用 worktree / worktree 分支已删除 / change name 不匹配");
    console.error("  如果未使用 worktree,跳过 worktree 清理,直接进 /opsx:archive。");
    process.exit(1);
    return;
  }

  // 从 worktree 分支读 state(用 git show)
  const stateShow = gitExec(`git show ${worktreeBranch}:${changeDir}/.alloy.yaml`);
  if (!stateShow.ok) {
    console.error(`⛔ [PRECONDITION_FAIL] 无法从 worktree 分支 ${worktreeBranch} 读 .alloy.yaml`);
    console.error(`  git show ${worktreeBranch}:${changeDir}/.alloy.yaml 失败`);
    console.error("  可能原因:.alloy.yaml 未 commit 到 worktree 分支 / change-dir 路径不对");
    process.exit(1);
    return;
  }

  // 提取 state 字段(worktree / feature_branch)
  const stateContent = stateShow.stdout;
  const worktreePath = stateContent
    .match(/^worktree:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  const featureBranch = stateContent
    .match(/^feature_branch:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");

  if (!worktreePath || worktreePath === "null" || worktreePath === "skipped") {
    console.error(`⛔ [PRECONDITION_FAIL] worktree 分支 ${worktreeBranch} 的 state 缺少 worktree 字段`);
    console.error(`  worktree: ${worktreePath ?? "(空)"}`);
    console.error("  可能原因:apply 阶段未写 worktree state");
    process.exit(1);
    return;
  }

  if (!featureBranch) {
    console.error(`⛔ [PRECONDITION_FAIL] worktree 分支 ${worktreeBranch} 的 state 缺少 feature_branch`);
    process.exit(1);
    return;
  }

  // silent fallback 检测：worktree 目录不存在（可能已清理过）
  if (!existsSync(worktreePath)) {
    const wtList = gitExec("git worktree list --porcelain").stdout;
    if (!wtList.includes(worktreePath)) {
      console.log(`ℹ️ worktree 目录不存在: ${worktreePath}（可能已清理）`);
      console.log("  仅记录 worktree_merged_at");
      const mergedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
      try {
        const state = await readState(changeDir);
        state.worktree_merged_at = mergedAt;
        await writeState(changeDir, state);
        gitExec(`git add "${changeDir}/.alloy.yaml" && git diff --cached --quiet || git commit -m "chore: 记录 worktree 合并时间"`);
        console.log("✓ worktree_merged_at 已记录");
      } catch {
        console.error(`⚠️ 无法读取 state: ${changeDir}/.alloy.yaml（merge 后再试）`);
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
  console.log(`ℹ️ merge worktree 分支 ${worktreeBranch} -> feature 分支 ${featureBranch}`);
  const mergeResult = gitExec(`git merge ${worktreeBranch} --no-edit`);
  if (!mergeResult.ok) {
    console.error("⛔ [HARD_STOP] git merge 失败--worktree 工作未合入 feature 分支");
    console.error("  冲突现场：");
    console.error(gitExec("git status --short").stdout);
    console.error("");
    console.error("  合法路径：");
    console.error("    1) 用户手动解决冲突后 git add + git commit，再重新运行 /alloy-archive");
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
      const alloyYamlPath = `${changeDir}/.alloy.yaml`;
      // 分离 untracked(??)和 tracked(modified/staged 等)
      const untrackedLines = lines.filter((l) => l.startsWith("?? "));
      const trackedLines = lines.filter((l) => !l.startsWith("?? "));
      // tracked 修改:如果仅含 .alloy.yaml -> 可 --force;否则 HARD_STOP
      const trackedNonAlloy = trackedLines.filter((l) => !l.endsWith(alloyYamlPath));

      if (trackedNonAlloy.length > 0) {
        // 有 tracked 文件修改(非 .alloy.yaml)-> HARD_STOP(保护用户代码)
        console.error("⛔ [HARD_STOP] worktree 目录有 tracked 文件未提交修改,git worktree remove 拒绝执行");
        console.error("  tracked 文件修改:");
        console.error(trackedNonAlloy.join("\n"));
        console.error("");
        console.error("  禁止：agent 自动 git clean -fd / rm -rf（§3.5.1）");
        console.error("  必须：用户确认后手动 git worktree remove --force,或退出 skill 处理");
        process.exit(1);
        return;
      }

      // 只有 untracked + .alloy.yaml -> --force(untracked 未进 git,删除不丢 commit)
      const alloyCount = trackedLines.filter((l) => l.endsWith(alloyYamlPath)).length;
      console.log(`ℹ️ worktree 内有 ${untrackedLines.length} 个 untracked 文件 + ${alloyCount} 个 .alloy.yaml 修改(merge 已合入 commit 版本),强制 remove(untracked 未进 git,删除不丢 commit)`);
      if (untrackedLines.length > 0) {
        console.log(`  untracked 文件(将被删除):`);
        untrackedLines.forEach((l) => console.log(`    ${l}`));
      }
      const forceRemove = gitExec(`git worktree remove --force "${worktreePath}"`);
      if (!forceRemove.ok) {
        console.error("⛔ [HARD_STOP] git worktree remove --force 失败");
        console.error(`  ${forceRemove.stderr}`);
        console.error("  禁止：agent 自动 git clean -fd / rm -rf（§3.5.1）");
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
    console.error("⛔ [HARD_STOP] git branch -d 失败--worktree 分支可能未完全合并");
    console.error(`  worktree 分支: ${worktreeBranch}`);
    console.error(`  feature 分支: ${featureBranch}`);
    console.error(`  ${branchResult.stderr}`);
    console.error("");
    console.error("  禁止：agent 自动 git branch -D 强制删除--会丢失未合并 commit");
    console.error("  必须：用户手动检查后 -D，或排查 merge 问题");
    process.exit(1);
    return;
  }

  // 6. 记录 worktree_merged_at + commit（merge 后 change-dir 在 feature 分支存在）
  const mergedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
  try {
    const state = await readState(changeDir);
    state.worktree_merged_at = mergedAt;
    await writeState(changeDir, state);
    gitExec(`git add "${changeDir}/.alloy.yaml" && git diff --cached --quiet || git commit -m "chore: 记录 worktree 合并时间"`);
  } catch {
    console.error(`⚠️ 无法读取 state: ${changeDir}/.alloy.yaml（merge 后路径应存在，请检查）`);
    console.error("  worktree 已清理，但 worktree_merged_at 未记录--请手动检查");
    process.exit(1);
    return;
  }

  console.log("✓ worktree 清理完成：");
  console.log(`  ✓ merge ${worktreeBranch} -> ${featureBranch}`);
  console.log(`  ✓ worktree remove: ${worktreePath}`);
  console.log(`  ✓ branch -d: ${worktreeBranch}`);
  console.log(`  ✓ worktree_merged_at: ${mergedAt}`);
}
