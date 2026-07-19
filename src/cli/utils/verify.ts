// src/utils/verify.ts

/**
 * verify.md 决策状态。
 *
 * 判定规则(与 `_guard verify-passed` 命令一致):
 * 1. 行首 `- [x]` checkbox + ❌ FAIL -> FAIL
 * 2. 行首 `- [x]` checkbox + ⚠️ WARNING -> WARNING
 * 3. 其他(无标记 / PASS 字眼 / 仅文本描述) -> PASS
 *
 * 注意:不能用 `/WARNING/i` grep 整个 verify.md 内容,
 * 否则 verify.md 内 "WARNING: 无" / "**WARNING:** 无" 这类字眼会被误判为 WARNING 状态。
 * 必须用 `^- \[x\].*(?:⚠️\s*)?WARNING` 精确匹配 checkbox+标记。
 *
 * 反例:OpenCode 测试中 verify.md 实际全 PASS(内容含 "All checks passed"),
 * 但出现 "**WARNING:** 无" 字眼被 retro.ts 旧 grep 误判 WARNING,retrospective §0 量化失真。
 */
export type VerifyDecision = "PASS" | "FAIL" | "WARNING";

export function parseVerifyDecision(content: string): VerifyDecision {
  if (/^- \[x\].*(?:❌\s*)?FAIL/mi.test(content)) return "FAIL";
  if (/^- \[x\].*(?:⚠️\s*)?WARNING/mi.test(content)) return "WARNING";
  return "PASS";
}
