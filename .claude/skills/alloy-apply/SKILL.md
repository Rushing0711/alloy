---
name: alloy-apply
description: Alloy 执行阶段 - worktree 隔离 + SDD(TDD) + verify + retrospective
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plan.md 逐任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

**关键行为规则：调用任何外部命令/技能前，MUST 先输出标题 + 状态文本。严禁只出标题后沉默。顺序：1) 标题 → 2) 状态描述 → 3) 调用。**

## 前置检查

1. 确认 `plan.md` 存在于 change 目录，不存在则报错
2. 确认 change 的 phase 为 `planned`

```
---
## Alloy · 执行阶段 · 隔离 + SDD(TDD) + 验证 + 复盘

前置检查通过：plan.md ✓  phase=planned ✓
共有 6 个步骤：选择分支 → 提交 → 隔离 → 实现 → 验证 → 复盘
---
```

## 执行步骤

### Step 1/6：选择基础分支

规划制品尚未提交。先选择 worktree 基于哪个分支创建，默认当前分支。

```
---
### Step 1/6：选择基础分支
---

检测到未提交的规划制品。Worktree 将基于以下分支之一创建：

  1. main（当前分支）← 默认
  2. develop
  3. release/1.0

请选择基础分支（输入编号，回车默认 1）：
```

1. 运行 `git branch --list` 列出本地分支
2. 默认选中当前分支（编号 1）
3. 用户选择其他分支 → `git switch <selected-branch>`（未提交制品跟随切换，git 自动处理）
4. 用户回车选默认 → 保持在当前分支

### Step 2/6：提规交划制品

```
---
### Step 2/6：提交规划制品
---

正在提交规划制品到 <branch>...
```

1. `git add -A && git commit -m "Alloy: <change-name> 规划制品"`
2. 确保仓库有 commit（worktree 的前置条件）
3. 输出确认：

```
✓ 已提交到 <branch> @ <sha>
```

### Step 3/6：创建隔离环境

```
---
### Step 3/6：隔离环境 · superpowers:using-git-worktrees
---

创建隔离开发环境：

  基础分支：   <branch> @ <sha>
  新分支：     <change-name>
  工作目录：   .worktrees/<change-name>/

基于 <branch> 的 HEAD (<sha>) 创建新分支和独立工作目录...
正在调用 superpowers:using-git-worktrees...
```

调用 `superpowers:using-git-worktrees` skill：
- 基于选择的分支 HEAD 创建新分支 `<change-name>`
- 在新目录 `.worktrees/<change-name>/` 检出代码
- 不会影响当前分支和当前目录

创建完成后 MUST 确认：

```
✓ worktree 已创建
  分支：   <change-name>（基于 <branch> @ <sha>）
  目录：   .worktrees/<change-name>/
  状态：   已切换到新目录，后续所有操作在此目录中进行
```

### Step 4/6：逐任务实现

```
---
### Step 4/6：逐任务实现 · superpowers:subagent-driven-development
---

按 plan.md 微步骤逐任务分派子 agent 执行...
每个子 agent 内部遵循 TDD + code review。
```

调用 `superpowers:subagent-driven-development` skill：
- 主 agent 读取 plan.md，按微步骤逐个分派子 agent
- 每个子 agent 内部遵循 TDD（RED-GREEN-REFACTOR）
- 每个子 agent 完成后执行 code review
- 子 agent 失败 → 主 agent 分析原因 → 修复或重试

### Step 5/6：验证

```
---
### Step 5/6：验证 · verification-before-completion + openspec-verify-change
---

正在验证代码行为和制品结构...
```

1. 调用 `superpowers:verification-before-completion` skill —— 代码行为验证
2. 运行 `openspec-verify-change` —— 产出 verify.md（7 项检查）
3. **HARD GATE：验证失败 → 修复 → 重新验证 → 循环直到通过**

### Step 6/6：复盘

```
---
### Step 6/6：复盘 · retrospective
---

正在生成证据驱动复盘报告...
```

生成 `retrospective.md`（7 节结构，证据驱动）

### 完成

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

- **选择分支再提交** —— 让用户选择基础分支，制品跟随切换
- **verify 不通过不结束 apply（HARD GATE）** —— 循环修复直到通过
- **apply 完成后 DO NOT 自动进入 finish**
