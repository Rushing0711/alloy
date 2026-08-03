// src/cli/commands/internal/finish-cleanup.ts
import { execSync } from "node:child_process";
import { readState } from "../../utils/state.js";

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
 * alloy _finish-cleanup <change-dir> <feature-branch>
 *
 * finish 阶段 squash merge 后,原子删除 feature 分支。
 * 下沉到 CLI 的原因:
 * 1. hook-guard 拦截 `git branch -D`(§3.5.1 禁令),agent 不能直接跑
 * 2. CLI 内部跑不经过 hook,可安全执行
 * 3. CLI 内置变量校验 + main 分支保护 + squash merge 完成校验,比 SKILL.md 模板更可靠
 *
 * 前置:agent 已在 finish:confirm-merge USER_GATE 二次确认后,执行完 squash merge + commit。
 * 本命令只负责删分支,不负责 merge。
 *
 * 校验链:
 * 1. feature-branch 变量已替换(非模板占位符)
 * 2. feature-branch 不等于 main/master(防误删主分支)
 * 3. feature-branch 存在
 * 4. 当前在 main 分支(squash merge 后应已 git checkout main)
 * 5. main 分支的 HEAD 含 feature-branch 的 commit(squash merge 已完成)
 */
export async function finishCleanupCommand(args: string[]): Promise<void> {
  const changeDir = args[0];
  const featureBranchArg = args[1];

  if (!changeDir || !featureBranchArg) {
    console.error("用法: alloy _finish-cleanup <change-dir> <feature-branch>");
    console.error("");
    console.error("  finish 阶段 squash merge 后,原子删除 feature 分支。");
    console.error("  前置:agent 已 USER_GATE 二次确认 + squash merge + commit 完成。");
    console.error("  校验:变量替换 + 非主分支 + 分支存在 + 当前在 main + squash merge 已完成。");
    process.exit(1);
    return;
  }

  // 1. 校验 feature-branch 变量已替换(非模板占位符)
  if (featureBranchArg.startsWith("<") && featureBranchArg.endsWith(">")) {
    console.error(`⛔ [PRECONDITION_FAIL] feature-branch 变量未替换: ${featureBranchArg}`);
    console.error("  agent 必须从 .alloy.yaml 读取 feature_branch 字段,替换模板占位符。");
    console.error("  禁止:agent 自动猜测分支名继续执行。退出 skill 让用户检查 .alloy.yaml。");
    process.exit(1);
    return;
  }

  // 2. 校验 feature-branch 不等于 main/master(防误删主分支)
  const mainBranch = await readMainBranch(changeDir);
  const protectedBranches = ["main", "master", mainBranch].filter(Boolean) as string[];
  if (protectedBranches.includes(featureBranchArg)) {
    console.error(`⛔ [PRECONDITION_FAIL] feature-branch 与主分支同名,拒绝执行 git branch -D`);
    console.error(`  feature-branch: ${featureBranchArg}`);
    console.error(`  main-branch: ${mainBranch}`);
    console.error("  主分支是受保护分支,禁删。退出 skill 让用户检查 .alloy.yaml feature_branch 字段。");
    process.exit(1);
    return;
  }

  // 3. 校验 feature-branch 存在
  // Windows 兼容:移除 `2>/dev/null`,gitExec 已 try/catch + .ok 字段
  const branchCheck = gitExec(`git rev-parse --verify "${featureBranchArg}"`);
  if (!branchCheck.ok) {
    console.error(`⛔ [PRECONDITION_FAIL] feature 分支 ${featureBranchArg} 不存在`);
    console.error("  可能原因:分支已删 / 未创建 / 名字不匹配。退出 skill 让用户检查。");
    process.exit(1);
    return;
  }

  // 4. 校验当前在 main 分支(squash merge 后应已 git checkout main)
  const currentBranch = gitExec("git branch --show-current").stdout;
  if (currentBranch !== mainBranch) {
    console.error(`⛔ [PRECONDITION_FAIL] 当前分支 ${currentBranch} ≠ main 分支 ${mainBranch}`);
    console.error("  git branch -D 必须在 squash merge 完成 + git checkout main 之后执行。");
    console.error(`  请先 git checkout ${mainBranch},再重新运行 alloy _finish-cleanup。`);
    process.exit(1);
    return;
  }

  // 5. 校验 squash merge 已完成(main HEAD 的 tree 与 feature 分支 tip 一致)
  // 语义校验:git diff --quiet <feature-branch> <main-branch> 返回 0 = 两边内容一致
  // 之前校验 main 最近 commit message 含 "squash merge"/"feature/<name>" 字符串,
  // 依赖 message 内容,与 SKILL.md 模板耦合过紧:
  // agent 偏离模板(如简化 commit message)时误拦,把 agent 推向手动 git 操作
  // (实测 OpenCode session 2026-08-02:连续 2 次 PRECONDITION_FAIL 后 agent 弃用 CLI,
  // 自行 git reset --soft + 手动 branch -D 绕过)。
  // tree 一致 = squash 内容已合入 main,与 message 无关,才是"squash merge 已完成"的语义。
  const diffCheck = gitExec(`git diff --quiet "${featureBranchArg}" "${mainBranch}"`);
  if (!diffCheck.ok) {
    console.error(`⛔ [PRECONDITION_FAIL] main HEAD 与 feature 分支 ${featureBranchArg} 内容不一致(squash merge 未完成)`);
    console.error("  git branch -D 必须在 squash merge commit 完成后执行。");
    console.error("  请先完成 squash merge(git merge --squash + git commit),再重新运行本命令。");
    process.exit(1);
    return;
  }

  // 6. 执行 git branch -D
  // 直接用 -D 强删--squash merge 不保留 ancestry,`git branch -d` 必然失败(not fully merged)
  // 上方校验链已保证安全:变量已替换 + 非主分支 + 分支存在 + 当前在 main + squash merge 已完成
  const deleteResult = gitExec(`git branch -D "${featureBranchArg}"`);
  if (!deleteResult.ok) {
    console.error(`⛔ [HARD_FAIL] git branch -D ${featureBranchArg} 失败`);
    console.error(`  ${deleteResult.stderr}`);
    console.error("  上方校验已通过,失败可能是 git 状态异常。退出 skill 让用户排查。");
    process.exit(1);
    return;
  }

  console.log(`✓ 已删除 feature 分支: ${featureBranchArg}`);
  console.log(`  ${deleteResult.stdout}`);
}

/** 从 openspec/config.yaml 读 main_branch,默认 main */
async function readMainBranch(changeDir: string): Promise<string> {
  try {
    const state = await readState(changeDir);
    // state 不直接含 main_branch,从 config 读
    // 这里简化:默认 main,config 读取由 readProjectConfig 处理
    void state;
  } catch {
    // 读 state 失败不阻断,用默认 main
  }
  // 从 openspec/config.yaml 读 main_branch
  try {
    const { readProjectConfig } = await import("../../utils/state.js");
    const config = await readProjectConfig(process.cwd());
    return config.alloy?.main_branch ?? "main";
  } catch {
    return "main";
  }
}
