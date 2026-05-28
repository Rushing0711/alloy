---
name: alloy-discard
description: Alloy 放弃 change - 按 phase 分级清理
---

# alloy-discard

## Phase 行为

| phase | 行为 |
|-------|------|
| started / planned | 仅删除 `openspec/changes/<name>/` 目录 |
| applied / finished | 删除 change 目录 + worktree + 分支 |
| finished（已 merge） | 警告 "代码已合入 main，仅清理 change 目录，不撤销 merge" |
| archived | **[HARD STOP] 已归档的 change 不可 discard** |

## 确认提示

```
将删除以下内容，不可恢复:
  - Change: <name>
  - Worktree: <path>（如有）
  - Branch: <name>（如有）
  - 目录: <change dir>
  输入 'discard <name>' 确认
```

## 确认后清理

1. `git worktree remove <path> --force`（如有）
2. `git branch -D <name>`（如有且未合并）
3. `rm -rf openspec/changes/<name>/`
