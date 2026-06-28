---
behaviors:
  preconditions: 1
  hard_stops:    6
  user_gates:    7
  warns:         0
  artifacts: []
  transitions_to: ""
  external_calls: [superpowers:systematic-debugging, superpowers:test-driven-development, superpowers:verification-before-completion]
---

# alloy fix 行为规格

详见 skill 文件：`commands/alloy/fix.md`

## 命令格式

```
/alloy:fix
```

核心原则：诊断先行——先判断是代码 bug 还是 spec 变更；分支后置——确认是代码 bug 后才选择分支策略。

## 前置检查

1. Skill 预检：systematic-debugging + TDD + verification-before-completion 三个技能可用
2. Phase 校验与场景标记：
   ├── phase = applied + worktree 存在 → 场景 1
   ├── phase = applied + worktree 已清理 → 场景 2
   ├── phase = planned → 场景 2
   ├── phase = archived/finished → 场景 3（热修候选）
   └── 无活跃 change → 场景 3（热修候选）

## Step 1: 环境感知

检测 worktree 状态、当前分支、活跃 change、主分支配置
输出环境摘要 + 场景标记

## Step 2: 根因诊断 (superpowers:systematic-debugging)

├── 诊断结论：需改 spec → 引导 /alloy:start <建议名称>，结束 fix
└── 诊断结论：代码 bug → 用户确认后进入 Step 3

## Step 3: 分支选择 + 修复（确认是代码 bug 后）

[HARD STOP] 主分支保护：当前在主分支且无活跃 change → 禁止直接修改代码，必须先创建 hotfix 分支

### 场景 1：有归属 change + worktree 存在

→ worktree 内 TDD 修复 → verify → 精确提交到 worktree 分支

### 场景 2：有归属 change + worktree 已清理

→ feature 分支 TDD 修复 → verify → 精确提交到 feature 分支

### 场景 3：无归属 change / change 已 finish

→ 确认主分支（读 config，未配置则自动检测 + 用户确认）
→ 创建 hotfix/<desc> 分支（从主分支）
→ TDD 修复 → verify → 精确提交
→ 合并回主分支（--no-ff）
→ commit message 注明 fix-from: <原 change 名>（如有）

## spec 变更兜底

修复中发现 spec 问题 → 完成后提示开新 change；正常修复 → 不提示
