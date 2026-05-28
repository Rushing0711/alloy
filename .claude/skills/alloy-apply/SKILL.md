---
name: alloy-apply
description: Alloy 执行阶段 - worktree 隔离 + SDD(TDD) + verify + retrospective
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plan.md 逐任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

## 前置检查

1. 确认 `plan.md` 存在于 change 目录，不存在则报错："未找到 plan.md，请先运行 /alloy-plan"
2. 确认 change 的 phase 为 `planned`

## 执行步骤

### Step 1: 创建隔离 workspace

1. 读取 `.alloy.yaml`，将 worktree 路径写入为 `.worktrees/<name>`
2. 调用 `superpowers:using-git-worktrees` skill —— 创建 git worktree 和新分支
3. 切换到 worktree 目录开始工作

### Step 2: 子 agent 驱动开发（SDD）

1. 调用 `superpowers:subagent-driven-development` skill
2. 主 agent 读取 plan.md，按微步骤逐个分派子 agent
3. 每个子 agent 内部遵循 `superpowers:test-driven-development`（RED-GREEN-REFACTOR）
4. 每个子 agent 完成后，子 agent 内部执行 code review（使用 requesting-code-review 模板）
5. 主 agent 在每步完成后审查子 agent 的产出

**关键规则：**
- SDD 内部自动激活 TDD + code review，Alloy 不重复声明
- 每个 plan 微步骤 = 一个子 agent 任务
- 子 agent 失败 → 主 agent 分析原因 → 修复或重试

### Step 3: 验证

1. 调用 `superpowers:verification-before-completion` skill —— 代码行为验证
2. 运行 `openspec-verify-change` —— 产出 verify.md（7 项检查）
3. 验证失败 → 修复后重新验证 → 循环直到通过（**HARD GATE: 不通过不结束 apply**）

### Step 4: 复盘

生成 `retrospective.md`（使用 schema 中定义的 retrospective 模板，7 节结构，证据驱动）

### Step 5: 完成

1. phase → `applied`
2. 输出扩展点提示：

```
retrospective.md 已生成。phase → applied

💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 finish。

准备好后，运行 /alloy-finish 进入收尾阶段。
```

## 闸门规则

- **verify 不通过不结束 apply（HARD GATE）** —— 循环修复直到通过
- **apply 完成后 DO NOT 自动进入 finish**
