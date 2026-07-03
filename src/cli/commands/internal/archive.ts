// src/cli/commands/internal/archive.ts
import { execSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, relative } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

  console.log(`✓ archive 完成: ${changeName}`);
  console.log(`  归档目录: openspec/changes/archive/${today}-${changeName}/`);
  if (hasSpecs) {
    console.log(`  ✓ Delta Spec 已 promote 到主 spec`);
  } else {
    console.log(`  ℹ️ spec-less change，跳过 spec sync`);
  }
}
