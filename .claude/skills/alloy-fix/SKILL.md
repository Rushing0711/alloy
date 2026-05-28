---
name: alloy-fix
description: Alloy Bug 修复入口 - 诊断 → 环境感知 → 分流
---

# alloy-fix

## Step 1: 环境感知

```
在 worktree 内 → "当前在 worktree <path>，在此修复并提交"
不在 worktree → "在当前分支 <branch> 修复并提交"
```
（告知用户操作位置，不自动跳转）

## Step 2: 诊断

调用 `superpowers:systematic-debugging` skill → 根因定位

## Step 3: 分流

### 不改 spec（实现偏离现有 spec）
→ TDD 修复 → verification-before-completion → 直接 PR

### 需改 spec（spec 需新增或修正）

**无代码落地（有活跃 change 且 phase < applied）：**
→ "spec 变更可并入当前 change <name>。回到 /alloy-plan 更新制品。"
→ 无需开新 change

**已有代码落地（无活跃 change 或 phase ≥ applied）：**
→ "修复需要变更 spec。开新 change: /alloy-start <建议名称>"
→ 不自动创建，让用户感知后手动发起
