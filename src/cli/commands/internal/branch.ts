// src/cli/commands/internal/branch.ts
// alloy _branch 命令:分支上下文读取 + 分支创建验证。
//
// 替代 alloy-start SKILL.md 里 Step 1 ①②④⑤ 的多步 bash:
//   _branch context - 合并"读 main_branch + 当前分支检测"(2 次 LLM -> 1 次)
//   _branch create  - 合并"git checkout -b + 验证当前分支"(2 次 LLM -> 1 次)
//
// 用法:
//   alloy _branch context
//   alloy _branch create --feature <branch> --main <main-branch>
import { execSync } from "node:child_process";
import { readProjectConfig } from "../../utils/state.js";
import { currentBranch } from "../../../core/git.js";

/**
 * alloy _branch context
 *
 * 读取分支上下文:openspec/config.yaml 的 main_branch + git 当前分支。
 * 输出 JSON:{"main_branch":"main","current_branch":"main"}
 *
 * main_branch 空/null -> PRECONDITION_FAIL exit 1(引导 alloy init)。
 */
async function branchContext(args: string[]): Promise<void> {
  if (args.length > 0) {
    console.error("用法: alloy _branch context");
    process.exit(1);
    return;
  }

  const projectRoot = process.cwd();
  const config = await readProjectConfig(projectRoot);
  const mainBranch = (config.alloy as Record<string, unknown>)?.main_branch;

  if (!mainBranch || mainBranch === "null") {
    console.error("⛔ [PRECONDITION_FAIL] openspec/config.yaml 未配置 main_branch");
    console.error("  主分支配置已下沉到 alloy init 阶段(项目级配置)。");
    console.error("  请先运行 alloy init 完成项目初始化。");
    process.exit(1);
    return;
  }

  const cur = currentBranch(projectRoot);
  if (!cur) {
    console.error("⛔ [PRECONDITION_FAIL] 无法读取当前分支(git branch --show-current 失败)");
    console.error("  可能原因:不在 git 仓库 / HEAD 处于 unborn 状态。");
    console.error("  修复:确保 alloy init 已完成(git 仓库初始化 + 首次 commit)。");
    process.exit(1);
    return;
  }

  console.log(JSON.stringify({ main_branch: String(mainBranch), current_branch: cur }));
}

/**
 * alloy _branch create --feature <branch> --main <main-branch>
 *
 * 从 main 创建 feature 分支 + 验证当前分支已切换到 feature。
 * 失败(仍在 main / checkout 失败) -> exit 1,SKILL.md 指示回退 USER_GATE。
 * 不自动 reset/checkout(§3.5.1 git 自救禁令)。
 */
async function branchCreate(args: string[]): Promise<void> {
  let feature: string | undefined;
  let main: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--feature" && i + 1 < args.length) {
      feature = args[++i];
    } else if (args[i] === "--main" && i + 1 < args.length) {
      main = args[++i];
    }
  }

  if (!feature || !main) {
    console.error("用法: alloy _branch create --feature <branch> --main <main-branch>");
    process.exit(1);
    return;
  }

  if (feature === main) {
    console.error(`⛔ [PRECONDITION_FAIL] feature 分支不能等于主分支: ${feature}`);
    process.exit(1);
    return;
  }

  const projectRoot = process.cwd();

  // git checkout -b feature main
  try {
    execSync(`git checkout -b "${feature}" "${main}"`, {
      cwd: projectRoot,
      stdio: "pipe",
    });
  } catch (e) {
    const err = e as { stderr?: Buffer; message: string };
    const stderr = err.stderr?.toString() ?? "";
    console.error(`⛔ [FAIL] git checkout -b 失败: ${err.message}`);
    if (stderr) console.error(`  ${stderr.trim()}`);
    console.error("  常见原因:分支已存在 / main 分支不存在 / working tree 冲突。");
    console.error("  禁止 agent 自动 reset/checkout(§3.5.1 git 自救禁令)--退出让用户处理。");
    process.exit(1);
    return;
  }

  // 验证当前分支 = feature
  const cur = currentBranch(projectRoot);
  if (cur !== feature) {
    console.error(`⛔ [FAIL] 分支创建后验证失败: 期望 ${feature}, 实际 ${cur}`);
    console.error("  git checkout -b 报告成功但当前分支未切换--极少见,可能 worktree 引用冲突。");
    console.error("  禁止 agent 自动 checkout(§3.5.1)--退出让用户处理。");
    process.exit(1);
    return;
  }

  console.log(`✓ 分支已创建并验证: ${feature} (从 ${main})`);
}

export async function branchCommand(args: string[]): Promise<void> {
  const action = args[0];

  if (!action) {
    console.error("用法: alloy _branch <context|create> [...]");
    process.exit(1);
    return;
  }

  switch (action) {
    case "context":
      return branchContext(args.slice(1));
    case "create":
      return branchCreate(args.slice(1));
    default:
      console.error(`未知操作: ${action} (支持: context, create)`);
      process.exit(1);
  }
}
