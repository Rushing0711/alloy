---
name: alloy-fix
description: Alloy Bug 修复入口 - 诊断 → 环境感知 → 分流
---

# alloy-fix

**关键行为规则：调用任何外部命令/技能前，MUST 先输出标题 + 状态文本。严禁只出标题后沉默。顺序：1) 标题 → 2) 状态描述 → 3) 调用。**

## Step 1：环境感知

```
---
## Alloy · Bug 修复 · 诊断 + 分流
---

### Step 1/3：环境感知
---

正在检测当前环境...
```

检测工作位置：

```
在 worktree 内 → "当前在 worktree <path>，在此修复并提交"
不在 worktree → "在当前分支 <branch> 修复并提交"
```

（告知用户操作位置，不自动跳转）

## Step 2：诊断

```
---
### Step 2/3：根因诊断 · superpowers:systematic-debugging
---

正在系统化诊断问题...
```

调用 `superpowers:systematic-debugging` skill → 根因定位

## Step 3：分流修复

根据诊断结果，走以下两个路径之一：

### 路径 A：不改 spec（实现偏离现有 spec）

```
---
### Step 3/3：直接修复 · 不改 spec
---

→ TDD 修复 → verification-before-completion → 直接 PR
```

### 路径 B：需改 spec（spec 需新增或修正）

**无代码落地（有活跃 change 且 phase < applied）：**

```
---
### Step 3/3：并入当前 Change
---

spec 变更可并入当前 change <name>。
回到 `/alloy-plan` 更新制品。
```

**已有代码落地（无活跃 change 或 phase ≥ applied）：**

```
---
### Step 3/3：新开 Change
---

修复需要变更 spec。
请手动发起：/alloy-start <建议名称>
```

### 完成

```
---
### Alloy Fix 完成
---

修复路径：<路径 A/B>
结果：<修复结果>
```
