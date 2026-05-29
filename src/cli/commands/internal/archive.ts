// src/cli/commands/internal/archive.ts
import { join } from "node:path";
import { execSync } from "node:child_process";
import { readState, writeState } from "../../utils/state.js";

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

  if (dryRun) {
    console.log(`[DRY RUN] 将归档 change '${changeName}' (phase=${state.phase})`);
    console.log(`[DRY RUN] openspec archive -y ${changeName}`);
    return;
  }

  // 2. 执行 openspec archive
  try {
    execSync(`openspec archive -y "${changeName}"`, {
      stdio: "pipe",
      cwd: projectDir,
    });
    console.log("✓ delta spec 已同步，change 已归档");
  } catch (e: any) {
    const msg = e.stderr?.toString() || e.message || "";
    console.log(`⚠️  openspec archive 失败，继续更新 phase（错误: ${msg.trim()}）`);
  }

  // 3. 更新 phase → archived
  state.phase = "archived";
  await writeState(changeDir, state);
  console.log("✓ phase → archived");

  // 4. 提交归档变更
  try {
    execSync("git diff --quiet && git diff --cached --quiet", {
      stdio: "pipe",
      cwd: projectDir,
    });
    console.log("⚠️  没有需要提交的变更");
  } catch {
    try {
      execSync(
        "git add openspec/specs/ openspec/changes/ archive/ 2>/dev/null; " +
          `git commit -m "archive: ${changeName} 归档——Delta Spec 已同步" 2>/dev/null`,
        { stdio: "pipe", cwd: projectDir }
      );
    } catch {
      console.log("⚠️  git commit 失败（可能不是 git 仓库）");
    }
  }
}
