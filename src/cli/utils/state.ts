import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { AlloyState } from "../../core/types.js";

export type { AlloyState };

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  // UTC ISO 8601 格式（与设计文档约定一致）
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
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
  const content = await readFile(yamlPath, "utf-8");
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
