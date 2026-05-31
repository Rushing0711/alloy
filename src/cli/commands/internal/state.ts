// src/cli/commands/internal/state.ts
import { readState, writeState, createInitialState } from "../../utils/state.js";
import type { AlloyState } from "../../../core/types.js";

// shell 传入的所有值都是字符串，需根据字段类型转换
const NUMERIC_FIELDS = new Set(["schema_version"]);

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

export async function stateCommand(args: string[]): Promise<void> {
  const action = args[0];
  const changeDir = args[1];
  const field = args[2];
  const value = args[3];

  if (!action || !changeDir) {
    console.error("用法: alloy _state <init|read|write|check> <change-dir> [field] [value]");
    process.exit(1);
  }

  switch (action) {
    case "init": {
      // 用 createInitialState() 创建完整 state——确保 records: [] 等所有字段存在
      const initialState = createInitialState();
      await writeState(changeDir, initialState);
      console.log(`✓ state 已初始化: ${changeDir}`);
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
      console.error(`未知操作: ${action} (支持: init, read, write, check)`);
      process.exit(1);
  }
}
