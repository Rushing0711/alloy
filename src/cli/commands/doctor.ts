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

function detectScope(projectPath: string): "global" | "project" | undefined {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  const probe = (dir: string) => existsSync(join(dir, ".claude", "commands", "alloy"));

  if (probe(projectPath)) return "project";
  if (probe(home)) return "global";
  return undefined;
}

export async function doctorCommand(
  projectPath: string
): Promise<DoctorResult> {
  const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const scope = detectScope(projectPath);

  // 1. 版本兼容性
  const healthResults = await runHealthCheck(packageDir, projectPath, scope);

  // 2. 文件一致性（双向检查）
  const consistencyWarnings: string[] = [];
  const changesDir = join(projectPath, "openspec", "changes");
  const changes = await findActiveChanges(changesDir);

  for (const [name, state] of changes) {
    const changePath = join(changesDir, name);

    // 检查 1: worktree 字段有值但磁盘路径不存在
    // "skipped" 是用户明确选择不创建 worktree 的标记，跳过此项检查
    if (state.worktree && state.worktree !== "skipped") {
      const worktreePath = join(projectPath, state.worktree);
      if (!existsSync(worktreePath)) {
        consistencyWarnings.push(
          `${name}: worktree 残留 — .alloy.yaml 声称 worktree 在 ${state.worktree} 但路径不可达`
        );
      }
    }

    // 检查 2: worktree 字段为 null（从未设置）但 .worktrees/<name>/ 目录存在
    // "skipped" 不触发此检查——用户选择不创建，孤儿目录由 git worktree list 覆盖
    if (!state.worktree) {
      const orphanPath = join(projectPath, ".worktrees", name);
      if (existsSync(orphanPath)) {
        consistencyWarnings.push(
          `${name}: worktree 孤儿 — .alloy.yaml 中 worktree 为 null 但 .worktrees/${name}/ 目录存在（状态写入可能缺失）`
        );
      }
    }
  }

  // 检查 3: git worktree list 中有孤立 worktree
  try {
    const { execSync } = await import("node:child_process");
    const output = execSync("git worktree list --porcelain", {
      cwd: projectPath,
      stdio: "pipe",
    }).toString();
    const listedPaths = output
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length));
    for (const wtPath of listedPaths) {
      if (wtPath === projectPath) continue; // 主 worktree
      // 检查此 worktree 路径是否属于已知 change
      const isTracked = [...changes.keys()].some((name) => {
        const expectedPath = join(projectPath, ".worktrees", name);
        return wtPath.startsWith(expectedPath);
      });
      if (!isTracked) {
        consistencyWarnings.push(
          `孤立 worktree: ${wtPath}（不属于任何活跃 change）`
        );
      }
    }
  } catch {
    // 不在 git 仓库中或无 worktree，跳过
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
