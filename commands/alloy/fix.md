---
name: "Alloy: Fix"
description: Alloy Bug 修复入口 - 发现 bug 时调用
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

## 前置检查

在进入诊断前，先校验环境和权限：

**1. Skill 预检：** 执行以下检测脚本，确认 3 个诊断技能均可用：

```bash
MISSING=0
for skill in "systematic-debugging" "test-driven-development" "verification-before-completion"; do
  if test -d ".claude/skills/$skill"; then echo "  ✓ superpowers:$skill（项目级 skill）"
  elif test -d "$HOME/.claude/skills/$skill"; then echo "  ✓ superpowers:$skill（用户级 skill）"
  elif for d in "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers/"*"/skills/$skill"; do test -d "$d" && break; done 2>/dev/null; then echo "  ✓ superpowers:$skill（用户级 plugin）"
  else echo "  ✗ superpowers:$skill — 未找到"; MISSING=$((MISSING+1)); fi
done
if [ "$MISSING" -gt 0 ]; then echo ""; echo "  需要先完成环境初始化。请运行: alloy init"; exit 1; fi
```

检测优先级：项目级 skill → 用户级 skill → 用户级 plugin。任一缺失 → 输出缺失列表 → 引导 `alloy init` → STOP。

**2. Phase 校验：** 若检测到活跃 change 的 `.alloy.yaml`，读取 phase：
- phase = `archived` → ⚠️ "该 change 已归档，spec 已封存。如果修复需要改 spec，应开新 change。继续修复（不改 spec）？"
- phase = `finished` → ⚠️ "该 change 已完成。建议开新 change 而非在此 change 上修复。"
- 不阻断——fix 命令的用户可能不在任何 change 上下文中，仅做知情提示。

---

```
Alloy · Bug 修复
──────────────────────────────────────
```

## Step 1/3：环境感知

```
[Step 1/3] 环境感知
──────────────────────────────────────
```

检测当前工作位置，告知用户操作位置（不自动跳转）：

- **在 worktree 内** → "当前在 worktree `<path>`，在此修复并提交"
- **不在 worktree** → "在当前分支 `<branch>` 修复并提交"

如果检测到当前目录下有活跃 change 的 `.alloy.yaml`，读取 phase 信息，供 Step 3 分流使用。

---

## Step 2/3：根因诊断

```
[Step 2/3] 根因诊断 · superpowers:systematic-debugging
──────────────────────────────────────

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
[Step 3/3] 分流修复 · 不改 spec
──────────────────────────────────────

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
[Step 3/3] 分流修复 · 并入当前 Change
──────────────────────────────────────

spec 变更可并入当前 change <name>。
运行 `/alloy:start <name>` 重新进入 brainstorming 流程——需求/设计调整从 draft 根重新审视。
```

无需开新 change——规划阶段的制品还没落地代码，回到 brainstorming 重新讨论即可。

**B2 — 需先处理当前 change（有活跃 change 且 phase ≥ applied）：**

```
[Step 3/3] 分流修复 · 需先处理当前 Change
──────────────────────────────────────

当前 change <name> 处于 <phase> 阶段，spec 需要修改。
当前 change 的代码基于旧 spec，需要先处理。
```

提供选项：
- **a. 先完成当前 change** → 推进测试、archive、finish，后续开新 change 修 spec + 修 bug（推荐，代码已落地，先确保当前工作完整交付）
- **b. discard 当前 change** → 重新开始（spec + 代码一起重做，适用于代码本身有严重问题的场景）
- **c. 记下建议名称** → 手动决定时机

不自动创建新 change——让用户感知当前 change 的状态后再决定。

**B2 — 直接开新 change（无活跃 change）：**

```
[Step 3/3] 分流修复 · 新开 Change
──────────────────────────────────────

修复需要变更 spec。建议名称：<name>
运行 /alloy:start <建议名称> 进入需求设计流程。
```

---

### 完成

```
Alloy · Bug 修复 — DONE
──────────────────────────────────────

修复路径：<路径 A / B1 / B2>
诊断结论：<根因摘要>
结果：<修复结果或后续步骤>
```
