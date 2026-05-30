// src/cli/commands/internal/guard.ts
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFile, stat, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { readState, writeState } from "../../utils/state.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  started: ["planned"],
  planned: ["applied"],
  applied: ["archived"],
  archived: ["finished"],
};

const ARTIFACT_CHECKS: Record<string, string[]> = {
  "started->planned": ["proposal.md", "design.md", "specs", "tasks.md", "plans.md"],
  "planned->applied": ["plans.md"],
  "applied->archived": ["verify.md"],
};

const ARTIFACT_FILES: Record<string, string> = {
  proposal: "proposal.md",
  design: "design.md",
  specs: "specs",
  tasks: "tasks.md",
  plans: "plans.md",
  verify: "verify.md",
  retrospective: "retrospective.md",
};

function computeHash(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 12);
}

async function computeArtifactHash(changeDir: string, artifactId: string): Promise<string | null> {
  const fileName = ARTIFACT_FILES[artifactId];
  if (!fileName) return null;

  const fullPath = join(changeDir, fileName);
  try {
    const st = await stat(fullPath);
    if (st.isDirectory()) {
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

export async function guardCommand(args: string[]): Promise<void> {
  const changeDir = args[0];
  const targetPhase = args[1];
  const apply = args.includes("--apply");

  if (!changeDir || !targetPhase) {
    console.error("用法: alloy _guard <change-dir> <target-phase> [--apply]");
    process.exit(1);
  }

  const state = await readState(changeDir);
  const currentPhase = state.phase;

  // 1. 校验 phase 转换合法性
  const allowed = VALID_TRANSITIONS[currentPhase];
  if (!allowed || !allowed.includes(targetPhase)) {
    console.error(`[HARD STOP] 不允许的 phase 转换: ${currentPhase} → ${targetPhase}`);
    console.error("  允许的转换: started→planned, planned→applied, applied→archived, archived→finished");
    process.exit(1);
  }

  // 2. 制品完整性检查
  const transition = `${currentPhase}->${targetPhase}`;
  const checks = ARTIFACT_CHECKS[transition];
  if (checks) {
    const missing: string[] = [];
    for (const c of checks) {
      const p = join(changeDir, c);
      if (!existsSync(p)) missing.push(`  ${c}`);
    }
    if (missing.length > 0) {
      console.error(`[HARD STOP] 以下制品缺失，无法进入 ${targetPhase} 阶段:`);
      console.error(missing.join("\n"));
      process.exit(1);
    }
  }

  // 3. hash 一致性校验（started→planned、planned→applied、applied→archived）
  if (transition === "started->planned" || transition === "planned->applied" || transition === "applied->archived") {
    const records = state.records || [];
    const mismatches: string[] = [];
    for (const record of records) {
      const currentHash = await computeArtifactHash(changeDir, record.artifact);
      if (currentHash === null) {
        mismatches.push(`  ${record.artifact}: 文件不存在（记录 hash=${record.hash}）`);
      } else if (currentHash !== record.hash) {
        mismatches.push(`  ${record.artifact}: 记录=${record.hash} 当前=${currentHash}`);
      }
    }
    if (mismatches.length > 0) {
      console.error(`[HARD STOP] hash 一致性校验失败:`);
      console.error(mismatches.join("\n"));
      process.exit(1);
    }
  }

  // started→planned 额外检查：change 目录必须已提交
  if (transition === "started->planned") {
    try {
      execSync("git rev-parse --git-dir", { stdio: "pipe" });
      const relPath = `openspec/changes/${basename(changeDir)}`;
      const status = execSync(`git status --porcelain "${relPath}"`, {
        stdio: "pipe",
        cwd: process.cwd(),
      }).toString();
      if (status.trim()) {
        console.error("[HARD STOP] Change 目录有未提交的变更，请先执行 git add + git commit:");
        console.error(status);
        process.exit(1);
      }
    } catch {
      // 不在 git 仓库中，跳过 git 检查
    }
  }

  // 4. --apply: 更新 phase
  if (apply) {
    state.phase = targetPhase as typeof state.phase;
    await writeState(changeDir, state);
    console.log(`✓ phase: ${currentPhase} → ${targetPhase}`);
  }
}
