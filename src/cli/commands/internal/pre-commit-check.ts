// src/cli/commands/internal/pre-commit-check.ts
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { collectPhases, collectPendingGates, isAlloyProject } from "./hook-guard.js";
import { guardCheck } from "../../../core/hook-guard.js";

/**
 * 检测当前是否处于 merge 进行中状态(.git/MERGE_HEAD 存在)。
 * merge commit 的文件已在 worktree 分支审查过(worktree-cleanup 的 git merge 带过来),
 * pre-commit 不应拦截--否则 archive 阶段 worktree-cleanup 会因 pre-commit 拦截
 * worktree 分支的 apply 产物(scripts/ 等)而失败。
 */
function isMergeInProgress(projectRoot: string): boolean {
  const gitDir = execSync("git rev-parse --git-dir", {
    cwd: projectRoot,
    encoding: "utf-8",
    stdio: "pipe",
  }).trim();
  return existsSync(join(projectRoot, gitDir, "MERGE_HEAD"));
}

/**
 * 纯逻辑判定:给定暂存文件 + phases + pendingGates + env,返回 exitCode + message。
 * 复用 guardCheck(hook-guard 的判定逻辑),确保 pre-commit 与 PreToolUse hook 行为一致。
 */
export function evaluatePreCommit(
  stagedFiles: string[],
  phases: string[],
  pendingGates: string[],
  env: Record<string, string>,
  isAlloyProject?: boolean,
  mergeInProgress?: boolean
): { exitCode: number; message?: string } {
  // 逃生阀(复用 hook-guard 的 ALLOY_FORCE_WRITE)
  if (env.ALLOY_FORCE_WRITE === "1") {
    return { exitCode: 0 };
  }

  // merge 进行中:放行。merge commit 的文件已在 worktree 分支审查过,
  // archive 阶段 worktree-cleanup 的 git merge 会带过 apply 产物(scripts/ 等),
  // pre-commit 不应拦截这些文件(它们不是 archive 阶段新写的)。
  if (mergeInProgress) {
    return { exitCode: 0 };
  }

  // 真非 alloy 项目(显式 false):放行。undefined 视为 alloy(安全优先)
  if (isAlloyProject === false) {
    return { exitCode: 0 };
  }

  const blocked: string[] = [];
  for (const file of stagedFiles) {
    const result = guardCheck({ filePath: file, phases, pendingGates, isAlloyProject: true });
    if (!result.allowed) {
      blocked.push(`${file}: ${result.reason}`);
    }
  }

  if (blocked.length === 0) {
    return { exitCode: 0 };
  }

  const message = [
    "⛔ [alloy pre-commit] 以下暂存文件被闸门拦截:",
    ...blocked.map((b) => `  ${b}`),
    "",
    "  请先进入 apply 阶段(alloy _phase start <change-dir> apply),",
    "  或用 ALLOY_FORCE_WRITE=1 绕过(仅限修复畸形状态)。",
  ].join("\n");

  return { exitCode: 1, message };
}

/** 读暂存文件列表(git diff --cached --name-only) */
function readStagedFiles(): string[] {
  try {
    const output = execSync("git diff --cached --name-only", {
      encoding: "utf-8",
      stdio: "pipe",
    });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * alloy _pre-commit-check
 *
 * git pre-commit hook 适配器:读暂存文件 + 调 guardCheck 判定,exit 0(放行)/ 1(拦截)。
 * 兜底 PreToolUse hook 的盲区(agent 用 Bash 写文件绕过 Write/Edit hook)。
 *
 * .git/hooks/pre-commit 配置:
 *   #!/bin/sh
 *   node <alloy-dist>/cli/index.js _pre-commit-check
 */
export async function preCommitCheckCommand(args: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const phases = collectPhases(projectRoot);
  const pendingGates = collectPendingGates(projectRoot);
  const isAlloy = isAlloyProject(projectRoot);
  const mergeInProgress = isMergeInProgress(projectRoot);
  const stagedFiles = readStagedFiles();
  const result = evaluatePreCommit(stagedFiles, phases, pendingGates, process.env as Record<string, string>, isAlloy, mergeInProgress);

  if (result.message) {
    console.error(result.message);
  }
  process.exit(result.exitCode);
}
