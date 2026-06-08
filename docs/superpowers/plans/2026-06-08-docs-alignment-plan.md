# 文档对齐代码 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 更新产品规格向代码对齐 + 修复 skill 文件视觉格式向规范对齐。

**Architecture:** 两部分独立工作——产品规格更新（内容对齐）和 skill 文件格式修复（视觉对齐）。产品规格以代码为真相源，skill 文件以视觉规范为格式标准。

**Tech Stack:** Markdown（无代码依赖）

---

### Task 1: 更新产品规格 — apply 段落

**Files:**
- Modify: `docs/specification/01-product-spec.md`（约 155-217 行）

- [ ] **Step 1: 更新 apply 隔离环境设置描述**

将第 179 行的 worktree 分支名从 `feature/<name>--wt` 改为 `worktree-<name>`：

```markdown
     - 用户选"是" → 创建 .claude/worktrees/<name> worktree，分支名 worktree-<name>
```

- [ ] **Step 2: 移除 apply 完成阶段的 worktree 清理**

删除第 210-216 行的 worktree 清理描述（已移至 archive），替换为：

```markdown
**完成阶段（验证 + 复盘通过后）：**
  verify.md 和 retrospective.md 各自 hash-lock + git commit。
  retrospective commit 可包含 phase_timings 等元数据（不要求单独拆分）。
  通过 `alloy _guard ... --apply` 校验并推进 phase，guard 后补 commit 确保 phase 变更不丢失。

  注意：worktree 清理已移至 /alloy:archive 阶段——归档目录移动需先 commit 到 worktree 分支，
  再合并回 feature 分支，否则 worktree 清理时 merge 会丢失归档操作。
```

- [ ] **Step 3: 提交**

```bash
git add docs/specification/01-product-spec.md
git commit -m "docs: 产品规格 apply 段落向代码对齐"
```

---

### Task 2: 更新产品规格 — archive 段落

**Files:**
- Modify: `docs/specification/01-product-spec.md`（约 219-243 行）

- [ ] **Step 1: 重写 archive 执行流程**

替换第 231-243 行的 archive 执行描述，加入 worktree 清理逻辑和多 commit 时序：

```markdown
执行:
  1. /opsx:archive → sync delta spec + 归档到 archive/YYYY-MM-DD-<name>/
  2. 归档变更提交（必须在 worktree 清理之前）：
     git add -A openspec/specs/ openspec/changes/
     git diff --cached --quiet || git commit -m "chore(<name>): 归档目录移动"
  3. 跨周期反馈：读取 retrospective.md §6 Promote Candidates，将 Promote to: memory 的条目写入 ~/.claude/memory/
  4. Worktree 清理（如果 apply 期间使用了 worktree）：
     - 读取 worktree_path、feature_branch、worktree_branch
     - 向下兼容：worktree_branch 为空时从 git worktree list 检测
     - cd 到主仓库目录，git merge worktree 分支回 feature 分支
     - git worktree remove + git branch -d
     - 写入 worktree_merged_at
  5. 记录完成时间 + 提交：
     alloy _state merge phase_timings，git add + commit
  6. phase → archived（通过 `alloy _guard ... --apply` + commit）

  git add 规则：`-A` 限定路径可用（如 `git add -A openspec/specs/ openspec/changes/`），
  无路径限定禁止。`-a`/`.` 始终禁止。
```

- [ ] **Step 2: 提交**

```bash
git add docs/specification/01-product-spec.md
git commit -m "docs: 产品规格 archive 段落向代码对齐"
```

---

### Task 3: 更新产品规格 — finish 段落

**Files:**
- Modify: `docs/specification/01-product-spec.md`（约 246-272 行）

- [ ] **Step 1: 更新 finish 段落**

在 finish 执行描述中加入 phase_timings 和 phase 时序说明：

```markdown
执行: superpowers:finishing-a-development-branch
  → 读取 openspec/config.yaml 的 main_branch 作为默认合并目标
  → 3 选项:
      1. 本地 merge → guard + phase → finished + commit phase_timings → git checkout + merge --squash → 完成
      2. 创建 PR    → guard + phase → finished + commit phase_timings → 创建 PR
      3. 保持分支   → phase 保持 archived，"分支已保留"

  phase_timings：finish 阶段写入 finish.started_at / completed_at 到 .alloy.yaml。
  phase 时序：guard + phase → finished 在 merge 之前执行（确保 state 变更先于代码操作）。

finish 纯做代码收尾，不涉及 spec 变更。若 PR 审查引出 spec 级修改，应走新 change。
注意：finish 阶段不涉及 worktree——worktree 已在 archive 阶段合并清理。
```

- [ ] **Step 2: 提交**

```bash
git add docs/specification/01-product-spec.md
git commit -m "docs: 产品规格 finish 段落向代码对齐"
```

---

### Task 4: 更新产品规格 — schema 和设计决策

**Files:**
- Modify: `docs/specification/01-product-spec.md`（schema 约 400-436 行，决策约 724-753 行）

- [ ] **Step 1: 更新 .alloy.yaml schema 示例和字段表**

在 schema 示例（第 400-424 行）中新增字段：

```yaml
worktree: null | ".claude/worktrees/<name>" | "skipped"
worktree_branch: "worktree-<name>"    # worktree 分支名
worktree_created_at: "2026-05-28 09:10:00"  # worktree 创建时间
worktree_merged_at: "2026-05-28 15:00:00"   # worktree 合并时间（archive 阶段写入）
```

在字段表（第 426-436 行）中新增行：

```markdown
| `worktree_branch` | apply 阶段写入 | worktree 分支名，archive 阶段用于合并回 feature 分支 |
| `worktree_created_at` | apply 阶段写入 | worktree 创建时间 |
| `worktree_merged_at` | archive 阶段写入 | worktree 合并回 feature 分支的时间 |
```

同时将 worktree 示例从 `.worktrees/<name>` 统一为 `.claude/worktrees/<name>`。

- [ ] **Step 2: 更新设计决策**

更新决策 #25（第 750 行）：
```markdown
| 25 | git add 精确路径优先 | 所有 Alloy 触发的 git commit 优先用精确路径。`-A` 限定路径可用（如 `git add -A openspec/specs/ openspec/changes/`），无路径限定禁止。`-a`/`.` 始终禁止。`.gitignore` 补齐 `*.local.*` |
```

更新决策 #26（第 751 行）：
```markdown
| 26 | worktree 在 archive 阶段清理 | worktree 在 apply Step 1 按需创建，在 archive 阶段合并清理。归档目录移动先 commit 到 worktree 分支，再合并回 feature 分支——opsx:archive 的 mv 不被 git 跟踪，不先 commit 会丢失 |
```

新增决策 #29 和 #30：
```markdown
| 29 | `_guard --apply` 后补 commit | phase 变更必须 commit，否则 worktree 清理时未提交的变更会丢失。guard 校验 + phase 推进 + commit 三步绑定 |
| 30 | 归档 commit 在 worktree 清理之前 | opsx:archive 执行 mv 但不负责 git commit。如果当前在 worktree 中，变更必须先 commit 到 worktree 分支，否则 worktree 清理时 merge 会丢失归档操作 |
```

- [ ] **Step 3: 提交**

```bash
git add docs/specification/01-product-spec.md
git commit -m "docs: 产品规格 schema + 设计决策向代码对齐"
```

---

### Task 5: 修复 skill 文件视觉格式 — apply.md

**Files:**
- Modify: `commands/alloy/apply.md`

- [ ] **Step 1: 移除 [PASS]/[FAIL] 颜色标签定义**

删除第 12-17 行的颜色标签定义块：

```markdown
**状态标签约定（ANSI 颜色输出）：**
- `[PASS]` 绿色 — 检查通过
- `[FAIL]` 红色 — 检查失败
- `[HALT]` 红色 — 硬阻断，不可继续
- `[WARN]` 黄色 — 警告，可继续但需关注
- `[DONE]` 绿色 — 阶段完成
```

替换为引用视觉规范的简短说明：

```markdown
**状态符号：** 使用 `✓`/`✗`/`⚠️` 符号（详见视觉规范 §七）。
```

- [ ] **Step 2: 修复 entry box 闭合**

将第 83-86 行的 entry box：
```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply           │
│ 启动时间: $PHASE_START               │
└──────────────────────────────────────┘
```

确认已正确闭合（当前已有 `└─┘`，无需修改）。

- [ ] **Step 3: 修复 DONE box 闭合**

将第 485-490 行的 DONE box 补全为完整 6 行格式：

```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply — DONE    │
│ 启动时间: 从 phase_timings.apply.started_at 读取  │
│ 完成时间: 从 phase_timings.apply.completed_at 读取 │
│ 耗时: completed_at - started_at 计算  │
└──────────────────────────────────────┘
```

- [ ] **Step 4: 修复 Step 标题格式**

将所有 `### Step N/M：` 和 `### [Step N/M]` 格式改为纯文本：

- `### [Step 1/5] 隔离环境设置` → `[Step 1/5] 隔离环境设置\n──────────────────────────────────────`
- `### [Step 2/5] 任务实现` → `[Step 2/5] 任务实现\n──────────────────────────────────────`
- `### Step 3/5：代码层验证` → `[Step 3/5] 代码层验证\n──────────────────────────────────────`
- `### Step 4/5：制品层验证` → `[Step 4/5] 制品层验证\n──────────────────────────────────────`
- `### Step 5/5：复盘` → `[Step 5/5] 复盘\n──────────────────────────────────────`

- [ ] **Step 5: 提交**

```bash
git add commands/alloy/apply.md
git commit -m "fix: apply.md 视觉格式向规范对齐（颜色标签 + Step 编号 + DONE box）"
```

---

### Task 6: 修复 skill 文件视觉格式 — plan.md

**Files:**
- Modify: `commands/alloy/plan.md`

- [ ] **Step 1: 修复 entry box 闭合**

确认第 58-61 行的 entry box 已正确闭合（检查 `└─┘` 行是否存在）。

- [ ] **Step 2: 修复 DONE box 闭合**

将 DONE box 补全为完整 6 行格式，加入完成时间和耗时。

- [ ] **Step 3: 修复 Step 2 标题格式**

将第 104 行的 `**[Step 2/3] 制品生成**` 改为纯文本：
```
[Step 2/3] 制品生成
──────────────────────────────────────
```

- [ ] **Step 4: 提交**

```bash
git add commands/alloy/plan.md
git commit -m "fix: plan.md 视觉格式向规范对齐（Step 编号 + DONE box）"
```

---

### Task 7: 修复 skill 文件视觉格式 — archive.md 和 finish.md

**Files:**
- Modify: `commands/alloy/archive.md`
- Modify: `commands/alloy/finish.md`

- [ ] **Step 1: 修复 archive.md entry box 闭合**

确认第 38-41 行的 entry box 已正确闭合。

- [ ] **Step 2: 修复 archive.md DONE box 闭合**

将 DONE box 补全为完整 6 行格式。

- [ ] **Step 3: 修复 finish.md entry box 闭合**

确认第 36-39 行的 entry box 已正确闭合。

- [ ] **Step 4: 修复 finish.md DONE box 闭合**

将 DONE box 补全为完整 6 行格式。

- [ ] **Step 5: 提交**

```bash
git add commands/alloy/archive.md commands/alloy/finish.md
git commit -m "fix: archive.md + finish.md 视觉格式向规范对齐（DONE box 闭合）"
```

---

### Task 8: 更新视觉规范中的 fix 示例

**Files:**
- Modify: `docs/specification/02-visual-spec.md`（约 465-495 行）

- [ ] **Step 1: 更新 fix 命令示例**

视觉规范 §十的 fix 示例（第 467-495 行）还是旧版"分流修复"格式，需要更新为三分支修复格式，匹配新的 fix.md 流程。

将示例更新为：
```
Alloy · Bug 修复
──────────────────────────────────────

[Step 1/3] 环境感知
──────────────────────────────────────

> 当前分支: feature/login-fix
> Worktree: 否
> 活跃 change: login-fix（phase: applied）
> 主分支: main

[Step 2/3] 根因诊断 · superpowers:systematic-debugging
──────────────────────────────────────

> 正在系统化诊断问题...

诊断结论：
> - 根因：空数组未返回 []
> - 涉及文件: src/utils/parse.ts
> - 是否偏离 spec: 否

> 确认以上诊断结果？[Y/n]

[Step 3/3] 分支选择 + 修复
──────────────────────────────────────

> 场景 2：feature 分支修复
> 归属 change: login-fix（phase: applied）
> Feature 分支: feature/login-fix

→ 修复路径：TDD → verification → commit

Alloy · Bug 修复 — DONE
──────────────────────────────────────

修复路径：场景 2
诊断结论：空数组未返回 []
结果：已修复并提交
```

- [ ] **Step 2: 提交**

```bash
git add docs/specification/02-visual-spec.md
git commit -m "docs: 视觉规范 fix 示例更新为三分支格式"
```

---

### Task 9: 构建验证

**Files:**
- 无文件修改

- [ ] **Step 1: 运行测试**

```bash
npm test
```

预期：全部通过（修改的是 markdown 文件）

- [ ] **Step 2: 运行构建**

```bash
npm run build
```

预期：构建成功
