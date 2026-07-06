// src/cli/commands/internal/verify.ts
import { existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { readState } from "../../utils/state.js";
import { ARTIFACT_FILES, computeArtifactHash } from "../../../core/artifacts.js";

interface VerifyRule {
  phase: string;
  artifacts: string[]; // 必须存在 + hash 有效(artifact id)
  stateFields: string[]; // 必须存在的 state 字段(点分路径,值非 null)
  nullableFields?: string[]; // 允许 null 的字段(如 worktree)
  dirLocation?: "changes" | "archive"; // change 目录位置
}

const VERIFY_RULES: Record<string, VerifyRule> = {
  "start-enter": {
    phase: "starting",
    artifacts: [],
    stateFields: [],
  },
  "start-exit": {
    phase: "starting",
    artifacts: ["draft"],
    stateFields: ["feature_branch", "started_at"],
    nullableFields: ["worktree"],
  },
  "plan-enter": {
    phase: "planning",
    artifacts: ["draft"],
    stateFields: ["feature_branch"],
  },
  "plan-exit": {
    phase: "planning",
    artifacts: ["proposal", "design", "specs", "tasks", "plans"],
    stateFields: ["phase_timings.plan.started_at"],
  },
  "apply-enter": {
    phase: "applying",
    artifacts: ["plans"],
    stateFields: ["feature_branch"],
  },
  "apply-exit": {
    phase: "applying",
    artifacts: ["verify", "retrospective"],
    stateFields: ["phase_timings.apply.started_at"],
  },
  "archive-enter": {
    phase: "archiving",
    artifacts: ["verify"],
    stateFields: [],
  },
  "archive-exit": {
    phase: "archiving",
    artifacts: [],
    stateFields: ["phase_timings.archive.started_at"],
    dirLocation: "archive",
  },
  "finish-enter": {
    phase: "finishing",
    artifacts: [],
    stateFields: [],
    dirLocation: "archive",
  },
  "finish-exit": {
    phase: "finishing",
    artifacts: [],
    stateFields: ["phase_timings.finish.started_at"],
    dirLocation: "archive",
  },
};

function getStateField(state: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, state);
}

async function checkArtifactHash(changeDir: string, artifactId: string): Promise<{ ok: boolean; reason?: string }> {
  const fileName = ARTIFACT_FILES[artifactId];
  if (!fileName) {
    return { ok: false, reason: `未知制品 id: ${artifactId}` };
  }
  const fullPath = join(changeDir, fileName);
  if (!existsSync(fullPath)) {
    return { ok: false, reason: `文件不存在: ${fileName}` };
  }
  // computeArtifactHash 支持文件和目录(specs 是目录)
  const actualHash = await computeArtifactHash(changeDir, artifactId);
  if (actualHash === null) {
    return { ok: false, reason: `无法读取: ${fileName}` };
  }
  return { ok: true };
}

/**
 * alloy _verify phase-enter <phase> <change-dir>
 * alloy _verify phase-exit <phase> <change-dir>
 *
 * 校验阶段转换状态——CLI 确定性校验,不替代 agent 执行,只报告缺失项。
 * 比 _guard precheck(单点 phase 路由)更全面:校验制品 + state 字段 + 目录位置。
 */
export async function verifyCommand(args: string[]): Promise<void> {
  const subCommand = args[0];
  if (subCommand !== "phase-enter" && subCommand !== "phase-exit") {
    console.error("用法: alloy _verify phase-enter|phase-exit <phase> <change-dir>");
    process.exit(1);
    return;
  }

  const phase = args[1];
  const changeDir = args[2];
  if (!phase || !changeDir) {
    console.error("用法: alloy _verify phase-enter|phase-exit <phase> <change-dir>");
    process.exit(1);
    return;
  }

  const ruleKey = `${phase}-${subCommand === "phase-enter" ? "enter" : "exit"}`;
  const rule = VERIFY_RULES[ruleKey];
  if (!rule) {
    console.error(`⛔ [PRECONDITION_FAIL] 未知阶段校验: ${ruleKey}`);
    console.error(`  支持的阶段: ${Object.keys(VERIFY_RULES).map(k => k.replace(/-(enter|exit)$/, "")).filter((v, i, a) => a.indexOf(v) === i).join(", ")}`);
    process.exit(1);
    return;
  }

  if (!existsSync(changeDir)) {
    console.error(`⛔ [PRECONDITION_FAIL] change 目录不存在: ${changeDir}`);
    process.exit(1);
    return;
  }

  let state;
  try {
    state = await readState(changeDir);
  } catch {
    console.error(`⛔ [PRECONDITION_FAIL] 无法读取 state: ${changeDir}/.alloy.yaml`);
    process.exit(1);
    return;
  }

  const failures: string[] = [];

  // 1. phase 校验
  if (state.phase !== rule.phase) {
    failures.push(`phase 不匹配: 期望 ${rule.phase},实际 ${state.phase}`);
  }

  // 2. state 字段校验
  const nullableFields = rule.nullableFields ?? [];
  for (const field of rule.stateFields) {
    const value = getStateField(state as unknown as Record<string, unknown>, field);
    if (value === undefined || value === null || value === "") {
      failures.push(`state 字段缺失: ${field}`);
    }
  }
  // nullableFields 只校验字段存在(允许 null)
  for (const field of nullableFields) {
    const value = getStateField(state as unknown as Record<string, unknown>, field);
    if (value === undefined) {
      failures.push(`state 字段缺失: ${field}(允许 null 但必须存在)`);
    }
  }

  // 3. 制品校验(存在 + 可读)
  for (const artifactId of rule.artifacts) {
    const result = await checkArtifactHash(changeDir, artifactId);
    if (!result.ok) {
      failures.push(`制品 ${artifactId}: ${result.reason}`);
    }
  }

  // 4. 目录位置校验(archive 阶段后 change 目录应在 archive/ 下)
  if (rule.dirLocation === "archive") {
    const parentName = basename(dirname(changeDir));
    if (parentName !== "archive") {
      failures.push(`目录位置错误: 期望在 archive/ 下,实际父目录 ${parentName}`);
    }
  }

  if (failures.length === 0) {
    console.log(`✓ ${ruleKey} 校验通过`);
    console.log(`  phase: ${state.phase}`);
    console.log(`  制品: ${rule.artifacts.length ? rule.artifacts.join(", ") : "无"}`);
    console.log(`  state 字段: ${rule.stateFields.length ? rule.stateFields.join(", ") : "无"}`);
  } else {
    console.error(`⛔ [PRECONDITION_FAIL] ${ruleKey} 校验失败:`);
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }
}
