// src/cli/commands/internal/skill-usage.ts
import { readState, writeState, createInitialState } from "../../utils/state.js";
import type { SkillUsageEntry, AlloyState } from "../../../core/types.js";

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function skillUsageCommand(args: string[]): Promise<void> {
  const action = args[0];   // log | skip
  const changeDir = args[1];
  const stage = args[2];
  const skill = args[3];

  if (!action || !changeDir || !stage || !skill) {
    console.error("用法: alloy _skill <log|skip> <change-dir> <stage> <skill> [--via <source>] [--reason <reason>]");
    process.exit(1);
    return;
  }

  if (action !== "log" && action !== "skip") {
    console.error(`未知操作: ${action} (支持: log, skip)`);
    process.exit(1);
    return;
  }

  let state: AlloyState;
  try {
    state = await readState(changeDir);
  } catch (e) {
    // 路径不存在时拒绝创建——避免 archive 后原路径被误重建残留 .alloy.yaml
    console.error(`⛔ [PRECONDITION_FAIL] .alloy.yaml 不存在: ${changeDir}`);
    console.error(`  _skill log 拒绝创建新 state——change 目录可能已归档。`);
    console.error(`  archive 后 change 移到 openspec/changes/archive/YYYY-MM-DD-<name>/，`);
    console.error(`  请用 archive 路径调用，禁用原路径 openspec/changes/<name>。`);
    process.exit(1);
    return;
  }
  if (!state.skill_usage) state.skill_usage = [];

  // 解析可选参数
  let via: string | undefined;
  let reason: string | undefined;
  let at: string | undefined;
  for (let i = 4; i < args.length; i++) {
    if (args[i] === "--via" && i + 1 < args.length) {
      via = args[++i];
    } else if (args[i] === "--reason" && i + 1 < args.length) {
      reason = args[++i];
    } else if (args[i] === "--at" && i + 1 < args.length) {
      at = args[++i];
    }
  }

  // --at 允许传入实际使用时间（Step 1/2 在 change 目录创建前执行，技能 log 只能补录；
  // 不传 --at 时用当前时间——补录时刻，非实际使用时刻）
  const now = at || formatTimestamp();

  // 幂等：同一 skill+stage 组合已存在时更新
  const existing = state.skill_usage.findIndex(
    r => r.skill === skill && r.stage === stage
  );

  const entry: SkillUsageEntry = {
    skill,
    stage,
    used: action === "log",
    recorded_at: now,
  };

  if (action === "log") {
    if (via) entry.via = via;
    // count: 如果已存在则 +1，否则 = 1
    if (existing >= 0) {
      const prev = state.skill_usage[existing];
      entry.count = prev.count ? prev.count + 1 : 1;
    } else {
      entry.count = 1;
    }
  } else {
    // skip
    if (reason) entry.reason = reason;
  }

  if (existing >= 0) {
    state.skill_usage[existing] = entry;
  } else {
    state.skill_usage.push(entry);
  }

  await writeState(changeDir, state);
  console.log(`✓ skill_usage: ${skill} (${stage}) → ${action === "log" ? "used" : "skipped"}`);
}
