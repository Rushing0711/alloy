import { execSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadCompat } from "./compat.js";
import { getPackageRoot } from "../utils/fs.js";
import { detectSkill } from "./detect-installations.js";
import { promptConfirm } from "../utils/prompt.js";
import type { AgentInfo } from "./types.js";

export interface SuperpowersInstallResult {
  status: "installed" | "skipped" | "failed";
  version?: string | null;
  location?: string | null;
  requiresUpgrade?: boolean;
}

export async function installSuperpowers(
  scope: "global" | "project",
  agent?: AgentInfo,
  projectPath?: string
): Promise<SuperpowersInstallResult> {
  const packageDir = getPackageRoot();
  const config = await loadCompat(packageDir);

  // 检测已有安装（含版本比较）
  if (agent && projectPath) {
    const detected = detectSkill("brainstorming", agent, projectPath);
    if (detected.found) {
      const locationLabel = ({
        "project-skill": "项目级 skill",
        "user-skill": "用户级 skill",
        "user-plugin": "用户级 plugin",
      } as Record<string, string>)[detected.location!] || detected.location;

      // 版本比较（如果有版本信息）
      if (detected.version) {
        const semver = (await import("semver")).default;
        const required = config.compatible.superpowers;
        const satisfies = semver.satisfies(detected.version, required);
        if (!satisfies) {
          // 版本不满足要求，需要升级，不提示直接继续安装
          // 继续执行后面的安装逻辑
        } else {
          // 版本满足要求，提示用户是否覆盖安装
          const overwrite = await promptConfirm("     是否覆盖安装？", false);
          if (!overwrite) {
            return { status: "skipped", version: detected.version, location: locationLabel };
          }
        }
      } else {
        // 无版本信息，只做存在性提示
        const overwrite = await promptConfirm("     是否覆盖安装？", false);
        if (!overwrite) {
          return { status: "skipped", location: locationLabel };
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
    return { status: "installed" };
  } catch {
    return fallbackInstall(scope);
  }
}

function fallbackInstall(scope: "global" | "project"): SuperpowersInstallResult {
  try {
    const packageDir = getPackageRoot();
    const vendorSkills = join(packageDir, "vendor", "superpowers", "skills");

    if (!existsSync(vendorSkills)) {
      return { status: "failed" };
    }

    const targetDir = scope === "global"
      ? join(homedir(), ".claude", "skills")
      : join(process.cwd(), ".claude", "skills");

    cpSync(vendorSkills, targetDir, { recursive: true });

    return { status: "installed" };
  } catch (err) {
    return { status: "failed" };
  }
}
