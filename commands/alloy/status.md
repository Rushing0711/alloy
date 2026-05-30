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

## 参数

- `/alloy:status` — 显示所有活跃 change 总览
- `/alloy:status <name>` — 显示指定 change 详情

---

## 无参数：总览模式

```
---
## Alloy · 状态查看
---
```

扫描 `openspec/changes/*/.alloy.yaml`，对每个活跃 change 读取 phase 并检查制品状态：

```
活跃 Change：
  login-feature  planned    artifacts: draft ✓ proposal ✓ design ✓ specs ✓ tasks ✓ plan ✓
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
  plan      ✓
下一步:   等待 /alloy:apply
```

---

## 一致性检查（自动附带）

每次 status 运行时自动检查：

1. `.alloy.yaml` 中 `worktree` 字段有值但磁盘路径不存在 → "worktree 残留：.alloy.yaml 声称 worktree 在 `<path>` 但路径不可达"
2. `git worktree list` 中存在孤立 worktree（`.worktrees/` 下存在目录但没有对应的 `.alloy.yaml`）→ 提示可能存在可清理的残留
