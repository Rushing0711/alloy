# 格式化指南 Skill 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 `commands/alloy/formatting.md` skill 文件，让 agent 知道并使用项目中已有的格式化工具函数。

**Architecture:** 创建一个独立的 skill 文件，包含格式化函数的说明、使用示例和最佳实践。Agent 可以通过 `/alloy:formatting` 加载这个指南。

**Tech Stack:** Markdown, TypeScript (格式化函数已在 src/utils/format.ts 中实现)

---

## 文件结构

- `commands/alloy/formatting.md` — 格式化指南 skill 文件
- `docs/superpowers/specs/2026-06-04-formatting-skill-design.md` — 设计文档（已存在）

---

### Task 1: 创建 formatting.md skill 文件

**Files:**
- Create: `commands/alloy/formatting.md`

- [ ] **Step 1: 创建 skill 文件**

```markdown
---
name: "Alloy: Formatting"
description: 终端格式化工具函数指南
category: Utility
tags: [alloy, formatting, terminal]
---

# alloy-formatting

你是 Alloy 的格式化工具函数指南。你的职责是提供格式化函数的使用说明，帮助 agent 生成格式化的终端输出。

**核心原则：使用格式化函数代替手绘的 Unicode 表格，确保中文字符不会导致错位。**

---

## 可用函数

### boxPanel(content, opts?)

生成带标题的面板。

**参数：**
- `content: string` — 面板内容
- `opts?: BoxOptions` — 可选配置
  - `title?: string` — 标题
  - `titleAlignment?: "left" | "center" | "right"` — 标题对齐，默认 "left"
  - `padding?: number` — 内边距，默认 1
  - `margin?: number` — 外边距，默认 0
  - `width?: number` — 固定宽度

**示例：**
```typescript
import { boxPanel } from "../../utils/format.js";

// 基本用法
console.log(boxPanel("Hello World", { title: "Demo" }));

// 带中文
console.log(boxPanel("待办事项应用", { title: "需求探索" }));
```

---

### tableWithBorder(headers, rows, opts?)

生成带边框的表格。

**参数：**
- `headers: string[]` — 表头
- `rows: string[][]` — 行数据
- `opts?: TableOptions` — 可选配置
  - `headerStyle?: string` — 表头样式，默认 "cyan"
  - `width?: number` — 固定宽度
  - `borderStyle?: string` — 边框样式

**示例：**
```typescript
import { tableWithBorder } from "../../utils/format.js";

console.log(tableWithBorder(
  ["范围", "功能"],
  [
    ["最小", "添加 ✓ 完成 ✓ 删除 ✓"],
    ["中等", "+ 编辑 + 分类 + 截止日期"],
    ["完整", "+ 优先级 + 搜索 + 拖拽排序"],
  ]
));
```

---

### statusLine(label, value, status, opts?)

生成状态行。

**参数：**
- `label: string` — 标签
- `value: string` — 值
- `status: "success" | "warning" | "error"` — 状态
- `opts?: StatusOptions` — 可选配置
  - `icon?: string` — 自定义图标
  - `width?: number` — 固定宽度

**示例：**
```typescript
import { statusLine } from "../../utils/format.js";

console.log(statusLine("Node.js", "v22.22.2", "success"));
console.log(statusLine("OpenSpec", "v1.3.1", "success"));
console.log(statusLine("Superpowers", "v5.1.0", "warning"));
console.log(statusLine("Git", "未安装", "error"));
```

---

### progressBar(value, total, width?)

生成进度条。

**参数：**
- `value: number` — 当前值
- `total: number` — 总值
- `width: number` — 进度条宽度，默认 20

**示例：**
```typescript
import { progressBar } from "../../utils/format.js";

console.log(progressBar(75, 100)); // ███████████████░░░░░ 75%
console.log(progressBar(50, 100, 30)); // ███████████████░░░░░░░░░░░░░░░ 50%
```

---

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
const status = statusLine("Node.js", "v22.22.2", "success");

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
import { boxPanel, tableWithBorder, statusLine, progressBar } from "../../utils/format.js";

// 生成多个小面板
const panel1 = boxPanel("CLI", { title: "终端工具" });
const panel2 = boxPanel("Web", { title: "浏览器" });
const panel3 = boxPanel("桌面应用", { title: "Electron" });

// 组合输出
console.log(`${panel1}\n${panel2}\n${panel3}`);

// 复杂面板
console.log(boxPanel(
  `"简单"可以有很多种含义...

功能范围：
${tableWithBorder(
  ["范围", "功能"],
  [
    ["最小", "添加 ✓ 完成 ✓ 删除 ✓"],
    ["中等", "+ 编辑 + 分类 + 截止日期"],
    ["完整", "+ 优先级 + 搜索 + 拖拽排序"],
  ]
)}

当前进度：${progressBar(60, 100)}

${statusLine("项目状态", "开发中", "warning")}`,
  { title: "待办事项应用 — 需求探索" }
));
```

---

## 最佳实践

1. **使用 boxPanel 代替手绘的 Unicode 表格**
   - 手绘表格在中文字符下会错位
   - boxPanel 自动处理字符宽度

2. **使用 tableWithBorder 代替手绘的表格**
   - 自动对齐列宽
   - 支持中文内容

3. **使用 statusLine 显示状态信息**
   - 统一的格式和颜色
   - 支持 success/warning/error 三种状态

4. **使用 progressBar 显示进度**
   - 自动处理边界情况（total=0、value>total 等）
   - 支持自定义宽度

5. **组合使用**
   - 可以将多个函数组合使用
   - 支持嵌套面板和表格

---

## 常见问题

### Q: 什么时候使用 boxPanel，什么时候使用 tableWithBorder？

A: 
- 使用 boxPanel 显示单个内容块，带标题
- 使用 tableWithBorder 显示多行多列的数据

### Q: 如何处理中文字符？

A: 格式化函数内部使用 `string-width` 来正确计算字符宽度，确保中文字符不会导致错位。

### Q: 如何自定义样式？

A: 每个函数都支持可选的 `opts` 参数，可以自定义标题、样式、宽度等。

---

## 相关文件

- `src/utils/format.ts` — 格式化函数实现
- `test/utils/format.test.ts` — 格式化函数测试
- `docs/superpowers/specs/2026-06-04-terminal-formatting-design.md` — 终端格式化设计文档
```

- [ ] **Step 2: 验证 skill 文件**

检查文件内容是否完整，格式是否正确。

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/formatting.md
git commit -m "feat: add formatting skill for terminal output"
```

---

### Task 2: 验证和清理

**Files:**
- None (verification only)

- [ ] **Step 1: 运行测试**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: 运行构建**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: 验证 skill 文件**

检查 `commands/alloy/formatting.md` 文件是否存在且内容正确。

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify formatting skill implementation"
```

---

## 完成

实现计划完成。创建了 `commands/alloy/formatting.md` skill 文件，包含：
- 格式化函数说明（boxPanel、tableWithBorder、statusLine、progressBar）
- 使用示例（基本用法和复杂场景）
- 最佳实践
- 常见问题

Agent 可以通过 `/alloy:formatting` 加载这个指南，了解并使用格式化函数。
