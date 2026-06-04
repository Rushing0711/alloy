# 格式化指南 Skill 设计

## Why

Agent 在输出表格和面板时，使用手绘的 Unicode 表格会导致错位问题，特别是包含中文字符时。需要创建一个格式化指南 skill，让 agent 知道并使用项目中已有的格式化工具函数。

## What

创建 `commands/alloy/formatting.md` skill 文件，提供格式化函数的使用指南，让 agent 在需要时加载并使用。

## 关键决策

### 1. Skill 文件结构

```markdown
---
name: "Alloy: Formatting"
description: 终端格式化工具函数指南
category: Utility
tags: [alloy, formatting, terminal]
---

# alloy-formatting

## 可用函数

### boxPanel(content, opts?)
生成带标题的面板。

### tableWithBorder(headers, rows, opts?)
生成带边框的表格。

### statusLine(label, value, status)
生成状态行。

### progressBar(value, total, width?)
生成进度条。

## 使用示例

### 基本用法
[示例代码]

### 复杂场景
[示例代码]

## 最佳实践

- 使用 boxPanel 代替手绘的 Unicode 表格
- 使用 tableWithBorder 代替手绘的表格
- 使用 statusLine 显示状态信息
- 使用 progressBar 显示进度
```

### 2. Agent 使用方式

Agent 可以通过以下方式使用：
- 在 skill 文件中直接调用格式化函数
- 在需要时加载 `/alloy:formatting` 获取指南

### 3. 与现有 skill 的关系

- 不修改现有的 skill 文件
- 格式化指南 skill 是独立的，可以随时加载
- 现有 skill 文件中的手绘表格可以逐步替换

## 范围与边界

**本次修改：**
- 创建 `commands/alloy/formatting.md` skill 文件
- 更新测试文件（如果需要）

**不在范围内：**
- 修改现有的 skill 文件
- 修改 agent 的系统提示

## 测试策略

- 验证 skill 文件可以正确加载
- 验证格式化函数可以正确调用
