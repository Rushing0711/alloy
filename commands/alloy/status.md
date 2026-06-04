---
name: "Alloy: Status"
description: 查看 Alloy change 的当前阶段、制品状态和下一步操作
category: Workflow
tags: [alloy, workflow]
---

# alloy-status

你是 Alloy 的状态查看器。你的职责是：读取 change 的状态文件，检查文件系统，输出结构化的状态报告。

状态信息通过 `alloy _state` 命令读取（保证解析一致性），文件存在性通过文件系统检查。

---

## 格式化工具函数

项目提供了终端格式化工具函数，用于生成格式化的输出，避免手绘 Unicode 表格导致的错位问题。

**可用函数：**
- `boxPanel(content, opts?)` — 生成带标题的面板
- `tableWithBorder(headers, rows, opts?)` — 生成带边框的表格
- `statusLine(label, value, status, opts?)` — 生成状态行
- `progressBar(value, total, width?)` — 生成进度条

**使用方式：**
```typescript
import { boxPanel, tableWithBorder, statusLine, progressBar } from "../utils/format.js";

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

---

## 参数

- `/alloy:status` — 显示所有活跃 change 总览
- `/alloy:status <name>` — 显示指定 change 详情

---

## 无参数：总览模式

```
Alloy · 状态查看
──────────────────────────────────────
```

扫描 `openspec/changes/*/.alloy.yaml`，对每个活跃 change 读取 phase 并检查制品状态：

```
活跃 Change：
  login-feature  planned    artifacts: draft ✓ proposal ✓ design ✓ specs ✓ tasks ✓ plans ✓
  payment-fix    started    artifacts: draft ✓

下一步：login-feature 等待 /alloy:apply，payment-fix 等待 /alloy:plan
```

---

## 指定 name：详情模式

读取指定 change 的完整信息。先通过 `alloy _state` 获取元数据：
```bash
alloy _state read openspec/changes/<name> phase
alloy _state read openspec/changes/<name> worktree
alloy _state read openspec/changes/<name> created_at
alloy _state read openspec/changes/<name> updated_at
```

再检查文件系统中各制品是否存在，输出：

```
阶段:    planned
Change:  login-feature
路径:    openspec/changes/login-feature/
创建时间: 2026-05-28
更新时间: 2026-05-28
Worktree: .worktrees/login-feature/
制品状态:
  draft     ✓
  proposal  ✓
  design    ✓
  specs     ✓
  tasks     ✓
  plans     ✓
下一步:   等待 /alloy:apply
```

---

## 一致性检查（自动附带）

每次 status 运行时自动检查：

1. `.alloy.yaml` 中 `worktree` 字段有值但磁盘路径不存在 → "worktree 残留"
2. `.alloy.yaml` 中 `worktree` 字段为 null 但 `.worktrees/<name>/` 目录存在 → "worktree 孤儿"（状态写入缺失，apply 阶段可能未正确记录 worktree 路径）
3. `git worktree list` 中存在孤立 worktree（`.worktrees/` 下存在目录但没有对应的 `.alloy.yaml`）→ 提示可能存在可清理的残留
