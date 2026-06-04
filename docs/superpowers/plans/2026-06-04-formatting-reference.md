# 格式化函数引用实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 start.md 和其他 skill 文件中添加格式化函数的说明和示例，让 agent 知道并使用这些函数。

**Architecture:** 在 skill 文件的开头添加格式化函数的说明，告诉 agent 使用这些函数代替手绘的 Unicode 表格。不替换现有的手绘表格，而是提供使用指南。

**Tech Stack:** Markdown, TypeScript (格式化函数已在 src/utils/format.ts 中实现)

---

## 文件结构

- `commands/alloy/start.md` — 添加格式化函数的说明
- `commands/alloy/plan.md` — 添加格式化函数的说明
- `commands/alloy/apply.md` — 添加格式化函数的说明
- `commands/alloy/archive.md` — 添加格式化函数的说明
- `commands/alloy/finish.md` — 添加格式化函数的说明
- `commands/alloy/fix.md` — 添加格式化函数的说明
- `commands/alloy/discard.md` — 添加格式化函数的说明
- `commands/alloy/status.md` — 添加格式化函数的说明

---

### Task 1: 在 start.md 中添加格式化函数的说明

**Files:**
- Modify: `commands/alloy/start.md`

- [ ] **Step 1: 在 start.md 中添加格式化函数的说明**

在 `# alloy-start` 之后，`## 状态检测` 之前添加以下内容：

```markdown
## 格式化工具函数

项目提供了终端格式化工具函数，用于生成格式化的输出，避免手绘 Unicode 表格导致的错位问题。

**可用函数：**
- `boxPanel(content, opts?)` — 生成带标题的面板
- `tableWithBorder(headers, rows, opts?)` — 生成带边框的表格
- `statusLine(label, value, status)` — 生成状态行
- `progressBar(value, total, width?)` — 生成进度条

**使用方式：**
```typescript
import { boxPanel, tableWithBorder, statusLine, progressBar } from "../../utils/format.js";

// 生成面板
console.log(boxPanel("内容", { title: "标题" }));

// 生成表格
console.log(tableWithBorder(["列1", "列2"], [["值1", "值2"]]));

// 生成状态行
console.log(statusLine("Node.js", "v22.22.2", "success"));

// 生成进度条
console.log(progressBar(75, 100));
```

**最佳实践：**
- 使用 boxPanel 代替手绘的 Unicode 表格
- 使用 tableWithBorder 代替手绘的表格
- 使用 statusLine 显示状态信息
- 使用 progressBar 显示进度
```

- [ ] **Step 2: 验证修改**

检查 start.md 文件内容是否正确添加。

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/start.md
git commit -m "docs: add formatting function reference to start.md"
```

---

### Task 2: 在其他 skill 文件中添加格式化函数的说明

**Files:**
- Modify: `commands/alloy/plan.md`
- Modify: `commands/alloy/apply.md`
- Modify: `commands/alloy/archive.md`
- Modify: `commands/alloy/finish.md`
- Modify: `commands/alloy/fix.md`
- Modify: `commands/alloy/discard.md`
- Modify: `commands/alloy/status.md`

- [ ] **Step 1: 在 plan.md 中添加格式化函数的说明**

在 `# alloy-plan` 之后，第一个 `##` 章节之前添加以下内容：

```markdown
## 格式化工具函数

项目提供了终端格式化工具函数，用于生成格式化的输出，避免手绘 Unicode 表格导致的错位问题。

**可用函数：**
- `boxPanel(content, opts?)` — 生成带标题的面板
- `tableWithBorder(headers, rows, opts?)` — 生成带边框的表格
- `statusLine(label, value, status)` — 生成状态行
- `progressBar(value, total, width?)` — 生成进度条

**使用方式：**
```typescript
import { boxPanel, tableWithBorder, statusLine, progressBar } from "../../utils/format.js";

// 生成面板
console.log(boxPanel("内容", { title: "标题" }));

// 生成表格
console.log(tableWithBorder(["列1", "列2"], [["值1", "值2"]]));

// 生成状态行
console.log(statusLine("Node.js", "v22.22.2", "success"));

// 生成进度条
console.log(progressBar(75, 100));
```

**最佳实践：**
- 使用 boxPanel 代替手绘的 Unicode 表格
- 使用 tableWithBorder 代替手绘的表格
- 使用 statusLine 显示状态信息
- 使用 progressBar 显示进度
```

- [ ] **Step 2: 在 apply.md 中添加格式化函数的说明**

在 `# alloy-apply` 之后，第一个 `##` 章节之前添加同样的内容。

- [ ] **Step 3: 在 archive.md 中添加格式化函数的说明**

在 `# alloy-archive` 之后，第一个 `##` 章节之前添加同样的内容。

- [ ] **Step 4: 在 finish.md 中添加格式化函数的说明**

在 `# alloy-finish` 之后，第一个 `##` 章节之前添加同样的内容。

- [ ] **Step 5: 在 fix.md 中添加格式化函数的说明**

在 `# alloy-fix` 之后，第一个 `##` 章节之前添加同样的内容。

- [ ] **Step 6: 在 discard.md 中添加格式化函数的说明**

在 `# alloy-discard` 之后，第一个 `##` 章节之前添加同样的内容。

- [ ] **Step 7: 在 status.md 中添加格式化函数的说明**

在 `# alloy-status` 之后，第一个 `##` 章节之前添加同样的内容。

- [ ] **Step 8: 验证修改**

检查所有 skill 文件内容是否正确添加。

- [ ] **Step 9: Commit**

```bash
git add commands/alloy/plan.md commands/alloy/apply.md commands/alloy/archive.md commands/alloy/finish.md commands/alloy/fix.md commands/alloy/discard.md commands/alloy/status.md
git commit -m "docs: add formatting function reference to all skill files"
```

---

### Task 3: 验证和清理

**Files:**
- None (verification only)

- [ ] **Step 1: 运行测试**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: 运行构建**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: 验证 skill 文件**

检查所有 skill 文件是否正确添加了格式化函数的说明。

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify formatting function reference implementation"
```

---

## 完成

实现计划完成。在所有 skill 文件中添加了格式化函数的说明和示例，包括：
- `commands/alloy/start.md`
- `commands/alloy/plan.md`
- `commands/alloy/apply.md`
- `commands/alloy/archive.md`
- `commands/alloy/finish.md`
- `commands/alloy/fix.md`
- `commands/alloy/discard.md`
- `commands/alloy/status.md`

Agent 在执行任何 skill 文件时，都会看到格式化函数的说明，并知道使用这些函数代替手绘的 Unicode 表格。
