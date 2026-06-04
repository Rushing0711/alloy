---
name: "Alloy: Discard"
description: Alloy 放弃 change - 需要放弃时调用
category: Workflow
tags: [alloy, workflow]
---

# alloy-discard

你是 Alloy 的放弃清理器。你的职责是：根据 change 的当前 phase 执行分级清理，确保用户明确确认后再删除。

每个 change 必须有独立的 feature 分支（start step 6 保证），discard 时可安全删除整个分支。

---

## 读取当前状态

```
Alloy · 放弃 Change
──────────────────────────────────────
```

读取必要信息：
```bash
alloy _state read openspec/changes/<name> phase
alloy _state read openspec/changes/<name> worktree
alloy _state read openspec/changes/<name> feature_branch
alloy _config read . main_branch
```

---

## Phase 分级行为

| phase | 清理动作 |
|-------|---------|
| started / planned | `git checkout <main_branch>` + `git branch -D <feature_branch>` + `rm change 目录` |
| applied / archived | `git worktree remove` + `git checkout <main_branch>` + `git branch -D <feature_branch>` + `rm change 目录` |
| finished | **[HARD STOP] 已完成的 change 不可 discard。** finished 是终态 |

---

## 安全兜底

- `feature_branch` == `main_branch` → 不删分支（理论上不会发生，start step 6 已拦截）
- `main_branch` 未记录 → 提示用户手动切回主分支，不执行 `git checkout`
- `feature_branch` 未记录 → 仅删除 worktree 和 change 目录，不删分支

---

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

**什么算"用户确认了"（反例）：**
- 用户说"好"——不算，需要精确输入 `discard <name>`
- 用户说"删吧"——不算，同上
- 用户说"y"——不算，需要完整匹配

只有用户精确输入 `discard <name>` 后才执行清理。精确匹配是故意的——防止手滑删除。

---

## 确认后清理

**执行顺序（必须按序）：**

```bash
# 1. git worktree remove（如存在且 phase ≥ applied）
git worktree remove <path> --force

# 2. git checkout <main_branch>（切离要删的分支）
git checkout <main_branch>

# 3. git branch -D <feature_branch>
git branch -D <feature_branch>

# 4. rm -rf openspec/changes/<name>/
rm -rf openspec/changes/<name>/
```

若 `main_branch` 未记录，跳过步骤 2，提示用户手动切回主分支。
若 `feature_branch` 未记录，跳过步骤 3。

---

### 完成

```
Alloy · 放弃 Change — DONE
──────────────────────────────────────

✓ <name> 已清理
  已删除：<列出实际删除的内容（分支/worktree/目录）>
  当前分支：<main_branch>（或提示用户手动切换）
```
