// src/core/git.ts
import { execSync } from "node:child_process";

export type GitRepoResult = "exists" | "initialized" | "failed";

export function ensureGitRepo(projectPath: string): GitRepoResult {
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
    execSync("git init", {
      cwd: projectPath,
      stdio: "pipe",
    });
    return "initialized";
  } catch {
    return "failed";
  }
}
