// src/cli/commands/internal/archive.ts
import { join } from "node:path";
import { readFile, access } from "node:fs/promises";
import { execSync } from "node:child_process";
import { readState, writeState } from "../../utils/state.js";

const FAIL_MARKER = "- [x] ❌ FAIL";

function isCommandNotFound(err: unknown): boolean {
  const msg = (err as any)?.stderr?.toString() || (err as any)?.message || "";
  return /command not found|not recognized|no such file/i.test(msg);
}

export async function archiveCommand(args: string[]): Promise<void> {
  const projectDir = args[0];
  const changeName = args[1];
  const dryRun = args.includes("--dry-run");

  if (!projectDir || !changeName) {
    console.error("用法: alloy _archive <project-dir> <change-name> [--dry-run]");
    process.exit(1);
  }

  const changeDir = join(projectDir, "openspec", "changes", changeName);

  // 1. 验证 phase = applied
  const state = await readState(changeDir);
  if (state.phase !== "applied") {
    console.error(`[HARD STOP] phase 必须为 applied，当前为 ${state.phase}`);
    process.exit(1);
  }

  // 2. 验证 verify.md 存在且 Overall Decision 不是 FAIL
  let verifyContent: string;
  try {
    await access(join(changeDir, "verify.md"));
    verifyContent = await readFile(join(changeDir, "verify.md"), "utf-8");
  } catch (e: any) {
    if (e.code === "ENOENT") {
      console.error("[HARD STOP] verify.md 不存在，无法归档。请先运行 /alloy:apply 完成执行阶段。");
      process.exit(1);
    }
    console.error(`[HARD STOP] 无法读取 verify.md: ${e.message}`);
    process.exit(1);
  }

  if (verifyContent!.includes(FAIL_MARKER)) {
    console.error("[HARD STOP] verify.md Overall Decision 为 FAIL，无法归档。请先修复阻塞问题。");
    process.exit(1);
  }

  if (dryRun) {
    console.log(`[DRY RUN] 将归档 change '${changeName}' (phase=${state.phase})`);
    console.log(`[DRY RUN] openspec archive -y ${changeName}`);
    return;
  }

  // 3. 执行 openspec archive
  try {
    execSync(`openspec archive -y "${changeName}"`, {
      stdio: "pipe",
      cwd: projectDir,
    });
    console.log("✓ delta spec 已同步，change 已归档");
  } catch (e: any) {
    const msg = e.stderr?.toString() || e.message || "";
    if (isCommandNotFound(e)) {
      // openspec CLI 不可用：警告但不阻断（skill 层已验证过，这里做兜底）
      console.log(`⚠️  openspec CLI 不可用，跳过 delta spec 同步（错误: ${msg.trim()}）`);
    } else {
      // 实际归档操作失败：HARD STOP，不推进 phase
      console.error(`[HARD STOP] openspec archive 失败: ${msg.trim()}`);
      process.exit(1);
    }
  }

  // 4. 更新 phase → archived
  state.phase = "archived";
  await writeState(changeDir, state);
  console.log("✓ phase → archived");

  // 5. 提交归档变更
  try {
    execSync("git diff --quiet && git diff --cached --quiet", {
      stdio: "pipe",
      cwd: projectDir,
    });
    console.log("⚠️  没有需要提交的变更");
  } catch {
    try {
      execSync(
        "git add openspec/specs/ openspec/changes/archive/ 2>/dev/null; " +
          `git commit -m "chore(${changeName}): Delta Spec 已同步并归档" 2>/dev/null`,
        { stdio: "pipe", cwd: projectDir }
      );
    } catch {
      console.log("⚠️  git commit 失败（可能不是 git 仓库）");
    }
  }
}
