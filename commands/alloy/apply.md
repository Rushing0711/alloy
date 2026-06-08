---
name: "Alloy: Apply"
description: Alloy 执行阶段 - plan 完成后进入
category: Workflow
tags: [alloy, workflow]
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plan.md 任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

**状态标签约定（ANSI 颜色输出）：**
- `[PASS]` 绿色 — 检查通过
- `[FAIL]` 红色 — 检查失败
- `[HALT]` 红色 — 硬阻断，不可继续
- `[WARN]` 黄色 — 警告，可继续但需关注
- `[DONE]` 绿色 — 阶段完成

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

## 前置检查

1. 确认 `plans.md` 存在于 change 目录，不存在则报错
2. 通过 `alloy _guard` 确认 change 的 phase：
   ```bash
   alloy _guard openspec/changes/<name> applied
   ```
   若 guard 报错说明 phase 转换不合法——检查当前 phase：

   | 当前 phase | 行为 |
   |-----------|------|
   | started | "plan 尚未完成，自动进入 /alloy:plan" → 加载 alloy-plan 指令 |
   | planned | precheck 通过，继续执行 |
   | applied | precheck 通过（重入），步骤幂等处理断点 |
   | archived | "已归档，自动进入 /alloy:finish" → 加载 alloy-finish 指令 |
   | finished | "工作流已完成" → STOP |

   **实现方式：** 输出对应命令文件的完整指令，将 change name 和当前进度信息作为上下文传入。
3. 确认当前目录在 git 仓库内：
   ```bash
   git rev-parse --git-dir
   ```
   若命令成功 → 继续。
   若命令失败 → HARD STOP："项目还不是 git 仓库。请先运行 `/alloy:start` 完成初始化（包含 git init）。"
4. **Skill 预检：** 执行以下检测脚本，确认 6 个执行技能均可用：

   ```bash
   MISSING=0
   for cmd in "opsx/verify"; do
     if test -f ".claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（项目级 command）"
     elif test -f "$HOME/.claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（用户级 command）"
     else echo "  ✗ ${cmd//\//:} — 未找到"; MISSING=$((MISSING+1)); fi
   done
   for skill in "using-git-worktrees" "subagent-driven-development" "executing-plans" "test-driven-development" "requesting-code-review" "verification-before-completion"; do
     if test -d ".claude/skills/$skill"; then echo "  ✓ superpowers:$skill（项目级 skill）"
     elif test -d "$HOME/.claude/skills/$skill"; then echo "  ✓ superpowers:$skill（用户级 skill）"
     elif for d in "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers/"*"/skills/$skill"; do test -d "$d" && break; done 2>/dev/null; then echo "  ✓ superpowers:$skill（用户级 plugin）"
     else echo "  ✗ superpowers:$skill — 未找到"; MISSING=$((MISSING+1)); fi
   done
   if [ "$MISSING" -gt 0 ]; then echo ""; echo "  需要先完成环境初始化。请运行: alloy init"; exit 1; fi
   ```

   检测优先级：项目级 skill → 用户级 skill → 用户级 plugin。任一缺失 → 输出缺失列表 → 引导 `alloy init` → STOP。不静默降级。

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
> 当前在 `<由 alloy _state read ... feature_branch 获取，回退 feature/<name>>`。未在隔离 worktree 中。
>
> 分支隔离的是提交历史，但同一时间只能有一个分支在工作目录里。
> Worktree 隔离的是工作目录——每个 worktree 有独立的文件副本，可同时 checkout 不同分支。
>
> 如果你的 feature 开发期间要切到其他分支（如修紧急 bug、切 main 查东西），
> worktree 让你无需 stash/commit 当前进度，直接进另一个目录操作。
>
> 正在加载 superpowers:using-git-worktrees 技能...
```

使用 Skill 工具加载 `superpowers:using-git-worktrees` 技能。传入参数 "工作目录偏好: .claude/worktrees/<name>"。该技能内置了完整的决策流程（Step 0 问询 → 创建或跳过）和执行步骤，Agent 按其内部指引执行即可。

**路径偏好说明：** 使用无条件路径 `.claude/worktrees/<name>`，因为 `.claude/` 是 alloy 初始化时的固定目录（存在 commands/skills 等子目录）。显式指定路径后，Agent 在 git worktree fallback（EnterWorktree 不可用时）会直接使用该路径，不会因条件判断错误而回退到 `.worktrees/`。

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
> 源分支:      <由 state.feature_branch 获取，回退 feature/<name>>
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

### Step 3/5：代码层验证

> [Step 3/5] superpowers:verification-before-completion
> 正在验证代码行为——测试通过、功能正确...

使用 Skill 工具加载 `superpowers:verification-before-completion` 技能 —— 代码行为验证。

验证失败 → 修复代码 → 回到 Step 2/5（SDD），确保修复也有 TDD + code review 安全网。

### Step 4/5：制品层验证

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

### Step 5/5：复盘

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

选 (a)：写入完成时间 + hash 锁定 + 提交，一个 commit 包含所有累积变更（retrospective + 阶段完成时间 + worktree 状态），不拆开：
```bash
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
alloy _state merge openspec/changes/<name> phase_timings "{\"apply\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
HASH=$(alloy _record compute openspec/changes/<name> retrospective)
alloy _record write openspec/changes/<name> retrospective "$HASH" "$(date "+%Y-%m-%d %H:%M:%S")" "$(alloy _record approver openspec/changes/<name>)"
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

**通过 `alloy _guard` 校验并更新 phase：**
```bash
alloy _guard openspec/changes/<name> applied --apply
```
guard 自动校验 hash 一致性后推进 phase。

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
