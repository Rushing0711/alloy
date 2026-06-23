// src/core/git.ts
import { execSync } from "node:child_process";

export type GitRepoResult = "exists" | "initialized" | "failed";

/**
 * 确保项目是 git 仓库。若不是，执行 git init。
 *
 * @param initialBranch 可选，传入时用 `git init -b <branch>` 指定初始分支名（git ≥ 2.28）。
 *                      适用于全新项目——让 main 分支名与用户确认的主分支对齐，
 *                      避免 git init 默认 main 与用户指定 master 偏差。
 *                      若 git 版本 < 2.28 不支持 -b，fallback 到无参数 git init
 *                      （调用方需自行用 symbolic-ref 调整）。
 */
export function ensureGitRepo(projectPath: string, initialBranch?: string): GitRepoResult {
  try {
    execSync("git rev-parse --git-dir", {
      cwd: projectPath,
      stdio: "pipe",
    });
    return "exists";
  } catch {
    // 不在 git 仓库，继续 init
  }

  try {
    if (initialBranch) {
      // 尝试 git init -b，失败则 fallback 到普通 git init
      try {
        execSync(`git init -b ${initialBranch}`, {
          cwd: projectPath,
          stdio: "pipe",
        });
        return "initialized";
      } catch {
        // git < 2.28 不支持 -b，fallback
      }
    }
    execSync("git init", {
      cwd: projectPath,
      stdio: "pipe",
    });
    return "initialized";
  } catch {
    return "failed";
  }
}

/**
 * 检测 HEAD 是否处于 unborn 状态（仓库无任何 commit）。
 *
 * unborn 时 `git rev-parse --verify HEAD` 失败（exit 1）。
 * 此时 HEAD 指向的分支（如 refs/heads/main）引用文件不存在，
 * `git checkout -b feature/...` 会创建 feature 分支并切走，
 * 原分支永久缺失——这是 main 分支丢失的根因。
 */
export function isHeadUnborn(projectPath: string): boolean {
  try {
    execSync("git rev-parse --verify HEAD", {
      cwd: projectPath,
      stdio: "pipe",
    });
    return false;
  } catch {
    return true;
  }
}

/**
 * 检测项目主分支名（3 级优先级，与 start.md main-branch-detection.md 对齐）。
 *
 * 1. remote HEAD（origin/HEAD 指向的分支）
 * 2. init.defaultBranch 配置
 * 3. 本地 main / master 分支名匹配
 *
 * 返回 null 表示无法检测，需用户手动输入。
 */
export function detectMainBranch(projectPath: string): string | null {
  // 1. remote HEAD
  try {
    const out = execSync("git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    if (out) {
      return out.replace(/^refs\/remotes\/origin\//, "");
    }
  } catch {
    // 无 remote 或无 HEAD，继续
  }

  // 2. init.defaultBranch
  try {
    const out = execSync("git config --get init.defaultBranch", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    if (out) return out;
  } catch {
    // 未配置，继续
  }

  // 3. 本地 main / master 分支名匹配
  try {
    const out = execSync("git branch --list main --list master", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    if (out) {
      // 去掉前导 * 和空格
      const branch = out.replace(/^\*\s*/, "").trim().split("\n")[0].trim();
      if (branch) return branch;
    }
  } catch {
    // 无分支，继续
  }

  return null;
}

/**
 * 读取当前分支名（unborn 时返回 HEAD 指向的 symbolic ref 名）。
 */
export function currentBranch(projectPath: string): string | null {
  try {
    const out = execSync("git branch --show-current", {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}
