# 格式化函数引用设计

## Why

Agent 在输出表格和面板时，使用手绘的 Unicode 表格会导致错位问题，特别是包含中文字符时。需要在 skill 文件中告诉 agent 使用格式化函数，而不是手绘表格。

## What

在 start.md 和其他 skill 文件中添加格式化函数的说明和示例，让 agent 知道并使用这些函数。

## 关键决策

### 1. 引用方式

在 start.md 的开头添加格式化函数的说明，告诉 agent：
1. 项目提供了格式化工具函数
2. 使用这些函数代替手绘的 Unicode 表格
3. 提供使用示例

具体位置：在 `# alloy-start` 之后，`## 状态检测` 之前添加。

### 2. 说明内容

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

### 3. 手绘表格的处理

**不替换**现有的手绘表格，而是在说明中告诉 agent 使用格式化函数。这样：
1. 保持现有 skill 文件的稳定性
2. Agent 可以根据需要选择使用格式化函数或手绘表格
3. 逐步迁移，而不是一次性替换

### 4. 其他 skill 文件的处理

在其他 skill 文件（如 plan.md、apply.md 等）中也添加类似的说明，保持一致性。

## 范围与边界

**本次修改：**
- 修改 `commands/alloy/start.md`，添加格式化函数的说明
- 修改其他 skill 文件，添加格式化函数的说明
- 更新测试文件（如果需要）

**不在范围内：**
- 替换现有的手绘表格
- 修改 agent 的系统提示

## 测试策略

- 验证 skill 文件可以正确加载
- 验证格式化函数可以正确调用
- 验证 agent 可以理解并使用格式化函数
