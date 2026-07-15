import { execSync } from "node:child_process";
import type { EnvInfo } from "./types.js";

export function detectEnv(): EnvInfo {
  const nodeVersion = process.version.slice(1);

  let gitInstalled = false;
  let gitVersion = "";
  try {
    const output = execSync("git --version", { stdio: "pipe", encoding: "utf-8" });
    gitInstalled = true;
    const match = output.match(/git version (\d+\.\d+\.\d+)/);
    gitVersion = match ? match[1] : "";
  } catch {
    // git 未安装
  }

  return { nodeVersion, gitVersion, gitInstalled };
}
