// src/cli/commands/internal/state.ts
import { readState, writeState } from "../../utils/state.js";
import type { AlloyState } from "../../../core/types.js";

export async function stateCommand(args: string[]): Promise<void> {
  const action = args[0];
  const changeDir = args[1];
  const field = args[2];
  const value = args[3];

  if (!action || !changeDir) {
    console.error("用法: alloy _state <read|write|check> <change-dir> [field] [value]");
    process.exit(1);
  }

  switch (action) {
    case "read": {
      if (!field) {
        console.error("用法: alloy _state read <change-dir> <field>");
        process.exit(1);
      }
      const state = await readState(changeDir);
      const val = (state as unknown as Record<string, unknown>)[field];
      if (val === undefined || val === null) {
        console.log("null");
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
      const state = await readState(changeDir);
      // 将字符串 "null" 转换为真正的 null（shell 传入的 null 是字符串）
      const resolved = value === "null" ? null : value;
      (state as unknown as Record<string, unknown>)[field] = resolved;
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
      console.error(`未知操作: ${action} (支持: read, write, check)`);
      process.exit(1);
  }
}
