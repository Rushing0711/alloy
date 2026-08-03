// src/cli/commands/internal/stop-guard.ts
import { readFileSync } from "node:fs";
import { detectAgent, KNOWN_AGENTS } from "../../../core/agents.js";
import type { AgentId } from "../../../core/types.js";

interface StopHookInput {
  last_assistant_message?: string;
  stop_hook_active?: boolean;
}

/**
 * 根据 agent 返回 USER_GATE 应用的交互工具提示。
 */
function getAgentToolHint(agent: AgentId | null): string {
  if (!agent) return "平台原生交互工具(AskUserQuestion / question / alloy-question / request_user_input)";
  const agentInfo = KNOWN_AGENTS.find(a => a.id === agent);
  return agentInfo?.askToolDisplay ? agentInfo.askToolDisplay + " 工具" : "平台原生交互工具(AskUserQuestion / question / alloy-question / request_user_input)";
}

/**
 * 检测文本是否为 USER_GATE 文本输出模式(agent 用纯文本列选项代替 AskUserQuestion)。
 *
 * 必须含 (a)/(b) 选项 + (🔴 USER_GATE 标记 或 确认/选项/选择 关键词)。
 *
 * 不含 (a)/(b) 的"🔴 USER_GATE: 精确字符串确认"(alloy-finish 的合规流程)不算违规,
 * 避免误报。
 *
 * 误报控制:agent 合规调 AskUserQuestion 后输出的总结文本(如"主题已确认")
 * 不含这些模式,不会命中。只有"用文本列 (a)/(b) 让用户回复"才命中。
 */
export function isUserGateTextOutput(text: string): boolean {
  if (!/\(a\)/i.test(text) || !/\(b\)/i.test(text)) return false;
  if (/🔴\s*USER_GATE/.test(text)) return true;
  if (/确认|选项|选择/.test(text)) return true;
  return false;
}

/**
 * 纯逻辑判定:给定 stdin + env,返回 exitCode + message(给 stderr)。
 *
 * 命中 USER_GATE 文本模式时,exit 2 + stderr(Claude Code Stop hook 的
 * 错误式阻断),stderr 作为 error 反馈给 agent,对话继续,agent 收到后修正。
 *
 * 为什么用 exit 2 + stderr 而不是 additionalContext JSON:
 * additionalContext 依赖较新版本 + stdout 易被 shell profile 污染导致
 * JSON validation failed。exit 2 + stderr 跨版本通吃,更可靠。
 */
export function evaluateStopGuard(
  rawStdin: string,
  env: Record<string, string | undefined>
): { exitCode: number; message?: string } {
  // 逃生阀
  if (env.ALLOY_FORCE_STOP === "1") return { exitCode: 0 };

  if (!rawStdin.trim()) return { exitCode: 0 };

  let input: StopHookInput;
  try {
    input = JSON.parse(rawStdin);
  } catch {
    return { exitCode: 0 };
  }

  // 防死循环:Stop hook 已激活过(本轮已提醒过),放行
  if (input.stop_hook_active === true) return { exitCode: 0 };

  const lastMessage = input.last_assistant_message ?? "";
  if (!lastMessage) return { exitCode: 0 };

  // 感知当前 agent(见 agents.ts detectAgent)
  const agent = detectAgent(env);

  if (isUserGateTextOutput(lastMessage)) {
    const toolHint = getAgentToolHint(agent);
    return {
      exitCode: 2,
      message: `⛔ [alloy stop-guard] 检测到你在 USER_GATE 用纯文本输出 (a)/(b) 选项。alloy 流程要求 USER_GATE 首次呈现必须是 ${toolHint} 调用,不能让用户回复 a/b。请立即改用 ${toolHint} 提问。如确需绕过(仅限修复畸形状态),设置 ALLOY_FORCE_STOP=1。`,
    };
  }

  return { exitCode: 0 };
}

/** 从 stdin(fd 0)读 JSON */
function readStdin(): string {
  try {
    return readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

/**
 * alloy _stop-guard
 *
 * Stop hook 适配器(Claude Code 专用)。检测 agent 在 USER_GATE 用纯文本输出选项
 * 代替 AskUserQuestion 的违规行为,exit 2 + stderr 阻止 agent 结束,stderr 反馈给 agent。
 *
 * 解决问题:弱模型在 USER_GATE 节点用文本输出 "(a) 选项 / (b) 选项" 让用户回复,
 * 跳过 AskUserQuestion 工具调用。hook-guard 管不到(不写源码不触发),Stop hook 在
 * 回合结束时检测 last_assistant_message,命中则 exit 2 阻止结束 + stderr 提醒 agent 改用 AskUserQuestion。
 *
 * .claude/settings.json 配置:
 *   hooks.Stop: [{ hooks: [{ type: "command", command: "node <alloy-dist>/cli/index.js _stop-guard" }] }]
 */
export async function stopGuardCommand(args: string[]): Promise<void> {
  const raw = readStdin();
  const result = evaluateStopGuard(raw, process.env);
  if (result.message) {
    process.stderr.write(result.message);
  }
  process.exit(result.exitCode);
}
