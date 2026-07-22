// src/cli/commands/internal/archive.ts
import { execSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readState, writeState, formatTimestamp } from "../../utils/state.js";
import type { PhaseTimings } from "../../../core/types.js";

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

/**
 * alloy _archive <change-dir>
 *
 * 原子完成：调用 openspec archive CLI + 校验 Delta Spec promote + 校验目录移动。
 * agent 禁自行 mkdir/cp/mv 模拟归档——本命令是唯一合法路径。
 */
export async function archiveCommand(args: string[]): Promise<void> {
  const changeDir = args[0];

  if (!changeDir) {
    console.error("用法: alloy _archive <change-dir>");
    process.exit(1);
    return;
  }

  const changeName = basename(changeDir);

  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    process.exit(1);
    return;
  }

  // 防御检查 1:禁止在 worktree 内执行
  // 原因:在 worktree 内归档,openspec archive CLI 的变更(目录移动 + spec promote)会落在 worktree 分支,
  // 后续 finish 阶段 squash merge feature 分支时,这些变更不会被合入 main,导致归档丢失
  try {
    const gitDir = execSync("git rev-parse --git-dir", {
      cwd: gitRoot.root,
      encoding: "utf-8",
    }).trim();
    const commonDir = execSync("git rev-parse --git-common-dir", {
      cwd: gitRoot.root,
      encoding: "utf-8",
    }).trim();
    const gitDirAbs = resolve(gitRoot.root, gitDir);
    const commonDirAbs = resolve(gitRoot.root, commonDir);
    if (gitDirAbs !== commonDirAbs) {
      console.error("⛔ [PRECONDITION_FAIL] 当前在 worktree 内,禁止执行 alloy _archive");
      console.error("  原因:在 worktree 内归档,变更会落在 worktree 分支,后续 finish 阶段 squash merge feature 分支时丢失");
      console.error("  修复:先退出 worktree 回主仓,执行 alloy _worktree-cleanup 合并 worktree 分支到 feature,再执行 alloy _archive");
      process.exit(1);
      return;
    }
  } catch {
    // git 命令失败,忽略--后续 openspec archive CLI 会报错
  }

  // 防御检查 2:worktree 未清理拒绝执行
  // 原因:worktree 分支的变更未合入 feature 分支,此时归档会导致 worktree 分支与 feature 分支内容不一致
  // 例外:worktree=skipped(Pi 不支持 worktree / 用户选跳过)或 null(未创建)时不检查 worktree_merged_at
  try {
    const state = await readState(changeDir);
    const hasWorktree = state.worktree
      && state.worktree !== "skipped"
      && state.worktree !== "null";
    if (hasWorktree && !state.worktree_merged_at) {
      console.error("⛔ [PRECONDITION_FAIL] worktree 未清理,禁止执行 alloy _archive");
      console.error(`  .alloy.yaml 记录 worktree=${state.worktree},但 worktree_merged_at 为 null`);
      console.error("  原因:worktree 分支的变更未合入 feature 分支,此时归档会导致变更丢失");
      console.error("  修复:先执行 alloy _worktree-cleanup 合并 worktree 分支到 feature,再执行 alloy _archive");
      process.exit(1);
      return;
    }
  } catch {
    // .alloy.yaml 不存在,跳过此检查--后续 openspec archive CLI 会报错
  }

  // 检测 change 是否含 specs/ 目录，决定是否传 --skip-specs
  const changeSpecsDir = join(changeDir, "specs");
  const hasSpecs = existsSync(changeSpecsDir) && readdirSync(changeSpecsDir).length > 0;

  // 调用 openspec archive CLI
  // -y 必传：agent 非交互调用，openspec archive CLI 默认有确认提示，不传 -y 会卡在交互等待
  const cliArgs = ["archive", changeName, "-y"];
  if (!hasSpecs) {
    cliArgs.splice(2, 0, "--skip-specs");
  }
  const cliCmd = `openspec ${cliArgs.join(" ")}`;

  try {
    execSync(cliCmd, { cwd: gitRoot.root, encoding: "utf-8", stdio: "pipe" });
  } catch (e) {
    const err = e as { stderr?: Buffer; message: string };
    const stderr = err.stderr?.toString() ?? "";
    console.error(`⛔ [PRECONDITION_FAIL] openspec archive CLI 失败`);
    console.error(`  命令: ${cliCmd}`);
    console.error(`  错误: ${err.message}${stderr ? `\n${stderr}` : ""}`);
    console.error(`  禁止 agent 自行 mkdir/cp/mv 模拟归档——必须 openspec archive CLI 成功完成。`);
    process.exit(1);
    return;
  }

  // 校验 1：archive 目录存在
  const today = new Date().toISOString().slice(0, 10);
  const archiveDir = join(gitRoot.root, `openspec/changes/archive/${today}-${changeName}`);
  if (!existsSync(archiveDir)) {
    console.error(`⛔ [PRECONDITION_FAIL] 归档目录不存在: ${archiveDir}`);
    console.error(`  openspec archive CLI 未完成目录移动——可能 agent 自行 mkdir 模拟跳过了 CLI。`);
    console.error(`  禁止 agent 自行 mv 模拟——必须重调 alloy _archive 让 openspec archive CLI 执行。`);
    process.exit(1);
    return;
  }

  // 校验 2：逐 capability 验证主 spec 已 promote
  const archiveSpecsDir = join(archiveDir, "specs");
  if (existsSync(archiveSpecsDir)) {
    const missingSpecs: string[] = [];
    for (const capDir of readdirSync(archiveSpecsDir)) {
      const capPath = join(archiveSpecsDir, capDir);
      if (!existsSync(capPath)) continue;
      const mainSpec = join(gitRoot.root, "openspec/specs", capDir, "spec.md");
      if (!existsSync(mainSpec)) {
        missingSpecs.push(capDir);
      }
    }

    if (missingSpecs.length > 0) {
      console.error(`⛔ [PRECONDITION_FAIL] Delta Spec 未 promote 到主 spec：`);
      console.error(`  缺失 capabilities: ${missingSpecs.join(" ")}`);
      console.error(`  归档目录: ${archiveSpecsDir}`);
      console.error(`  主 spec:  ${join(gitRoot.root, "openspec/specs")}`);
      console.error(`  openspec archive CLI 未执行真正的 spec sync。`);
      console.error(`  禁止 agent 自行 cp 补齐——必须重调 alloy _archive 让 openspec archive CLI 执行合并。`);
      process.exit(1);
      return;
    }
  }
  // change 无 specs/ 目录时跳过 spec sync 校验（spec-less change）

  // 兜底:确保 archive phase started_at 已写 + phase=archiving
  // 原因:agent 跳过 archive SKILL.md Step 1 的 _phase start 时,新路径 .alloy.yaml 无 started_at + phase=applied,
  // 后续 _verify phase-exit archive 会 FAIL("phase 不匹配: 期望 archiving,实际 applied; started_at 缺失")。
  // 幂等:agent 按流程执行 Step 1 时,started_at 已存在,phase=archiving,此处不覆盖不写。
  // 不 clear gate / 不 commit:clear gate 由 hook-guard 处理(问答工具调用时 clear);commit 由后续归档变更提交一起处理。
  // 多 agent 影响:Claude Code/OpenCode/Pi 都可能跳过 Step 1,兜底对 3 个 agent 都正收益。
  try {
    const state = await readState(archiveDir);
    let needsWrite = false;
    const timings: PhaseTimings = state.phase_timings ?? {};
    if (!timings.archive?.started_at) {
      timings.archive = {
        started_at: formatTimestamp(),
        completed_at: timings.archive?.completed_at ?? null,
      };
      state.phase_timings = timings;
      needsWrite = true;
    }
    if (state.phase !== "archiving") {
      state.phase = "archiving";
      needsWrite = true;
    }
    if (needsWrite) {
      await writeState(archiveDir, state);
      console.log(`✓ 兜底:archive phase started_at + phase=archiving 已写入(agent 可能跳过了 Step 1 的 _phase start)`);
    }
  } catch {
    // .alloy.yaml 不存在或读写失败,不阻断 _archive--后续 _phase complete 会报错引导 agent 修复
    console.warn(`⚠️ 兜底写 archive phase 状态失败(后续 _phase complete 可能 FAIL,agent 需手动调 alloy _phase start "${archiveDir}" archive)`);
  }

  console.log(`✓ archive 完成: ${changeName}`);
  const archivePath = `openspec/changes/archive/${today}-${changeName}`;
  console.log(`  归档目录: ${archivePath}/`);
  // 输出 ARCHIVE_DIR 引导行,供 agent 可靠解析后续 finish 阶段所需路径
  // 避免 agent 手写 ls -d openspec/changes/archive/*-<name> | sort -r | head -1(重名/多 archive 不可靠)
  console.log(`-> ARCHIVE_DIR=${archivePath}`);
  if (hasSpecs) {
    console.log(`  ✓ Delta Spec 已 promote 到主 spec`);
  } else {
    console.log(`  ℹ️ spec-less change，跳过 spec sync`);
  }

  // 归档变更提交(原子完成 git add + commit,限路径;替代 SKILL.md 手写 _chore-commit)
  // 限路径:openspec/specs/ + openspec/changes/(禁 git add -A,避免卷入无关 working tree 变更)
  // 幂等:无 staged 改动跳过 commit(openspec archive CLI 已 commit 时)
  try {
    execSync("git add openspec/specs/ openspec/changes/", {
      cwd: gitRoot.root,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let hasStaged = true;
    try {
      execSync("git diff --cached --quiet", { cwd: gitRoot.root, stdio: ["pipe", "pipe", "pipe"] });
      hasStaged = false;
    } catch {
      hasStaged = true;
    }
    if (hasStaged) {
      const commitMsg = `chore(${changeName}): 归档目录移动`;
      execSync(`git commit -m "${commitMsg}"`, {
        cwd: gitRoot.root,
        stdio: ["pipe", "pipe", "pipe"],
      });
      console.log(`✓ 归档变更已 commit: ${commitMsg}`);
    } else {
      console.log(`✓ 归档变更已提交,无新增改动跳过 commit(幂等)`);
    }
  } catch (e) {
    console.error(`⚠️ 归档变更 commit 失败: ${(e as Error).message}`);
    console.error(`  agent 需手动: git add openspec/specs/ openspec/changes/ && git commit -m "chore(${changeName}): 归档目录移动"`);
  }
}
