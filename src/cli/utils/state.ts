import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { AlloyState, ProjectConfig } from "../../core/types.js";

export type { AlloyState, ProjectConfig };

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  // 本地时间，人类可读格式：YYYY-MM-DD HH:MM:SS
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function createInitialState(): AlloyState {
  const now = formatTimestamp();
  return {
    phase: "started",
    worktree: null,
    schema_version: 1,
    created_at: now,
    updated_at: now,
    records: [],
  };
}

export async function readState(changePath: string): Promise<AlloyState> {
  const yamlPath = join(changePath, ".alloy.yaml");
  let content: string;
  try {
    content = await readFile(yamlPath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`缺少 .alloy.yaml: ${changePath}`);
    }
    throw err;
  }
  return parseYaml(content) as AlloyState;
}

export async function writeState(
  changePath: string,
  state: AlloyState
): Promise<void> {
  const yamlPath = join(changePath, ".alloy.yaml");
  state.updated_at = formatTimestamp();
  const content = stringifyYaml(state);
  await writeFile(yamlPath, content, "utf-8");
}

export async function findActiveChanges(
  changesDir: string
): Promise<Map<string, AlloyState>> {
  const changes = new Map<string, AlloyState>();
  try {
    const entries = await readdir(changesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const state = await readState(join(changesDir, entry.name));
        if (state.phase !== "finished") {
          changes.set(entry.name, state);
        }
      } catch {
        // 目录存在但无 .alloy.yaml，跳过
      }
    }
  } catch {
    // changes 目录可能不存在
  }
  return changes;
}

// --- 项目级配置（openspec/config.yaml）---

function createDefaultProjectConfig(): ProjectConfig {
  return { schema: "alloy", alloy: {} };
}

export async function readProjectConfig(projectRoot: string): Promise<ProjectConfig> {
  const configPath = join(projectRoot, "openspec", "config.yaml");
  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = parseYaml(content) as ProjectConfig;
    if (!parsed.alloy) parsed.alloy = {};
    return parsed;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return createDefaultProjectConfig();
    }
    throw err;
  }
}

export async function writeProjectConfig(
  projectRoot: string,
  config: ProjectConfig
): Promise<void> {
  const configPath = join(projectRoot, "openspec", "config.yaml");
  await mkdir(dirname(configPath), { recursive: true });
  const content = stringifyYaml(config);
  await writeFile(configPath, content, "utf-8");
}
