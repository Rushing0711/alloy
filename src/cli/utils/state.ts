import { readFile, writeFile, readdir, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { AlloyState, ProjectConfig } from "../../core/types.js";

export type { AlloyState, ProjectConfig };

export function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  // 本地时间，人类可读格式：YYYY-MM-DD HH:MM:SS
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function createInitialState(startedAt?: string, featureBranch?: string): AlloyState {
  const now = formatTimestamp();
  return {
    phase: "starting",
    worktree: null,
    feature_branch: featureBranch ?? null,
    worktree_branch: null,
    worktree_created_at: null,
    worktree_merged_at: null,
    schema_version: 1,
    started_at: startedAt ?? now,
    created_at: now,
    updated_at: now,
    completed_at: null,
    records: [],
    skill_usage: [],
    pending_gate: null,
    gate_history: [],
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
  const state = parseYaml(content) as AlloyState;
  // 旧字段兼容：recorded_at → called_at（rename 后旧 change 仍可读）
  if (state.skill_usage) {
    for (const e of state.skill_usage) {
      if ((e as any).recorded_at && !e.called_at) {
        e.called_at = (e as any).recorded_at;
        delete (e as any).recorded_at;
      }
    }
  }
  return state;
}


/** 原子写文件(tmp + rename):防止并发写撕裂(见 writeState 注释) */
async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmpPath = `${path}.tmp-${process.pid}`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, path);
}

export async function writeState(
  changePath: string,
  state: AlloyState
): Promise<void> {
  const yamlPath = join(changePath, ".alloy.yaml");
  state.updated_at = formatTimestamp();
  const content = stringifyYaml(state);
  await mkdir(dirname(yamlPath), { recursive: true });
  // 原子写:tmp 文件 + rename,避免并发写撕裂状态文件。
  // 实测(2026-08-02 OpenCode 会话):agent 一条消息内并行调 3 个 _skill log,
  // 并发 writeFile 直接覆盖把 .alloy.yaml 撕裂成 `completed_at: null\null`,
  // 后续 _artifact commit 报 YAMLParseError。
  // 原子写消除撕裂;"丢失更新"(最后写者覆盖)由 SKILL.md 的"同一消息禁止并行
  // 调用多个写状态命令"约束(见 cli-reference.md)。
  await writeFileAtomic(yamlPath, content);
}

/**
 * 精准替换 .alloy.yaml 的 pending_gate 字段,不触发 writeState 全量重写。
 *
 * 原因:writeState 用 yaml 库 stringifyYaml 全量重序列化,会破坏 agent 手动加的
 * worktree_created_at 等字段引号格式(yaml 库序列化不加引号,agent edit 加引号),
 * 产生 diff 噪音。pending_gate 是临时状态(USER_GATE 闸门),只改这一行即可,
 * 保留其他字段格式。
 *
 * 不更新 updated_at:pending_gate 是临时状态,updated_at 应反映"状态最后更新时间"
 * (phase/records/skill_usage 等),不应被临时 gate 写入刷新。
 *
 * gate 为 null 时写 `pending_gate: null`;为字符串时写 `pending_gate: <gate>`
 * (yaml 库序列化也不加引号,保持一致)。
 */
export async function setPendingGate(
  changePath: string,
  gate: string | null
): Promise<void> {
  const yamlPath = join(changePath, ".alloy.yaml");
  const content = await readFile(yamlPath, "utf-8");
  const value = gate === null ? "null" : gate;
  // 用 regex.test 判断 pending_gate 行是否存在。
  // 不能用 content.replace 后比较 newContent === content:JS 字符串值相等,
  // 当 value 与当前 pending_gate 值相同(null->null)时,replace 后内容相同,
  // 误判为"行不存在"触发防御性追加,在文件末尾多写一行,产生 YAML 重复键。
  const hasLine = /^pending_gate:.*$/m.test(content);
  let newContent: string;
  if (hasLine) {
    newContent = content.replace(
      /^pending_gate:.*$/m,
      `pending_gate: ${value}`
    );
  } else {
    const withNewline = content.endsWith("\n") ? content : content + "\n";
    newContent = withNewline + `pending_gate: ${value}\n`;
  }
  await writeFileAtomic(yamlPath, newContent);
}

/**
 * 精准追加 gate 到 .alloy.yaml 的 gate_history 字段,不触发 writeState 全量重写。
 *
 * 原因:与 setPendingGate 同理,writeState 全量重序列化会破坏 worktree_created_at 等字段引号格式。
 *
 * 幂等:gate 已存在不重复追加。
 *
 * 写入时机:
 * - _guard user-gate pass(手动通过)
 * - hook-guard clearAllPendingGates(问答工具调用自动 clear)
 * - Pi/Codex 自动通过(PI_CODING_AGENT=true 或 CODEX 会话时 worktree-choice;Pi 另含 sdd-ep-choice)
 *
 * 检查时机:
 * - _guard user-gate require apply:sdd-ep-choice 时检查 apply:worktree-choice 是否在 gate_history
 * - _phase complete <phase> 时检查 <phase>:phase-complete 是否在 gate_history
 */
export async function addClearedGate(
  changePath: string,
  gate: string
): Promise<void> {
  const yamlPath = join(changePath, ".alloy.yaml");
  const content = await readFile(yamlPath, "utf-8");

  // 解析当前 gate_history(用 parseYaml 读,不用 readState 避免旧字段兼容逻辑)
  const state = parseYaml(content) as AlloyState;
  const history = state.gate_history ?? [];
  if (history.includes(gate)) return; // 幂等

  const lines = content.split("\n");
  let gateIdx = -1;
  let lastElemIdx = -1;

  // 找 gate_history 行 + 后续 - elem 行
  for (let i = 0; i < lines.length; i++) {
    if (/^gate_history:/.test(lines[i])) {
      gateIdx = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+-\s+/.test(lines[j])) {
          lastElemIdx = j;
        } else {
          break;
        }
      }
      break;
    }
  }

  const newElem = `  - ${gate}`;
  if (gateIdx === -1) {
    // gate_history 不存在,追加新段
    const withNewline = content.endsWith("\n") ? content : content + "\n";
    await writeFileAtomic(yamlPath, withNewline + "gate_history:\n" + newElem + "\n");
  } else if (lastElemIdx === -1) {
    // gate_history 存在但无元素(可能是 "gate_history: []" 或 "gate_history:")
    // 替换 gate_history 行为 "gate_history:" + 插入新元素
    lines[gateIdx] = "gate_history:";
    lines.splice(gateIdx + 1, 0, newElem);
    await writeFileAtomic(yamlPath, lines.join("\n"));
  } else {
    // 在最后一个元素后追加
    lines.splice(lastElemIdx + 1, 0, newElem);
    await writeFileAtomic(yamlPath, lines.join("\n"));
  }
}

/**
 * 精准从 .alloy.yaml 的 gate_history 字段移除 gate,不触发 writeState 全量重写。
 *
 * 用途:用户在 USER_GATE 选"暂停/取消"后,agent 调 reset 恢复 gate 状态。
 * hook-guard 检测到问答工具调用时,无条件 clear pending_gate + 加入 gate_history,
 * 但用户选"暂停"本意是拒绝通过 gate,语义被吞了。agent 调 reset 把 gate 从
 * gate_history 移除 + 重新设为 pending_gate,恢复"等待用户确认"状态。
 *
 * 幂等:gate 不在 gate_history 时,只设 pending_gate,不报错。
 */
export async function removeClearedGate(
  changePath: string,
  gate: string
): Promise<void> {
  const yamlPath = join(changePath, ".alloy.yaml");
  const content = await readFile(yamlPath, "utf-8");

  const lines = content.split("\n");
  let gateIdx = -1;
  let firstElemIdx = -1;
  let lastElemIdx = -1;
  let targetElemIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^gate_history:/.test(lines[i])) {
      gateIdx = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+-\s+/.test(lines[j])) {
          if (firstElemIdx === -1) firstElemIdx = j;
          lastElemIdx = j;
          const elemMatch = lines[j].match(/^\s+-\s+(.+)$/);
          if (elemMatch && elemMatch[1].trim() === gate) {
            targetElemIdx = j;
          }
        } else {
          break;
        }
      }
      break;
    }
  }

  if (gateIdx !== -1 && targetElemIdx !== -1) {
    lines.splice(targetElemIdx, 1);
    await writeFileAtomic(yamlPath, lines.join("\n"));
  }
  // gate 不在 gate_history(gateIdx=-1 或 targetElemIdx=-1):只设 pending_gate,不动 gate_history
}

export async function findActiveChanges(
  changesDir: string
): Promise<Map<string, AlloyState>> {
  const changes = new Map<string, AlloyState>();
  try {
    const entries = await readdir(changesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // archive/ 子目录：扫描归档 change（archive/<date>-<name>/）
      if (entry.name === "archive") {
        const archiveDir = join(changesDir, entry.name);
        try {
          const archiveEntries = await readdir(archiveDir, { withFileTypes: true });
          for (const archiveEntry of archiveEntries) {
            if (!archiveEntry.isDirectory()) continue;
            try {
              const state = await readState(join(archiveDir, archiveEntry.name));
              if (state.phase !== "finished") {
                changes.set(archiveEntry.name, state);
              }
            } catch {
              // 归档子目录无 .alloy.yaml，跳过
            }
          }
        } catch {
          // archive 目录读取失败，跳过
        }
        continue;
      }
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
