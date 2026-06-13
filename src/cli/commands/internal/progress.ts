// src/cli/commands/internal/progress.ts
import { existsSync } from "node:fs";
import { readState } from "../../utils/state.js";
import { computeArtifactHash, ARTIFACT_FILES } from "../../../core/artifacts.js";

/**
 * alloy _progress artifacts <change-dir>
 * 输出每个制品的状态行：<artifact>:<status>[:<detail>]
 *   done       — 文件存在 + hash 匹配
 *   missing    — 文件不存在
 *   hash-mismatch — 文件存在但 hash 不匹配
 *   pending    — 文件存在但无 record（未审批）
 * 退出码: 始终 0（查询命令）
 */
export async function progressCommand(args: string[]): Promise<void> {
  const action = args[0];

  if (!action) {
    console.error("用法: alloy _progress artifacts <change-dir>");
    return process.exit(1);
  }

  if (action === "artifacts") {
    return artifactsProgress(args.slice(1));
  }

  console.error(`未知操作: ${action} (支持: artifacts)`);
  return process.exit(1);
}

async function artifactsProgress(args: string[]): Promise<void> {
  const changeDir = args[0];
  if (!changeDir) {
    console.error("用法: alloy _progress artifacts <change-dir>");
    return process.exit(1);
  }

  let state;
  try {
    state = await readState(changeDir);
  } catch {
    console.error(`无法读取状态: ${changeDir}`);
    return process.exit(1);
  }
  const records = state.records || [];

  // 按制品定义顺序输出
  const artifactOrder = ["draft", "proposal", "design", "specs", "tasks", "plans", "verify", "retrospective"];

  for (const artifactId of artifactOrder) {
    const fileName = ARTIFACT_FILES[artifactId];
    if (!fileName) continue;

    const fullPath = `${changeDir}/${fileName}`;
    const fileExists = existsSync(fullPath);
    const record = records.find((r) => r.artifact === artifactId);

    if (!fileExists) {
      console.log(`${artifactId}:missing`);
      continue;
    }

    if (!record) {
      console.log(`${artifactId}:pending`);
      continue;
    }

    const currentHash = await computeArtifactHash(changeDir, artifactId);
    if (currentHash === null) {
      console.log(`${artifactId}:missing`);
      continue;
    }

    if (currentHash !== record.hash) {
      console.log(`${artifactId}:hash-mismatch:${record.hash}!=${currentHash}`);
      continue;
    }

    console.log(`${artifactId}:done:${record.hash}`);
  }
}
