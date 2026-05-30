---
name: "Alloy: Fix"
description: Alloy Bug 修复入口 - 诊断 → 环境感知 → 分流
category: Workflow
tags: [alloy, workflow]
---

# alloy-fix

你是 Alloy 的 Bug 修复入口。你的职责是：感知当前环境、系统化诊断问题根因、根据是否需要变更 spec 进行分流。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

**什么算"fix 诊断不到位"（反例）：**
- 没跑 systematic-debugging 就凭直觉修——"一看就知道是哪的问题"——根因可能完全错误
- 诊断出需改 spec 但直接修代码不改 spec——spec 和代码从此分叉，下次换人（换 session）就断片
- 已有代码落地但并入当前 change——混入已有 change，后续 audit 无法追溯"这个 spec 变更是因为修 bug"

---

## Step 1/3：环境感知

```
---
## Alloy · Bug 修复 · 诊断 + 分流
---

### Step 1/3：环境感知
---

正在检测当前环境...
```

检测当前工作位置，告知用户操作位置（不自动跳转）：

- **在 worktree 内** → "当前在 worktree `<path>`，在此修复并提交"
- **不在 worktree** → "在当前分支 `<branch>` 修复并提交"

如果检测到当前目录下有活跃 change 的 `.alloy.yaml`，读取 phase 信息，供 Step 3 分流使用。

---

## Step 2/3：根因诊断

```
---
### Step 2/3：根因诊断 · superpowers:systematic-debugging
---

正在系统化诊断问题...
```

使用 Skill 工具加载 `superpowers:systematic-debugging` 技能。禁止跳过此步骤。

如果 `superpowers:systematic-debugging` 不可用，引导用户运行 `alloy init` 完成环境初始化。系统化调试技能有自己的诊断流程（复现 → 假设 → 验证 → 定位），普通对话无法替代这种方法论。

诊断必须产出一个明确的结论：**根因是什么、涉及哪些文件、是否偏离了现有 spec。**

---

## Step 3/3：分流修复

根据诊断结果走以下两个路径之一。分流的关键问题是：**修复是否需要修改 spec？**

### 路径 A：不改 spec（实现偏离现有 spec）

**适用场景：** bug 是代码层面的问题——逻辑错误、边界条件遗漏、性能问题——而现有 spec 的描述是正确的，只是代码没有按 spec 实现。

**什么算"不改 spec"（正例）：**
- 函数返回值与 spec 描述的行为不一致
- spec 说"空数组返回 []"但代码对空数组抛了异常
- 性能不达标，但 spec 没有性能要求

```
---
### Step 3/3：直接修复 · 不改 spec
---

根因：<诊断结论>
分流：不改 spec——代码偏离了现有 spec，修复实现即可
```

修复流程：
1. 使用 Skill 工具加载 `superpowers:test-driven-development` 技能 —— 先写失败测试，再修代码
2. 使用 Skill 工具加载 `superpowers:verification-before-completion` 技能 —— 验证修复
3. 直接提交，或创建 PR 时加载 `superpowers:requesting-code-review` 技能进行审查

### 路径 B：需改 spec

**适用场景：** bug 的根因是 spec 本身不完整或不正确，需要修改规格说明书。

**什么算"需改 spec"（正例）：**
- spec 没有描述这个边界情况，代码的行为其实是合理的，但 spec 需要补充
- spec 描述的行为本身就是错的（比如业务逻辑变更后 spec 没更新）
- 修复需要新增一个 spec 中没有的 capability

分流后根据是否有代码落地（phase）再拆分：

**B1 — 并入当前 change（有活跃 change 且 phase < applied，无代码落地）：**

```
---
### Step 3/3：并入当前 Change
---

spec 变更可并入当前 change <name>。
回到 `/alloy:plan` 更新制品。
```

无需开新 change——规划阶段的制品还没落地代码，直接修改即可。

**B2 — 新开 change（无活跃 change 或 phase ≥ applied，已有代码落地）：**

```
---
### Step 3/3：新开 Change
---

修复需要变更 spec。已有代码已落地，需要独立追踪。
请手动发起：/alloy:start <建议名称>
```

已有代码落地后，spec 变更应该独立追踪——不混入已有 change，也不跳过 Alloy 流程。

---

### 完成

```
---
### Alloy Fix 完成
---

修复路径：<路径 A / B1 / B2>
诊断结论：<根因摘要>
结果：<修复结果或后续步骤>
```
