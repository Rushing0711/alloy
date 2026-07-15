import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getPackageRoot } from "../utils/fs.js";
import { getSkillTargetDir } from "./agents.js";
import type { AgentInfo } from "./types.js";

export interface SuperpowersInstallResult {
  status: "installed" | "skipped" | "failed";
  version?: string | null;
  location?: string | null;
  requiresUpgrade?: boolean;
  /** 部分失败:fallbackInstallAll 时,记录复制失败的 agent label */
  partialFailures?: string[];
  /** 保留兼容,不再使用(npx 一次装所有,无 skip 逻辑) */
  partialSkipped?: string[];
}

/**
 * 为多个 agent 安装 Superpowers。
 *
 * 策略:
 * 1. 调一次 `npx skills add obra/superpowers -y`--npx 装到 .agents/skills/ 共享目录,
 *    并为 claude-code/pi 创建符号链接,OpenCode 直接读 .agents/skills/。
 *    所有 agent 都能用 npx 最新版。
 * 2. npx 失败时(网络问题),fallback 复制 vendor 到 .agents/skills/ + claude-code/pi 各自目录。
 *
 * 非 npx 失败场景不 fallback(避免覆盖 npx 最新版)。
 *
 * 证据:npx skills add 行为见 docs/reference/agent-instruction-files.md#8-npx-skills-add-行为
 */
export async function installSuperpowers(
  scope: "global" | "project",
  agents: AgentInfo[],
  projectPath: string,
  _force?: boolean
): Promise<SuperpowersInstallResult> {
  if (agents.length === 0) {
    return { status: "skipped" };
  }

  // 尝试 npx skills add(一次,为所有 agent 装)
  try {
    const scopeFlag = scope === "global" ? "-g" : "";
    const flags = ["-y", scopeFlag].filter(Boolean).join(" ");
    execSync(`npx skills add obra/superpowers ${flags}`, {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return { status: "installed" };
  } catch {
    // npx 失败(网络问题),fallback 复制 vendor
    return fallbackInstallAll(scope, agents, projectPath);
  }
}

/**
 * fallback 安装:npx 失败时,复制 vendor 到 .agents/skills/ + claude-code/pi 各自目录。
 *
 * - .agents/skills/(共享,OpenCode 读)
 * - .claude/skills/(claude-code 读,不读 .agents/skills/)
 * - .pi/skills/(pi 读,不读 .agents/skills/)
 *
 * 注意:claude-code/pi 不读 .agents/skills/,需要复制到各自目录。
 * OpenCode 读 .agents/skills/,不需要额外复制。
 */
function fallbackInstallAll(
  scope: "global" | "project",
  agents: AgentInfo[],
  projectPath: string
): SuperpowersInstallResult {
  try {
    const packageDir = getPackageRoot();
    const vendorSkills = join(packageDir, "vendor", "superpowers", "skills");
    if (!existsSync(vendorSkills)) {
      return { status: "failed" };
    }

    // 1. 复制 vendor 到 .agents/skills/(共享,OpenCode 读)
    //    scope=global 时装 ~/.agents/skills/,scope=project 时装 <projectPath>/.agents/skills/
    const agentsBase = scope === "global" ? homedir() : projectPath;
    const agentsDir = join(agentsBase, ".agents", "skills");
    mkdirSync(join(agentsBase, ".agents"), { recursive: true });
    cpSync(vendorSkills, agentsDir, { recursive: true });

    // 2. 为 claude-code 和 pi 复制到各自目录(它们不读 .agents/skills/)
    const partialFailures: string[] = [];
    for (const agent of agents) {
      if (agent.id === "claude-code" || agent.id === "pi") {
        try {
          const targetDir = getSkillTargetDir(agent, scope, projectPath);
          cpSync(vendorSkills, targetDir, { recursive: true });
        } catch {
          partialFailures.push(agent.label);
        }
      }
    }

    if (partialFailures.length > 0) {
      return { status: "installed", partialFailures };
    }
    return { status: "installed" };
  } catch {
    return { status: "failed" };
  }
}
