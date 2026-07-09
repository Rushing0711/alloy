// src/core/hook-guard.ts

/**
 * hook-guard:平台无关的文件写入判定逻辑(纯函数)。
 *
 * 被 PreToolUse hook 适配器(Claude Code/Codex)调用,拦截 agent 在非 apply 阶段写源码的行为。
 * 解决问题:agent 在 explore/start 阶段直接写代码,跳过 alloy 流程(plan/apply/archive)。
 *
 * 判定规则:
 * 1. 非 alloy 项目(phases 空)-> 放行(不影响非 alloy 项目)
 * 2. 有任一 change 在 apply 阶段 -> 放行(允许写源码)
 * 3. 非 apply 阶段 + 白名单路径 -> 放行(openspec/文档/配置等)
 * 4. 非 apply 阶段 + 非白名单路径 -> 拦截(src/、scripts/、根目录代码文件等)
 */

export interface GuardInput {
  /** 要写的文件路径(项目相对路径,可带 ./ 前缀) */
  filePath: string;
  /** 所有活跃 change 的 phase 列表(空数组=非 alloy 项目) */
  phases: string[];
  /** 所有活跃 change 的未通过 user-gate 列表(非空=有 pending_gate,需先问答) */
  pendingGates?: string[];
}

export interface GuardResult {
  allowed: boolean;
  reason: string;
}

/** apply 阶段(允许写源码) */
const APPLY_PHASES = new Set(["applying", "applied"]);

/**
 * 非 apply 阶段白名单(允许写的路径模式)
 * - openspec/:change 产物(proposal/design/specs/tasks/plans/verify/retrospective)
 * - .alloy.yaml:state 文件(由 _state 命令写)
 * - .claude/、.codex/:agent 配置
 * - docs/:文档
 * - *.md:markdown 文件(任意位置,含 README/CLAUDE.md/AGENTS.md)
 * - .gitignore、.gitattributes:git 配置
 */
const NON_APPLY_WHITELIST: RegExp[] = [
  /^openspec\//,
  /^\.alloy\.yaml$/,
  /^\.claude\//,
  /^\.codex\//,
  /^docs\//,
  /\.md$/,
  /^\.gitignore$/,
  /^\.gitattributes$/,
];

export function guardCheck(input: GuardInput): GuardResult {
  const { filePath, phases } = input;
  const pendingGates = input.pendingGates ?? [];

  // 1. 非 alloy 项目(无 phases 无 pendingGates):放行
  if (phases.length === 0 && pendingGates.length === 0) {
    return { allowed: true, reason: "非 alloy 项目(无活跃 change),放行" };
  }

  const normalizedPath = filePath.replace(/^\.\//, "");
  const inWhitelist = NON_APPLY_WHITELIST.some((p) => p.test(normalizedPath));

  // 2. 有 pending_gate:非白名单拦截(强制先问答;优先级高于 apply 阶段)
  if (pendingGates.length > 0) {
    if (inWhitelist) {
      return { allowed: true, reason: `${normalizedPath} 在白名单内(user-gate 期间允许)` };
    }
    return {
      allowed: false,
      reason: `有未通过的 user-gate(${pendingGates.join(",")}),禁止写: ${normalizedPath}。请先用问答工具与用户确认,或调 alloy _guard user-gate pass <change-dir> 降级`,
    };
  }

  // 3. 有任一 change 在 apply 阶段:放行(允许写源码)
  const applyPhases = phases.filter((p) => APPLY_PHASES.has(p));
  if (applyPhases.length > 0) {
    return {
      allowed: true,
      reason: `存在 apply 阶段 change(${applyPhases.join(",")}),允许写源码`,
    };
  }

  // 4. 非 apply 阶段:检查白名单
  if (inWhitelist) {
    return {
      allowed: true,
      reason: `${normalizedPath} 在白名单内(非 apply 阶段允许)`,
    };
  }

  // 5. 非白名单:拦截
  return {
    allowed: false,
    reason: `所有活跃 change 均非 apply 阶段(phases=${phases.join(",")}),禁止写: ${normalizedPath}`,
  };
}
