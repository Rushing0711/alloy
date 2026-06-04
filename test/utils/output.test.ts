import { describe, it, expect, vi } from "vitest";
import {
  section,
  check,
  success,
  error,
  warn,
  banner,
  detailTable,
  info,
} from "../../src/utils/output.js";
import { stripAnsi } from "../../src/utils/format.js";

describe("section", () => {
  it("输出粗体标题，前面有空行", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    section("测试标题");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("测试标题");
    expect(stripAnsi(output)).toMatch(/^\n\s+测试标题$/);
    spy.mockRestore();
  });
});

describe("check", () => {
  it("pass 状态输出绿色 ✓", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    check("Node.js", "v18.0.0", "pass");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("✓");
    expect(output).toContain("Node.js");
    expect(output).toContain("v18.0.0");
    spy.mockRestore();
  });

  it("fail 状态输出红色 ✗", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    check("Git", "未安装", "fail");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("✗");
    expect(output).toContain("Git");
    spy.mockRestore();
  });

  it("warn 状态输出黄色 ⚠", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    check("OpenSpec", "v1.2.0", "warn");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("⚠");
    spy.mockRestore();
  });
});

describe("success", () => {
  it("输出绿色 ✓ 消息", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    success("操作成功");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("✓");
    expect(output).toContain("操作成功");
    spy.mockRestore();
  });
});

describe("error", () => {
  it("输出红色 ✗ 消息", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    error("操作失败");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("✗");
    expect(output).toContain("操作失败");
    spy.mockRestore();
  });
});

describe("warn", () => {
  it("输出黄色 ⚠ 消息", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    warn("警告信息");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("⚠");
    expect(output).toContain("警告信息");
    spy.mockRestore();
  });
});

describe("banner", () => {
  it("输出绿色横幅", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    banner("✅ 完成");
    const output = spy.mock.calls.join("\n");
    expect(output).toContain("✅ 完成");
    spy.mockRestore();
  });
});

describe("detailTable", () => {
  it("输出带边框表格", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    detailTable(["名称", "状态"], [["alloy", "已安装"]]);
    const output = spy.mock.calls.join("\n");
    expect(output).toContain("名称");
    expect(output).toContain("alloy");
    expect(output).toContain("│");
    spy.mockRestore();
  });
});

describe("info", () => {
  it("输出缩进普通文本", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    info("普通信息");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("普通信息");
    expect(output).toMatch(/^\s{3}/);
    spy.mockRestore();
  });
});
