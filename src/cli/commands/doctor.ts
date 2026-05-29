import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { runHealthCheck } from "../../core/health.js";
import type { HealthCheckResult } from "../../core/types.js";
import { findActiveChanges } from "../utils/state.js";

export interface DoctorResult {
  healthResults: HealthCheckResult[];
  consistencyWarnings: string[];
}

export async function doctorCommand(
  projectPath: string
): Promise<DoctorResult> {
  const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

  // 1. 版本兼容性
  const healthResults = await runHealthCheck(packageDir, projectPath);

  // 2. 文件一致性
  const consistencyWarnings: string[] = [];
  const changesDir = join(projectPath, "openspec", "changes");
  const changes = await findActiveChanges(changesDir);

  for (const [name, state] of changes) {
    const changePath = join(changesDir, name);

    // 检查 worktree 字段与实际路径的一致性
    if (state.worktree) {
      const worktreePath = join(projectPath, state.worktree);
      if (!existsSync(worktreePath)) {
        consistencyWarnings.push(
          `${name}: .alloy.yaml 声称 worktree 存在但路径不可达 (${state.worktree})`
        );
      }
    }
  }

  return { healthResults, consistencyWarnings };
}

export function formatDoctorResult(
  result: DoctorResult,
  useJson: boolean
): string {
  if (useJson) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  lines.push("健康检查：");
  for (const r of result.healthResults) {
    const mark = r.status === "pass" ? "✓" : r.status === "warn" ? "⚠️" : "✗";
    lines.push(`  ${mark} ${r.name}: ${r.current}（要求 ${r.required}）`);
  }

  if (result.consistencyWarnings.length > 0) {
    lines.push("\n文件一致性：");
    for (const w of result.consistencyWarnings) {
      lines.push(`  ⚠️ ${w}`);
    }
  } else {
    lines.push("\n文件一致性：✓ 无问题");
  }

  return lines.join("\n");
}
