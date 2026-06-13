# Alloy 技能闸门加固设计

> 日期：2026-06-12
> 目标：修复 Agent 跳过关键步骤的问题，系统性加固所有技能的交互闸门
> 范围：7 个技能文件，13 处闸门补强

---

## 问题根因

三类闸门缺失模式：

1. **外部调用无结果确认**（4 处）——调用外部技能/命令后假设成功直接继续
2. **破坏性操作无闸门**（4 处）——合并、删除、commit 等不可逆操作前无确认
3. **Agent 自判断跳过**（4 处）——允许 Agent 自行判断是否跳过某步骤

外加 1 处 Red Flags 缺失。

---

## 修复清单

### P0：用户反馈

#### P0-1. archive.md — Delta Spec 合并审查闸门

**位置：** Step 2/3，`/opsx:archive` 调用之后

**当前：** 调用 `/opsx:archive` 后直接继续，无确认。

**修复：** 在 `/opsx:archive` 返回后、归档变更提交前，加 🔴 STOP 审查 Delta Spec 合并结果：

```
> Delta Spec 合并结果：
> [展示被合并的 spec 文件变更摘要]
> 🔴 STOP: 确认 Delta Spec 合并结果（确认并继续 / 需要调整）
```

- 选 (a)：继续提交归档变更
- 选 (b)：调整 spec 合并内容（不编辑归档文件，而是回到 `/opsx:archive` 参数调整或手动修正 spec）

**Red Flags 补充（archive.md）：**

| 借口 | 现实 |
|------|------|
| "spec 合并看起来没问题，直接继续" | 没看过的 spec 变更 = 代码与规格可能已分叉。审查只需 1 分钟，修复分叉需要 1 小时。 |

---

#### P0-2. plan.md — 需求变更回溯闸门

**位置：** 审查窗口选 (b) 后，需求变更判断处

**当前：** 判断为需求变更后"直接执行回溯清理"，加载 brainstorming 重新讨论。无 🔴 STOP 确认。

**修复：** 判断为需求变更后，🔴 STOP 双选项：

```
> 检测到需求变更：<用户提出的变更摘要>
> 🔴 STOP: 选择处理路径
> (a) 回溯到 brainstorming 重新讨论（删除所有 plan 制品，保留 draft.md）
> (b) 取消调整，继续当前审查
```

- 选 (a)：执行回溯清理（plan-rollback.md 需求变更路径）→ 加载 `superpowers:brainstorming`
- 选 (b)：回到审查窗口，重新展示制品内容

**Red Flags 补充（plan.md）：**

| 借口 | 现实 |
|------|------|
| "用户说了要改，我直接回溯吧" | 回溯是不可逆操作——删除所有 plan 制品。必须让用户看到两条路径的后果后主动选择。 |
| "需求变更和轻量修正差不多" | 需求变更 = 删除全部 plan 制品重新来，轻量修正 = 只重置一个制品。后果完全不同。 |

---

### P1：高严重度

#### P1-1. apply.md — 需求变更闸门补强

**位置：** "需求变更闸门"段落

**当前：** 标题叫"闸门"但无 🔴 STOP。两处分支（回溯 / 开新 change）都无确认。

**修复：** 在判断分支前加 🔴 STOP：

- 未编码（全部 unchecked）时：
  ```
  > 检测到需求变更，tasks 尚未编码
  > 🔴 STOP: 确认处理路径
  > (a) 回溯清理 plan 制品，回到 brainstorming
  > (b) 取消变更，继续 apply
  ```

- 已编码（有 [x]）时：
  ```
  > 检测到需求变更，tasks 已有编码完成项
  > 🔴 STOP: 确认处理路径
  > (a) 开新 change 处理变更（引导 /alloy:start <建议名称>）
  > (b) 取消变更，继续 apply
  ```

---

#### P1-2. archive.md — worktree 合并审查闸门

**位置：** Worktree 清理代码块，merge 成功后

**当前：** merge 成功后直接 `git worktree remove` + `git branch -d`，无确认。

**修复：** merge 成功后、清理前加 🔴 STOP：

```
> worktree 合并完成：
> [展示 merge 的 commit 列表：git log --oneline <FEATURE_BRANCH>..HEAD]
> 🔴 STOP: 确认合并结果（确认并清理 worktree / 需要检查）
```

- 选 (a)：执行 `git worktree remove` + `git branch -d`
- 选 (b)：暂停，提示用户检查后再继续

---

#### P1-3. start.md — 接续路由确认闸门

**位置：** 接续场景路由表

**当前：** phase=planned/applied/archived 时自动跳转到对应阶段，无确认。

**修复：** 所有非 started 阶段的自动跳转前加 🔴 STOP：

```
> 检测到活跃 change：<name>（phase: <phase>）
> 🔴 STOP: 选择操作
> (a) 进入 <目标阶段> 继续
> (b) 查看状态（/alloy:status）
> (c) 放弃此 change（/alloy:discard）
```

phase=started + proposal.md 存在时也加确认：
```
> 检测到活跃 change：<name>（phase: started，已有 plan 制品）
> 🔴 STOP: 选择操作
> (a) 继续规划（/alloy:plan）
> (b) 回到需求讨论（重新运行 start）
> (c) 查看状态
```

---

#### P1-4. archive.md — memory 写入确认闸门

**位置：** retrospective.md §6 Promote Candidates 处理

**当前：** 标记条目后直接写入 `~/.claude/memory/`，无确认。

**修复：** 写入前加 🔴 STOP：

```
> 以下 retrospective 条目标记为 Promote to memory：
> [列出待写入条目及内容摘要]
> 🔴 STOP: 确认 memory 写入
> (a) 确认写入
> (b) 调整（选择要排除的条目）
> (c) 跳过 memory 写入
```

---

### P2：中严重度

#### P2-1. fix.md — 场景 1/2 commit 前审查闸门

**位置：** 场景 1 和场景 2 的 `git commit` 之前

**当前：** TDD + verification 后直接精确提交，无用户确认。

**修复：** commit 前加 🔴 STOP：

```
> 修复内容：
> [展示 git diff --stat 和关键变更摘要]
> 🔴 STOP: 确认修复内容（确认提交 / 需要调整）
```

---

#### P2-2. apply.md — retrospective 跳过确认闸门

**位置：** "单 commit 小修可跳过"规则

**当前：** Agent 自行判断是否跳过 retrospective。

**修复：** 改为 🔴 STOP 确认：

```
> 当前为单 commit 小修，可选跳过 retrospective
> 🔴 STOP: 是否跳过 retrospective？
> (a) 跳过（写入 'Skipped: single-commit fix, no insights'）
> (b) 正常生成 retrospective
```

---

#### P2-3. plan.md — 全部制品 done 确认闸门

**位置：** 制品进度扫描返回全部 done 时

**当前：** 直接推进 phase 到 Step 3/3。

**修复：** 全部 done 时加 🔴 STOP：

```
> 所有制品已锁定（proposal ✓ design ✓ specs ✓ tasks ✓ plans ✓）
> 🔴 STOP: 确认推进到完成步骤
> (a) 确认，推进 phase
> (b) 重新审查某个制品（指定制品名）
```

---

#### P2-4. archive.md — commit 失败 HARD STOP

**位置：** 归档阶段 commit

**当前：** "commit 失败必须阻断"仅为文字描述。

**修复：** 改为显式 HARD STOP 标记：

```
git commit 返回非零 → HARD STOP：归档 commit 失败，检查 git 状态后重试。
禁止在 commit 失败时继续执行后续步骤。
```

---

#### P2-5. start.md — /opsx:new 结果验证

**位置：** 步骤 4 `/opsx:new` 调用后

**当前：** 假设成功直接执行步骤 5-9。

**修复：** 步骤 4 后加验证：

```bash
# 验证 change 目录创建成功
[ -d "openspec/changes/<name>/.alloy.yaml" ] || HARD STOP: /opsx:new 创建失败——目录或配置文件缺失
```

---

### P3：低严重度

#### P3-1. finish.md — PR 审查 spec 变更判断闸门

**位置：** PR 审查反馈处理规范

**当前：** "spec 变更 = 新 change"只是文字规则，无闸门。

**修复：** 处理 PR 审查反馈涉及代码修改时，加判断提示：

```
> 代码修改可能影响 spec 行为
> 🔴 STOP: 此修改是否需要 spec 变更？
> (a) 不需要，仅代码调整
> (b) 需要 → 开新 change（/alloy:start）
```

---

#### P3-2. start.md — 自由探索后重载闸门

**位置：** 自由探索场景，用户提出 topic 后

**当前：** 文字要求用户重新调用 `/alloy:start <topic>`，但无闸门防止 Agent 直接进入流程。

**修复：** 自由探索发现用户有明确 topic 后，🔴 STOP：

```
> 🔴 STOP: 检测到明确功能需求，请选择：
> (a) 以 "<topic>" 进入全新开始（重新加载 /alloy:start <topic>）
> (b) 继续自由探索
```

选 (a) 时输出：`请输入 /alloy:start <topic> 正式开始`，Agent 不得直接跳转。

---

## 修改文件清单

| 文件 | 修复项 |
|------|--------|
| `commands/alloy/archive.md` | P0-1, P1-2, P1-4, P2-4 |
| `commands/alloy/plan.md` | P0-2, P2-3 |
| `commands/alloy/apply.md` | P1-1, P2-2 |
| `commands/alloy/start.md` | P1-3, P2-5, P3-2 |
| `commands/alloy/fix.md` | P2-1 |
| `commands/alloy/finish.md` | P3-1 |

共 6 个文件，13 处修复。
