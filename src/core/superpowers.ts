import { execSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { checkSuperpowers } from "./health.js";
import { loadCompat } from "./compat.js";
import { getPackageRoot } from "../utils/fs.js";
import { detectSkill } from "./detect-installations.js";
import { promptConfirm } from "../utils/prompt.js";
import type { AgentInfo } from "./types.js";

export async function installSuperpowers(
  scope: "global" | "project",
  agent?: AgentInfo,
  projectPath?: string
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

  // 检测已有安装（含版本比较）
  if (agent && projectPath) {
    const detected = detectSkill("brainstorming", agent, projectPath);
    if (detected.found) {
      const locationLabel = ({
        "project-skill": "项目级 skill",
        "user-skill": "用户级 skill",
        "user-plugin": "用户级 plugin",
      } as Record<string, string>)[detected.location!] || detected.location;

      const versionInfo = detected.version ? ` v${detected.version}` : "";
      console.log(`     ℹ Superpowers 已安装（${locationLabel}${versionInfo}）`);

      // 版本比较（如果有版本信息）
      if (detected.version) {
        const semver = (await import("semver")).default;
        const required = config.compatible.superpowers;
        const satisfies = semver.satisfies(detected.version, required);
        if (!satisfies) {
          console.log(`     ⚠ 版本 v${detected.version} 不满足要求 ${required}，需要升级`);
          // 不提示，直接继续安装
        } else {
          const overwrite = await promptConfirm("     是否覆盖安装？", false);
          if (!overwrite) {
            console.log("     ✓ 跳过 Superpowers 安装");
            return "skipped";
          }
        }
      } else {
        // 无版本信息，只做存在性提示
        const overwrite = await promptConfirm("     是否覆盖安装？", false);
        if (!overwrite) {
          console.log("     ✓ 跳过 Superpowers 安装");
          return "skipped";
        }
      }
    }
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
