---
name: alloy-apply
description: Alloy 执行阶段 - worktree 隔离 + SDD(TDD) + verify + retrospective
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plan.md 逐任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

**关键行为规则：每次进入新阶段或调用新技能前，MUST 先输出醒目的 `---` 分隔的阶段标题。**

## 前置检查

1. 确认 `plan.md` 存在于 change 目录，不存在则报错："未找到 plan.md，请先运行 /alloy-plan"
2. 确认 change 的 phase 为 `planned`

```
---
## Alloy · 执行阶段 · 隔离 + SDD(TDD) + 验证 + 复盘

前置检查通过：plan.md ✓  phase=planned ✓
---
```

## 执行步骤

### Step 1: 创建隔离 workspace

```
---
### Step 1/4：隔离环境 · superpowers:using-git-worktrees

**MUST 先输出以下信息，告知用户即将创建的隔离环境：**

```
---
### Step 1/4：隔离环境 · superpowers:using-git-worktrees
---

创建隔离开发环境：

  当前分支：   <current-branch>
  新分支：     <change-name>
  工作目录：   .worktrees/<change-name>/

正在创建 git worktree...
```

**然后调用 `superpowers:using-git-worktrees` skill，创建隔离 workspace：**

1. 读取当前 git 分支名（`git branch --show-current`）
2. 将 worktree 路径 `.worktrees/<name>` 写入 `.alloy.yaml`
3. 调用 `superpowers:using-git-worktrees` skill：
   - 基于当前分支 HEAD 创建新分支 `<change-name>`
   - 在新目录 `.worktrees/<change-name>/` 检出代码
   - 不会影响当前分支和当前目录

**创建完成后，MUST 确认结果：**

```
✓ worktree 已创建
  分支：   <change-name>（基于 <current-branch>）
  目录：   .worktrees/<change-name>/
  状态：   已切换到新目录，后续操作在此目录中进行
```

4. 切换到 worktree 目录开始工作

### Step 2: 子 agent 驱动开发（SDD）

```
---
### Step 2/4：逐任务实现 · superpowers:subagent-driven-development
---

按 plan.md 微步骤逐任务分派子 agent 执行...
每个子 agent 内部遵循 TDD + code review。
```

1. 调用 `superpowers:subagent-driven-development` skill
2. 主 agent 读取 plan.md，按微步骤逐个分派子 agent
3. 每个子 agent 内部遵循 TDD（RED-GREEN-REFACTOR）
4. 每个子 agent 完成后执行 code review

**关键规则：**
- SDD 内部自动激活 TDD + code review
- 每个 plan 微步骤 = 一个子 agent 任务
- 子 agent 失败 → 主 agent 分析原因 → 修复或重试

### Step 3: 验证

```
---
### Step 3/4：验证 · verification-before-completion + openspec-verify-change
---

正在验证代码行为和制品结构...
```

1. 调用 `superpowers:verification-before-completion` skill —— 代码行为验证
2. 运行 `openspec-verify-change` —— 产出 verify.md
3. 验证失败 → 修复后重新验证 → 循环直到通过（**HARD GATE: 不通过不结束 apply**）

### Step 4: 复盘

```
---
### Step 4/4：复盘 · retrospective
---

正在生成证据驱动复盘报告...
```

生成 `retrospective.md`（7 节结构，证据驱动）

### 完成

```
---
### Alloy Apply 完成
---

verify.md ✓  retrospective.md ✓
phase → applied

💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 finish。

准备好后，运行 `/alloy-finish` 进入收尾阶段。
```

## 闸门规则

- **verify 不通过不结束 apply（HARD GATE）** —— 循环修复直到通过
- **apply 完成后 DO NOT 自动进入 finish**
