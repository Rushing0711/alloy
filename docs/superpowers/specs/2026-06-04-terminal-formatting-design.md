# 终端格式化工具函数设计

## Why

Agent 在输出复杂表格和面板时，使用手绘的 Unicode 表格会导致错位问题，特别是包含中文字符时。需要提供统一的格式化工具函数，让 agent 可以轻松生成格式化的输出。

## What

在 `src/utils/format.ts` 中添加格式化工具函数，支持：
- 带标题的面板
- 带边框的表格
- 状态行
- 进度条

所有函数都使用 `string-width` 来正确计算字符宽度，确保中文字符不会导致错位。

## 关键决策

### 1. 函数设计

```typescript
interface BoxOptions {
  padding?: number;        // 内边距，默认 1
  margin?: number;         // 外边距，默认 0
  width?: number;          // 固定宽度，默认自动计算
  title?: string;          // 标题
  titleAlignment?: "left" | "center" | "right";  // 标题对齐，默认 "left"
}

interface TableOptions {
  width?: number;          // 固定宽度，默认自动计算
  headerStyle?: string;    // 表头样式，默认 "cyan"
  borderStyle?: string;    // 边框样式，默认 "gray"
}

interface StatusOptions {
  icon?: string;           // 图标，默认根据 status 自动生成
  width?: number;          // 固定宽度
}

// 核心函数
export function boxPanel(content: string, opts?: BoxOptions): string
export function tableWithBorder(headers: string[], rows: string[][], opts?: TableOptions): string
export function statusLine(label: string, value: string, status: "success" | "warning" | "error", opts?: StatusOptions): string
export function progressBar(value: number, total: number, width?: number): string
```

### 2. 实现细节

- 使用 `string-width` 计算字符宽度（正确处理中文）
- 使用 `boxen` 生成面板
- 使用 `cli-table3` 生成表格
- 自动检测终端宽度，避免超出

### 3. Agent 使用示例

```typescript
// 在 skill 文件中，agent 可以这样使用：
import { boxPanel, tableWithBorder, statusLine } from "../../utils/format.js";

// 生成面板
const panel = boxPanel("待办事项应用", "内容...");

// 生成表格
const table = tableWithBorder(
  ["范围", "功能"],
  [["最小", "添加 ✓ 完成 ✓ 删除 ✓"]]
);

// 组合输出
console.log(panel);
console.log(table);
```

## 范围与边界

**本次修改：**
- 修改 `src/utils/format.ts`，添加格式化工具函数
- 更新测试文件
- 更新文档

**不在范围内：**
- 修改 agent 的 skill 文件（后续单独规划）
- 修改 agent 的系统提示（后续单独规划）

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

## 测试策略

- 单元测试：测试每个格式化函数的输出
- 集成测试：测试函数组合使用
- 边界测试：测试中文字符、超长文本、空内容等场景
