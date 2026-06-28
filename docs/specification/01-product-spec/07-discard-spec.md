---
behaviors:
  preconditions: 1
  hard_stops:    1
  user_gates:    1
  warns:         0
  artifacts: []
  transitions_to: ""
  external_calls: []
---

# alloy discard 行为规格

详见 skill 文件：`commands/alloy/discard.md`

## 命令格式

```
/alloy:discard [name]（省略时从当前活跃 change 推断）
```

## Phase 分级行为

| phase | 清理动作 |
|-------|---------|
| started / planned | `git checkout <main_branch>` + `git branch -D <feature_branch>` + `rm change 目录` |
| applied / archived | `git worktree remove` + `git checkout <main_branch>` + `git branch -D <feature_branch>` + `rm change 目录` |
| finished | **[HARD STOP] 已完成的 change 不可 discard。** finished 是终态 |

## 安全兜底

- `feature_branch` == `main_branch` → 不删分支（理论上不会发生，start step 6 已拦截）
- `main_branch` 未记录 → 提示用户手动切回主分支，不执行 `git checkout`
- `feature_branch` 未记录 → 仅删除 worktree 和 change 目录，不删分支

## 确认提示

清理前必须展示将要删除的内容并等待用户精确确认：

```
将删除以下内容，不可恢复:

  Change:        <name>
  Phase:         <phase>
  Feature 分支:  <feature_branch>（如有）
  Worktree:      <path>（如有）
  目录:          openspec/changes/<name>/
  切回分支:      <main_branch>（如有）

输入 'discard <name>' 确认，或输入其他任意内容取消。
```

只有用户精确输入 `discard <name>` 后才执行清理。精确匹配是故意的——防止手滑删除。

## 确认后清理（必须按序）

1. git worktree remove <path> --force（如存在且 phase ≥ applied）
2. git checkout <main_branch>（切离要删的分支）
3. git branch -D <feature_branch>
4. rm -rf openspec/changes/<name>/

若 `main_branch` 未记录，跳过步骤 2，提示用户手动切回主分支。
若 `feature_branch` 未记录，跳过步骤 3。
