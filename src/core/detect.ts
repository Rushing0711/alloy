import { execSync } from "node:child_process";
import type { EnvInfo } from "./types.js";

export function detectEnv(): EnvInfo {
  const nodeVersion = process.version.slice(1);

  let gitInstalled = false;
  try {
    execSync("git --version", { stdio: "pipe" });
    gitInstalled = true;
  } catch {
    // git 未安装
  }

  return { nodeVersion, gitInstalled };
}
