// src/cli/commands/internal/artifact.ts
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readState, writeState } from "../../utils/state.js";
import { ARTIFACT_FILES } from "../../../core/artifacts.js";

/**
 * alloy _artifact <action> <change-dir> [artifact]
 *
 * 动作:
 *   reset <change-dir> <artifact> — 清除指定制品的 hash 记录 + 删除文件
 */
export async function artifactCommand(args: string[]): Promise<void> {
  const action = args[0];

  if (!action) {
    console.error("用法: alloy _artifact reset <change-dir> <artifact>");
    return process.exit(1);
  }

  if (action === "reset") {
    return artifactReset(args.slice(1));
  }

  console.error(`未知操作: ${action} (支持: reset)`);
  return process.exit(1);
}

async function artifactReset(args: string[]): Promise<void> {
  const changeDir = args[0];
  const artifactId = args[1];

  if (!changeDir || !artifactId) {
    console.error("用法: alloy _artifact reset <change-dir> <artifact>");
    return process.exit(1);
  }

  const fileName = ARTIFACT_FILES[artifactId];
  if (!fileName) {
    console.error(`未知制品: ${artifactId} (支持: ${Object.keys(ARTIFACT_FILES).join(", ")})`);
    return process.exit(1);
  }

  // 1. 清除 hash 记录
  let state;
  try {
    state = await readState(changeDir);
  } catch {
    console.error(`无法读取状态: ${changeDir}`);
    return process.exit(1);
  }
  const originalCount = state.records.length;
  state.records = state.records.filter((r) => r.artifact !== artifactId);

  if (state.records.length === originalCount) {
    console.log(`${artifactId}: no hash record found`);
  } else {
    await writeState(changeDir, state);
    console.log(`${artifactId}: hash record cleared`);
  }

  // 2. 删除制品文件
  const fullPath = join(changeDir, fileName);
  if (existsSync(fullPath)) {
    const st = await import("node:fs/promises").then((m) => m.stat(fullPath));
    if (st.isDirectory()) {
      rmSync(fullPath, { recursive: true, force: true });
    } else {
      rmSync(fullPath, { force: true });
    }
    console.log(`${artifactId}: file deleted (${fileName})`);
  } else {
    console.log(`${artifactId}: file not found (${fileName})`);
  }
}
