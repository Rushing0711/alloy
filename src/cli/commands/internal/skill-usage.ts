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
  } catch {
    state = createInitialState();
  }
  if (!state.skill_usage) state.skill_usage = [];

  const now = formatTimestamp();

  // 解析可选参数
  let via: string | undefined;
  let reason: string | undefined;
  for (let i = 4; i < args.length; i++) {
    if (args[i] === "--via" && i + 1 < args.length) {
      via = args[++i];
    } else if (args[i] === "--reason" && i + 1 < args.length) {
      reason = args[++i];
    }
  }

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
