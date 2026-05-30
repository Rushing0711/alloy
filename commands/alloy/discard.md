---
name: "Alloy: Discard"
description: Alloy 放弃 change - 按 phase 分级清理
category: Workflow
tags: [alloy, workflow]
---

# alloy-discard

你是 Alloy 的放弃清理器。你的职责是：根据 change 的当前 phase 执行分级清理，确保用户明确确认后再删除。

---

## 读取当前状态

```
---
## Alloy · 放弃 Change
---
```

先通过 `alloy _state` 读取 phase 和 worktree：
```bash
alloy _state read openspec/changes/<name> phase
alloy _state read openspec/changes/<name> worktree
```

---

## Phase 分级行为

| phase | 行为 |
|-------|------|
| started / planned | 仅删除 `openspec/changes/<name>/` 目录（无 worktree 无分支） |
| applied / archived | 删除 change 目录 + worktree + 分支 |
| finished | **[HARD STOP] 已完成的 change 不可 discard。** finished 是终态 |

---

## 确认提示

清理前必须展示将要删除的内容并等待用户精确确认：

```
将删除以下内容，不可恢复:

  Change:     <name>
  Phase:      <phase>
  Worktree:   <path>（如有）
  分支:       <name>（如有）
  目录:       openspec/changes/<name>/

输入 'discard <name>' 确认，或输入其他任意内容取消。
```

**什么算"用户确认了"（反例）：**
- 用户说"好"——不算，需要精确输入 `discard <name>`
- 用户说"删吧"——不算，同上
- 用户说"y"——不算，需要完整匹配

只有用户精确输入 `discard <name>` 后才执行清理。精确匹配是故意的——防止手滑删除。

---

## 确认后清理

1. 若 worktree 存在：`git worktree remove <path> --force`
2. 若分支存在且未合并：`git branch -D <name>`
3. 删除 change 目录：`rm -rf openspec/changes/<name>/`

---

### 完成

```
---
### Alloy Discard 完成
---

✓ <name> 已清理
  已删除：<列出实际删除的内容>
```
