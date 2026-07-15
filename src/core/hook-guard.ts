// src/core/hook-guard.ts

/**
 * hook-guard:平台无关的文件写入判定逻辑(纯函数)。
 *
 * 被 PreToolUse hook 适配器(Claude Code)调用,拦截 agent 在非 apply 阶段写源码的行为。
 * 解决问题:agent 在 explore/start 阶段直接写代码,跳过 alloy 流程(plan/apply/archive)。
 *
 * 判定规则:
 * 1. 非 alloy 项目(无 openspec/changes/)-> 放行(不影响非 alloy 项目)
 * 2. 有 pending_gate -> 非白名单拦截(强制先问答;优先级高于 apply)
 * 3. 有任一 change 在 apply/finishing/finished 阶段 -> 放行(允许写源码 / finish 合入 main 的 commit)
 * 4. 非 apply 阶段 + 白名单路径 -> 放行(openspec/文档/配置等)
 * 5. 非 apply 阶段 + 非白名单路径 -> 拦截(src/、scripts/、根目录代码文件等)
 *
 * 关键:alloy 项目但无活跃 change(phases 空)也走拦截,强制 agent 先 _phase start 创建 change,
 * 避免 agent 不创建 change 直接写文件绕过整个 alloy 流程。
 */

export interface GuardInput {
  /** 要写的文件路径(项目相对路径,可带 ./ 前缀) */
  filePath: string;
  /** 所有活跃 change 的 phase 列表(空数组=无活跃 change 或非 alloy 项目) */
  phases: string[];
  /** 所有活跃 change 的未通过 user-gate 列表(非空=有 pending_gate,需先问答) */
  pendingGates?: string[];
  /** 是否 alloy 项目(有 openspec/changes/ 目录)。默认 true(安全优先:不传视为 alloy 项目)。alloy 项目即使无活跃 change 也走拦截逻辑 */
  isAlloyProject?: boolean;
}

export interface GuardResult {
  allowed: boolean;
  reason: string;
}

/** 允许写源码的阶段:apply(写源码)+ finishing/finished(finish 阶段合入 main 的 squash merge commit) */
const APPLY_PHASES = new Set(["applying", "applied", "finishing", "finished"]);

/**
 * 非 apply 阶段白名单(允许写的路径模式)
 * - openspec/:change 产物(proposal/design/specs/tasks/plans/verify/retrospective)
 * - .alloy.yaml:state 文件(由 _state 命令写)
 * - .claude/、.agents/、.opencode/、.pi/:agent 配置 + 共享 skills 运行时(npx skills add 装到 .agents/skills/)
 * - docs/:文档
 * - *.md:markdown 文件(任意位置,含 README/CLAUDE.md/AGENTS.md)
 * - .gitignore、.gitattributes:git 配置
 * - opencode.json:OpenCode 项目配置(在项目根,不在 .opencode/ 目录下;alloy init 注入 permissions)
 */
const NON_APPLY_WHITELIST: RegExp[] = [
  /^openspec\//,
  /^\.alloy\.yaml$/,
  /^\.claude\//,  /^\.agents\//,
  /^\.opencode\//,
  /^\.pi\//,
  /^docs\//,
  /\.md$/,
  /^\.gitignore$/,
  /^\.gitattributes$/,
  /^opencode\.json$/,
];

export function guardCheck(input: GuardInput): GuardResult {
  const { filePath, phases } = input;
  const pendingGates = input.pendingGates ?? [];
  const isAlloyProject = input.isAlloyProject ?? true;

  // 1. 真非 alloy 项目(无 openspec/changes/):放行(不影响非 alloy 项目)
  if (!isAlloyProject) {
    return { allowed: true, reason: "非 alloy 项目(无 openspec/changes/),放行" };
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

  // 5. 非白名单:拦截(phases 空 = 无活跃 change,或所有 change 非 apply)
  const phaseDesc = phases.length === 0
    ? "无活跃 change"
    : `phases=${phases.join(",")}`;
  return {
    allowed: false,
    reason: `alloy 项目(${phaseDesc}),禁止写: ${normalizedPath}`,
  };
}
