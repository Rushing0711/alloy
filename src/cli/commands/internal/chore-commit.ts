// src/cli/commands/internal/chore-commit.ts
// alloy _chore-commit 命令:非制品 commit 的原子操作。
// 替代 SKILL.md 里手写的 `git add <path> && git commit -m "..."` 裸 bash 序列。
//
// 用法:alloy _chore-commit <change-dir> --msg <message> --paths <p1,p2,...> [--cwd <dir>]
//
// 设计:
// - --paths 必填,显式列出要 add 的文件路径(逗号分隔)。禁 git add -A / git add .
// - --msg 必填,commit message
// - --cwd 可选,git 命令的 cwd(默认 process.cwd())
// - 幂等:无 staged 改动时跳过 commit
// - 用 -F 文件方式提交,避免 heredoc + 变量展开在 Claude Code Bash(eval)触发 "command too long"
//
// 多 agent 适配:Claude Code / OpenCode / Pi 都用此命令,无平台差异。
// Pi/OpenCode bash 无 shell state 持久化,跨 bash 调用变量会丢,原子命令避免此问题。
import { execSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

/**
 * alloy _chore-commit
 *
 * 原子完成 git add --paths + git commit --message。用于状态写入收尾、worktree 创建前快照等非制品 commit。
 *
 * 替代 SKILL.md 里 6 处手写的 `git add <path> && git commit -m "..."` 裸 bash 序列:
 * - alloy-apply L106-107(apply 阶段开始前状态快照)
 * - alloy-apply L252-253(skill log 后 commit worktree 创建前)
 * - alloy-apply L272-273(worktree skipped 决策 commit)
 * - alloy-archive L163-164(archive 前 .alloy.yaml 同步)
 * - alloy-archive L351-352(归档目录移动 commit)
 * - alloy-finish L366-367(finish 延期 deferred_at commit)
 */
export async function choreCommitCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      msg: { type: "string" },
      paths: { type: "string" },
      cwd: { type: "string" },
    },
    allowPositionals: true,
  });

  const changeDir = positionals[0];
  const msg = values.msg;
  const paths = values.paths;
  const cwd = values.cwd ?? process.cwd();

  if (!changeDir || !msg || !paths) {
    console.error("用法: alloy _chore-commit <change-dir> --msg <message> --paths <p1,p2,...> [--cwd <dir>]");
    console.error("  原子完成 git add --paths + git commit --message(限路径 + 幂等)");
    console.error("  --paths 必填,显式列出要 add 的文件路径(逗号分隔),禁 git add -A / git add .");
    console.error("  --msg 必填,commit message(支持多行)");
    console.error("  --cwd 可选,git 命令的 cwd(默认 process.cwd())");
    process.exit(1);
    return;
  }

  if (!existsSync(changeDir)) {
    console.error(`⛔ [PRECONDITION_FAIL] change 目录不存在: ${changeDir}`);
    process.exit(1);
    return;
  }

  const pathList = paths.split(",").map(p => p.trim()).filter(Boolean);
  if (pathList.length === 0) {
    console.error("⛔ --paths 不能为空");
    process.exit(1);
    return;
  }

  // 获取 .git 目录路径(支持 worktree,git rev-parse --git-dir 在 worktree 内返回 .git/worktrees/<name>)
  let gitDir: string;
  try {
    const rawGitDir = execSync("git rev-parse --git-dir", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    gitDir = isAbsolute(rawGitDir) ? rawGitDir : resolve(cwd, rawGitDir);
  } catch {
    console.error(`⛔ [PRECONDITION_FAIL] 非 git 仓库或 git 命令失败: ${cwd}`);
    process.exit(1);
    return;
  }

  // git add 限路径(禁 git add -A / git add .)
  try {
    const addCmd = `git add -- ${pathList.map(p => `"${p}"`).join(" ")}`;
    execSync(addCmd, { cwd, stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    console.error(`⛔ git add 失败: ${(e as Error).message}`);
    process.exit(1);
    return;
  }

  // 检查是否有 staged 改动(git diff --cached --quiet 退出码 0=无改动,1=有改动)
  let hasStaged = true;
  try {
    execSync("git diff --cached --quiet", { cwd, stdio: ["pipe", "pipe", "pipe"] });
    hasStaged = false;
  } catch {
    hasStaged = true;
  }

  if (!hasStaged) {
    console.log("✓ 无 staged 改动,跳过 commit(幂等)");
    return;
  }

  // 用 -F 文件方式提交,避免 heredoc + 变量展开问题(Claude Code Bash 用 eval 触发 "command too long")
  const tmpFile = join(gitDir, `alloy-chore-msg-${randomBytes(4).toString("hex")}.txt`);
  try {
    writeFileSync(tmpFile, msg, "utf-8");
    execSync(`git commit -F "${tmpFile}"`, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    console.log(`✓ chore-commit 完成: ${msg.split("\n")[0]}`);
  } catch (e) {
    console.error(`⛔ git commit 失败: ${(e as Error).message}`);
    process.exit(1);
  } finally {
    try { unlinkSync(tmpFile); } catch { /* 文件可能不存在,忽略 */ }
  }
}
