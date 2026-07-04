// src/core/agent-config.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentInfo, DeployOptions } from "./types.js";

async function injectSettingsFile(
  projectPath: string,
  agent: AgentInfo
): Promise<void> {
  if (!agent.settingsFile || !agent.settingsContent) return;

  const settingsPath = join(projectPath, agent.settingsFile);
  let settings: Record<string, unknown> = {};
  try {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw);
  } catch {
    // 文件不存在或解析失败
  }

  // 幂等深合并：把 settingsContent 合并到现有 settings
  for (const [key, value] of Object.entries(agent.settingsContent)) {
    const existing = settings[key];
    if (existing && typeof existing === "object" && !Array.isArray(existing) &&
        value && typeof value === "object" && !Array.isArray(value)) {
      settings[key] = { ...(existing as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      settings[key] = value;
    }
  }

  const dir = join(settingsPath, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

export async function injectAgentConfigs(opts: DeployOptions): Promise<void> {
  if (opts.targetAgents.length === 0) return;

  // 注入专有配置（每个 agent 各自的 settingsFile，如 .claude/settings.json 的 worktree.baseRef）
  for (const agent of opts.targetAgents) {
    await injectSettingsFile(opts.projectPath, agent);
  }
}
