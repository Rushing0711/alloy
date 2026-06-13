---
name: "Alloy: Fix"
description: Alloy Bug 修复入口 - 发现 bug 时调用
category: Workflow
tags: [alloy, workflow]
spec: 01-product-spec/06-fix-spec.md
behaviors:
  stops: 8
  hard_stops: 5
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

**交互规则：** `🔴 STOP` = 硬交互确认点，必须用 `AskUserQuestion`（`commands/alloy/references/interaction-style.md`，含"沉默 ≠ 授权"通用禁令——禁批量打包、禁基于内容跳过、禁 agent 回填精确字符串）。跳过任何 🔴 STOP = 违反 Iron Law。

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
| "性能/重构/优化也算 fix，不用开新 change" | 命中关键词必须经过 USER_GATE。fix 跳新 change = spec 与代码分叉的隐蔽路径。 |

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

**关键词二次 USER_GATE（⛔ HARD_STOP，task L6）：** 用户原始描述或诊断结论命中下列关键词时，必须追加 🔴 USER_GATE 让用户物理确认"这是 bug 修复，不是新需求/重构"。命中关键词检测：

```bash
# 输入：$USER_DESC（用户原始描述）+ $DIAGNOSIS（诊断结论）
KEYWORDS="优化|性能|performance|refactor|重构|改造|增强|enhancement|提升|更好|更快"
HIT=$(echo "$USER_DESC $DIAGNOSIS" | grep -Eo "$KEYWORDS" | sort -u | tr '\n' ' ')
```

`$HIT` 非空 → 🔴 USER_GATE（必须 AskUserQuestion）：

> 检测到关键词：`$HIT`
> 这类工作通常不是 bug 修复——
> - **性能优化 / 重构 / 增强**：应走 `/alloy:start` 开新 change（spec 需描述新行为或性能契约）
> - **真正的 bug 修复**：spec 已定义的行为坏了 / 测试期望已存在
>
> 选项：
> (a) 这是真正的 bug 修复——spec 行为坏了（继续 fix）
> (b) 这是新需求 / 重构 / 优化——退出 fix，运行 `/alloy:start` 开新 change
> (c) 两者混合——退出 fix，先开 change 处理新需求，剩余 bug 再回 fix

**[HARD_STOP]** agent 不得基于"用户用了 fix 命令所以一定是 bug"自动选 (a)——必须用户物理选择。命中关键词且未经 USER_GATE 直接进 Step 3 = 违反 Iron Law。

**违反字面 = 违反精神：** 哪怕"用户描述里说了 bug 字样"或"诊断结论看着像 bug"，只要命中关键词就必须 USER_GATE。fix 流程跳过新 change 闸门 = spec 与代码分叉的隐蔽路径。

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
3. **⛔ HARD_STOP pre-commit 校验**（读取 `commands/alloy/references/fix-precommit-check.md`）：commit 前必须确认 skill_usage[] 包含 `fix/test-driven-development` + `fix/verification-before-completion` 两条 `action=log` 记录。缺失 → 返回步骤 1-2 重做，**禁 agent 自动补 `_skill log` 后继续**。
4. 🔴 STOP: 确认修复内容（展示 `git diff --stat` 和关键变更摘要。确认提交 / 需要调整）
5. 精确提交：`git add <路径> && git commit -m "fix: <描述>"`

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
3. **⛔ HARD_STOP pre-commit 校验**（读取 `commands/alloy/references/fix-precommit-check.md`）：与场景 1 相同——skill_usage[] 校验通过才能进入步骤 4。
4. 🔴 STOP: 确认修复内容（展示 `git diff --stat` 和关键变更摘要。确认提交 / 需要调整）
5. 精确提交到 feature 分支

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

**⛔ PRECONDITION_FAIL 分支命名白名单**（读取 `commands/alloy/references/branch-naming.md`）：默认热修分支名 `fix/<desc>`（**禁用历史 `hotfix/` prefix**——不在 CLAUDE.md 白名单内）。用户自定义时必须以 `feature/` `fix/` `docs/` `refactor/` `test/` `chore/` 之一开头，后缀 kebab-case，且不与主分支同名。校验失败 → USER_GATE 让用户重新输入。

创建热修分支：`git checkout -b fix/<desc> <MAIN_BRANCH>`

1. 加载 `test-driven-development`
2. 加载 `verification-before-completion`
3. 精确提交（可追溯原 change 时注明 `fix-from: <change名>`）
4. **⛔ HARD_STOP merge 前 USER_GATE 校验**（读取 `commands/alloy/references/fix-precommit-check.md` 场景 3 章节）：merge 精确字符串确认前必须追加 🔴 USER_GATE 让用户物理确认已加载 TDD + verification 两个 skill，禁 agent 基于 "diff 含测试代码" 自动跳过。
5. 合并确认（阻塞点）：

   > 确认合并：源 `fix/<desc>` → 目标 `<MAIN_BRANCH>`
   > 输入 `merge fix/<desc> into <MAIN_BRANCH>` 确认，其他输入取消。

   **必须等待精确输入。** "好"、"可以"、"y"不算确认。**[HARD_STOP] agent 不得在工具调用中预填或模拟此精确字符串**（见 interaction-style.md "沉默 ≠ 授权"通用禁令）。

   确认后：
   ```bash
   git checkout <MAIN_BRANCH>
   git merge fix/<desc> --no-ff
   git branch -d fix/<desc>
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
