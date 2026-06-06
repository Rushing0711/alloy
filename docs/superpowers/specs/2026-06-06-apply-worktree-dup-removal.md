---
title: Apply 阶段 worktree 创建去重设计
date: 2026-06-06
status: draft
---

# Apply 阶段 worktree 创建去重设计

## 问题

`commands/alloy/apply.md` Step 1/5 隔离环境设置中，用户被连续问两次是否要创建 worktree：

1. **apply.md 自身（行 176-184）：** "你想创建隔离 worktree 吗？/ 是 → ... / 否 → ..."
2. **superpowers:using-git-worktrees 技能 Step 0：** "Would you like me to set up an isolated worktree?"

两个问询在同一段流程中连续触发，造成不必要的重复。

## 根因

apply.md 包装层尝试先做用户决策，然后加载技能；但技能自身拥有独立的授权提示（Step 0）。两者在设计上各有一个"是否创建 worktree"的决策点，没有协调。

## 方案

**采用方案 A：删除 apply 的问询，由技能统一处理。** apply.md Step 1 只展示上下文摘要说明，不提问，直接加载 worktree 技能。技能 Step 0 是唯一的用户交互点。

### 具体变更

| 位置（apply.md） | 变更 |
|---|---|
| 行 163-185 | 删除"你想创建隔离 worktree 吗？/ 是 → ... / 否 → ..."问询段落。保留摘要说明文本，末尾改为"正在加载 worktree 隔离环境..." |
| 行 187 | 跟随文案调整 |
| 行 189-196 | 不变 — skill 执行后按 state 值写入 |
| 行 198-210 | 不变 — 完成汇总展示 |
| 行 493-520 | 不变 — 完成阶段 worktree 合并清理 |

### 改后流程

```
幂等检查 → state 为 null →
  ├─ 显示摘要说明（不提问）
  ├─ 加载 skill ──→ skill Step 0 问用户（唯一一次问询）
  ├─ skill 执行
  └─ 记录结果到 state
```

## 边界情况

- **断点重入：** 幂等检查（行 148-159）不变。state 为 path/skipped 时跳过，null 时执行。
- **用户拒绝创建：** skill 的 Step 0 记录用户拒绝偏好，apply.md 按现有逻辑写 `worktree: skipped`。
- **路径一致性：** 取消 apply.md 引用 `.claude/worktrees/` 路径（仅出现在已删除的文案中），与 worktree 技能使用的 `.worktrees/` 一致。

## 影响范围

仅修改 `commands/alloy/apply.md`，不修改任何 TS 源码、测试文件或技能文件。
