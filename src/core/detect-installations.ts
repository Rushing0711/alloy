import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import semver from "semver";
import type { AgentInfo } from "./types.js";
import { getSkillTargetDir } from "./agents.js";

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
 * 用 getSkillTargetDir 推导路径。
 * 优先级：项目级 skill -> 用户级 skill
 */
export function detectAlloySkill(agent: AgentInfo, projectPath: string): InstallationInfo {
  // 项目级 skill
  const projectSkill = join(getSkillTargetDir(agent, "project", projectPath), "alloy-start", "SKILL.md");
  if (existsSync(projectSkill)) {
    return { found: true, location: "project-skill", path: projectSkill, version: null };
  }

  // 用户级 skill
  const userSkill = join(getSkillTargetDir(agent, "global", projectPath), "alloy-start", "SKILL.md");
  if (existsSync(userSkill)) {
    return { found: true, location: "user-skill", path: userSkill, version: null };
  }

  return NOT_FOUND;
}

/**
 * 检测某 agent 的技能是否存在。
 * 优先级：项目级 skill -> 用户级 skill -> 用户级 plugin
 * 按 agent 的实际 skills 路径检测(证据见 docs/reference/agent-instruction-files.md):
 * - claude-code: .claude/skills/ -> ~/.claude/skills/ -> ~/.claude/plugins/cache/ * - opencode: .opencode/skills/ + .claude/skills/ + .agents/skills/ -> ~/.config/opencode/skills/ + ~/.claude/skills/ + ~/.agents/skills/ -> ~/.cache/opencode/node_modules/superpowers/skills/
 * - pi: .pi/skills/ + .agents/skills/ -> ~/.pi/agent/skills/ + ~/.agents/skills/ -> ~/.pi/agent/git/ + ~/.pi/agent/npm/
 *
 * @param scope 可选,严格按 scope 检测:
 *              - "global":只查用户级 + plugin(跳过项目级)
 *              - "project":只查项目级(不 fallback 用户级;scope 选择决定安装位置,检测也应按 scope)
 *              - 不传:查所有位置(health/execute/openspec 等"查所有位置"语义)
 */
export function detectSkill(name: string, agent: AgentInfo, projectPath: string, scope?: "global" | "project"): InstallationInfo {
  const home = homedir();

  // 按 agent 定义 skills 检测路径
  let projectPaths: string[] = [];
  let globalPaths: string[] = [];
  let pluginPaths: { path: string; version: string | null }[] = [];

  switch (agent.id) {
    case "claude-code":
      projectPaths = [join(projectPath, ".claude", "skills", name)];
      globalPaths = [join(home, ".claude", "skills", name)];
      pluginPaths = scanPluginCache(join(home, ".claude", "plugins", "cache"), name);
      break;
    case "opencode":
      // OpenCode 读 .opencode/skills/ + .claude/skills/ + .agents/skills/(官方:skills.mdx)
      projectPaths = [
        join(projectPath, ".opencode", "skills", name),
        join(projectPath, ".claude", "skills", name),
        join(projectPath, ".agents", "skills", name),
      ];
      globalPaths = [
        join(home, ".config", "opencode", "skills", name),
        join(home, ".claude", "skills", name),
        join(home, ".agents", "skills", name),
      ];
      // OpenCode npm plugin: ~/.cache/opencode/node_modules/superpowers/skills/<name>(证据:plugins.mdx)
      pluginPaths = [
        { path: join(home, ".cache", "opencode", "node_modules", "superpowers", "skills", name), version: null },
      ];
      break;
    case "pi":
      // Pi 读 .pi/skills/ + .agents/skills/(官方:skills.md)
      projectPaths = [
        join(projectPath, ".pi", "skills", name),
        join(projectPath, ".agents", "skills", name),
      ];
      globalPaths = [
        join(home, ".pi", "agent", "skills", name),
        join(home, ".agents", "skills", name),
      ];
      // Pi package: git(~/.pi/agent/git/github.com/obra/superpowers/skills/)+ npm(~/.pi/agent/npm/node_modules/superpowers/skills/)
      // 证据:packages/coding-agent/src/core/package-manager.ts:1999-2000,2039
      pluginPaths = [
        { path: join(home, ".pi", "agent", "git", "github.com", "obra", "superpowers", "skills", name), version: null },
        { path: join(home, ".pi", "agent", "npm", "node_modules", "superpowers", "skills", name), version: null },
      ];
      break;
    default: {
      // 未知 agent,fallback 到原逻辑(commandsDir 推导)
      const agentBase = agent.commandsDir.split("/")[0];
      const globalBase = agent.globalBase ?? agentBase;
      projectPaths = [join(projectPath, agentBase, "skills", name)];
      globalPaths = [join(home, globalBase, "skills", name)];
    }
  }

  // scope=global:只查用户级 + plugin(跳过项目级)
  // scope=project:只查项目级(不 fallback 用户级;严格按 scope 检测)
  // 不传 scope:查所有位置(health/execute/openspec 等"查所有位置"语义)
  if (scope !== "global") {
    for (const p of projectPaths) {
      if (existsSync(p)) {
        return { found: true, location: "project-skill", path: p, version: null };
      }
    }
  }

  if (scope !== "project") {
    for (const p of globalPaths) {
      if (existsSync(p)) {
        return { found: true, location: "user-skill", path: p, version: null };
      }
    }

    // 用户级 plugin(有版本号,选最新)
    for (const p of pluginPaths) {
      if (existsSync(p.path)) {
        return { found: true, location: "user-plugin", path: p.path, version: p.version };
      }
    }
  }

  return NOT_FOUND;
}

/**
 * 扫描 plugin cache 目录(claude-code 用),找最新版本的 skill。
 * 路径结构:~/.{agent}/plugins/cache/<marketplace>/superpowers/<version>/skills/<name>
 * 证据:Claude Code 文档
 */
function scanPluginCache(cacheBase: string, name: string): { path: string; version: string }[] {
  const results: { path: string; version: string }[] = [];
  if (!existsSync(cacheBase)) return results;
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
          results.push({ path: skillPath, version: v });
        }
      }
    }
  } catch {
    // 目录不存在或无法读取
  }
  return results;
}
