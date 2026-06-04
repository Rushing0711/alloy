import { describe, it, expect } from "vitest";
import {
  color,
  box,
  boxPanel,
  table,
  borderedTable,
  tableWithBorder,
  spinner,
  stripAnsi,
  stringWidth,
  statusLine,
  progressBar,
} from "../../src/utils/format.js";

describe("color", () => {
  it("导出 green/red/yellow/cyan/dim/bold 函数", () => {
    expect(typeof color.green).toBe("function");
    expect(typeof color.red).toBe("function");
    expect(typeof color.yellow).toBe("function");
    expect(typeof color.cyan).toBe("function");
    expect(typeof color.dim).toBe("function");
    expect(typeof color.bold).toBe("function");
  });

  it("导出的颜色函数可正常调用", () => {
    const result = color.green("hello");
    expect(typeof result).toBe("string");
    expect(stripAnsi(result)).toBe("hello");
  });
});

describe("box", () => {
  it("生成带边框的文本", () => {
    const result = box("hello");
    expect(result).toContain("hello");
    const hasBorder =
      result.includes("─") || result.includes("-") || result.includes("=");
    expect(hasBorder).toBe(true);
  });

  it("支持 title 选项", () => {
    const result = box("content", { title: "标题" });
    expect(result).toContain("content");
  });

  it("正确处理 CJK 字符对齐", () => {
    const result = box("中文测试");
    const lines = result.split("\n");
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    if (nonEmpty.length >= 2) {
      const widths = nonEmpty.map((l) => stringWidth(l));
      const firstWidth = widths[0];
      expect(widths.every((w) => w === firstWidth)).toBe(true);
    }
  });
});

describe("table", () => {
  it("生成无边框表格，包含表头和数据行", () => {
    const result = table(["名称", "状态"], [["alloy", "已安装"]]);
    expect(result).toContain("名称");
    expect(result).toContain("状态");
    expect(result).toContain("alloy");
    expect(result).toContain("已安装");
  });

  it("无边框表格不包含 box-drawing 字符", () => {
    const result = table(["A", "B"], [["x", "y"]]);
    expect(result).not.toContain("│");
    expect(result).not.toContain("─");
    expect(result).not.toContain("┌");
    expect(result).not.toContain("└");
  });
});

describe("borderedTable", () => {
  it("生成带边框表格", () => {
    const result = borderedTable(["名称", "状态"], [["alloy", "已安装"]]);
    expect(result).toContain("名称");
    expect(result).toContain("alloy");
    expect(result).toContain("│");
  });
});

describe("spinner", () => {
  it("返回 ora 实例，支持 succeed/fail/info", () => {
    const s = spinner("测试");
    expect(s).toBeDefined();
    expect(typeof s.succeed).toBe("function");
    expect(typeof s.fail).toBe("function");
    expect(typeof s.info).toBe("function");
    s.stop();
  });
});

describe("stringWidth", () => {
  it("正确计算 ASCII 字符宽度", () => {
    expect(stringWidth("abc")).toBe(3);
  });

  it("正确计算 CJK 字符宽度", () => {
    expect(stringWidth("中文")).toBe(4);
  });

  it("混合 ASCII 和 CJK 字符", () => {
    expect(stringWidth("hello中文")).toBe(9);
  });
});

describe("boxPanel", () => {
  it("生成带标题的面板", () => {
    const result = boxPanel("Hello", { title: "Test" });
    expect(result).toContain("Test");
    expect(result).toContain("Hello");
    expect(result).toContain("┌");
    expect(result).toContain("┐");
    expect(result).toContain("└");
    expect(result).toContain("┘");
  });

  it("生成无标题的面板", () => {
    const result = boxPanel("Hello");
    expect(result).toContain("Hello");
    expect(result).toContain("┌");
    expect(result).toContain("┐");
    expect(result).toContain("└");
    expect(result).toContain("┘");
  });

  it("正确处理中文字符", () => {
    const result = boxPanel("你好世界");
    expect(result).toContain("你好世界");
  });
});

describe("tableWithBorder", () => {
  it("生成带边框表格，包含表头和数据行", () => {
    const result = tableWithBorder(
      ["Name", "Age"],
      [["Alice", "30"], ["Bob", "25"]]
    );
    expect(result).toContain("Name");
    expect(result).toContain("Age");
    expect(result).toContain("Alice");
    expect(result).toContain("30");
    expect(result).toContain("Bob");
    expect(result).toContain("25");
  });

  it("正确处理中文字符表头", () => {
    const result = tableWithBorder(
      ["姓名", "年龄"],
      [["张三", "30"]]
    );
    expect(result).toContain("姓名");
    expect(result).toContain("年龄");
    expect(result).toContain("张三");
  });

  it("处理空数据行", () => {
    const result = tableWithBorder(["Name", "Age"], []);
    expect(result).toContain("Name");
    expect(result).toContain("Age");
  });

  it("支持自定义 headerStyle", () => {
    const result = tableWithBorder(
      ["A", "B"],
      [["x", "y"]],
      { headerStyle: "green" }
    );
    expect(result).toContain("A");
    expect(result).toContain("B");
  });
});

describe("statusLine", () => {
  it("生成 success 状态行", () => {
    const result = statusLine("Node.js", "v18.0.0", "success");
    expect(result).toContain("Node.js");
    expect(result).toContain("v18.0.0");
    expect(result).toContain("✓");
  });

  it("生成 warning 状态行", () => {
    const result = statusLine("OpenSpec", "v1.2.0", "warning");
    expect(result).toContain("OpenSpec");
    expect(result).toContain("v1.2.0");
    expect(result).toContain("⚠");
  });

  it("生成 error 状态行", () => {
    const result = statusLine("Git", "未安装", "error");
    expect(result).toContain("Git");
    expect(result).toContain("未安装");
    expect(result).toContain("✗");
  });

  it("正确处理中文字符", () => {
    const result = statusLine("节点", "v18.0.0", "success");
    expect(result).toContain("节点");
  });
});

describe("progressBar", () => {
  it("生成 0% 进度条", () => {
    const result = progressBar(0, 100, 20);
    expect(result).toContain("0%");
    expect(result).toContain("░");
    expect(result).not.toContain("█");
  });

  it("生成 50% 进度条", () => {
    const result = progressBar(50, 100, 20);
    expect(result).toContain("50%");
    expect(result).toContain("█");
    expect(result).toContain("░");
  });

  it("生成 100% 进度条", () => {
    const result = progressBar(100, 100, 20);
    expect(result).toContain("100%");
    expect(result).toContain("█");
    expect(result).not.toContain("░");
  });

  it("默认 width 为 20", () => {
    const result = progressBar(50, 100);
    // 默认 width=20，50% 应有 10 个填充块
    expect(result).toContain("█".repeat(10));
    expect(result).toContain("░".repeat(10));
    expect(result).toContain("50%");
  });

  it("total 为 0 时不产生除零错误", () => {
    const result = progressBar(0, 0, 20);
    expect(result).toContain("0%");
    expect(result).toContain("░".repeat(20));
    expect(result).not.toContain("NaN");
  });

  it("value 超过 total 时 clamp 到 100%", () => {
    const result = progressBar(150, 100, 20);
    expect(result).toContain("100%");
    expect(result).toContain("█".repeat(20));
    expect(result).not.toContain("░");
    expect(result).not.toContain("150%");
  });

  it("value 为负数时 clamp 到 0%", () => {
    const result = progressBar(-10, 100, 20);
    expect(result).toContain("0%");
    expect(result).toContain("░".repeat(20));
    expect(result).not.toContain("█");
  });

  it("width 为 0 时返回纯百分比", () => {
    const result = progressBar(50, 100, 0);
    expect(result).toBe("0%");
  });
});
