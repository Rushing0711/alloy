---
name: alloy-apply
description: Alloy 执行阶段 - worktree 隔离 + SDD(TDD) + verify + retrospective
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plan.md 逐任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

**关键行为规则：每次进入新阶段或调用新技能前，MUST 先输出 `---` 分隔的阶段标题，包含当前步骤编号和技能名。**

## 前置检查

1. 确认 `plan.md` 存在于 change 目录，不存在则报错
2. 确认 change 的 phase 为 `planned`

```
---
## Alloy · 执行阶段 · 隔离 + SDD(TDD) + 验证 + 复盘

前置检查通过：plan.md ✓  phase=planned ✓
共有 5 个步骤：提交 → 隔离 → 实现 → 验证 → 复盘
---
```

## 执行步骤

### Step 0/5：提交规划制品

**worktree 基于当前 HEAD 创建，因此仓库必须有 commit。**

```
---
### Step 0/5：提交规划制品
---

检查仓库状态...
```

1. 运行 `git rev-parse --verify HEAD 2>/dev/null` 检查是否有 commit
2. **无 commit（新项目）：**
   - "项目尚无 commit，将规划制品作为初始提交"
   - `git add -A && git commit -m "Alloy: 初始提交（规划制品）"`
   - 输出：`✓ 初始提交：<sha>`
3. **有 commit 但有待提交文件：**
   - "以下文件未提交，将作为工作基础提交：<file list>"
   - `git add -A && git commit -m "Alloy: <change-name> 规划制品"`
   - 输出：`✓ 已提交：<sha>`
4. **仓库干净：**
   - `✓ 仓库干净，HEAD: <sha>`

### Step 1/5：创建隔离环境

```
---
### Step 1/5：隔离环境 · superpowers:using-git-worktrees
---

创建隔离开发环境：

  当前分支：   <current-branch>
  新分支：     <change-name>
  工作目录：   .worktrees/<change-name>/

基于当前 HEAD (<sha>) 创建新分支和独立工作目录...
正在调用 superpowers:using-git-worktrees...
```

调用 `superpowers:using-git-worktrees` skill：
- 基于当前分支 HEAD 创建新分支 `<change-name>`
- 在新目录 `.worktrees/<change-name>/` 检出代码

创建完成后 MUST 确认：

```
✓ worktree 已创建
  分支：   <change-name>（基于 <current-branch> @ <sha>）
  目录：   .worktrees/<change-name>/
  状态：   已切换到新目录，后续所有操作在此目录中进行
```

### Step 2/5：逐任务实现

```
---
### Step 2/5：逐任务实现 · superpowers:subagent-driven-development
---

按 plan.md 微步骤逐任务分派子 agent 执行...
每个子 agent 内部遵循 TDD + code review。
```

调用 `superpowers:subagent-driven-development` skill：
- 主 agent 读取 plan.md，按微步骤逐个分派子 agent
- 每个子 agent 内部遵循 TDD（RED-GREEN-REFACTOR）
- 每个子 agent 完成后执行 code review
- 子 agent 失败 → 主 agent 分析原因 → 修复或重试

### Step 3/5：验证

```
---
### Step 3/5：验证 · verification-before-completion + openspec-verify-change
---

正在验证代码行为和制品结构...
```

1. 调用 `superpowers:verification-before-completion` skill —— 代码行为验证
2. 运行 `openspec-verify-change` —— 产出 verify.md（7 项检查）
3. **HARD GATE：验证失败 → 修复 → 重新验证 → 循环直到通过**

### Step 4/5：复盘

```
---
### Step 4/5：复盘 · retrospective
---

正在生成证据驱动复盘报告...
```

生成 `retrospective.md`（7 节结构，证据驱动）

### Step 5/5：完成

```
---
### Alloy Apply 完成
---

✓ verify.md         已生成
✓ retrospective.md  已生成
  phase → applied

💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 finish。

准备好后，运行 `/alloy-finish` 进入收尾阶段。
```

## 闸门规则

- **先提交再隔离** —— 仓库无 commit 或有待提交文件时，MUST 先提交
- **verify 不通过不结束 apply（HARD GATE）** —— 循环修复直到通过
- **apply 完成后 DO NOT 自动进入 finish**
