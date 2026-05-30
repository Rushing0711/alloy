import { execSync } from "node:child_process";
import { checkSuperpowers } from "./health.js";
import { loadCompat } from "./compat.js";
import { getPackageRoot } from "../utils/fs.js";

export async function installSuperpowers(
  scope: "global" | "project"
): Promise<"installed" | "skipped" | "failed"> {
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);
  const dep = await checkSuperpowers(config.compatible.superpowers);

  if (dep.installed && dep.compatible) {
    const versionInfo = dep.version ? ` v${dep.version}` : "";
    console.log(`     ✓ Superpowers${versionInfo} 已安装，跳过`);
    return "skipped";
  }

  if (dep.installed && !dep.compatible) {
    const versionInfo = dep.version ? ` v${dep.version}` : "";
    console.log(
      `     ⚠ Superpowers${versionInfo} 不满足要求 ${config.compatible.superpowers}，重新安装...`
    );
  }

  const scopeFlag = scope === "global" ? "-g" : "";
  const flags = ["-y", scopeFlag, "--agent claude-code"].filter(Boolean).join(" ");

  try {
    execSync(`npx skills add obra/superpowers ${flags}`, {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    return "failed";
  }
}
