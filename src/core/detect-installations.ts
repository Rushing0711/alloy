import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import semver from "semver";
import type { AgentInfo } from "./types.js";

export type InstallLocation = "project-skill" | "user-skill" | "user-plugin";

export interface InstallationInfo {
  found: boolean;
  location: InstallLocation | null;
  path: string | null;
  version: string | null;
}

const NOT_FOUND: InstallationInfo = { found: false, location: null, path: null, version: null };

/**
 * 检测 Alloy skill 是否已部署。
 * 检测路径：<agentBase>/skills/alloy-start/SKILL.md
 * 优先级：项目级 skill -> 用户级 skill
 */
export function detectAlloySkill(agent: AgentInfo, projectPath: string): InstallationInfo {
  const agentBase = agent.commandsDir.split("/")[0];

  // 项目级 skill
  const projectSkill = join(projectPath, agentBase, "skills", "alloy-start", "SKILL.md");
  if (existsSync(projectSkill)) {
    return { found: true, location: "project-skill", path: projectSkill, version: null };
  }

  // 用户级 skill
  const home = homedir();
  const userSkill = join(home, agentBase, "skills", "alloy-start", "SKILL.md");
  if (existsSync(userSkill)) {
    return { found: true, location: "user-skill", path: userSkill, version: null };
  }

  return NOT_FOUND;
}

/**
 * 检测某 agent 的技能是否存在。
 * 优先级：项目级 skill -> 用户级 skill -> 用户级 plugin
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
  // 扫描 ~/.claude/plugins/cache/<marketplace>/superpowers/<version>/skills/<name>
  // 兼容任意 marketplace（obra/superpowers-marketplace、anthropics/claude-plugins-official 等）
  // 多版本并存时用 semver 比较选最新(防御 5.1.0 + 6.1.1 并存导致检测与 Claude Code 注册不一致)
  const cacheBase = join(home, ".claude", "plugins", "cache");
  if (existsSync(cacheBase)) {
    try {
      const marketplaces = readdirSync(cacheBase, { withFileTypes: true });
      for (const mk of marketplaces) {
        if (!mk.isDirectory()) continue;
        const pluginBase = join(cacheBase, mk.name, "superpowers");
        if (!existsSync(pluginBase)) continue;
        const versions = readdirSync(pluginBase, { withFileTypes: true })
          .filter((v) => v.isDirectory())
          .map((v) => v.name)
          .filter((v) => semver.valid(v))
          .sort((a, b) => semver.rcompare(a, b));  // 降序,最新在前
        for (const v of versions) {
          const skillPath = join(pluginBase, v, "skills", name);
          if (existsSync(skillPath)) {
            return { found: true, location: "user-plugin", path: skillPath, version: v };
          }
        }
      }
    } catch {
      // 目录不存在或无法读取
    }
  }

  return NOT_FOUND;
}
