import { execSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import semver from "semver";
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
  // 检测已有安装(按版本分支询问)
  if (agent && projectPath) {
    const detected = detectSkill("brainstorming", agent, projectPath);
    if (detected.found) {
      const locationLabel = ({
        "project-skill": "项目级 skill",
        "user-skill": "用户级 skill",
        "user-plugin": "用户级 plugin",
      } as Record<string, string>)[detected.location!] || detected.location;

      if (detected.version) {
        // 插件安装,有版本号
        const major = semver.major(detected.version);
        if (major < 6) {
          // v5 及更早 → 问是否更新到 v6
          const update = await promptConfirm(
            `检测到 Superpowers v${detected.version},是否更新到 v6?`,
            false
          );
          if (!update) {
            return { status: "skipped", version: detected.version, location: locationLabel };
          }
          // update=true → 继续执行后面的安装逻辑
        } else {
          // v6+ → 现有逻辑(提示是否覆盖)
          const overwrite = await promptConfirm(`检测到 Superpowers v${detected.version},是否覆盖安装?`, false);
          if (!overwrite) {
            return { status: "skipped", version: detected.version, location: locationLabel };
          }
        }
      } else {
        // 手动安装,version=null(user-skill / project-skill)
        // cpSync 覆盖式拷贝,会覆盖现有 skill 文件——提示需明确
        const reinstall = await promptConfirm(
          `检测到 Superpowers 已安装(${locationLabel}),重新安装将覆盖现有 skill 文件,是否继续?`,
          false
        );
        if (!reinstall) {
          return { status: "skipped", location: locationLabel };
        }
        // reinstall=true → 继续执行后面的安装逻辑
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
