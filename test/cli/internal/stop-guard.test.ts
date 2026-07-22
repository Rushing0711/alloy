// test/cli/internal/stop-guard.test.ts
import { describe, it, expect } from "vitest";
import { evaluateStopGuard, isUserGateTextOutput } from "../../../src/cli/commands/internal/stop-guard.js";

describe("isUserGateTextOutput(模式检测)", () => {
  it("含 🔴 USER_GATE + (a)/(b) -> true", () => {
    expect(isUserGateTextOutput("## 🔴 USER_GATE：主题确认\n(a) 确认\n(b) 调整")).toBe(true);
  });

  it("含 🔴 USER_GATE 但无 (a)/(b)(精确字符串确认)-> false", () => {
    expect(isUserGateTextOutput("🔴 USER_GATE: 确认合并\n请输入精确字符串")).toBe(false);
  });

  it("含 (a) + (b) + 确认 -> true", () => {
    expect(isUserGateTextOutput("请确认：\n- (a) 确认使用\n- (b) 调整")).toBe(true);
  });

  it("含 (a) + (b) + 选项 -> true", () => {
    expect(isUserGateTextOutput("选项：\n(a) 方案1\n(b) 方案2")).toBe(true);
  });

  it("含 (a) + (b) + 选择 -> true", () => {
    expect(isUserGateTextOutput("请选择：\n(a) X\n(b) Y")).toBe(true);
  });

  it("主题已确认总结 -> false(合规输出)", () => {
    expect(isUserGateTextOutput("好的,主题已确认为 hello-script,进入下一步。")).toBe(false);
  });

  it("(a)/(b) 但无确认/选项/选择关键词 -> false(降低误报)", () => {
    expect(isUserGateTextOutput("有两种实现方式:(a) 方案1 (b) 方案2,都可以")).toBe(false);
  });

  it("空字符串 -> false", () => {
    expect(isUserGateTextOutput("")).toBe(false);
  });

  it("普通文本 -> false", () => {
    expect(isUserGateTextOutput("我来创建这个脚本。")).toBe(false);
  });
});

describe("evaluateStopGuard(纯逻辑,exit 2 + stderr 模式)", () => {
  it("ALLOY_FORCE_STOP=1 逃生阀 -> exit 0 无 message", () => {
    const stdin = JSON.stringify({ last_assistant_message: "🔴 USER_GATE\n(a) 确认" });
    const result = evaluateStopGuard(stdin, { ALLOY_FORCE_STOP: "1" });
    expect(result.exitCode).toBe(0);
    expect(result.message).toBeUndefined();
  });

  it("空 stdin -> exit 0", () => {
    const result = evaluateStopGuard("", {});
    expect(result.exitCode).toBe(0);
    expect(result.message).toBeUndefined();
  });

  it("非 JSON stdin -> exit 0", () => {
    const result = evaluateStopGuard("not json", {});
    expect(result.exitCode).toBe(0);
    expect(result.message).toBeUndefined();
  });

  it("stop_hook_active=true -> exit 0(防死循环)", () => {
    const stdin = JSON.stringify({
      last_assistant_message: "🔴 USER_GATE\n(a) 确认",
      stop_hook_active: true,
    });
    const result = evaluateStopGuard(stdin, {});
    expect(result.exitCode).toBe(0);
    expect(result.message).toBeUndefined();
  });

  it("last_assistant_message 含 🔴 USER_GATE -> exit 2 + message 含 AskUserQuestion", () => {
    const stdin = JSON.stringify({
      last_assistant_message: "## 🔴 USER_GATE：主题确认\n(a) 确认\n(b) 调整",
      stop_hook_active: false,
    });
    const result = evaluateStopGuard(stdin, {});
    expect(result.exitCode).toBe(2);
    expect(result.message).toBeDefined();
    expect(result.message).toContain("AskUserQuestion");
  });

  it("last_assistant_message 含 (a)/(b)/确认 -> exit 2 + message", () => {
    const stdin = JSON.stringify({
      last_assistant_message: "请确认：\n(a) 确认使用 hello-script\n(b) 自定义主题名",
    });
    const result = evaluateStopGuard(stdin, {});
    expect(result.exitCode).toBe(2);
    expect(result.message).toBeDefined();
    expect(result.message).toContain("AskUserQuestion");
  });

  it("last_assistant_message 不含 USER_GATE 模式 -> exit 0 无 message", () => {
    const stdin = JSON.stringify({
      last_assistant_message: "脚本创建完成,已测试通过。",
    });
    const result = evaluateStopGuard(stdin, {});
    expect(result.exitCode).toBe(0);
    expect(result.message).toBeUndefined();
  });

  it("无 last_assistant_message 字段 -> exit 0", () => {
    const stdin = JSON.stringify({ stop_hook_active: false });
    const result = evaluateStopGuard(stdin, {});
    expect(result.exitCode).toBe(0);
    expect(result.message).toBeUndefined();
  });

  it("message 含 ALLOY_FORCE_STOP 绕过提示", () => {
    const stdin = JSON.stringify({
      last_assistant_message: "🔴 USER_GATE\n(a) X\n(b) Y",
    });
    const result = evaluateStopGuard(stdin, {});
    expect(result.message).toContain("ALLOY_FORCE_STOP");
  });

  // 各 agent 提示语差异化
  it("Claude Code(CLAUDECODE=1)提示含 AskUserQuestion", () => {
    const stdin = JSON.stringify({
      last_assistant_message: "🔴 USER_GATE\n(a) 确认\n(b) 调整",
    });
    const result = evaluateStopGuard(stdin, { CLAUDECODE: "1" });
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("AskUserQuestion");
  });

  it("OpenCode(OPENCODE=1)提示含 question 工具", () => {
    const stdin = JSON.stringify({
      last_assistant_message: "🔴 USER_GATE\n(a) 确认\n(b) 调整",
    });
    const result = evaluateStopGuard(stdin, { OPENCODE: "1" });
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("question 工具");
  });

  it("Pi(PI_CODING_AGENT=true)提示含 alloy-question", () => {
    const stdin = JSON.stringify({
      last_assistant_message: "🔴 USER_GATE\n(a) 确认\n(b) 调整",
    });
    const result = evaluateStopGuard(stdin, { PI_CODING_AGENT: "true" });
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain("alloy-question");
  });
});
