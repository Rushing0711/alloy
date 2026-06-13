---
name: "Alloy: Fix"
description: Alloy Bug 修复入口 - 发现 bug 时调用
category: Workflow
tags: [alloy, workflow]
spec: 01-product-spec/06-fix-spec.md
behaviors:
  stops: 6
  hard_stops: 1
  artifacts: []
  transitions_to: ""
  external_calls: [superpowers:systematic-debugging, superpowers:test-driven-development, superpowers:verification-before-completion]
---

# alloy-fix

你是 Alloy 的 Bug 修复入口。系统化诊断问题根因、根据是否需要变更 spec 进行分流，确认是代码 bug 后按 change 状态选择修复分支。

**核心原则：诊断先行——先判断是代码 bug 还是 spec 变更；分支后置——确认是代码 bug 后才选择分支策略。**

```
NO FIX WITHOUT DIAGNOSIS
先跑 systematic-debugging，再谈修复。跳诊的坏账率极高
```

**交互规则：** `🔴 STOP` = 硬交互确认点，必须用 `AskUserQuestion`（`commands/alloy/references/interaction-style.md`）。跳过任何 🔴 STOP = 违反 Iron Law。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

---

### Red Flags——STOP

| 借口 | 现实 |
|------|------|
| "就在 main 上修吧，反正就改一行" | 一行和千行保护等级一样。main 污染 = 所有人受影响。建分支只需 2 秒。 |
| "我知道 bug 在哪，不用诊断" | "一看就知道"是修复中最危险的错觉。跳诊 → 修错地方 → 引入新 bug → 回滚 → 重新排查。 |
| "用户很确定说是 X 的问题" | 没有堆栈和复现步骤的"诊断"只是猜测。证据驱动，不信任任何人（包括自己）。 |
| "继续在 login-feature 上修就行" | finished 是终态——已交付 change 混入新修复破坏审计链。代码在 main 上，不在 feature 分支。 |
| "需求不对，我顺便改下 spec" | spec 问题 = 新 change。修复中发现 spec 问题 → 不阻断修复，完成后提示开新 change。 |

---

## 前置检查

**1. Skill 预检：** skill: systematic-debugging test-driven-development verification-before-completion

读取 `commands/alloy/references/skill-precheck.md` 检测。任一缺失 → 引导 `alloy init` → STOP。

**2. Phase 校验与场景标记：** 检测活跃 change 的 phase：

- phase = `applied` 且 worktree 存在 → **场景 1：worktree 内修复**
- phase = `applied`（worktree 已清理）或 `planned` → **场景 2：feature 分支修复**
- phase = `archived` / `finished` / 无活跃 change → **场景 3：热修候选**

不阻断——fix 的用户可能不在任何 change 上下文中。

```
Alloy · Bug 修复
──────────────────────────────────────
```

---

### [Step 1/3] 环境感知

```bash
# 检测是否在 worktree 中
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
IN_WORKTREE=$([ "$GIT_DIR" != "$GIT_COMMON" ] && echo "true" || echo "false")

# 检测活跃 change
alloy status --json 2>/dev/null

# 读取主分支配置
alloy _config read . main_branch 2>/dev/null
```

输出：当前分支 / Worktree(是/否+路径) / 活跃 change(phase) / 主分支。结合场景标记标注场景编号。

---

### [Step 2/3] 根因诊断

```
[Step 2/3] 根因诊断 · superpowers:systematic-debugging
──────────────────────────────────────
```

加载 `superpowers:systematic-debugging` 技能。禁止跳过——普通对话无法替代系统化调试（复现 → 假设 → 验证 → 定位）。

```bash
[ -n "<name>" ] && alloy _skill log openspec/changes/<name> fix superpowers:systematic-debugging
```

诊断必须产出明确结论：**根因、涉及文件、是否偏离 spec。**

**诊断确认（阻塞点）：** 🔴 STOP: 确认诊断结论（根因+涉及文件+是否偏离 spec）。确认后进入 Step 3 或回到 Step 2 重新诊断。

**"需改 spec"的判断：** spec 未描述此边界 / spec 行为本身有错 / 修复需新增 spec 中没有的 capability。

**"代码 bug"的判断：** 函数返回值与 spec 不一致 / spec 说 A 但代码做了 B / 性能不达标但 spec 没有性能要求。

---

### [Step 3/3] 分支选择 + 修复

确认是代码 bug 后，根据场景编号走对应路径。**场景标记不可跳过。**

**[HARD STOP] 主分支保护：** 当前在主分支且无活跃 change → **禁止直接修改代码**。任何主分支上的 commit 都污染历史。必须先创建分支。一行和千行保护等级完全一样。

#### 场景 1：有归属 change + worktree 存在

```
[Step 3/3] 修复 · worktree 内修复
归属 change: <name>（phase: applied）Worktree: <path>
```

1. 加载 `test-driven-development` → 写失败测试 → 修代码
2. 加载 `verification-before-completion` → 验证修复
3. 🔴 STOP: 确认修复内容（展示 `git diff --stat` 和关键变更摘要。确认提交 / 需要调整）
4. 精确提交：`git add <路径> && git commit -m "fix: <描述>"`

```bash
alloy _skill log openspec/changes/<name> fix superpowers:test-driven-development
alloy _skill log openspec/changes/<name> fix superpowers:verification-before-completion
```

#### 场景 2：有归属 change + worktree 已清理

```
[Step 3/3] 修复 · feature 分支修复
归属 change: <name>（phase: <phase>）Feature 分支: <branch>
```

1. 加载 `test-driven-development`
2. 加载 `verification-before-completion`
3. 🔴 STOP: 确认修复内容（展示 `git diff --stat` 和关键变更摘要。确认提交 / 需要调整）
4. 精确提交到 feature 分支

```bash
alloy _skill log openspec/changes/<name> fix superpowers:test-driven-development
alloy _skill log openspec/changes/<name> fix superpowers:verification-before-completion
```

#### 场景 3：无归属 change / change 已 finish

```
[Step 3/3] 修复 · 热修分支
无活跃归属 change，创建热修分支
```

**确认主分支（阻塞点）：** 🔴 STOP: 确认主分支。读取 `commands/alloy/references/main-branch-detection.md`，优先读 config，未配置时按 3 级优先级检测。确认后：`alloy _config write . main_branch <值>`

创建热修分支：`git checkout -b hotfix/<desc> <MAIN_BRANCH>`

1. 加载 `test-driven-development`
2. 加载 `verification-before-completion`
3. 精确提交（可追溯原 change 时注明 `fix-from: <change名>`）
4. 合并确认（阻塞点）：

   > 确认合并：源 `hotfix/<desc>` → 目标 `<MAIN_BRANCH>`
   > 输入 `merge hotfix/<desc> into <MAIN_BRANCH>` 确认，其他输入取消。

   **必须等待精确输入。** "好"、"可以"、"y"不算确认。

   确认后：
   ```bash
   git checkout <MAIN_BRANCH>
   git merge hotfix/<desc> --no-ff
   git branch -d hotfix/<desc>
   ```
   取消则保留分支，提示手动合并。

---

### spec 变更兜底

修复中发现 spec 问题 → 不阻断修复。完成后提示：

> 修复中发现 spec 可能需要变更：<问题描述>。🔴 STOP: 是否开新 change？

正常修复完成 → 不提示。

---

### 完成

```
Alloy · Bug 修复 — DONE
修复路径：<场景 1/2/3>  诊断：<根因摘要>  结果：<修复结果>
```
