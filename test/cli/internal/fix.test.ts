// test/cli/internal/fix.test.ts
import { describe, it, expect, vi } from "vitest";
import { fixCommand } from "../../../src/cli/commands/internal/fix.js";

describe("alloy _fix detect-keywords", () => {
  it("缺参数 -> exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await fixCommand(["detect-keywords"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("无子命令 -> exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await fixCommand([]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("命中'优化' -> 输出 优化", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await fixCommand(["detect-keywords", "优化", "数据库查询"]);
    expect(logSpy).toHaveBeenCalledWith("优化");
    logSpy.mockRestore();
  });

  it("命中'performance' -> 输出 performance(大小写不敏感)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await fixCommand(["detect-keywords", "Performance", "issue"]);
    expect(logSpy).toHaveBeenCalledWith("performance");
    logSpy.mockRestore();
  });

  it("命中多个关键词 -> 输出去重列表", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await fixCommand(["detect-keywords", "优化性能,refactor重构"]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("优化"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("性能"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("refactor"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("重构"));
    logSpy.mockRestore();
  });

  it("未命中 -> 不输出(bash $() 捕获为空,保持 [ -n \"$HIT\" ] 兼容)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await fixCommand(["detect-keywords", "修复 typo 错别字"]);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("多参数拼接(用户描述含空格)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await fixCommand(["detect-keywords", "用户说", "要优化", "查询性能"]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("优化"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("性能"));
    logSpy.mockRestore();
  });
});
