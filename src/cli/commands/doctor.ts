import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { runHealthCheck } from "../../core/health.js";
import { KNOWN_AGENTS } from "../../core/agents.js";
import { getHookSupportedAgents, hasHookConfig } from "../../core/agent-config.js";
import type { HealthCheckResult } from "../../core/types.js";
import { findActiveChanges } from "../utils/state.js";
import { color } from "../../utils/format.js";
import { section, check, warn } from "../../utils/output.js";

export interface DoctorResult {
  healthResults: HealthCheckResult[];
  consistencyWarnings: string[];
  agentProtection: AgentProtectionInfo[];
}

export interface AgentProtectionInfo {
  agentId: string;
  agentLabel: string;
  installed: boolean;
  hookConfigured: boolean;
  protectionLevel: "hook" | "skill-only" | "none";
}

/**
 * 检测项目装了哪些 agent + 各 agent 的保护层级。
 * - hook:有 PreToolUse hook 真闸门(Claude Code/Codex,绝对路径正确)
 * - skill-only:装了 alloy skill 但无 hook(如 Pi/OpenCode,或 Claude Code 未装 hook / hook 配置无效)
 * - none:没装 alloy(不返回)
 */
export async function detectAgentProtection(projectPath: string): Promise<AgentProtectionInfo[]> {
  const hookSupportedAgents = getHookSupportedAgents();
  const result: AgentProtectionInfo[] = [];

  for (const agent of KNOWN_AGENTS) {
    const agentDir = agent.commandsDir.split("/")[0];
    const skillPath = join(projectPath, agentDir, "skills", "alloy-start", "SKILL.md");
    const installed = existsSync(skillPath);

    if (!installed) continue;

    let hookConfigured = false;
    if (hookSupportedAgents.includes(agent.id)) {
      hookConfigured = await hasHookConfig(projectPath, agent.id);
    }

    const protectionLevel: AgentProtectionInfo["protectionLevel"] = hookConfigured ? "hook" : "skill-only";

    result.push({
      agentId: agent.id,
      agentLabel: agent.label,
      installed: true,
      hookConfigured,
      protectionLevel,
    });
  }

  return result;
}

function detectScope(projectPath: string): "global" | "project" | undefined {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  // 探测 alloy skill 是否已部署（与 detectAlloySkill 一致：.claude/skills/alloy-start/SKILL.md）
  const probe = (dir: string) => existsSync(join(dir, ".claude", "skills", "alloy-start", "SKILL.md"));

  if (probe(projectPath)) return "project";
  if (probe(home)) return "global";
  return undefined;
}

/**
 * 检查 worktree 文件一致性(检查 1/2/3)。
 * 提取为独立函数以便单元测试。
 */
export function checkWorktreeConsistency(
  changes: Map<string, { worktree: string | null; schema_version?: number }>,
  projectPath: string
): string[] {
  const warnings: string[] = [];

  for (const [name, state] of changes) {
    // 检查 1: worktree 字段有值但磁盘路径不存在
    // "skipped" 是用户明确选择不创建 worktree 的标记，跳过此项检查
    if (state.worktree && state.worktree !== "skipped") {
      const worktreePath = join(projectPath, state.worktree);
      if (!existsSync(worktreePath)) {
        warnings.push(
          `${name}: worktree 残留 — .alloy.yaml 声称 worktree 在 ${state.worktree} 但路径不可达`
        );
      }
    }

    // 检查 2: worktree 字段为 null 但目录存在
    // 覆盖两个路径:Claude Code EnterWorktree(.claude/worktrees/)和其他 agent git fallback(.worktrees/)
    if (!state.worktree) {
      const candidatePaths = [
        join(projectPath, ".claude", "worktrees", name),
        join(projectPath, ".worktrees", name),
      ];
      const existingPaths = candidatePaths
        .filter((p) => existsSync(p))
        .map((p) => relative(projectPath, p));

      if (existingPaths.length > 0) {
        warnings.push(
          `${name}: worktree 孤儿 — .alloy.yaml 中 worktree 为 null 但 ${existingPaths.join(" 或 ")} 目录存在（状态写入可能缺失）`
        );
      }
    }
  }

  // 检查 3: git worktree list 中有孤立 worktree
  try {
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
      // 检查此 worktree 路径是否属于已知 change（覆盖两个路径）
      const isTracked = [...changes.keys()].some((name) => {
        const expectedPaths = [
          join(projectPath, ".claude", "worktrees", name),
          join(projectPath, ".worktrees", name),
        ];
        return expectedPaths.some((p) => wtPath.startsWith(p));
      });
      if (!isTracked) {
        warnings.push(
          `孤立 worktree: ${wtPath}（不属于任何活跃 change）`
        );
      }
    }
  } catch {
    // 不在 git 仓库中或无 worktree，跳过
  }

  return warnings;
}

export async function doctorCommand(
  projectPath: string
): Promise<DoctorResult> {
  const packageDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const scope = detectScope(projectPath);

  // 1. 版本兼容性
  const healthResults = await runHealthCheck(packageDir, projectPath, scope);

  // 2. 文件一致性（双向检查）
  const changesDir = join(projectPath, "openspec", "changes");
  const changes = await findActiveChanges(changesDir);
  const consistencyWarnings = checkWorktreeConsistency(changes, projectPath);

  const agentProtection = await detectAgentProtection(projectPath);

  return { healthResults, consistencyWarnings, agentProtection };
}

export function formatDoctorResult(
  result: DoctorResult,
  useJson: boolean
): string {
  if (useJson) {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  lines.push(color.bold("健康检查："));
  for (const r of result.healthResults) {
    const mark =
      r.status === "pass"
        ? color.green("✓")
        : r.status === "warn"
          ? color.yellow("⚠️")
          : color.red("✗");
    lines.push(
      `  ${mark} ${r.name}: ${color.cyan(r.current)}（要求 ${color.dim(r.required)}）`
    );
  }

  if (result.consistencyWarnings.length > 0) {
    lines.push("\n" + color.bold("文件一致性："));
    for (const w of result.consistencyWarnings) {
      lines.push(`  ${color.yellow("⚠️")} ${w}`);
    }
  } else {
    lines.push("\n" + color.bold("文件一致性：") + color.green(" ✓ 无问题"));
  }

  if ((result.agentProtection ?? []).length > 0) {
    lines.push("\n" + color.bold("Agent 保护层级："));
    for (const a of result.agentProtection) {
      const mark = a.protectionLevel === "hook" ? color.green("✓") : color.yellow("⚠️");
      const level = a.protectionLevel === "hook"
        ? "hook 真闸门"
        : "仅 skill(无 hook,保护降级)";
      lines.push(`  ${mark} ${a.agentLabel}: ${level}`);
    }
  }

  return lines.join("\n");
}

export function printDoctorResult(result: DoctorResult): void {
  section("健康检查");
  for (const r of result.healthResults) {
    check(r.name, `${r.current}（要求 ${r.required}）`, r.status);
  }

  if (result.consistencyWarnings.length > 0) {
    section("文件一致性");
    for (const w of result.consistencyWarnings) {
      warn(w);
    }
  } else {
    section("文件一致性");
    check("一致性", "无问题", "pass");
  }

  if ((result.agentProtection ?? []).length > 0) {
    section("Agent 保护层级");
    for (const a of result.agentProtection) {
      const level = a.protectionLevel === "hook"
        ? "hook 真闸门"
        : "仅 skill(无 hook,保护降级)";
      check(a.agentLabel, level, a.protectionLevel === "hook" ? "pass" : "warn");
    }
  }
}
