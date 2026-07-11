import { execSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import semver from "semver";
import { getPackageRoot } from "../utils/fs.js";
import { detectSkill } from "./detect-installations.js";
import { getSkillTargetDir } from "./agents.js";
import { promptConfirm } from "../utils/prompt.js";
import type { AgentInfo } from "./types.js";

export interface SuperpowersInstallResult {
  status: "installed" | "skipped" | "failed";
  version?: string | null;
  location?: string | null;
  requiresUpgrade?: boolean;
  /** 部分失败:status="installed" 时,记录失败的 agent label(供 init 提醒用户) */
  partialFailures?: string[];
  /** 部分跳过:status="installed" 时,记录跳过的 agent label(用户选 No 保留现有) */
  partialSkipped?: string[];
}

/**
 * 为多个 agent 安装 Superpowers。
 * - 遍历 agents 数组,每个 agent 独立做版本检测 + 升级确认 + 安装/fallback
 * - 聚合各 agent 结果:任一 installed -> installed;任一 failed(无 installed) -> failed;全 skipped -> skipped
 * - force=true 时跳过所有覆盖/升级确认,直接执行安装
 *
 * fallback 策略:npx skills add --agent <id> 失败(或不支持该 agent)时,
 * 复制 vendor/superpowers/skills 到该 agent 的 skills 目录(通过 getSkillTargetDir)。
 */
export async function installSuperpowers(
  scope: "global" | "project",
  agents: AgentInfo[],
  projectPath: string,
  force?: boolean
): Promise<SuperpowersInstallResult> {
  // 空 agents:无目标 agent,直接跳过(不视为失败)
  if (agents.length === 0) {
    return { status: "skipped" };
  }

  const perAgentResults: SuperpowersInstallResult[] = [];
  for (const agent of agents) {
    const result = await installForAgent(scope, agent, projectPath, force);
    perAgentResults.push(result);
  }

  return aggregateResults(perAgentResults, agents);
}

/** 为单个 agent 安装 Superpowers(保留原版本检测 + 升级确认逻辑,按 agent 独立) */
async function installForAgent(
  scope: "global" | "project",
  agent: AgentInfo,
  projectPath: string,
  force?: boolean
): Promise<SuperpowersInstallResult> {
  // 检测已有安装(按版本分支询问)
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
        // v5 及更早 -> 问是否更新到 v6
        if (force) {
          // --force 跳过更新确认,直接执行后面的安装逻辑
        } else {
          const update = await promptConfirm(
            `检测到 Superpowers v${detected.version},是否更新到 v6?`,
            false
          );
          if (!update) {
            return { status: "skipped", version: detected.version, location: locationLabel };
          }
        }
      } else {
        // v6+ -> 现有逻辑(提示是否覆盖)
        if (force) {
          // --force 跳过覆盖确认,直接执行后面的安装逻辑
        } else {
          const overwrite = await promptConfirm(`检测到 Superpowers v${detected.version},是否覆盖安装?`, false);
          if (!overwrite) {
            return { status: "skipped", version: detected.version, location: locationLabel };
          }
        }
      }
    } else {
      // 手动安装,version=null(user-skill / project-skill)
      // cpSync 覆盖式拷贝,会覆盖现有 skill 文件--提示需明确
      if (force) {
        // --force 跳过重装确认,直接执行后面的安装逻辑
      } else {
        const reinstall = await promptConfirm(
          `检测到 Superpowers 已安装(${locationLabel}),重新安装将覆盖现有 skill 文件,是否继续?`,
          false
        );
        if (!reinstall) {
          return { status: "skipped", location: locationLabel };
        }
      }
    }
  } else {
    // 未装,直接安装(给用户可见反馈)
    console.log(`     ℹ ${agent.label}: 未装 Superpowers,开始安装`);
  }

  // 尝试网络安装(只 claude-code 支持 npx skills add;其他 agent 直接 fallback 复制 vendor)
  // 原因:npx skills add 不支持 --agent opencode/pi/codex,装到 .claude/skills/(claude-code 默认),
  // 导致 OpenCode 的 .opencode/skills/ 没装到。非 claude-code 直接用 fallback 复制 vendor。
  if (agent.id === "claude-code") {
    const scopeFlag = scope === "global" ? "-g" : "";
    const flags = ["-y", scopeFlag].filter(Boolean).join(" ");
    try {
      execSync(`npx skills add obra/superpowers ${flags}`, {
        stdio: "pipe",
        cwd: process.cwd(),
      });
      return { status: "installed" };
    } catch {
      return fallbackInstall(scope, agent, projectPath);
    }
  }
  return fallbackInstall(scope, agent, projectPath);
}

/**
 * fallback 安装:复制 vendor/superpowers/skills 到 agent 的 skills 目录。
 * 使用 getSkillTargetDir 推导目标路径,支持多 agent(claude-code/opencode/codex/pi)。
 */
function fallbackInstall(
  scope: "global" | "project",
  agent: AgentInfo,
  projectPath: string
): SuperpowersInstallResult {
  try {
    const packageDir = getPackageRoot();
    const vendorSkills = join(packageDir, "vendor", "superpowers", "skills");

    if (!existsSync(vendorSkills)) {
      return { status: "failed" };
    }

    const targetDir = getSkillTargetDir(agent, scope, projectPath);
    cpSync(vendorSkills, targetDir, { recursive: true });

    return { status: "installed" };
  } catch {
    return { status: "failed" };
  }
}

/**
 * 聚合多 agent 安装结果。
 * 优先级:installed > failed > skipped
 * - 任一 installed + 任一 failed -> installed(带 partialFailures,提醒用户部分 agent 失败)
 * - 任一 installed(无 failed) -> installed(整体成功)
 * - 任一 failed(无 installed) -> failed
 * - 全 skipped -> skipped(取首个 skipped 的 version/location 供 init.ts 展示)
 */
function aggregateResults(
  results: SuperpowersInstallResult[],
  agents: AgentInfo[]
): SuperpowersInstallResult {
  if (results.length === 0) return { status: "skipped" };

  const hasInstalled = results.some((r) => r.status === "installed");
  const hasFailed = results.some((r) => r.status === "failed");
  const hasSkipped = results.some((r) => r.status === "skipped");

  if (hasInstalled && hasFailed) {
    const partialFailures = results
      .map((r, i) => (r.status === "failed" ? agents[i]?.label : null))
      .filter((label): label is string => typeof label === "string");
    return { status: "installed", partialFailures };
  }
  if (hasInstalled && hasSkipped) {
    const partialSkipped = results
      .map((r, i) => (r.status === "skipped" ? agents[i]?.label : null))
      .filter((label): label is string => typeof label === "string");
    return { status: "installed", partialSkipped };
  }
  if (hasInstalled) return { status: "installed" };
  if (hasFailed) return { status: "failed" };

  // 全 skipped:取首个 skipped 的 version/location
  const first = results[0];
  return { status: "skipped", version: first.version, location: first.location };
}
