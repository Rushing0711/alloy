import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AgentInfo } from "./types.js";

export type InstallLocation = "project-command" | "project-skill" | "user-command" | "user-skill" | "user-plugin";

export interface InstallationInfo {
  found: boolean;
  location: InstallLocation | null;
  path: string | null;
  version: string | null;
}

const NOT_FOUND: InstallationInfo = { found: false, location: null, path: null, version: null };

/**
 * 检测某 agent 的命令是否存在。
 * 优先级：项目级 command → 用户级 command
 */
export function detectCommand(name: string, agent: AgentInfo, projectPath: string): InstallationInfo {
  const cmdFile = `${name}.md`;

  // 项目级 command
  const projectCmd = join(projectPath, agent.commandsDir, cmdFile);
  if (existsSync(projectCmd)) {
    return { found: true, location: "project-command", path: projectCmd, version: null };
  }

  // 用户级 command
  const home = homedir();
  const userCmd = join(home, agent.commandsDir, cmdFile);
  if (existsSync(userCmd)) {
    return { found: true, location: "user-command", path: userCmd, version: null };
  }

  return NOT_FOUND;
}

/**
 * 检测某 agent 的技能是否存在。
 * 优先级：项目级 skill → 用户级 skill → 用户级 plugin
 * 注意：只有 Claude Code 有 skills/plugins，其他 agent 直接返回 NOT_FOUND。
 */
export function detectSkill(name: string, agent: AgentInfo, projectPath: string): InstallationInfo {
  // skills 只对 Claude Code 有意义（.claude/skills/）
  if (!agent.commandsDir.startsWith(".claude/")) {
    return NOT_FOUND;
  }

  const home = homedir();

  // 项目级 skill
  const projectSkill = join(projectPath, ".claude", "skills", name);
  if (existsSync(projectSkill)) {
    return { found: true, location: "project-skill", path: projectSkill, version: null };
  }

  // 用户级 skill
  const userSkill = join(home, ".claude", "skills", name);
  if (existsSync(userSkill)) {
    return { found: true, location: "user-skill", path: userSkill, version: null };
  }

  // 用户级 plugin（superpowers 插件）
  const pluginBase = join(home, ".claude", "plugins", "cache", "superpowers-marketplace", "superpowers");
  if (existsSync(pluginBase)) {
    const { readdirSync } = require("node:fs");
    try {
      const versions = readdirSync(pluginBase, { withFileTypes: true });
      for (const v of versions) {
        if (!v.isDirectory()) continue;
        const skillPath = join(pluginBase, v.name, "skills", name);
        if (existsSync(skillPath)) {
          return { found: true, location: "user-plugin", path: skillPath, version: v.name };
        }
      }
    } catch {
      // 目录不存在或无法读取
    }
  }

  return NOT_FOUND;
}
