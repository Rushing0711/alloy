// src/cli/commands/internal/record.ts
import { createHash } from "node:crypto";
import { readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readState, writeState } from "../../utils/state.js";
import type { ArtifactRecord } from "../../../core/types.js";

function computeHash(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 12);
}

const ARTIFACT_FILES: Record<string, string> = {
  draft: "draft.md",
  proposal: "proposal.md",
  design: "design.md",
  specs: "specs",
  tasks: "tasks.md",
  plans: "plans.md",
  verify: "verify.md",
  retrospective: "retrospective.md",
};

async function computeArtifactHash(changeDir: string, artifactId: string): Promise<string | null> {
  const fileName = ARTIFACT_FILES[artifactId];
  if (!fileName) return null;

  const fullPath = join(changeDir, fileName);
  try {
    const st = await stat(fullPath);
    if (st.isDirectory()) {
      // specs/: 收集所有文件, 排序, 拼接, hash
      const entries = await readdir(fullPath, { withFileTypes: true });
      const files = entries.filter(e => e.isFile()).map(e => e.name).sort();
      const contents: Buffer[] = [];
      for (const f of files) {
        contents.push(await readFile(join(fullPath, f)));
      }
      return computeHash(Buffer.concat(contents));
    } else {
      const content = await readFile(fullPath);
      return computeHash(content);
    }
  } catch {
    return null;
  }
}

export async function recordCommand(args: string[]): Promise<void> {
  const action = args[0]; // write | check | compute
  const changeDir = args[1];

  if (!action || !changeDir) {
    console.error("用法: alloy _record <write|check|compute> <change-dir> [artifact] [hash] [committed_at] [approver]");
    process.exit(1);
  }

  switch (action) {
    case "write": {
      const artifact = args[2];
      const hash = args[3];
      const approvedAt = args[4];
      const approver = args[5];

      if (!artifact || !hash || !approvedAt || !approver) {
        console.error("用法: alloy _record write <change-dir> <artifact> <hash> <committed_at> <approver>");
        process.exit(1);
      }

      const state = await readState(changeDir);
      const existing = state.records.findIndex(r => r.artifact === artifact);
      const record: ArtifactRecord = { artifact, hash, committed_at: approvedAt, approver };

      if (existing >= 0) {
        state.records[existing] = record;
      } else {
        state.records.push(record);
      }

      await writeState(changeDir, state);
      console.log(`✓ record: ${artifact} → ${hash}`);
      break;
    }
    case "check": {
      const artifact = args[2];
      const state = await readState(changeDir);

      const targets = artifact
        ? state.records.filter(r => r.artifact === artifact)
        : state.records;

      if (targets.length === 0) {
        if (artifact) {
          console.log(`[WARN] 未找到制品 '${artifact}' 的 record`);
          process.exit(1);
        }
        console.log("[WARN] 无 records 可校验");
        process.exit(0);
      }

      let allMatch = true;
      for (const record of targets) {
        const currentHash = await computeArtifactHash(changeDir, record.artifact);
        if (currentHash === null) {
          console.log(`[FAIL] ${record.artifact}: 文件不存在`);
          allMatch = false;
        } else if (currentHash !== record.hash) {
          console.log(`[FAIL] ${record.artifact}: hash 不匹配 (recorded=${record.hash}, current=${currentHash})`);
          allMatch = false;
        } else {
          console.log(`[PASS] ${record.artifact}: ${currentHash}`);
        }
      }

      if (!allMatch) {
        process.exit(1);
      }
      break;
    }
    case "compute": {
      const artifact = args[2];
      if (!artifact) {
        console.error("用法: alloy _record compute <change-dir> <artifact>");
        process.exit(1);
      }
      const hash = await computeArtifactHash(changeDir, artifact);
      if (hash === null) {
        console.error(`[FAIL] 无法计算 ${artifact} 的 hash`);
        process.exit(1);
      }
      console.log(hash);
      break;
    }
    default:
      console.error(`未知操作: ${action} (支持: write, check, compute)`);
      process.exit(1);
  }
}
