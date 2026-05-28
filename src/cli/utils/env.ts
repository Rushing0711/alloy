import { execSync } from "node:child_process";

export interface EnvInfo {
  nodeVersion: string;
  gitInstalled: boolean;
  claudeCodeInstalled: boolean;
}

export function detectEnv(): EnvInfo {
  const nodeVersion = process.version.slice(1); // 去掉 'v' 前缀

  let gitInstalled = false;
  try {
    execSync("git --version", { stdio: "pipe" });
    gitInstalled = true;
  } catch {
    // git 未安装
  }

  let claudeCodeInstalled = false;
  try {
    execSync("claude --version", { stdio: "pipe" });
    claudeCodeInstalled = true;
  } catch {
    // Claude Code 未安装
  }

  return { nodeVersion, gitInstalled, claudeCodeInstalled };
}
