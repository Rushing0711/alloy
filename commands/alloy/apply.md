---
name: "Alloy: Apply"
description: Alloy 执行阶段 - plan 完成后进入
category: Workflow
tags: [alloy, workflow]
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plan.md 任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

**状态符号：** 使用 `✓`/`✗`/`⚠️` 符号（详见视觉规范 §七）。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。不要只出标题然后沉默。**

**捕获阶段启动时间**（命令调用后第一时间，前置检查之前）：
```bash
PHASE_START=$(date "+%Y-%m-%d %H:%M:%S")
```

---

**什么算"apply 执行不到位"（反例）：**
- precheck 发现技能缺失但继续执行——"先跑着，后面可能用不到"——后面会静默丢失 TDD 或 code review
- 验证失败后直接改代码跳回验证，不经过 SDD——丢失了 TDD 安全网
- retrospective 在没有 verify.md 的情况下生成——复盘建立在不可靠的基础上
- 在主分支上创建 worktree——"start 已经确认过主分支了"——plan 阶段的 commit 在 feature 分支上，worktree 基于 main 会丢失这些 commit
- feature_branch 为 null 时静默回退——"回退路径是设计的容错"——null 是状态异常，回退值可能与实际分支不一致
- 跳过分支验证闸门直接加载 using-git-worktrees——"技能内部会处理 base ref"——技能不知道你的 feature_branch 是什么

### Red Flags——STOP，不要继续

以下任何一个念头出现，都意味着闸门正在被绕过：

| 借口 | 现实 |
|------|------|
| "用户说了跳过 worktree" | 用户说了不算。隔离是 apply 的硬闸门，用户跳过 worktree 就是跳过安全网。必须明确拒绝并解释风险。 |
| "先写代码再补测试，加快速度" | TDD 的次序不可颠倒。先写测试再写代码才是安全网，顺序反了等于没网。提速的正确方式是并行子任务，不是砍测试。 |
| "用户要改需求，我直接改吧" | 需求变更必须通过 tasks.md checkbox 闸门。已开始编码 → 开新 change。未开始 → 回溯 brainstorming。不存在"顺手改了"这个选项。 |
| "技能缺失没关系，我可以自己搞定" | 技能是闸门，不是加速器。缺失 = HARD STOP。不存在"降级处理"。引导 `alloy init` 修复环境。 |
| "反正是个小改动，不用那么正式" | 小改动和大改动的闸门完全一样。不存在"大小分级的保护等级"。 |
| "用户很急，跳过 review 吧" | 跳过 review = 跳过代码质量闸门。急不是绕过流程的理由。 |
| "start 阶段已经确认过主分支了" | 配置可能已变，确认只需 2 秒。跳过确认 = 在错误的 base 上创建 worktree。 |
| "feature_branch 是 null，用回退值就行" | null 是状态异常，不是设计的容错。回退值可能与实际分支不一致——交叉验证后才能用。 |
| "当前在 main 上，直接建 worktree 吧" | 主分支上创建 worktree 丢失 feature 分支的 plan commit。必须先切到 feature 分支。 |
| "using-git-worktrees 技能内部会处理 base ref" | 技能不知道你的 feature_branch 是什么。base ref 由 apply.md 决定，不是下游技能。 |

## 前置检查

1. 确认 `plans.md` 存在于 change 目录，不存在则报错
2. 通过 `alloy _guard` 确认 change 的 phase：
   ```bash
   alloy _guard openspec/changes/<name> applied
   ```
   若 guard 报错说明 phase 转换不合法——读取 `commands/alloy/references/phase-routing.md` 按路由表自动跳转。当前 phase=planned 或 applied 时 precheck 通过（applied 为断点重入）。
3. 确认当前目录在 git 仓库内：
   ```bash
   git rev-parse --git-dir
   ```
   若命令成功 → 继续。
   若命令失败 → HARD STOP："项目还不是 git 仓库。请先运行 `/alloy:start` 完成初始化（包含 git init）。"
4. **Skill 预检：** 确认以下依赖可用：
   cmd: opsx/verify
   skill: using-git-worktrees subagent-driven-development executing-plans test-driven-development requesting-code-review verification-before-completion

   读取 `commands/alloy/references/skill-precheck.md` 了解检测方法。任一缺失 → 输出缺失列表 → 引导 `alloy init` → STOP。**不存在降级处理。** 技能是闸门，不是加速器——有则用，无则停。

**写入阶段启动时间**（前置检查通过后，使用命令开头捕获的 `PHASE_START`）：
```bash
alloy _state merge openspec/changes/<name> phase_timings "{\"apply\":{\"started_at\":\"${PHASE_START:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
```

```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply           │
│ 启动时间: $PHASE_START               │
└──────────────────────────────────────┘

**提交前置状态（worktree 创建前确保 .alloy.yaml 变更已落地）：**
后续步骤写入 worktree 的路径和分支名也会进入此快照 commit，确保 worktree 内能看到完整状态。

```bash
git add openspec/changes/<name>/.alloy.yaml
git diff --cached --quiet || git commit -m "chore(<name>): apply 阶段开始前状态快照"
```

`git diff --cached --quiet` 接续时无变更则跳过，不会产生空 commit。

---

前置检查通过：plan.md ✓  phase=planned ✓  git ✓  技能 ✓

> 共 5 个步骤：隔离 → 任务实现 → 代码验证 → 制品验证 → 复盘

---

---

## 需求变更处理（Apply 阶段回溯闸门）

apply 阶段用户提出需求/设计变更时，以"编码是否已开始"为分界线：

**检查 tasks.md checkbox 状态：**
```bash
grep -c '\[x\]' openspec/changes/<name>/tasks.md
```

- 返回 0（全部 unchecked）→ 尚未开始编码，允许回溯
- 返回 > 0（有已勾选任务）→ 编码已开始，拒绝回溯

**未开始编码（全部 unchecked）：**

> → (a) 确认变更，回到 brainstorming（清理 plan 制品，在当前 change 内修正）
> → (b) 取消，继续 apply

用户选 (a) → 执行 plan.md 的"回溯清理步骤"（删除 proposal/design/tasks/plans/specs，重置 records/phase_timings），回到 brainstorming。

**编码已开始（有 [x]）：**

> 编码已开始（<N> 个任务已完成），需求变更应开新 change:
>   /alloy:start <建议名称>
>
> 当前 change 继续执行，或 /alloy:discard 放弃。

不允许在当前 change 内回溯——已有代码落地，规格和代码不能分叉。

**什么算"需求变更闸门失效"（反例）：**
- 用户说"需求不对，改一下"就直接改代码——没检查 tasks.md checkbox 状态
- 已在 [x] 的 change 上做架构级改动（如 JWT→session）——应开新 change
- 用户说"就改一点点需求"——不存在"一点点"，要么未编码可回溯，要么已编码开新 change
- 在同一 change 上多次反复变更需求——每次变更都应经过闸门判断

## 执行步骤

### [Step 1/5] 隔离环境设置

**幂等检查：** 先读取 worktree 状态：
```bash
alloy _state read openspec/changes/<name> worktree
```

```
Step 1/5 进度检测:
  worktree 值: 有效路径（如 `.claude/worktrees/<name>/` 或 `.worktrees/<name>/`）→ 路径存在 → ✓ 已完成，跳过此步骤
  worktree 值: 有效路径 → 路径不存在 → ⚠️ 残留记录，重新处理
  worktree 值: "skipped"                                                → ✓ 用户选择不创建，跳过此步骤
  worktree 值: null（从未写入）                                           → ⚠️ 尚未决定，加载 using-git-worktrees
```

路径存在、"skipped" 时，直接跳过 Step 1，进入 Step 2。

null 时，先展示摘要，再加载技能：

```
> [Step 1/5] 隔离环境设置
>
> 当前在 `<feature_branch>`。未在隔离 worktree 中。
>
> 分支隔离的是提交历史，但同一时间只能有一个分支在工作目录里。
> Worktree 隔离的是工作目录——每个 worktree 有独立的文件副本，可同时 checkout 不同分支。
>
> 如果你的 feature 开发期间要切到其他分支（如修紧急 bug、切 main 查东西），
> worktree 让你无需 stash/commit 当前进度，直接进另一个目录操作。
>
> 正在验证分支位置...
```

**分支验证闸门**（加载 using-git-worktrees 之前必须通过——worktree 的 base ref 取决于当前分支，错误的 base = plan 阶段 commit 丢失）：

**① 主分支确认：** 读取 `commands/alloy/references/main-branch-detection.md`，按 3 级优先级检测主分支。若 `openspec/config.yaml` 已有 `alloy.main_branch` 记录，直接用记录值，跳过检测和确认。

**② 当前分支位置检查：**
```bash
CURRENT_BRANCH=$(git branch --show-current)
FEATURE_BRANCH=$(alloy _state read openspec/changes/<name> feature_branch)
MAIN_BRANCH=$(alloy _config read main_branch 2>/dev/null || echo "$DEFAULT_BRANCH")
```

- **在主分支上**（`CURRENT_BRANCH === MAIN_BRANCH`）→ HARD STOP："当前在主分支 `<main_branch>`。不允许从主分支创建 worktree——plan 阶段的 commit 在 feature 分支上，worktree 会丢失这些变更。" → 必须 `git checkout <feature_branch>` 后再继续
- **当前分支 = feature_branch** → ✓ 位置正确，继续
- **feature_branch 为 null** → ⚠️ 状态异常，需修复：
  ```
  .alloy.yaml 未记录 feature_branch。这通常是 start 阶段数据写入失败。

  → (a) 手动指定：输入分支名（如 feature/<name>）
  → (b) 使用当前分支 `<current_branch>` 作为 feature_branch
  → (c) 放弃，回退到 start 阶段修复
  ```
  用户选择后，`alloy _state write openspec/changes/<name> feature_branch <用户确认的分支>`，然后继续。**null 是状态异常，不是设计的容错——不允许静默回退。**
- **当前分支 ≠ feature_branch** → 提示切换：
  ```
  当前在 `<current_branch>`，但 feature_branch 记录为 `<feature_branch>`。
  → (a) 切换到 <feature_branch>（推荐）
  → (b) 使用当前分支 <current_branch>（更新 feature_branch 记录）
  ```
  选 (a)：`git checkout <feature_branch>` → 继续
  选 (b)：`alloy _state write openspec/changes/<name> feature_branch <current_branch>` → 继续
- **feature_branch 不存在本地** → ⚠️ 分支丢失：
  ```
  feature_branch 记录为 `<feature_branch>`，但本地不存在此分支。
  → (a) 从远程拉取：git fetch origin <feature_branch> && git checkout <feature_branch>
  → (b) 手动指定其他分支
  → (c) 放弃，回退到 start 阶段修复
  ```

**③ base ref 锁定：** 创建 worktree 时，必须基于 `feature_branch`（不是 HEAD，不是 main）。

**base ref 处理策略：** EnterWorktree 的 `worktree.baseRef` 默认为 `fresh`（从 `origin/<default-branch>` 分出），**不会**使用当前 HEAD 作为 base——即使分支验证闸门已确保当前在 feature_branch 上。因此：
1. **优先：** 先手动 `git worktree add .claude/worktrees/<name> -b worktree-<name> <feature_branch>` 创建 worktree（显式指定 base ref），再用 EnterWorktree(path=...) 或 `cd` 进入
2. **回退：** 若 EnterWorktree 支持自定义 base ref（查看工具参数），直接使用并传入 feature_branch

分支验证闸门通过后，加载技能：

使用 Skill 工具加载 `superpowers:using-git-worktrees` 技能。传入参数 "工作目录偏好: .claude/worktrees/<name>\n分支命名: worktree-<name>\n基于: <feature_branch>\n注意: EnterWorktree 默认从 origin/main 分出，必须先 git worktree add 指定 base ref 再进入"。该技能内置了完整的决策流程（Step 0 问询 → 创建或跳过）和执行步骤，Agent 按其内部指引执行即可。

**路径偏好说明：** 使用无条件路径 `.claude/worktrees/<name>`，因为 `.claude/` 是 alloy 初始化时的固定目录（存在 commands/skills 等子目录）。显式指定路径后，Agent 在 git worktree fallback（EnterWorktree 不可用时）会直接使用该路径，不会因条件判断错误而回退到 `.worktrees/`。

**分支命名说明：** 使用 `worktree-<name>` 命名规范，与 EnterWorktree 的内置命名一致。这确保无论 worktree 由 EnterWorktree 还是 git worktree fallback 创建，分支名格式统一，archive 阶段清理时无需猜测。

**when 用户选择不创建 worktree：** 写入 `skipped`（非 null）：
```bash
alloy _state write openspec/changes/<name> worktree skipped
```

```bash
echo "  正在检测 worktree 实际状态..."

# 判断是否已在 worktree 中：GIT_DIR != GIT_COMMON 表示在 linked worktree 中
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)

if [ "$GIT_DIR" != "$GIT_COMMON" ]; then
  # 已在 worktree 中，获取实际路径和分支名
  WORKTREE_PATH=$(cd "$(git rev-parse --show-toplevel)" 2>/dev/null && pwd -P)
  WORKTREE_BRANCH=$(cd "$WORKTREE_PATH" && git branch --show-current)
  alloy _state write openspec/changes/<name> worktree "$WORKTREE_PATH"
  alloy _state write openspec/changes/<name> worktree_branch "$WORKTREE_BRANCH"
  alloy _state write openspec/changes/<name> worktree_created_at "$(date '+%Y-%m-%d %H:%M:%S')"
  echo "  ✓ worktree 已记录: 分支=$WORKTREE_BRANCH  路径=$WORKTREE_PATH"
  # commit 确保断点恢复时 state 不丢失
  git add openspec/changes/<name>/.alloy.yaml
  git diff --cached --quiet || git commit -m "chore(<name>): record worktree state"
else
  # EnterWorktree 失败后的 git worktree fallback
  # 优先检测 .claude/worktrees/（EnterWorktree 原生路径），回退 .worktrees/
  WT_PATH=""
  for CANDIDATE in ".claude/worktrees/<name>" ".worktrees/<name>"; do
    if [ -d "$CANDIDATE" ]; then
      WT_PATH=$(cd "$CANDIDATE" 2>/dev/null && pwd -P)
      break
    fi
  done
  if [ -n "$WT_PATH" ]; then
    WORKTREE_BRANCH=$(cd "$WT_PATH" && git branch --show-current 2>/dev/null)
    alloy _state write openspec/changes/<name> worktree "$WT_PATH"
    alloy _state write openspec/changes/<name> worktree_branch "$WORKTREE_BRANCH"
    alloy _state write openspec/changes/<name> worktree_created_at "$(date '+%Y-%m-%d %H:%M:%S')"
    echo "  ✓ worktree fallback 已记录: 分支=$WORKTREE_BRANCH  路径=$WT_PATH"
    # 提交 source repo 的 state
    git add openspec/changes/<name>/.alloy.yaml
    git diff --cached --quiet || git commit -m "chore(<name>): record worktree state"
    # worktree 内也写入并提交——bash cd 不跨工具调用持久化，
    # 若只在 source repo 写，agent 后续进入 worktree 后读到的 state 仍为 null
    cd "$WT_PATH" && \
      alloy _state write openspec/changes/<name> worktree "$WT_PATH" && \
      alloy _state write openspec/changes/<name> worktree_branch "$WORKTREE_BRANCH" && \
      alloy _state write openspec/changes/<name> worktree_created_at "$(date '+%Y-%m-%d %H:%M:%S')" && \
      git add openspec/changes/<name>/.alloy.yaml && \
      git diff --cached --quiet || git commit -m "chore(<name>): record worktree state (worktree)"
  else
    echo "  ℹ 未检测到 worktree，按用户选择记录"
    alloy _state write openspec/changes/<name> worktree skipped
  fi
fi

技能执行完成后，将结果写入状态文件——这是断点恢复的关键数据（已在上方检测逻辑中自动写入）：
- 已创建 worktree → worktree 路径（已在检测中自动写入到 state）
- 用户拒绝或已在隔离环境 → `skipped`（已在检测中自动写入到 state）

**Step 1/5 完成汇总：**

```
> [Step 1/5] 隔离环境 — 已跳过（用户选择不创建）

或

> [Step 1/5] 隔离环境 — 就绪
>
> 源分支:      <由 state.feature_branch 获取>
> Worktree 分支: <由 state.worktree_branch 获取，无则显示 N/A>
> Worktree 路径: <由 state.worktree 获取，无则显示 N/A>
```

### [Step 2/5] 任务实现

**幂等检查：** 读取 `tasks.md`，扫描 checkbox 状态：

```
Step 2/5 进度检测:
  tasks.md: 3/7 已勾选 → 已完成的 task TDD 测试仍通过，自然跳过
                         → 从第一个未勾选的 task 开始执行
  tasks.md: 7/7 已勾选 → ✓ 已完成，跳过此步骤
```

TDD 机制天然保证幂等——已实现的 task 对应测试已通过，重跑时自动跳过。无需额外检测。

> 按 plans.md 微步骤执行实现...

**先分析，再展示推荐方案：**

1. 读取 `plans.md` 的 YAML frontmatter，提取 `strategy` 和 `reason`
2. 读取 `tasks.md`，分析任务特征——任务数、独立性、耦合度、并行潜力
3. 展示推荐方案（来自 plans.md header），用户可覆写：

   ```
   [Step 2/5] 执行策略选择
   ──────────────────────────────────────

   任务分析：<N 个任务，哪些独立/哪些耦合>

   推荐方案：superpowers:subagent-driven-development（规划阶段建议）
   理由：<来自 plans.md reason>

   选择哪个？

   subagent-driven-development（推荐）
     适用场景：
     - 任务多（≥3 个）、相互独立
     - 涉及不同文件/模块，可并行
     - 适合：新功能、多组件改造、跨模块变更

   executing-plans
     适用场景：
     - 任务少（1-2 个）、紧密耦合
     - 共享状态或同一文件、不可拆分
     - 适合：小修小改、重构单个模块、快速修复
   ```

**如果 plans.md 有 strategy header：**
- 对应选项标记为"（推荐）"
- 用户不明确选择时，默认采用推荐方案
- 展示推荐时，一起展示 writing-plans 给出的 `reason`（策略背后的分析理由）

**如果 plans.md 无 strategy header（兼容旧 change）：**
- 分析任务特征后给出推荐
- 两个选项不标记推荐，等用户明确选择
- **策略决定后，将 strategy 回写到 plans.md YAML frontmatter**，补充 `strategy` 和 `reason` 字段，然后重新 hash 锁定。这确保后续 apply（如断线重连）不会重复分析。

**必须等待用户明确选择后才能继续。**

4. 用户选择后，加载对应技能，**按其内部指引执行**，alloy 不重复建造选择闸门

Superpowers 技能内部行为（alloy 仅编排，不替代）：

**superpowers:subagent-driven-development 路径：** 加载 `superpowers:subagent-driven-development` 技能，由其内部驱动：
- 读取 plan → 分派子 agent → 每个子 agent 独立执行 TDD + code review（transitive 激活）
- 子 agent 各自勾选 tasks.md 中对应任务的 checkbox

**superpowers:executing-plans 路径：** 分四步执行，确保不丢 TDD、spec 合规和 code review 闸门：

**1. 先加载 `superpowers:test-driven-development` 技能设定 TDD 预期：**
- 加载后，TDD 纪律（RED→GREEN→REFACTOR）成为本次执行的硬约束
- 不在 executing-plans 内部"顺便做"——先设定预期，再执行

**2. 加载 `superpowers:executing-plans` 技能执行 plans.md 微步骤：**
- executing-plans 按 plans.md 逐步执行，每步完成后暂停审查
- 执行过程中遵循 TDD 流程（先写测试→确认失败→实现→确认通过）

**3. executing-plans 完成后，进行 Spec 合规审查（Agent 自行检查，不加载额外技能）：**
- tasks.md 的每个 checkbox → 代码中是否有对应实现？
- 代码中是否有 tasks.md 未要求的实现？（over-building）
- plan.md 中明确排除的范围 → 代码是否碰了？
- 不通过 → 修复 → 重新审查 → 通过后进入 code review

**4. 加载 `superpowers:requesting-code-review` 技能进行代码审查：**
- 代码审查闸门——所有代码变更必须经过审查才能进入 Step 3 验证

> superpowers:executing-plans 路径不会 transitive 激活 TDD、spec 合规或 code review。以上四步通过**显式加载**来补偿——先设定 TDD 预期，再执行，再校验 spec 合规，最后审查。

### [Step 3/5] 代码层验证

> [Step 3/5] superpowers:verification-before-completion
> 正在验证代码行为——测试通过、功能正确...

使用 Skill 工具加载 `superpowers:verification-before-completion` 技能 —— 代码行为验证。

验证失败 → 修复代码 → 回到 Step 2/5（SDD），确保修复也有 TDD + code review 安全网。

### [Step 4/5] 制品层验证

**幂等检查：** 检查 verify.md 是否存在且 hash 有效：
```bash
alloy _record check openspec/changes/<name> verify 2>/dev/null && echo "VERIFY_DONE" || echo "VERIFY_NEEDED"
```

```
Step 4/5 进度检测:
  verify.md 存在 + hash 有效 → ✓ 已完成，跳过此步骤
  verify.md 缺失或 hash 无效 → 执行制品验证
```

verify.md 已完成时，跳过 Step 4，直接进入 Step 5。

> [Step 4/5] 制品层验证
> 正在验证制品结构——7 项结构化检查 → verify.md...

**生成 verify 前，校验上游 plans 的 hash：**
```bash
alloy _record check openspec/changes/<name> plans
```
若 check 失败 → HARD STOP，plans 可能被未审批修改。

1. 调用 `/opsx:verify` 执行结构化的 7 项检查
2. `/opsx:verify` 的输出由 OpenSpec CLI 生成，其语言不由 Agent 控制。Agent 拿到输出后，**必须将 verify.md 重写为与 `instructions/verify.md` 和 `templates/verify.md` 一致的语言**，不得直接透传 CLI 输出
3. 检查结果（PASS/FAIL/WARNING）保留作为事实依据

7 项检查：结构校验 → 任务完成 → Delta Spec 同步 → Design/Specs 一致性 → 实现信号 → 路由泄漏检测 → 延期任务对照。

验证失败 → 修复 → 回到 Step 2/5（SDD）。verify 不通过不结束 apply。

**tasks.md checkbox 已更新，重录 hash：**
```bash
HASH=$(alloy _record compute openspec/changes/<name> tasks)
alloy _record write openspec/changes/<name> tasks "$HASH" "$(date "+%Y-%m-%d %H:%M:%S")" "$(alloy _record approver openspec/changes/<name>)"
```

**verify.md 生成后，展示审查窗口：**

> 制品 [1/2] verify ✓ 完成
>
> [展示 verify.md 完整内容]
>
> → 下一个：retrospective
> → (a) 确认，锁定 verify 并继续 retrospective
> → (b) 需要调整 — 说明修改点，修改后重新展示

选 (a)：hash 锁定 verify 并 commit：
```bash
HASH=$(alloy _record compute openspec/changes/<name> verify)
APPROVED_AT=$(date "+%Y-%m-%d %H:%M:%S")
APPROVER=$(alloy _record approver openspec/changes/<name>)
alloy _record write openspec/changes/<name> verify "$HASH" "$APPROVED_AT" "$APPROVER"
git add openspec/changes/<name>/verify.md
git commit -m "docs(<name>): verify 已确认"
```

选 (b)：调整 verify 内容后重新展示审查窗口。

### [Step 5/5] 复盘

**幂等检查：** 检查 retrospective.md 是否存在且 hash 有效：
```bash
alloy _record check openspec/changes/<name> retrospective 2>/dev/null && echo "RETRO_DONE" || echo "RETRO_NEEDED"
```

```
Step 5/5 进度检测:
  retrospective.md 存在 + hash 有效 → ✓ 已完成，跳过此步骤
  retrospective.md 缺失或 hash 无效 → 执行复盘
```

retrospective.md 已完成时，跳过 Step 5，直接进入完成阶段。

> [Step 5/5] retrospective
> 正在生成全周期复盘报告（§0-§6）...

读取 `instructions/retrospective.md`，按模板 `templates/retrospective.md` 生成 `openspec/changes/<name>/retrospective.md`。

**输出语言与 `instructions/retrospective.md` 和 `templates/retrospective.md` 保持一致。** 代码标识符、commit hash、文件名保持原始语言。

**生成 retrospective 前，校验上游 verify 的 hash：**
```bash
alloy _record check openspec/changes/<name> verify
```
若 check 失败 → HARD STOP。

**PRECHECK：** verify.md 存在且 Overall Decision 不是 FAIL，否则 STOP。

**§0 量化全景：** 三来源自动收集——`.alloy.yaml` records（制品审批链）+ `git log`（全周期 commit，按 type 和阶段分组）+ 文件系统（任务完成比、变更规模、测试覆盖信号）。

**§1 Wins：** `[evidence: ...]` 格式，聚焦可复现的成功模式。

**§2 Misses：** 🔴 blocking / 🟡 painful / 📌 nit 三级严重度。

**§3 Plan Deviations：** 计划 vs 实际变更表格，含 strategy 偏差说明。

**§4 全周期技能审计：** Agent 自报 start/plan/apply 三阶段 11 项技能/命令使用情况（✓/✗）。同一 session 亲历，无需推断。跳过的技能填三问（跳过什么/为什么/如何防复发）。

**§5 Surprises：** 被推翻的假设。

**§6 Promote Candidates：** `- [ ]` checklist + Why/How to apply，跨周期 carry-forward。标记 `Promote to: memory` 的条目在 archive 阶段由 Agent 写入 memory。

复盘是证据驱动的——每条结论都引用具体 commit 或文件。
跳过策略：单 commit 小修可跳过，写 "Skipped: single-commit fix, no insights"。

**retrospective.md 生成后，展示审查窗口：**

> 制品 [2/2] retrospective ✓ 完成
>
> [展示 retrospective.md 完整内容]
>
> → 下一个：完成 apply 阶段
> → (a) 确认，锁定 retrospective 并完成 apply
> → (b) 需要调整 — 说明修改点，修改后重新展示

选 (a)：补填审批时间 + hash 锁定 + 提交，一个 commit 包含所有累积变更（retrospective + 阶段完成时间 + worktree 状态），不拆开：
```bash
APPROVAL_TIME=$(date "+%Y-%m-%d %H:%M:%S")
# 将 §0 表格中 retrospective 行的"待确认"替换为实际审批时间（hash 列保持 "—"，避免自指悖论）
sed -i '' "s/| retrospective |.*| 待确认 |/| retrospective | $(alloy _record approver openspec/changes/<name>) | — | ${APPROVAL_TIME} |/" openspec/changes/<name>/retrospective.md
COMPLETED_AT="${APPROVAL_TIME}"
alloy _state merge openspec/changes/<name> phase_timings "{\"apply\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
HASH=$(alloy _record compute openspec/changes/<name> retrospective)
alloy _record write openspec/changes/<name> retrospective "$HASH" "$APPROVAL_TIME" "$(alloy _record approver openspec/changes/<name>)"
git add openspec/changes/<name>/
git commit -m "docs(<name>): retrospective 已确认"
```

选 (b)：调整 retrospective 内容后重新展示审查窗口。

---

### 完成

```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply — DONE    │
│ 启动时间: 从 phase_timings.apply.started_at 读取               │
│ 完成时间: 从 phase_timings.apply.completed_at 读取                │
│ 耗时: completed_at - started_at 计算                       │
└──────────────────────────────────────┘

→ Change: <name>
→ Phase: applied
→ Worktree: <path  或  当前分支>

所有制品已生成并锁定：

  制品             状态    Hash          创建时间
  ──────────────  ────    ────────────  ───────────────────
  plans           ✓       <hash>        <timestamp>
  verify          ✓       <hash>        <timestamp>
  retrospective   ✓       <hash>        <timestamp>

→ 代码变更已提交
→ 验证: <PASS  或  存在 N 个 WARN>
```

**apply 阶段 commit 规则：**
- 代码变更：SDD 过程中每次成功验证后立即 commit
- verify.md / retrospective.md：用户通过审查窗口选 (a) 确认后，hash 锁定 + commit（具体命令已内联在上方各审查窗口中）

**SDD commit 前检查 untracked 文件：**

commit 实现代码前，先检查是否有未跟踪文件：
```bash
UNTRACKED=$(git status --porcelain | grep '^??' | sed 's/^?? //')
```

对每个未跟踪文件，判断：
- **构建产物或临时文件**（`.vite/`、`dist/`、`build/`、`.next/`、`.cache/`、`*.log`、`node_modules/` 等）→ 追加到 `.gitignore`，`git add .gitignore` 一起提交
- **项目源码**（`.ts`、`.vue`、`.css` 等新创建的文件）→ 按精准路径 `git add`

不需要穷举目录——Agent 根据项目上下文判断即可。比如项目用了 vite，看到 `.vite/` 就知道该 ignore。判断不准时，询问用户确认。

**通过 `alloy _guard` 校验并更新 phase（必须在 worktree 中执行，若使用了 worktree）：**
```bash
alloy _guard openspec/changes/<name> applied --apply
git add openspec/changes/<name>/.alloy.yaml
git commit -m "chore(<name>): phase → applied"
```
guard 自动校验 hash 一致性后推进 phase。phase 变更必须 commit，否则 worktree 清理时未提交的变更会丢失。

```
💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 archive。

准备好后，运行 `/alloy:archive` 进入归档阶段。
```

---

## 闸门规则

- **git add 只用精确路径** — 永远不用 `-A`、`-a`、`.`。
  代码变更只 add 本次改动的具体文件；反例：`git add .` 会把第三方依赖、临时文件一起提交
- **precheck 不过不执行** —— 6 个技能任一缺失即 STOP，不静默降级
- **verify 不通过不结束 apply** —— 两层验证（代码层 + 制品层），任意 FAIL 回到 SDD
- **retrospective PRECHECK** —— verify.md 不存在或 Overall Decision 是 FAIL 时 STOP
- **apply 完成后不要自动进入 archive** —— archive 是人工闸门，留给用户空间做 QA
- **每制品独立 commit** — verify 和 retrospective 单独 hash 锁定并 commit
