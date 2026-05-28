---
name: alloy-status
description: 查看 Alloy change 的当前阶段、制品状态和下一步操作
---

# alloy-status

```
---
## Alloy · 状态查看
---
```

## 参数

- `/alloy-status` — 显示所有活跃 change 总览
- `/alloy-status <name>` — 显示指定 change 详情

## 无参数：总览模式

扫描 `openspec/changes/*/.alloy.yaml`，输出表格：

```
活跃 Change：
  login-feature  planned    artifacts: draft ✓ proposal ✓ design ✓ specs ✓ tasks ✓ plan ✓
  payment-fix    started    artifacts: draft ✓

下一步：login-feature 等待 /alloy-apply，payment-fix 等待 /alloy-plan
```

## 指定 name：详情模式

输出指定 change 的完整信息：

```
阶段:    planned
Change:  login-feature
路径:    openspec/changes/login-feature/
制品状态:
  draft     ✓
  proposal  ✓
  design    ✓
  specs     ✓
  tasks     ✓
  plan      ✓
下一步:   等待 /alloy-apply
```

## 一致性检查（自动附带）

每次 status 运行时自动检查：

1. `worktree` 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留：.alloy.yaml 声称 worktree 存在但路径不可达"
2. `git worktree list` 中有孤立 worktree（没有对应 .alloy.yaml 的）→ ⚠️ 提示可能的清理项
