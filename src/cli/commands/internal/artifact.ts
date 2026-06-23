// src/cli/commands/internal/artifact.ts
import { existsSync, rmSync, realpathSync } from "node:fs";
import { join, basename, relative } from "node:path";
import { execSync } from "node:child_process";
import { readState, writeState } from "../../utils/state.js";
import { ARTIFACT_FILES, computeArtifactHash } from "../../../core/artifacts.js";
import type { ArtifactRecord } from "../../../core/types.js";

/**
 * alloy _artifact <action> <change-dir> [artifact]
 *
 * 动作:
 *   reset <change-dir> <artifact>           — 清除指定制品的 hash 记录 + 删除文件
 *   commit <change-dir> <artifact>          — hash-lock + records 写入 + git add 限路径 + commit
 */
export async function artifactCommand(args: string[]): Promise<void> {
  const action = args[0];

  if (!action) {
    console.error("用法: alloy _artifact <reset|commit> <change-dir> <artifact>");
    return process.exit(1);
  }

  if (action === "reset") {
    return artifactReset(args.slice(1));
  }

  if (action === "commit") {
    return artifactCommit(args.slice(1));
  }

  console.error(`未知操作: ${action} (支持: reset, commit)`);
  return process.exit(1);
}

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getApprover(cwd: string): string {
  try {
    return execSync("git config user.name", { cwd, encoding: "utf-8" }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** 找到 changeDir 所在的 git 仓库根目录，返回 {root, relPath}；非 git 仓库返回 null */
function findGitRoot(changeDir: string): { root: string; relPath: string } | null {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd: changeDir,
      encoding: "utf-8",
    }).trim();
    // macOS 下 /var 是 /private/var 的符号链接，git 返回 realpath，
    // changeDir 可能是符号路径，需要 realpath 后再算相对路径
    const realChangeDir = realpathSync(changeDir);
    let rel = relative(root, realChangeDir);
    if (rel === "") rel = ".";
    return { root, relPath: rel };
  } catch {
    return null;
  }
}

/** alloy _artifact commit <change-dir> <artifact> — 原子化制品 hash-lock + commit */
async function artifactCommit(args: string[]): Promise<void> {
  const changeDir = args[0];
  const artifactId = args[1];

  if (!changeDir || !artifactId) {
    console.error("用法: alloy _artifact commit <change-dir> <artifact>");
    return process.exit(1);
  }

  if (!ARTIFACT_FILES[artifactId]) {
    console.error(`未知制品: ${artifactId} (支持: ${Object.keys(ARTIFACT_FILES).join(", ")})`);
    return process.exit(1);
  }

  const hash = await computeArtifactHash(changeDir, artifactId);
  if (hash === null) {
    console.error(`[FAIL] 无法计算 ${artifactId} 的 hash（文件不存在）`);
    return process.exit(1);
  }

  // 重复锁定检测（N3）：制品已锁定且 hash 未变 → 拒绝重复提交，避免回溯再提交污染历史
  // hash 变了（制品内容真改了，如回溯后重新生成）允许重新锁定
  let existingState;
  try {
    existingState = await readState(changeDir);
  } catch {
    existingState = null;
  }
  const existingRecord = existingState?.records?.find((r) => r.artifact === artifactId);
  if (existingRecord && existingRecord.hash === hash) {
    console.log(`✓ ${artifactId}: hash=${hash} (已锁定且未变更，跳过重复 commit)`);
    return;
  }

  // git add 限路径 + commit（用 git 仓库根目录作为 cwd）
  const changeName = basename(changeDir);
  const gitRoot = findGitRoot(changeDir);
  if (!gitRoot) {
    console.error(`[FAIL] 不在 git 仓库中: ${changeDir}`);
    return process.exit(1);
  }

  const approvedAt = formatTimestamp();
  const approver = getApprover(gitRoot.root);

  // 写入 records（复用 record.ts 的逻辑，内联以保持原子性）
  const state = await readState(changeDir);
  if (!state.records) state.records = [];
  const existing = state.records.findIndex((r) => r.artifact === artifactId);
  const record: ArtifactRecord = { artifact: artifactId, hash, committed_at: approvedAt, approver };
  if (existing >= 0) {
    state.records[existing] = record;
  } else {
    state.records.push(record);
  }
  await writeState(changeDir, state); // writeState 自动刷新 updated_at

  const addPath = gitRoot.relPath === "." ? "." : `${gitRoot.relPath}/`;
  try {
    execSync(`git add "${addPath}"`, { cwd: gitRoot.root, stdio: "pipe" });
  } catch (e) {
    const err = e as { stderr?: Buffer; message: string };
    const stderr = err.stderr?.toString() ?? "";
    console.error(`[FAIL] git add 失败: ${err.message}${stderr ? `\n${stderr}` : ""}`);
    return process.exit(1);
  }

  // git diff --cached --quiet 退出码 0 = 无变更，1 = 有变更
  let hasStagedChanges = false;
  try {
    execSync("git diff --cached --quiet", { cwd: gitRoot.root, stdio: "pipe" });
  } catch {
    hasStagedChanges = true;
  }

  if (!hasStagedChanges) {
    console.log(`✓ ${artifactId}: hash=${hash} (无文件变更，跳过 commit)`);
    return;
  }

  try {
    execSync(`git commit -m "docs(${changeName}): ${artifactId} 已锁定"`, {
      cwd: gitRoot.root,
      stdio: "pipe",
    });
    console.log(`✓ ${artifactId}: hash=${hash} 已 commit`);
  } catch (e) {
    console.error(`[FAIL] git commit 失败: ${(e as Error).message}`);
    return process.exit(1);
  }
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
