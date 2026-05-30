---
name: "Alloy: Apply"
description: Alloy 执行阶段——当 plan.md 完成后，在隔离环境中实现代码并通过双层验证
category: Workflow
tags: [alloy, workflow]
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plan.md 任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

**状态标签约定（ANSI 颜色输出）：**
- `[PASS]` 绿色 — 检查通过
- `[FAIL]` 红色 — 检查失败
- `[HALT]` 红色 — 硬阻断，不可继续
- `[WARN]` 黄色 — 警告，可继续但需关注
- `[DONE]` 绿色 — 阶段完成

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。不要只出标题然后沉默。**

**什么算"apply 执行不到位"（反例）：**
- precheck 发现技能缺失但继续执行——"先跑着，后面可能用不到"——后面会静默丢失 TDD 或 code review
- 验证失败后直接改代码跳回验证，不经过 SDD——丢失了 TDD 安全网
- retrospective 在没有 verify.md 的情况下生成——复盘建立在不可靠的基础上

## 前置检查

1. 确认 `plans.md` 存在于 change 目录，不存在则报错
2. 通过 `alloy _guard` 确认 change 的 phase 为 `planned`：
   ```bash
   alloy _guard openspec/changes/<name> applied
   ```
   若 guard 报错说明 phase 转换不合法——检查当前 phase 是否符合前置条件
3. 确认当前目录在 git 仓库内：
   ```bash
   git rev-parse --git-dir
   ```
   若命令成功 → 继续。
   若命令失败 → 项目还不是 git 仓库，worktree 隔离和版本追踪需要 git。展示选项：
   > [Step 0/5] Git 仓库检测
   > ──────────────────────────────────────
   >
   > 检测到项目还不是 git 仓库。worktree 隔离和版本追踪依赖 git。
   >
   > **1.** 立即初始化 — 执行 `git init` 并做一次初始提交（推荐）
   > **2.** 稍后自行处理 — 手动初始化后再运行 `/alloy:apply`
   
   选 1：Agent 执行 `git init && git add -A && git commit -m "chore: 初始提交"`，完成后继续
   选 2：STOP，"请手动初始化 git 仓库后重新运行 `/alloy:apply`"

```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply           │
└──────────────────────────────────────┘

[Step 0/5] 技能可用性预检（precheck）
──────────────────────────────────────

前置检查通过：plan.md ✓  phase=planned ✓  git仓库 ✓

检查以下 5 个 Superpowers 技能是否可用（缺一 STOP，不静默降级）：
- [ ] superpowers:using-git-worktrees
- [ ] superpowers:subagent-driven-development
- [ ] superpowers:test-driven-development
- [ ] superpowers:requesting-code-review
- [ ] superpowers:verification-before-completion

任一缺失 → 输出缺失列表 → 引导 `alloy init` 重新安装 → STOP

全部通过后：
> precheck 通过：5/5 技能可用 ✓
> 共 5 个步骤：隔离 → SDD → 代码验证 → 制品验证 → 复盘
```

---

## 执行步骤

### [Step 1/5] 隔离环境设置

> [Step 1/5] superpowers:using-git-worktrees
>
> 使用 Skill 工具加载 `superpowers:using-git-worktrees` 技能。该技能内置了完整的决策流程（检测现有隔离 → 询问用户是否创建 → 创建或跳过），Agent 不重复建造选择闸门，按其内部指引执行即可。

技能执行完成后，将结果写入状态文件——这是断点恢复的关键数据：
- 已创建 worktree → `alloy _state write openspec/changes/<name> worktree "<path>"`
- 用户拒绝或已在隔离环境 → `alloy _state write openspec/changes/<name> worktree null`

### [Step 2/5] 任务实现

> 按 plans.md 微步骤执行实现...

**先分析，再展示推荐方案：**

1. 读取 `plans.md` 的 YAML frontmatter，提取 `strategy` 和 `reason`
2. 读取 `tasks.md`，分析任务特征——任务数、独立性、耦合度、并行潜力
3. 展示推荐方案（来自 plans.md header），用户可覆写：

   ```
   [Step 2/5] 执行策略选择
   ──────────────────────────────────────

   任务分析：<N 个任务，哪些独立/哪些耦合>

   推荐方案：<SDD / 串行>（规划阶段建议）
   理由：<来自 plans.md reason>

   1. SDD — 派发子 agent 并行执行（推荐）
   2. 串行执行 — 当前 session 逐步实现
   ```

**如果 plans.md 有 strategy header：**
- 对应选项标记为"（推荐）"
- 用户不明确选择时，默认采用推荐方案

**如果 plans.md 无 strategy header（兼容旧 change）：**
- 分析任务特征后给出推荐
- 两个选项不标记推荐，等用户明确选择

**必须等待用户明确选择后才能继续。**

4. 用户选择后，加载对应技能，**按其内部指引执行**，alloy 不重复建造选择闸门

Superpowers 技能内部行为（alloy 仅编排，不替代）：
- SDD：读取 plan → 分派子 agent → 每个子 agent TDD + 两阶段 review（spec + code quality）
- 串行：当前 session 直接执行，每步有审查检查点

### Step 3/5：代码层验证

> [Step 3/5] superpowers:verification-before-completion
> 正在验证代码行为——测试通过、功能正确...

使用 Skill 工具加载 `superpowers:verification-before-completion` 技能 —— 代码行为验证。

验证失败 → 修复代码 → 回到 Step 2/5（SDD），确保修复也有 TDD + code review 安全网。

### Step 4/5：制品层验证

> [Step 4/5] 制品层验证
> 正在验证制品结构——7 项结构化检查 → verify.md...

1. 调用 `/opsx:verify` 执行结构化的 7 项检查
2. `/opsx:verify` 的输出由 OpenSpec CLI 生成，其语言不由 Agent 控制。Agent 拿到输出后，**必须将 verify.md 重写为与 `instructions/verify.md` 和 `templates/verify.md` 一致的语言**，不得直接透传 CLI 输出
3. 检查结果（PASS/FAIL/WARNING）保留作为事实依据

7 项检查：结构校验 → 任务完成 → Delta Spec 同步 → Design/Specs 一致性 → 实现信号 → 路由泄漏检测 → 延期任务对照。

验证失败 → 修复 → 回到 Step 2/5（SDD）。verify 不通过不结束 apply。

### Step 5/5：复盘

> [Step 5/5] retrospective
> 正在生成证据驱动复盘报告（§0-§6）...

读取 `instructions/retrospective.md`，按模板 `templates/retrospective.md` 生成 `openspec/changes/<name>/retrospective.md`。

**输出语言与 `instructions/retrospective.md` 和 `templates/retrospective.md` 保持一致。** 代码标识符、commit hash、文件名保持原始语言。

**PRECHECK：** verify.md 存在且 Overall Decision 不是 FAIL，否则 STOP。

**§0 Evidence：** 收集量化证据（git log、diff stat、任务完成比、提交链等）。
**§1 Wins：** `[evidence: ...]` 格式，聚焦可复现的成功模式。
**§2 Misses：** 🔴 blocking / 🟡 painful / 📌 nit 三级严重度。
**§3 Plan Deviations：** 计划 vs 实际变更表格。
**§4 Skill Compliance：** 技能清单 ✓/✗，跳过的技能填三问（跳过什么/为什么/如何防复发）。
**§5 Surprises：** 被推翻的假设。
**§6 Promote Candidates：** `- [ ]` checklist + Why/How to apply，跨周期 carry-forward。

复盘是证据驱动的——每条结论都引用具体 commit 或文件。
跳过策略：单 commit 小修可跳过，写 "Skipped: single-commit fix, no insights"。

---

### 完成

```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply — DONE    │
└──────────────────────────────────────┘
>
> ✓ verify.md         已生成
> ✓ retrospective.md  已生成
```

**apply 阶段 commit 规则：**
- 代码变更：SDD 过程中每次成功验证后立即 commit
- verify.md：审批通过后 hash + commit：
  ```bash
  HASH=$(alloy _record compute openspec/changes/<name> verify)
  APPROVED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  APPROVER=$(git config user.name)
  alloy _record write openspec/changes/<name> verify "$HASH" "$APPROVED_AT" "$APPROVER"
  git add openspec/changes/<name>/verify.md
  git commit -m "apply(<name>): verify 已确认"
  ```
- retrospective.md：审批通过后 hash + commit：
  ```bash
  HASH=$(alloy _record compute openspec/changes/<name> retrospective)
  alloy _record write openspec/changes/<name> retrospective "$HASH" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(git config user.name)"
  git add openspec/changes/<name>/retrospective.md
  git commit -m "apply(<name>): retrospective 已确认"
  ```

**通过 `alloy _guard` 校验并更新 phase：**
```bash
alloy _guard openspec/changes/<name> applied --apply
```
guard 自动校验 hash 一致性后推进 phase。

```
💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 archive。

准备好后，运行 `/alloy:archive` 进入归档阶段。
```

---

## 闸门规则

- **precheck 不过不执行** —— 5 个技能任一缺失即 STOP，不静默降级
- **verify 不通过不结束 apply** —— 两层验证（代码层 + 制品层），任意 FAIL 回到 SDD
- **retrospective PRECHECK** —— verify.md 不存在或 Overall Decision 是 FAIL 时 STOP
- **apply 完成后不要自动进入 archive** —— archive 是人工闸门，留给用户空间做 QA
- **每制品独立 commit** —— 不再使用 `git add -A`，verify 和 retrospective 单独 hash 锁定并 commit
