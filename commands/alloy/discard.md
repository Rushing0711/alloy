---
name: "Alloy: Discard"
description: Alloy 放弃 change - 需要放弃时调用
category: Workflow
tags: [alloy, workflow]
spec: 01-product-spec/07-discard-spec.md
behaviors:
  preconditions: 1
  hard_stops:    1
  user_gates:    1
  warns:         0
  artifacts: []
  transitions_to: ""
  external_calls: []
---

# alloy-discard

你是 Alloy 的放弃清理器。你的职责是：根据 change 的当前 phase 执行分级清理，确保用户明确确认后再删除。

**核心原则：软删除（移到 archive/）而非物理删除，保留完整审计链，允许误删后恢复。**

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
| started / planned | `git checkout <main_branch>` + `git branch -D <feature_branch>` + 软删除 → `archive/` |
| applied / archived | `git worktree remove` + `git checkout <main_branch>` + `git branch -D <feature_branch>` + 软删除 → `archive/` |
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
将软删除以下内容（移到 archive/ 保留审计链，可手动恢复）:

  Change:        <name>
  Phase:         <phase>
  Feature 分支:  <feature_branch>（如有）
  Worktree:      <path>（如有）
  目录:          openspec/changes/<name>/ → archive/YYYY-MM-DD-discard-<name>/
  切回分支:      <main_branch>（如有）

输入 'discard <name>' 确认，或输入其他任意内容取消。
```

**什么算"用户确认了"（反例）：**
- 用户说"好"——不算，需要精确输入 `discard <name>`
- 用户说"删吧"——不算，同上
- 用户说"y"——不算，需要完整匹配
- 用户说"嗯"——不算，中文里可以表示"知道了"而非"确认执行"
- 用户说"删了吧"——不算，虽然语义明确但不够精确，仍需要完整匹配

只有用户精确输入 `discard <name>` 后才执行清理。精确匹配是故意的——防止手滑删除。

### Red Flags——STOP，不可跳过闸门

| 借口 | 现实 |
|------|------|
| "就删个目录而已，y 就行了" | 即使软删除可恢复，确认步骤不可跳过。`discard <name>` 的精确匹配是防手滑的最后一道防线。"y"、"好"、"删了吧"都不算。 |
| "这个 change 已完成，直接删了吧" | finished 是终态——不可 discard。已完成的 change 有完整审计链，删除会破坏追溯性。 |
| "不用列出清单了，我知道有什么" | 必须先展示六行删除清单（Change/Phase/分支/Worktree/目录/切回分支），让用户确认每个待删除项的完整性和正确性。 |
| "不用按顺序清理，直接 rm -rf 就行了" | 清理必须按序：worktree remove → checkout main → branch -D → mv 到 archive。rm -rf 不可恢复，软删除保留审计链。 |

---

## 确认后清理

**执行顺序（必须按序）：**

```bash
# 1. 清理该 change 的所有 checkpoint tag（plan 阶段检查点，change 放弃后无意义）
alloy _checkpoint clean openspec/changes/<name>

# 2. git worktree remove（如存在且 phase ≥ applied）
git worktree remove <path> --force

# 3. git checkout <main_branch>（切离要删的分支）
git checkout <main_branch>

# 4. git branch -D <feature_branch>
git branch -D <feature_branch>

# 5. 软删除——移动到 archive/ 保留审计链
DISCARD_DIR="openspec/changes/archive/$(date +%Y-%m-%d)-discard-<name>"
mkdir -p openspec/changes/archive/
mv openspec/changes/<name>/ "$DISCARD_DIR"

# 6. 记录 discarded_at 时间戳
alloy _state merge "$DISCARD_DIR" phase_timings "{\"discarded_at\":\"$(date '+%Y-%m-%d %H:%M:%S')\"}"
```

若 `main_branch` 未记录，跳过步骤 3，提示用户手动切回主分支。
若 `feature_branch` 未记录，跳过步骤 4。

---

### 完成

```
Alloy · 放弃 Change — DONE
──────────────────────────────────────

✓ <name> 已软删除
  分支/worktree：已清理
  归档位置：archive/YYYY-MM-DD-discard-<name>/
  恢复方式：mv 回 openspec/changes/<name>/ 即可恢复
  当前分支：<main_branch>（或提示用户手动切换）
```
