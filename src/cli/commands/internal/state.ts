// src/cli/commands/internal/state.ts
import { readState, writeState, createInitialState } from "../../utils/state.js";
import type { AlloyState } from "../../../core/types.js";

// shell 传入的所有值都是字符串，需根据字段类型转换
const NUMERIC_FIELDS = new Set(["schema_version"]);

// 受管字段：必须通过专用命令写入，禁止 _state write 直接操作
// records → alloy _artifact commit；skill_usage → alloy _skill log/skip；phase_timings → alloy _phase start/complete|reset
const MANAGED_FIELDS_WRITE: Record<string, string> = {
  records: "alloy _artifact commit <change-dir> <artifact>",
  skill_usage: "alloy _skill <log|skip> <change-dir> <stage> <skill>",
  phase_timings: "alloy _phase <start|complete|reset> <change-dir> <phase>",
};

// merge 拦截的受管字段——phase_timings 放开 merge
// 原因：merge 增量追加生命周期字段（discarded_at/deferred_at 等），不覆盖 started_at/completed_at
// write 拦截 phase_timings 是因为覆盖式写入会清掉已有 started_at/completed_at（破坏阶段时间链）
const MANAGED_FIELDS_MERGE: Record<string, string> = {
  records: "alloy _artifact commit <change-dir> <artifact>",
  skill_usage: "alloy _skill <log|skip> <change-dir> <stage> <skill>",
};

function rejectManagedField(field: string, action: "write" | "merge"): boolean {
  const table = action === "write" ? MANAGED_FIELDS_WRITE : MANAGED_FIELDS_MERGE;
  if (field in table) {
    console.error(`[FAIL] 字段 '${field}' 受管，禁止 _state ${action} 直接操作`);
    console.error(`  请使用专用命令: ${table[field]}`);
    console.error("  违反 'Agent 不直接写 YAML' 规则——受管字段需经原子命令保证 hash-lock / commit 一致性");
    process.exit(1);
    return true;
  }
  return false;
}

function coerceValue(field: string, value: string | undefined): unknown {
  if (value === undefined) return undefined;
  if (value === "null") return null;
  if (NUMERIC_FIELDS.has(field)) {
    const n = Number(value);
    if (isNaN(n)) {
      console.error(`字段 '${field}' 需要 number 类型，收到: ${value}`);
      process.exit(1);
    }
    return n;
  }
  // 尝试解析 JSON 值（用于 phase_timings 等复杂字段）
  if ((value.startsWith("{") && value.endsWith("}")) ||
      (value.startsWith("[") && value.endsWith("]"))) {
    try {
      return JSON.parse(value);
    } catch {
      // 不是有效 JSON，保持原字符串
    }
  }
  return value;
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (target === null || target === undefined) return source;
  if (source === null) return source;
  if (typeof target !== "object" || typeof source !== "object") return source;
  if (Array.isArray(target) || Array.isArray(source)) return source;

  const result: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  const src = source as Record<string, unknown>;

  for (const key of Object.keys(src)) {
    if (!(key in result)) {
      // 新 key：直接添加
      result[key] = src[key];
    } else if (result[key] === null) {
      // target 值为 null（sentinel，timestamp ensure 写入）→ 允许覆盖
      result[key] = src[key];
    } else if (
      typeof src[key] === "object" &&
      src[key] !== null &&
      !Array.isArray(src[key]) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      // 双方都是对象：递归合并（已有嵌套 key 不被覆盖）
      result[key] = deepMerge(result[key], src[key]);
    }
    // else: key 在两边都存在且至少一方是 leaf → 跳过（幂等）
  }
  return result;
}

export async function stateCommand(args: string[]): Promise<void> {
  const action = args[0];
  const changeDir = args[1];
  const field = args[2];
  const value = args[3];

  if (!action || !changeDir) {
    console.error("用法: alloy _state <init|read|write|merge|check> <change-dir> [field] [value]");
    process.exit(1);
  }

  switch (action) {
    case "init": {
      // 解析 --at（全周期开始时间，补录场景：start 阶段 EXPLORE_START 早于 change 目录创建）
      let at: string | undefined;
      let featureBranch: string | undefined;
      for (let i = 2; i < args.length; i++) {
        if (args[i] === "--at" && i + 1 < args.length) {
          at = args[i + 1];
        } else if (args[i] === "--feature-branch" && i + 1 < args.length) {
          featureBranch = args[i + 1];
        }
      }
      // 非破坏性初始化：如果文件已存在（如 _skill log 已提前创建），保留已有数据
      try {
        await readState(changeDir);
        console.log(`state 已存在: ${changeDir} (跳过初始化)`);
      } catch {
        const initialState = createInitialState(at, featureBranch);
        await writeState(changeDir, initialState);
        console.log(`✓ state 已初始化: ${changeDir}${at ? ` (started_at=${at})` : ""}${featureBranch ? ` (feature_branch=${featureBranch})` : ""}`);
      }
      break;
    }
    case "read": {
      if (!field) {
        console.error("用法: alloy _state read <change-dir> <field>");
        process.exit(1);
      }
      const state = await readState(changeDir);
      const val = (state as unknown as Record<string, unknown>)[field];
      if (val === undefined || val === null) {
        console.log("null");
      } else if (Array.isArray(val) || typeof val === "object") {
        console.log(JSON.stringify(val));
      } else {
        console.log(String(val));
      }
      break;
    }
    case "write": {
      if (!field || value === undefined) {
        console.error("用法: alloy _state write <change-dir> <field> <value>");
        process.exit(1);
      }
      if (rejectManagedField(field, "write")) return;
      // 如果文件不存在，用 createInitialState() 创建初始状态（确保 records: [] 等所有字段存在）
      let state: AlloyState;
      try {
        state = await readState(changeDir);
      } catch {
        state = createInitialState();
      }
      (state as unknown as Record<string, unknown>)[field] = coerceValue(field, value);
      await writeState(changeDir, state);
      break;
    }
    case "merge": {
      if (!field || value === undefined) {
        console.error("用法: alloy _state merge <change-dir> <field> <partial-json>");
        process.exit(1);
      }
      if (rejectManagedField(field, "merge")) return;
      let state: AlloyState;
      try {
        state = await readState(changeDir);
      } catch {
        state = createInitialState();
      }
      const currentValue = (state as unknown as Record<string, unknown>)[field];
      const parsedValue = coerceValue(field, value);
      (state as unknown as Record<string, unknown>)[field] = deepMerge(currentValue, parsedValue);
      await writeState(changeDir, state);
      console.log(`✓ ${field} 已 merge: ${changeDir}`);
      break;
    }
    case "timestamp": {
      // alloy _state timestamp ensure <change-dir> <phase-name>
      // args: [0]="timestamp", [1]="ensure"→changeDir, [2]=changeDir→field, [3]=phaseName→value
      const subAction = changeDir;
      const targetDir = field;
      const phaseName = value;

      if (subAction !== "ensure" || !targetDir || !phaseName) {
        console.error("用法: alloy _state timestamp ensure <change-dir> <phase-name>");
        process.exit(1);
      }

      const validPhases = ["start", "plan", "apply", "archive", "finish"];
      if (!validPhases.includes(phaseName)) {
        console.error(`无效的 phase 名称: ${phaseName} (支持: ${validPhases.join(", ")})`);
        process.exit(1);
      }

      let state: AlloyState;
      try {
        state = await readState(targetDir);
      } catch {
        state = createInitialState();
      }

      const timings = state.phase_timings ?? {};
      const phaseTiming = timings[phaseName as keyof typeof timings];

      if (phaseTiming?.started_at) {
        // 已存在：幂等输出已有值，不覆盖
        console.log(phaseTiming.started_at);
      } else {
        // 不存在：写入当前时间并输出
        const d = new Date();
        const pad = (n: number) => n.toString().padStart(2, "0");
        const now = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

        state.phase_timings = {
          ...(state.phase_timings ?? {}),
          [phaseName]: {
            started_at: now,
            completed_at: phaseTiming?.completed_at ?? null,
          },
        };

        await writeState(targetDir, state);
        console.log(now);
      }
      break;
    }
    case "check": {
      if (!field) {
        console.error("用法: alloy _state check <change-dir> <phase>");
        process.exit(1);
      }
      const state = await readState(changeDir);
      if (state.phase !== field) {
        console.log(`phase 不匹配: 当前=${state.phase}, 期望=${field}`);
        process.exit(1);
      }
      break;
    }
    default:
      console.error(`未知操作: ${action} (支持: init, read, write, merge, timestamp, check)`);
      process.exit(1);
  }
}
