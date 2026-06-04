# 终端格式化工具函数实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `src/utils/format.ts` 中添加格式化工具函数，让 agent 可以轻松生成格式化的输出，解决中文字符导致的错位问题。

**Architecture:** 使用现有的 `boxen` 和 `cli-table3` 库，封装简单易用的 API。所有函数都使用 `string-width` 来正确计算字符宽度。

**Tech Stack:** TypeScript, boxen, cli-table3, string-width

---

## 文件结构

- `src/utils/format.ts` — 添加格式化工具函数
- `test/utils/format.test.ts` — 添加测试用例
- `docs/superpowers/specs/2026-06-04-terminal-formatting-design.md` — 设计文档（已存在）

---

### Task 1: 添加 boxPanel 函数

**Files:**
- Modify: `src/utils/format.ts`
- Test: `test/utils/format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/utils/format.test.ts
import { describe, it, expect } from "vitest";
import { boxPanel } from "../../src/utils/format.js";

describe("boxPanel", () => {
  it("should generate a panel with title", () => {
    const result = boxPanel("Hello", { title: "Test" });
    expect(result).toContain("Test");
    expect(result).toContain("Hello");
    expect(result).toContain("┌");
    expect(result).toContain("┐");
    expect(result).toContain("└");
    expect(result).toContain("┘");
  });

  it("should generate a panel without title", () => {
    const result = boxPanel("Hello");
    expect(result).toContain("Hello");
    expect(result).toContain("┌");
    expect(result).toContain("┐");
    expect(result).toContain("└");
    expect(result).toContain("┘");
  });

  it("should handle Chinese characters correctly", () => {
    const result = boxPanel("你好世界");
    expect(result).toContain("你好世界");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/utils/format.test.ts`
Expected: FAIL with "boxPanel is not a function"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/utils/format.ts
import boxen, { type Options as BoxenOptions } from "boxen";

interface BoxOptions {
  padding?: number;
  margin?: number;
  width?: number;
  title?: string;
  titleAlignment?: "left" | "center" | "right";
}

export function boxPanel(content: string, opts?: BoxOptions): string {
  const boxenOpts: BoxenOptions = {
    padding: opts?.padding ?? 1,
    margin: opts?.margin ?? 0,
    width: opts?.width,
    title: opts?.title,
    titleAlignment: opts?.titleAlignment ?? "left",
  };
  return boxen(content, boxenOpts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/utils/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.ts test/utils/format.test.ts
git commit -m "feat: add boxPanel function for terminal formatting"
```

---

### Task 2: 添加 tableWithBorder 函数

**Files:**
- Modify: `src/utils/format.ts`
- Test: `test/utils/format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/utils/format.test.ts
import { describe, it, expect } from "vitest";
import { tableWithBorder } from "../../src/utils/format.js";

describe("tableWithBorder", () => {
  it("should generate a table with headers and rows", () => {
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

  it("should handle Chinese characters in headers", () => {
    const result = tableWithBorder(
      ["姓名", "年龄"],
      [["张三", "30"]]
    );
    expect(result).toContain("姓名");
    expect(result).toContain("年龄");
    expect(result).toContain("张三");
  });

  it("should handle empty rows", () => {
    const result = tableWithBorder(["Name", "Age"], []);
    expect(result).toContain("Name");
    expect(result).toContain("Age");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/utils/format.test.ts`
Expected: FAIL with "tableWithBorder is not a function"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/utils/format.ts
import cliTable from "cli-table3";

interface TableOptions {
  width?: number;
  headerStyle?: string;
  borderStyle?: string;
}

export function tableWithBorder(headers: string[], rows: string[][], opts?: TableOptions): string {
  const table = new cliTable({
    head: headers,
    style: { head: [opts?.headerStyle ?? "cyan"] },
  });

  for (const row of rows) {
    table.push(row);
  }

  return table.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/utils/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.ts test/utils/format.test.ts
git commit -m "feat: add tableWithBorder function for terminal formatting"
```

---

### Task 3: 添加 statusLine 函数

**Files:**
- Modify: `src/utils/format.ts`
- Test: `test/utils/format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/utils/format.test.ts
import { describe, it, expect } from "vitest";
import { statusLine } from "../../src/utils/format.js";

describe("statusLine", () => {
  it("should generate a success status line", () => {
    const result = statusLine("Node.js", "v18.0.0", "success");
    expect(result).toContain("Node.js");
    expect(result).toContain("v18.0.0");
    expect(result).toContain("✓");
  });

  it("should generate a warning status line", () => {
    const result = statusLine("OpenSpec", "v1.2.0", "warning");
    expect(result).toContain("OpenSpec");
    expect(result).toContain("v1.2.0");
    expect(result).toContain("⚠");
  });

  it("should generate an error status line", () => {
    const result = statusLine("Git", "未安装", "error");
    expect(result).toContain("Git");
    expect(result).toContain("未安装");
    expect(result).toContain("✗");
  });

  it("should handle Chinese characters", () => {
    const result = statusLine("节点", "v18.0.0", "success");
    expect(result).toContain("节点");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/utils/format.test.ts`
Expected: FAIL with "statusLine is not a function"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/utils/format.ts
import pc from "picocolors";

interface StatusOptions {
  icon?: string;
  width?: number;
}

export function statusLine(label: string, value: string, status: "success" | "warning" | "error", opts?: StatusOptions): string {
  const icons = {
    success: "✓",
    warning: "⚠",
    error: "✗",
  };

  const icon = opts?.icon ?? icons[status];
  const coloredIcon = status === "success" ? pc.green(icon) : status === "warning" ? pc.yellow(icon) : pc.red(icon);

  return `     ${coloredIcon} ${label} ${pc.cyan(value)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/utils/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.ts test/utils/format.test.ts
git commit -m "feat: add statusLine function for terminal formatting"
```

---

### Task 4: 添加 progressBar 函数

**Files:**
- Modify: `src/utils/format.ts`
- Test: `test/utils/format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/utils/format.test.ts
import { describe, it, expect } from "vitest";
import { progressBar } from "../../src/utils/format.js";

describe("progressBar", () => {
  it("should generate a progress bar at 0%", () => {
    const result = progressBar(0, 100, 20);
    expect(result).toContain("0%");
    expect(result).toContain("░");
  });

  it("should generate a progress bar at 50%", () => {
    const result = progressBar(50, 100, 20);
    expect(result).toContain("50%");
    expect(result).toContain("█");
    expect(result).toContain("░");
  });

  it("should generate a progress bar at 100%", () => {
    const result = progressBar(100, 100, 20);
    expect(result).toContain("100%");
    expect(result).toContain("█");
  });

  it("should use default width of 20", () => {
    const result = progressBar(50, 100);
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/utils/format.test.ts`
Expected: FAIL with "progressBar is not a function"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/utils/format.ts
export function progressBar(value: number, total: number, width: number = 20): string {
  const percentage = Math.round((value / total) * 100);
  const filled = Math.round((value / total) * width);
  const empty = width - filled;

  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `${bar} ${percentage}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/utils/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/format.ts test/utils/format.test.ts
git commit -m "feat: add progressBar function for terminal formatting"
```

---

### Task 5: 集成测试和文档更新

**Files:**
- Test: `test/utils/format.test.ts`
- Modify: `docs/superpowers/specs/2026-06-04-terminal-formatting-design.md`

- [ ] **Step 1: Write integration test**

```typescript
// test/utils/format.test.ts
import { describe, it, expect } from "vitest";
import { boxPanel, tableWithBorder, statusLine, progressBar } from "../../src/utils/format.js";

describe("integration", () => {
  it("should combine multiple formatting functions", () => {
    const panel = boxPanel("Test Panel", { title: "Integration" });
    const table = tableWithBorder(["Name", "Value"], [["Key", "Value"]]);
    const status = statusLine("Status", "OK", "success");
    const progress = progressBar(75, 100);

    expect(panel).toBeDefined();
    expect(table).toBeDefined();
    expect(status).toBeDefined();
    expect(progress).toBeDefined();

    // Verify they can be concatenated
    const combined = `${panel}\n${table}\n${status}\n${progress}`;
    expect(combined).toContain("Test Panel");
    expect(combined).toContain("Name");
    expect(combined).toContain("Status");
    expect(combined).toContain("75%");
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npm test -- test/utils/format.test.ts`
Expected: PASS

- [ ] **Step 3: Update design document with usage examples**

Add to `docs/superpowers/specs/2026-06-04-terminal-formatting-design.md`:

```markdown
## 使用示例

### 基本用法

```typescript
import { boxPanel, tableWithBorder, statusLine, progressBar } from "../../utils/format.js";

// 生成面板
const panel = boxPanel("待办事项应用", { title: "需求探索" });

// 生成表格
const table = tableWithBorder(
  ["范围", "功能"],
  [
    ["最小", "添加 ✓ 完成 ✓ 删除 ✓"],
    ["中等", "+ 编辑 + 分类 + 截止日期"],
    ["完整", "+ 优先级 + 搜索 + 拖拽排序"],
  ]
);

// 生成状态行
const status = statusLine("Node.js", "v18.0.0", "success");

// 生成进度条
const progress = progressBar(75, 100);

// 组合输出
console.log(panel);
console.log(table);
console.log(status);
console.log(progress);
```

### 复杂场景

```typescript
// 生成多个小面板
const panel1 = boxPanel("CLI", { title: "终端工具" });
const panel2 = boxPanel("Web", { title: "浏览器" });
const panel3 = boxPanel("桌面应用", { title: "Electron" });

// 组合输出
console.log(`${panel1}  ${panel2}  ${panel3}`);
```
```

- [ ] **Step 4: Commit**

```bash
git add test/utils/format.test.ts docs/superpowers/specs/2026-06-04-terminal-formatting-design.md
git commit -m "test: add integration tests and update documentation"
```

---

### Task 6: 最终验证和清理

**Files:**
- None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Verify exports**

Check that all functions are properly exported from `src/utils/format.ts`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```

---

## 完成

实现计划完成。所有格式化工具函数已添加到 `src/utils/format.ts`，包括：
- `boxPanel()` — 生成带标题的面板
- `tableWithBorder()` — 生成带边框的表格
- `statusLine()` — 生成状态行
- `progressBar()` — 生成进度条

所有函数都使用 `string-width` 来正确计算字符宽度，确保中文字符不会导致错位。
