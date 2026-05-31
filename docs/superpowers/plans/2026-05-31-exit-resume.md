# 退出接续 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户退出后随意打任何 alloy 命令都能自动接续，不依赖记忆。

**Architecture:** 两个简单改动——(1) precheck 不满足时自动路由到正确命令而非 HARD STOP；(2) apply 的 5 个步骤各自检查是否已完成，已完成则跳过。不引入新状态字段。

**Tech Stack:** Markdown (SKILL.md) — 只改命令文件，不涉及 TypeScript/CLI/schema。

---

## 文件结构

| 文件 | 改动内容 |
|------|---------|
| `commands/alloy/start.md` | 接续分支：phase 路由替代指路 |
| `commands/alloy/plan.md` | precheck 路由 + 制品扫描跳步 |
| `commands/alloy/apply.md` | precheck 路由 + 5 步骤幂等 |
| `commands/alloy/archive.md` | precheck 路由 |
| `commands/alloy/finish.md` | precheck 路由 |

---

### Task 1: `/alloy:start` — 接续时自动带路

**Files:**
- Modify: `commands/alloy/start.md`

将"接续（有 1 个活跃 change）"段的指路行为改为自动加载对应命令。

- [ ] **Step 1: 修改接续段——phase 路由表**

将当前 content（行 218-240，从 `### [Step 1/1] 状态展示与接续建议` 到 `| finished | 工作流已完成——如需继续修改，使用自然对话提交新变更 |`）替换为：

```markdown
### [Step 1/1] 状态展示与自动接续

先读取 `.alloy.yaml` 获取 phase 和 worktree 字段，再检查文件系统确认实际制品状态。

展示检测结果后，直接加载对应阶段命令继续执行：

| phase | 自动加载命令 |
|-------|-------------|
| started | alloy-plan |
| planned | alloy-apply |
| applied | alloy-archive |
| archived | alloy-finish |
| finished | 工作流已完成——如需继续修改，使用自然对话提交新变更 |

**实现方式：** 根据 phase 值，输出对应命令文件的完整指令（`commands/alloy/plan.md` / `apply.md` / `archive.md` / `finish.md`），将 change name 和检测到的进度信息作为上下文传入。Agent 无缝进入对应阶段。

一致性检查（双向）：
- worktree 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留：.alloy.yaml 声称有 worktree 但磁盘不存在"
- worktree 字段为 null 但 `.worktrees/<name>/` 目录存在 → ⚠️ "worktree 孤儿：磁盘存在 worktree 但 .alloy.yaml 未记录，建议手动验证并更新状态"
- 发现孤儿 worktree 时，询问用户是否修复 .alloy.yaml：`alloy _state write openspec/changes/<name> worktree ".worktrees/<name>"`
```

- [ ] **Step 2: 验证改动逻辑正确**

检查：
- phase=started → 输出 alloy-plan 指令
- phase=planned → 输出 alloy-apply 指令
- phase=applied → 输出 alloy-archive 指令
- phase=archived → 输出 alloy-finish 指令
- phase=finished → 输出完成信息
- 一致性检查逻辑保留

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/start.md
git commit -m "feat(start): 接续时自动加载对应阶段命令，不再指路"
```

---

### Task 2: `/alloy:plan` — precheck 路由 + 制品扫描跳步

**Files:**
- Modify: `commands/alloy/plan.md`

- [ ] **Step 1: 修改前置检查——phase 不匹配时路由而非 HARD STOP**

将当前 content 行 59-62（"若 change 目录不存在或 phase 不匹配"部分）替换为：

```markdown
**若 phase 不匹配（phase != started）：**

先读取当前 phase，按以下规则自动路由：

| 当前 phase | 行为 |
|-----------|------|
| planned | "plan 已完成，自动进入 /alloy:apply" → 加载 alloy-apply 指令 |
| applied | "已进入执行阶段，自动进入 /alloy:apply" → 加载 alloy-apply 指令 |
| archived | "已归档，自动进入 /alloy:finish" → 加载 alloy-finish 指令 |
| finished | "工作流已完成" → STOP |

**实现方式：** 输出对应命令文件的完整指令，将 change name 和当前进度信息作为上下文传入。

**若 change 目录不存在或 draft.md 缺失：**
→ 引导用户先运行 `/alloy:start <name>` 创建 change。这是唯一保留 HARD STOP 的场景——前序阶段完全没做。
```

- [ ] **Step 2: 制品生成前——扫描已完成制品，跳过**

在 "### 正常推进：逐个制品的审查流程" 小节（行 93）之前，插入制品扫描段落：

```markdown
### 制品进度扫描

在调用 `/opsx:continue` 之前，先扫描哪些制品已完成（文件存在 + hash 有效）：

```bash
# 扫描已完成制品
for artifact in proposal design specs tasks plans; do
  if alloy _record check openspec/changes/<name> "$artifact" 2>/dev/null; then
    echo "  $artifact ✓"
  else
    echo "  $artifact ✗"
  fi
done
```

已完成制品列表和首个缺失制品：

```
制品进度扫描:
  proposal  ✓ hash 有效 → 跳过
  design    ✓ hash 有效 → 跳过
  specs     ✗ → 从 specs 开始生成

→ /opsx:continue 从第一个缺失制品开始
```

制品全部完成（plans.md 存在且 hash 有效）→ phase 推进到 planned，提示下一步。
```

- [ ] **Step 3: 验证改动逻辑正确**

检查：
- phase=planned 时路由到 apply 而非报错
- phase=applied 时路由到 apply
- phase=archived 时路由到 finish
- change 不存在时仍 HARD STOP
- 制品扫描正确检测已完成的制品
- 制品全部完成时不重复生成

- [ ] **Step 4: Commit**

```bash
git add commands/alloy/plan.md
git commit -m "feat(plan): precheck 自动路由 + 制品扫描跳步"
```

---

### Task 3: `/alloy:apply` — precheck 路由 + 步骤幂等

**Files:**
- Modify: `commands/alloy/apply.md`

- [ ] **Step 1: 修改前置检查——phase 不匹配时路由而非 HARD STOP**

将当前的前置检查 2（行 30-33，"通过 `alloy _guard` 确认 change 的 phase 为 `planned`"）替换为：

```markdown
2. 通过 `alloy _guard` 确认 change 的 phase：
   ```bash
   alloy _guard openspec/changes/<name> applied
   ```
   若 guard 报错说明 phase 转换不合法——检查当前 phase：

   | 当前 phase | 行为 |
   |-----------|------|
   | started | "plan 尚未完成，自动进入 /alloy:plan" → 加载 alloy-plan 指令 |
   | planned | precheck 通过，继续执行 |
   | applied | precheck 通过（重入），步骤幂等处理断点 |
   | archived | "已归档，自动进入 /alloy:finish" → 加载 alloy-finish 指令 |
   | finished | "工作流已完成" → STOP |

   **实现方式：** 输出对应命令文件的完整指令，将 change name 和当前进度信息作为上下文传入。
```

- [ ] **Step 2: Step 1 worktree — 幂等**

在 `### [Step 1/5] 隔离环境设置` 小节开头加入幂等检查：

```markdown
### [Step 1/5] 隔离环境设置

**幂等检查：** 先读取 worktree 状态：
```bash
alloy _state read openspec/changes/<name> worktree
```

```
Step 1/5 进度检测:
  worktree 值: ".worktrees/<name>/" → 路径已存在 → ✓ 已完成，跳过此步骤
  worktree 值: null              → 用户选择不创建 → ✓ 已完成，跳过此步骤
  worktree 值: ".worktrees/<name>/" → 路径不存在 → ⚠️ 残留记录，重新创建
```

worktree 路径存在或为 null 时，直接跳过 Step 1，进入 Step 2。
```

- [ ] **Step 3: Step 2 任务实现 — TDD 天然幂等**

在 `### [Step 2/5] 任务实现` 小节开头加入提示：

```markdown
### [Step 2/5] 任务实现

**幂等检查：** 读取 `tasks.md`，扫描 checkbox 状态：

```
Step 2/5 进度检测:
  tasks.md: 3/7 已勾选 → 已完成的 task TDD 测试仍通过，自然跳过
                         → 从第 4 个 task 开始执行
  tasks.md: 7/7 已勾选 → ✓ 已完成，跳过此步骤
```

TDD 机制天然保证幂等——已实现的 task 对应测试已通过，重跑时自动跳过。无需额外检测。
```

- [ ] **Step 4: Step 4 制品验证 — 幂等**

在 `### Step 4/5：制品层验证` 小节开头加入幂等检查：

```markdown
### Step 4/5：制品层验证

**幂等检查：** 检查 verify.md 是否存在且 hash 有效：
```bash
alloy _record check openspec/changes/<name> verify 2>/dev/null && echo "VERIFY_DONE" || echo "VERIFY_NEEDED"
```

```
Step 4/5 进度检测:
  verify.md 存在 + hash 有效 → ✓ 已完成，跳过此步骤
  verify.md 缺失或 hash 无效 → 执行制品验证
```

verify.md 已完成时，跳过 Step 4，直接进入 Step 5。
```

- [ ] **Step 5: Step 5 复盘 — 幂等**

在 `### Step 5/5：复盘` 小节开头加入幂等检查：

```markdown
### Step 5/5：复盘

**幂等检查：** 检查 retrospective.md 是否存在且 hash 有效：
```bash
alloy _record check openspec/changes/<name> retrospective 2>/dev/null && echo "RETRO_DONE" || echo "RETRO_NEEDED"
```

```
Step 5/5 进度检测:
  retrospective.md 存在 + hash 有效 → ✓ 已完成，跳过此步骤
  retrospective.md 缺失或 hash 无效 → 执行复盘
```

retrospective.md 已完成时，跳过 Step 5，直接进入完成阶段。
```

- [ ] **Step 6: 验证改动逻辑正确**

检查：
- phase=started 时路由到 plan
- phase=planned 或 applied 时正常执行
- phase=archived 时路由到 finish
- Step 1 worktree 存在/null 时跳过
- Step 2 tasks 全勾时跳过
- Step 4 verify.md + hash 有效时跳过
- Step 5 retrospective.md + hash 有效时跳过

- [ ] **Step 7: Commit**

```bash
git add commands/alloy/apply.md
git commit -m "feat(apply): precheck 自动路由 + 5 步骤幂等"
```

---

### Task 4: `/alloy:archive` — precheck 路由

**Files:**
- Modify: `commands/alloy/archive.md`

- [ ] **Step 1: 修改前置检查——phase 不匹配时路由而非 HARD STOP**

将当前 content 行 32-37（"phase 必须是 `applied`"的 HARD STOP 部分）替换为：

```markdown
**1. phase 检查：**

先通过 `alloy _guard` 做硬校验：
```bash
alloy _guard openspec/changes/<name> archived
```

若 guard 报错（phase 不匹配），读取当前 phase，按以下规则自动路由：

| 当前 phase | 行为 |
|-----------|------|
| started | "尚未 plan，自动进入 /alloy:plan" → 加载 alloy-plan 指令 |
| planned | "尚未 apply，自动进入 /alloy:apply" → 加载 alloy-apply 指令 |
| applied | precheck 通过，继续归档 |
| archived | "已归档，自动进入 /alloy:finish" → 加载 alloy-finish 指令 |
| finished | "工作流已完成" → STOP |

**实现方式：** 输出对应命令文件的完整指令，将 change name 和当前进度信息作为上下文传入。

**HARD STOP 保留场景：** change 目录不存在（前序阶段完全没做）→ 引导用户先运行 `/alloy:start`。
```

- [ ] **Step 2: 验证改动逻辑正确**

检查：
- phase=started 时路由到 plan
- phase=planned 时路由到 apply
- phase=applied 时正常归档
- phase=archived 时路由到 finish
- verify.md 缺失/FAIL 时仍 HARD STOP（不变）

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/archive.md
git commit -m "feat(archive): precheck 自动路由替代 HARD STOP"
```

---

### Task 5: `/alloy:finish` — precheck 路由

**Files:**
- Modify: `commands/alloy/finish.md`

- [ ] **Step 1: 修改前置检查——phase 不匹配时路由而非 HARD STOP**

将当前 content 行 36-40（"phase 必须是 `archived`"的 HARD STOP 部分）替换为：

```markdown
**phase 检查：**

通过 `alloy _guard` 校验：
```bash
alloy _guard openspec/changes/<name> finished
```

若 guard 报错（phase 不匹配），读取当前 phase，按以下规则自动路由：

| 当前 phase | 行为 |
|-----------|------|
| started | "尚未 plan，自动进入 /alloy:plan" → 加载 alloy-plan 指令 |
| planned | "尚未 apply，自动进入 /alloy:apply" → 加载 alloy-apply 指令 |
| applied | "尚未归档，自动进入 /alloy:archive" → 加载 alloy-archive 指令 |
| archived | precheck 通过，继续收尾 |
| finished | "工作流已完成" → STOP |

**实现方式：** 输出对应命令文件的完整指令，将 change name 和当前进度信息作为上下文传入。

**HARD STOP 保留场景：** 分支不存在（可能已 merge 或删除）→ 提示无需再次 finish。
```

- [ ] **Step 2: 验证改动逻辑正确**

检查：
- phase=applied 时路由到 archive
- phase=planned 时路由到 apply
- phase=archived 时正常收尾
- phase=finished 时提示已完成

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/finish.md
git commit -m "feat(finish): precheck 自动路由替代 HARD STOP"
```

---

### Task 6: 端到端验证

**Files:**
- 无需修改文件，验证 5 个命令的路由链完整

- [ ] **Step 1: 验证 precheck 路由链**

模拟以下场景，确认路由链导向正确位置：

| 当前 phase | 调用命令 | 应路由到 |
|-----------|---------|---------|
| started | `/alloy:finish` | plan（finish→archive→apply→plan） |
| started | `/alloy:archive` | plan（archive→apply→plan） |
| planned | `/alloy:finish` | apply（finish→archive→apply） |
| planned | `/alloy:archive` | apply（archive→apply） |
| applied | `/alloy:plan` | apply（plan→apply） |
| applied | `/alloy:finish` | archive（finish→archive） |
| archived | `/alloy:apply` | finish（apply→finish） |

- [ ] **Step 2: 验证 apply 步骤幂等**

模拟 apply 中途退出后重入：
- Step 1 worktree 已创建 → 重入时跳过
- Step 4 verify.md 已存在 → 重入时跳过
- Step 5 retrospective.md 已存在 → 重入时跳过

- [ ] **Step 3: Commit 验证结果（如有修改）**
```

---

## 路由链汇总

```
              /alloy:start
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼         ▼
      started   planned   applied   archived
         │         │         │         │
         ▼         ▼         ▼         ▼
      plan ◄─── apply ◄── archive ◄── finish

路由方向: plan → apply → archive → finish（正向）
          finish → archive → apply → plan（反向自动路由）

每个命令的 precheck 不满足时，自动向 plan 方向回退一步，直到找到匹配的命令。
```

## 不变的部分

- `alloy _guard` 阶段闸门保留（推进 phase 时仍做硬校验）
- `.alloy.yaml` 字段不增加
- 前置检查内容不变（只改不满足时的行为）
- 唯一保留 HARD STOP：change 目录不存在 / draft.md 缺失 / verify.md FAIL / 分支不存在
