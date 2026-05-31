import { execSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

  // 尝试网络安装
  const scopeFlag = scope === "global" ? "-g" : "";
  const flags = ["-y", scopeFlag, "--agent claude-code"].filter(Boolean).join(" ");

  try {
    execSync(`npx skills add obra/superpowers ${flags}`, {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    console.log("     ⚠ 网络安装失败，从本地 vendor 副本部署...");
    return fallbackInstall(scope);
  }
}

function fallbackInstall(scope: "global" | "project"): "installed" | "failed" {
  try {
    const packageDir = getPackageRoot();
    const vendorSkills = join(packageDir, "vendor", "superpowers", "skills");

    if (!existsSync(vendorSkills)) {
      console.log("     ✗ vendor/superpowers/skills/ 不存在，兜底安装失败");
      return "failed";
    }

    const targetDir = scope === "global"
      ? join(homedir(), ".claude", "skills")
      : join(process.cwd(), ".claude", "skills");

    console.log(`     → 从 vendor 复制到 ${targetDir}`);

    cpSync(vendorSkills, targetDir, { recursive: true });

    console.log("     ✓ Superpowers 从本地副本部署完成");
    return "installed";
  } catch (err) {
    console.log(`     ✗ 兜底安装失败: ${err instanceof Error ? err.message : err}`);
    return "failed";
  }
}
