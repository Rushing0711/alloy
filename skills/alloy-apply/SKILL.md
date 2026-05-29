---
name: alloy-apply
description: Alloy 执行阶段——当 plan.md 完成后，在隔离环境中实现代码并通过双层验证
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plan.md 任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。不要只出标题然后沉默。**

**什么算"apply 执行不到位"（反例）：**
- precheck 发现技能缺失但继续执行——"先跑着，后面可能用不到"——后面会静默丢失 TDD 或 code review
- 验证失败后直接改代码跳回验证，不经过 SDD——丢失了 TDD 安全网
- retrospective 在没有 verify.md 的情况下生成——复盘建立在不可靠的基础上

## 前置检查

1. 确认 `plan.md` 存在于 change 目录，不存在则报错
2. 通过 alloy-guard.sh 确认 change 的 phase 为 `planned`：
   ```bash
   bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> applied
   ```
   若 guard 报错说明 phase 转换不合法——检查当前 phase 是否符合前置条件

```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply           │
└──────────────────────────────────────┘

[Step 0/5] 技能可用性预检（precheck）
──────────────────────────────────────

前置检查通过：plan.md ✓  phase=planned ✓

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

### [Step 1/5] 选择基础分支 + 创建隔离环境

**此步骤不可跳过。** 在创建 worktree 之前，必须让用户明确选择基础分支。

#### 1a：收集分支信息

```bash
git branch --list
git rev-parse --abbrev-ref HEAD
```

确保仓库有 commit（worktree 的前置条件）。如果仓库无任何 commit（全新项目），先做一次初始提交。

#### 1b：展示选项，等待用户选择

> [Step 1/5] 选择基础分支
> ──────────────────────────────────────
>
> **当前分支：** <current-branch>
>
> **本地分支列表：**
>   - main
>   - dev
>   - ...
>
> worktree 将基于所选分支的 HEAD 创建新分支 `<change-name>`，在新目录 `.worktrees/<change-name>/` 中工作。
>
> **请选择基础分支：**
> **1.** 当前分支 <current-branch>（推荐）
> **2.** 其他已有分支（请指定分支名）
> **3.** 基于已有分支新建 feature 分支（请指定父分支和新的 feature 分支名）

**必须等待用户明确选择后才能继续。** 不允许 Agent 静默使用当前分支。

用户选择后，确认：
> **基础分支：** <selected-branch> @ <sha>
> **新分支：** <change-name>
> **工作目录：** .worktrees/<change-name>/
>
> 确认创建？(y/n)

用户确认后，才进入 1c。

#### 1c：创建 worktree

> [Step 1/5] superpowers:using-git-worktrees
>
> 创建隔离开发环境：
>
> | | |
> |---|---|
> | **基础分支** | <selected-branch> @ <sha> |
> | **新分支** | <change-name> |
> | **工作目录** | .worktrees/<change-name>/ |
>
> 基于 <selected-branch> 的 HEAD (<sha>) 创建新分支和独立工作目录...

使用 Skill 工具加载 `superpowers:using-git-worktrees` 技能：
- 基于用户选择的**基础分支** HEAD 创建新分支 `<change-name>`
- 在新目录 `.worktrees/<change-name>/` 检出代码
- 不会影响当前分支和当前目录

创建完成后确认：
```
✓ worktree 已创建
  基础分支： <selected-branch> @ <sha>
  新分支：   <change-name>
  目录：     .worktrees/<change-name>/
  状态：     已切换到新目录，后续所有操作在此目录中进行
```

**关键约束：** worktree 基于用户选择的分支创建。事后 finish 时 merge 回合的目标也是这个基础分支，而非固定 main。

### [Step 2/5] 选择执行策略

> [Step 2/5] 选择执行策略
> ──────────────────────────────────────
>
> plan.md 已就绪，请选择执行策略：
>
> **1.** SDD 子 agent 执行（推荐）
>   — 主 agent 按 plan.md 微步骤分派子 agent，每个子 agent 内部 TDD + spec/code review
>   — 适合任务多、可并行的场景
>
> **2.** 单 agent 直接执行
>   — 当前 session 串行执行 plan.md，每步有审查检查点，同样遵循 TDD
>   — 适合任务少、逻辑连贯的场景
>
> **3.** 跳过自动实现
>   — 手动编码，apply 仅做双层验证（代码 + 制品）+ 复盘
>   — 适合复杂逻辑需要人工推敲、或已手动完成编码的场景

**必须等待用户明确选择后才能继续。** 不允许 Agent 静默选择执行策略。

用户选择后，确认：
> **执行策略：** <选择的策略>
>
> 确认开始执行？(y/n)

用户确认后，才进入对应的执行路径。

### 路径 1：SDD 子 agent 执行

> 按 plan.md 微步骤分派子 agent...

使用 Skill 工具加载 `superpowers:subagent-driven-development`：
- 主 agent 读取 plan.md，按微步骤依次分派子 agent
- 每个子 agent 内部遵循 TDD（RED-GREEN-REFACTOR）+ spec/code review
- 子 agent 失败 → 主 agent 分析原因 → 修复或重试

### 路径 2：单 agent 直接执行

> 按 plan.md 微步骤串行执行...

使用 Skill 工具加载 `superpowers:executing-plans`：
- 当前 session 直接执行，每步有审查检查点
- 同样内部遵循 TDD

### 路径 3：跳过自动实现

> 跳过自动实现，直接进入验证阶段。

不加载执行技能。apply 仅做 Step 3-5：代码层验证 → 制品层验证 → 复盘。

适用于：已手动完成编码、复杂逻辑需要人工推敲、或 plan.md 仅作为指导手册而非自动化脚本的场景。

**如果任何执行路径中当前平台不支持对应技能，告知用户并建议选择其他路径。**

### Step 3/5：代码层验证

> [Step 3/5] superpowers:verification-before-completion
> 正在验证代码行为——测试通过、功能正确...

使用 Skill 工具加载 `superpowers:verification-before-completion` 技能 —— 代码行为验证。

验证失败 → 修复代码 → 回到 Step 2/5（SDD），确保修复也有 TDD + code review 安全网。

### Step 4/5：制品层验证

> [Step 4/5] /opsx:verify
> 正在验证制品结构——7 项结构化检查 → verify.md...

调用 `/opsx:verify`（openspec-verify-change）产出 `verify.md`。

7 项检查：结构校验 → 任务完成 → Delta Spec 同步 → Design/Specs 一致性 → 实现信号 → 路由泄漏检测 → 延期任务对照。

验证失败 → 修复 → 回到 Step 2/5（SDD）。verify 不通过不结束 apply。

### Step 5/5：复盘

> [Step 5/5] retrospective
> 正在生成证据驱动复盘报告（§0-§6）...

读取 `instructions/retrospective.md`，按模板 `templates/retrospective.md` 生成 `openspec/changes/<name>/retrospective.md`：

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

**通过 alloy-guard.sh 校验并更新 phase：**
```bash
bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> applied --apply
```

```
💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 finish。

准备好后，运行 `/alloy-archive` 进入归档阶段。
```

---

## 闸门规则

- **precheck 不过不执行** —— 5 个技能任一缺失即 STOP，不静默降级
- **verify 不通过不结束 apply** —— 两层验证（代码层 + 制品层），任意 FAIL 回到 SDD
- **retrospective PRECHECK** —— verify.md 不存在或 Overall Decision 是 FAIL 时 STOP
- **apply 完成后不要自动进入 archive** —— archive 是人工闸门，留给用户空间做 QA
