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

**记录阶段开始时间：**

```bash
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('apply',{})
if 'started_at' not in p:
    p['started_at']='$COMPLETED_AT'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```

读取启动时间用于展示：
```bash
alloy _state read openspec/changes/<name> phase_timings | python3 -c "
import sys,json
print(json.loads(sys.stdin.read() or '{}').get('apply',{}).get('started_at',''))
"
```

```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply           │
│ 启动时间: <上面命令输出的 started_at 值>  │
└──────────────────────────────────────┘

**提交前置状态（worktree 创建前确保 .alloy.yaml 变更已落地）：**

```bash
git add openspec/changes/<name>/.alloy.yaml
git diff --cached --quiet || git commit -m "chore(<name>): apply 阶段开始前状态快照"
```

`git diff --cached --quiet` 接续时无变更则跳过，不会产生空 commit。

[Step 0/5] 技能可用性预检（precheck）
──────────────────────────────────────

前置检查通过：plan.md ✓  phase=planned ✓  git仓库 ✓

检查以下 6 个 Superpowers 技能是否可用（缺一 STOP，不静默降级）：
- [ ] superpowers:using-git-worktrees
- [ ] superpowers:subagent-driven-development
- [ ] superpowers:executing-plans
- [ ] superpowers:test-driven-development
- [ ] superpowers:requesting-code-review
- [ ] superpowers:verification-before-completion

任一缺失 → 输出缺失列表 → 引导 `alloy init` 重新安装 → STOP

全部通过后：
> precheck 通过：6/6 技能可用 ✓
> 共 5 个步骤：隔离 → 任务实现 → 代码验证 → 制品验证 → 复盘
```

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
  worktree 值: ".worktrees/<name>/" → 路径存在 → ✓ 已完成，跳过此步骤
  worktree 值: ".worktrees/<name>/" → 路径不存在 → ⚠️ 残留记录，重新处理
  worktree 值: "skipped"           → ✓ 用户选择不创建，跳过此步骤
  worktree 值: null（从未写入）      → ⚠️ 尚未决定，加载 using-git-worktrees
```

路径存在、"skipped" 时，直接跳过 Step 1，进入 Step 2。

null 时，先展示摘要，再加载技能：

```
> [Step 1/5] 隔离环境设置
>
> 源分支:   <当前 git branch>
> Worktree 分支: worktree-<change-name>
> Worktree 路径: .claude/worktrees/<change-name>
>
> 加载 superpowers:using-git-worktrees...
```

使用 Skill 工具加载 `superpowers:using-git-worktrees` 技能。该技能内置了完整的决策流程，Agent 按其内部指引执行即可。

**when 用户选择不创建 worktree：** 写入 `skipped`（非 null）：
```bash
alloy _state write openspec/changes/<name> worktree skipped
```

技能执行完成后，将结果写入状态文件——这是断点恢复的关键数据：
- 已创建 worktree → `alloy _state write openspec/changes/<name> worktree "<path>"`
- 用户拒绝或已在隔离环境 → `alloy _state write openspec/changes/<name> worktree skipped`

**Step 1/5 完成汇总：**

```
> [Step 1/5] 隔离环境 — 已跳过（用户选择不创建）

或

> [Step 1/5] 隔离环境 — 就绪
>
> 源分支:      feature/<name>
> Worktree 分支: worktree-<name>
> Worktree 路径: .claude/worktrees/<name>
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

   推荐方案：<superpowers:subagent-driven-development / superpowers:executing-plans>（规划阶段建议）
   理由：<来自 plans.md reason>

   1. superpowers:subagent-driven-development — 派发子 agent 并行执行（推荐）
   2. superpowers:executing-plans — 当前 session 逐步实现
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

**superpowers:executing-plans 路径：** 分三步执行，确保不丢 TDD 和 code review 闸门：

**1. 先加载 `superpowers:test-driven-development` 技能设定 TDD 预期：**
- 加载后，TDD 纪律（RED→GREEN→REFACTOR）成为本次执行的硬约束
- 不在 executing-plans 内部"顺便做"——先设定预期，再执行

**2. 加载 `superpowers:executing-plans` 技能执行 plans.md 微步骤：**
- executing-plans 按 plans.md 逐步执行，每步完成后暂停审查
- 执行过程中遵循 TDD 流程（先写测试→确认失败→实现→确认通过）

**3. executing-plans 完成后，加载 `superpowers:requesting-code-review` 技能：**
- 代码审查闸门——所有代码变更必须经过审查才能进入 Step 3 验证

> superpowers:executing-plans 路径不会 transitive 激活 TDD 或 code review。以上三步通过**显式加载**来补偿——先设定 TDD 预期，再执行，最后审查。

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

选 (a)：先写入 phase_timings.completed_at，再 hash 锁定 retrospective 并 commit（phase_timings 作为元数据附着在 retrospective 制品提交上，不单独 commit）：
```bash
# 先写入完成时间
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('apply',{})
if 'completed_at' not in p:
    p['completed_at']='$COMPLETED_AT'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done

# 再 hash 锁定 + commit
HASH=$(alloy _record compute openspec/changes/<name> retrospective)
alloy _record write openspec/changes/<name> retrospective "$HASH" "$(date "+%Y-%m-%d %H:%M:%S")" "$(alloy _record approver openspec/changes/<name>)"
git add openspec/changes/<name>/retrospective.md
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
