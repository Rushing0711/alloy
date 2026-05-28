---
name: alloy-fix
description: Alloy Bug 修复入口 - 诊断 → 环境感知 → 分流
---

# alloy-fix

**关键行为规则：每次调用技能/命令前，MUST 先输出醒目的 `---` 分隔的阶段标题。**

## Step 1: 环境感知

```
---
## Alloy Fix
---

正在检测当前环境...
```

```
在 worktree 内 → "当前在 worktree <path>，在此修复并提交"
不在 worktree → "在当前分支 <branch> 修复并提交"
```
（告知用户操作位置，不自动跳转）

## Step 2: 诊断

```
---
### 根因诊断（superpowers:systematic-debugging）
---

正在系统化诊断问题...
```

调用 `superpowers:systematic-debugging` skill → 根因定位

## Step 3: 分流

### 不改 spec（实现偏离现有 spec）

```
---
### 修复方式：直接修复（不改 spec）
---

→ TDD 修复 → verification-before-completion → 直接 PR
```

### 需改 spec（spec 需新增或修正）

**无代码落地（有活跃 change 且 phase < applied）：**

```
---
### 修复方式：并入当前 Change
---

spec 变更可并入当前 change <name>。
回到 `/alloy-plan` 更新制品。
```

**已有代码落地（无活跃 change 或 phase ≥ applied）：**

```
---
### 修复方式：新开 Change
---

修复需要变更 spec。
请手动发起：/alloy-start <建议名称>
```
