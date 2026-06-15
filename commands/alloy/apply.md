---
name: "Alloy: Apply"
description: Alloy 执行阶段 - plan 完成后进入
category: Workflow
tags: [alloy, workflow]
spec: 01-product-spec/03-apply-spec.md
behaviors:
  preconditions: 11
  hard_stops:    8
  user_gates:    8
  warns:         3
  artifacts: [verify, retrospective]
  transitions_to: applied
  external_calls: [opsx:verify, superpowers:using-git-worktrees, superpowers:subagent-driven-development, superpowers:executing-plans, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:requesting-code-review]
---

# alloy-apply

你是 Alloy 的执行阶段编排器。按 plans.md 任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

```
[HARD_STOP] NO CODE WITHOUT TDD + NO ARTIFACT EDITING
先写测试再写代码；已生成制品禁止直接编辑，必须重新生成
违反字面 = 违反精神：哪怕"小改一行 case 不补测试"或"直接编辑 verify.md 换措辞"，也算违反 Iron Law
```

**核心原则：先 TDD 再代码，先验证再复盘。** 所有阶段制品（verify / retrospective）以 hash-lock + 单独 commit 入 records，禁直接编辑。

**交互规则：** `🔴 STOP` 等价 `USER_GATE`，必须用 `AskUserQuestion`（`commands/alloy/references/interaction-style.md`，含"沉默 ≠ 授权"通用禁令——禁批量打包、禁基于 diff 短/无 conflict 跳过、禁 agent 回填精确字符串）。跳过任何 USER_GATE = 违反 Iron Law。

**状态符号：** `⛔` = HARD_STOP / PRECONDITION_FAIL，`🔴` = USER_GATE，`⚠️` = WARN（视觉规范 §七）。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

**捕获阶段启动时间**（幂等，重入时返回已有值）：
```bash
PHASE_START=$(alloy _state timestamp ensure openspec/changes/<name> apply)
```

---

### Red Flags（第三层防御——任一借口出现即 STOP）

主文件保留 5 条核心借口，完整 12 条见 `commands/alloy/references/apply-rationalizations.md`。

| 借口 | 现实 |
|------|------|
| "先写代码再补测试" | TDD 次序不可颠倒。提速靠并行子任务，不靠砍测试（Iron Law 第一层）。 |
| "用户要改需求，直接改" | 需求变更必须走 tasks.md checkbox 闸门。已编码→开新 change，未编码→回溯，禁直接改 plans.md。 |
| "verify.md 措辞不太顺，直接编辑改一下" | 制品禁直接编辑——任何变更必须重新生成 + 重新 hash-lock。违反字面 = 违反精神。 |
| "verify FAIL 是小问题，retro 写'已知 FAIL'继续" | FAIL 必须修复回到 Step 2。带 FAIL 进 archive 阶段 = spec 与代码偏差永久封存。 |
| "single-commit 修复不需要 retrospective，自动跳过" | retrospective 跳过判定必须 USER_GATE，agent 不得自动选"跳过"（task #17）。 |

## 前置检查

```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply           │
│ 启动时间: $PHASE_START               │
└──────────────────────────────────────┘
```

### [Step 0/5] 前置检查

**1. plans.md 存在（PRECONDITION_FAIL）：** 文件不存在 → ⛔ `[PRECONDITION_FAIL] plans.md 不存在，apply 拒绝执行。请先运行 /alloy:plan 完成 plan 阶段。` 然后退出 skill。

**2. phase 路由（PRECONDITION_FAIL）：**

```bash
alloy _guard precheck openspec/changes/<name> planned,applied
```

phase=planned 或 applied 时通过（applied 为断点重入）。不匹配 → ⛔ `[PRECONDITION_FAIL]`，读取 `commands/alloy/references/phase-routing.md` 自动跳转。

**3. git 仓库（PRECONDITION_FAIL）：**

```bash
git rev-parse --git-dir
```

失败 → ⛔ `[PRECONDITION_FAIL] 项目还不是 git 仓库。请先运行 /alloy:start 完成初始化。`

**4. Skill 预检（PRECONDITION_FAIL）：** cmd: opsx/verify, skill: using-git-worktrees subagent-driven-development executing-plans test-driven-development requesting-code-review verification-before-completion

读取 `commands/alloy/references/skill-precheck.md` 检测。任一缺失 → ⛔ `[PRECONDITION_FAIL] skill 缺失，引导 alloy init，不存在降级处理`。agent 不得自行模拟缺失 skill 的行为。

**5. 多 change 并行 apply 检测（WARN，task #14）：** apply 单 change 串行（subagent 内部并行 OK）——同期多个 change 同时 apply 会导致 git 操作竞争（branch 切换、worktree 创建、commit 写入相互干扰）。

读取 `commands/alloy/references/apply-precheck.md` 执行检测。WARN 不阻断——仅提示。

提交前置状态（worktree 创建前确保 .alloy.yaml 变更已落地）：
```bash
# §5.2.1: git add 限路径，禁 -A 无路径
git add openspec/changes/<name>/.alloy.yaml
git diff --cached --quiet || git commit -m "chore(<name>): apply 阶段开始前状态快照"
```

前置检查通过：plans.md ✓  phase ✓  git ✓  技能 ✓

> 共 5 步：隔离 → 任务实现 → 代码验证 → 制品验证 → 复盘

---

## 需求变更闸门

用户提出需求/设计变更时，以编码是否已开始为分界线：

```bash
grep -c '\[x\]' openspec/changes/<name>/tasks.md
```

- **返回 0（未编码）：** 🔴 USER_GATE（必须 AskUserQuestion）: 检测到需求变更，tasks 尚未编码。选择处理路径：
  - (a) 回溯清理 plan 制品，回到 brainstorming
  - (b) 取消变更，继续 apply

  选 (a)：清理 plan 制品 → 回到 brainstorming（plan.md 的回溯清理步骤）。
  选 (b)：继续当前 apply 流程。

- **返回 > 0（已编码）：** 🔴 USER_GATE（必须 AskUserQuestion）: 检测到需求变更，tasks 已有编码完成项。选择处理路径：
  - (a) 开新 change 处理变更（引导 `/alloy:start <建议名称>`）
  - (b) 取消变更，继续 apply

  选 (a)：引导用户运行 `/alloy:start <建议名称>` 开新 change。
  选 (b)：继续当前 apply 流程。

> 违反字面 = 违反精神：禁直接编辑 plans.md "顺手"承载需求变更——必须走 (a) 回溯或开新 change，否则 plans hash 锁定形同虚设。

## 执行步骤

### [Step 1/5] 隔离环境设置

> [HARD_STOP §3.5.1] worktree / branch 操作链路上严禁 agent 自动 `git worktree remove --force` / `git worktree prune --force` / `git branch -D` / `rm -rf .claude/worktrees/<name>` / `git reset --hard` 任意一个清场。
> 违反字面 = 违反精神：哪怕"残留 worktree 看起来空，删了让流程继续"，也算违反禁令——必须 USER_GATE。

**幂等检查：**
```bash
alloy _guard worktree-status openspec/changes/<name>
```

- `done:<path>:<branch>` → ✓ 已完成，跳过
- `skipped` → ✓ 用户选择不创建，跳过
- `pending` → 加载 using-git-worktrees
- `stale:<path>` → ⚠️ WARN 残留记录，让用户决策清理或重用，agent 不得自动 `git worktree prune`（§3.5.1）

**分支验证闸门（PRECONDITION_FAIL）**——加载 using-git-worktrees 前必须通过；base ref 取决于当前分支，错误 base = plan 阶段 commit 丢失：

```bash
alloy _guard branch-position openspec/changes/<name>
```

- `on-feature` → ✓ 位置正确
- `on-main` / `feature-missing` / `feature-lost:<branch>` / `on-other:<branch>` → ⛔ `[PRECONDITION_FAIL] 分支位置异常`：
  - on-main：在主分支，不允许创建 worktree——plan 阶段 commit 在 feature 分支上
  - feature-missing / feature-lost：feature_branch 状态记录与实际不符
  - on-other：当前位于第三分支

  详细分类与修复选项见 `commands/alloy/references/branch-validation.md`。**禁止 agent 自动 `git checkout` 切换或 `git branch -m` 重命名——可能丢弃用户未提交工作（§3.5.1）。**

**主分支确认：** 读取 `commands/alloy/references/main-branch-detection.md`。若 `openspec/config.yaml` 已有 `alloy.main_branch`，直接用，跳过确认。

分支验证通过后，加载 `superpowers:using-git-worktrees` 技能获取用户 consent：
- 传入：工作目录偏好 `.claude/worktrees/<name>`，分支命名 `worktree-<name>`，基于 `<feature_branch>`
- **仅使用 Step 0（检测+consent）。不要用 Step 1a/1b 的创建方法——EnterWorktree 默认从 origin/main 分出，base ref 错误。**
- **必须等用户明确选择（创建/跳过）后才继续。模糊回复（"嗯"、"好吧"）不算同意。** 🔴 USER_GATE（必须 AskUserQuestion）: 确认 worktree 选择（创建 / 跳过）。

```bash
alloy _skill log openspec/changes/<name> apply superpowers:using-git-worktrees
# _skill log 写入后必须 commit——git worktree add 基于 HEAD 创建，
# 不 commit 会导致此条记录在 worktree 中丢失
git add openspec/changes/<name>/.alloy.yaml
git diff --cached --quiet || git commit -m "chore(<name>): 记录 using-git-worktrees 技能使用"
```

**用户选择不创建：** `alloy _state write openspec/changes/<name> worktree skipped`，跳到 Step 1 完成框。

**用户选择创建：** 手动创建确保正确 base ref。

**路径占用检查 + 创建后状态记录 + worktree 内分支锁定**：读取 `commands/alloy/references/apply-worktree.md`：

- 路径占用 → ⛔ PRECONDITION_FAIL + 🔴 USER_GATE（复用 / 重命名 / 中止）。**禁 agent 自动 `rm -rf` 或 `git worktree remove --force` 清场（§3.5.1）。**
- 路径未占用 → `git worktree add` 创建并 `EnterWorktree` 进入
- 创建后写入 worktree / worktree_branch / worktree_created_at 三字段并 commit（断点恢复）
- 进入后校验 HEAD == `worktree-<name>`（task #18）；不一致 ⛔ PRECONDITION_FAIL，**禁 agent 自动 git checkout 切换。**

**Step 1/5 完成：**
```
> [Step 1/5] 隔离环境 — 已跳过 / 就绪
> 源分支: <feature_branch>  Worktree: <path>/<branch> 或 N/A
> 分支锁: HEAD == worktree-<name> ✓
```

### [Step 2/5] 任务实现

```
[HARD_STOP] TDD 次序不可颠倒——RED → GREEN → REFACTOR
违反字面 = 违反精神：哪怕"只改一行 case 没必要先写测试"，也算违反 Iron Law 第一层
```

**幂等检查：** 读取 `tasks.md` checkbox 状态。已勾选任务 TDD 测试仍通过，自然跳过；从第一个未勾选开始。

**先分析，再展示推荐方案：**

1. 读取 `plans.md` frontmatter 的 `strategy` + `reason`
2. 读取 `tasks.md`，分析任务特征（数量、独立性、耦合度）
3. 展示推荐方案，用户可覆写：
   - **subagent-driven-development** — 任务多（≥3）、相互独立、涉及不同文件/模块
   - **executing-plans** — 任务少（1-2）、紧密耦合、共享状态

   plans.md 无 strategy 时分析后给出推荐（不标记），策略决定后回写 frontmatter 并重新 hash 锁定。

4. 🔴 USER_GATE（必须 AskUserQuestion）: 选择执行策略（SDD / EP）。必须等用户选择后才加载技能。

**SDD 路径：**

**先记录技能使用，再加载技能：**
```bash
alloy _skill log openspec/changes/<name> apply superpowers:subagent-driven-development
alloy _skill log openspec/changes/<name> apply test-driven-development --via subagent-driven-development
alloy _skill log openspec/changes/<name> apply spec-compliance-review --via subagent-driven-development
alloy _skill log openspec/changes/<name> apply code-quality-review --via subagent-driven-development
```

加载 `superpowers:subagent-driven-development`，由其驱动分派子 agent → 每个独立 TDD + code review（transitive 激活）。

**构造子 agent 任务描述时，必须注入以下指令到任务描述末尾：**
> 实现完成时，在**同一个 commit** 中包含：实现代码 + 测试 + `openspec/changes/<name>/tasks.md` 中你负责的 task checkbox 从 `- [ ]` 改为 `- [x]`（含父级和子级）。不要分两个 commit。

**EP 路径：** 四步显式加载补偿（EP 不 transitive 激活 TDD/spec 合规/code review）：
1. 加载 `test-driven-development`（设定 TDD 预期，RED→GREEN→REFACTOR 成为硬约束）
2. 加载 `executing-plans`（逐步执行 plans.md，每步遵循 TDD）
3. Spec 合规审查（Agent 自检：每个 checkbox ↔ 代码实现，无 over-building，排除范围未碰，不通过→修复→重审）
4. 加载 `requesting-code-review`（代码审查闸门——所有代码变更必须经审查才进 Step 3）

```bash
alloy _skill log openspec/changes/<name> apply superpowers:test-driven-development
alloy _skill log openspec/changes/<name> apply superpowers:executing-plans
alloy _skill log openspec/changes/<name> apply superpowers:requesting-code-review
```

---

#### Step 2/5 子 agent commit 通用规则（SDD/EP 共享）

每个子 agent 任务的 commit 必须满足以下三条硬规则——任一违反即拒绝合入。读取 `commands/alloy/references/apply-subagent-commit.md` 获取完整 bash 与措辞，要点：

1. **分支再校验**（⛔ PRECONDITION_FAIL，task #18）—— `git rev-parse --abbrev-ref HEAD` ≠ `worktree-<name>` 时退出，禁 agent 自动 `git checkout` 切回。
2. **git add 限路径**（⛔ HARD_STOP §5.2.1）—— 精确路径，禁 `-A`/`-a`/`.`。违反字面 = 违反精神：哪怕"反正只有这一个文件"也禁 `-A`，副作用文件会被一并 commit。判断不准 🔴 USER_GATE。
3. **stash 残留检查**（⚠️ WARN，task #19）—— commit 前 `git stash list`，非空播报让用户决策，禁 agent 自动 `git stash drop`（§3.5.1）。

### [Step 3/5] 代码层验证

加载 `superpowers:verification-before-completion` 技能——代码行为验证。

```bash
alloy _skill log openspec/changes/<name> apply superpowers:verification-before-completion
```

**验证失败处理（⛔ HARD_STOP）：**

> ⛔ [HARD_STOP] verify-before-completion FAIL → 修复代码回到 Step 2，修复也必须 TDD + code review。
> 禁止：agent 在 retrospective 中标记"已知 FAIL 跳过修复"——FAIL 必须修到 PASS 才能进 Step 4。
> 违反字面 = 违反精神：哪怕"小问题先记 deferred 跳过"，也算违反 Iron Law——
> 带 FAIL 进 archive = spec 与代码偏差永久封存。

### [Step 4/5] 制品层验证

**幂等检查：**
```bash
alloy _record check openspec/changes/<name> verify 2>/dev/null && echo "VERIFY_DONE" || echo "VERIFY_NEEDED"
```
VERIFY_DONE → 跳过 Step 4。

**生成 verify 前，校验 plans 上游 hash（⛔ PRECONDITION_FAIL）：**

```bash
alloy _record check openspec/changes/<name> plans
```

check 失败 → ⛔ `[PRECONDITION_FAIL] plans 上游 hash 失效——plans.md 可能被未审批修改`。修复路径：用户审查 plans.md 变更后，决定是否回到 plan 阶段重新锁定，或回滚 plans.md 到锁定版本。**禁止 agent 自动 `alloy _record write` 重新锁定——绕过审查 = 绕过 hash chain（§5.2.3）。**

1. 调用 `/opsx:verify` 执行 7 项检查（结构校验 → 任务完成 → Delta Spec 同步 → Design/Specs 一致性 → 实现信号 → 路由泄漏检测 → 延期任务对照）
   ```bash
   alloy _skill log openspec/changes/<name> apply opsx:verify
   ```
2. 输出必须重写为与 `instructions/verify.md` 和 `templates/verify.md` 一致的语言，不直接透传 CLI 输出。检查结果（PASS/FAIL/WARNING）保留作为事实依据。

**opsx:verify 失败处理（⛔ HARD_STOP）：**

> ⛔ [HARD_STOP] opsx:verify 7 项有 FAIL → 修复 → 回到 Step 2（SDD），禁带 FAIL 继续 Step 5。
> 违反字面 = 违反精神：哪怕"FAIL 仅 1 项 retro 写一笔继续"，也算违反——FAIL 必须先修到 PASS。
> WARNING 项可继续，但需在 retrospective §2 Misses 记录。

**tasks.md checkbox 已更新，重录 hash（§5.2.1 git add 限路径）：**
```bash
HASH=$(alloy _record compute openspec/changes/<name> tasks)
alloy _record write openspec/changes/<name> tasks "$HASH" "$(date "+%Y-%m-%d %H:%M:%S")" "$(alloy _record approver openspec/changes/<name>)"
```

**verify.md 审查窗口（🔴 USER_GATE）：**

> 制品 [1/2] verify ✓ 完成
> [展示 verify.md 完整内容]
> 🔴 USER_GATE（必须 AskUserQuestion）: 确认锁定 verify
> (a) 确认并继续——hash-lock + commit
> (b) 需要调整——重新生成 verify.md（禁直接编辑），重展示审查窗口
>
> 违反字面 = 违反精神：哪怕 verify.md 看似"明显合理"，没经过用户明确选择 (a) = 不算授权。
> 禁止 agent 基于"diff 短"或"全 PASS"自动跳过此 USER_GATE，必须完整阅读 diff。

选 (a)：hash 锁定 + commit（§5.2.1 git add 限路径）：
```bash
HASH=$(alloy _record compute openspec/changes/<name> verify)
APPROVED_AT=$(date "+%Y-%m-%d %H:%M:%S")
APPROVER=$(alloy _record approver openspec/changes/<name>)
alloy _record write openspec/changes/<name> verify "$HASH" "$APPROVED_AT" "$APPROVER"
# §5.2.1: 限路径，禁 -A
git add openspec/changes/<name>/verify.md openspec/changes/<name>/.alloy.yaml
git commit -m "docs(<name>): verify 已确认"
```

选 (b)：重新生成 verify.md（不是直接编辑），重新展示审查窗口。

> [N/M] 是阶段内局部编号（M=2），不输出全局制品进度。全局进度由 `alloy status` 管理。

### [Step 5/5] 复盘

**幂等检查：**
```bash
alloy _record check openspec/changes/<name> retrospective 2>/dev/null && echo "RETRO_DONE" || echo "RETRO_NEEDED"
```
RETRO_DONE → 跳过 Step 5。

**PRECHECK：** verify.md 通过检查（⛔ PRECONDITION_FAIL）：
```bash
alloy _guard verify-passed openspec/changes/<name>
```
FAIL → ⛔ `[PRECONDITION_FAIL] verify.md 未通过——retrospective 不得在 FAIL 状态下生成`。修复路径：回到 Step 3/Step 4 修复后重锁 verify。PASS/WARNING → 继续。

**校验 verify 上游 hash（⛔ PRECONDITION_FAIL）：**

```bash
alloy _record check openspec/changes/<name> verify
```

失败 → ⛔ `[PRECONDITION_FAIL] verify 上游 hash 失效——verify.md 可能被未审批修改`。禁止 agent 自动重新锁定，必须用户审查后决定。

读取 `instructions/retrospective.md`，按 `templates/retrospective.md` 生成。输出语言与模板一致。代码标识符、commit hash、文件名保持原文。

**§0-§6：** §0 量化全景（records + git log + 文件系统三来源）、§1 Wins（evidence 格式）、§2 Misses（🔴 blocking / 🟡 painful / 📌 nit）、§3 Plan Deviations、§4 技能审计（从 `.alloy.yaml` skill_usage[] 读取，空填 `—`，跳过的展开三问）、§5 Surprises、§6 Promote Candidates（`→ Promote to: memory` 的条目在 archive 阶段写入 memory）。

**Retrospective 跳过判定（🔴 USER_GATE + ⛔ HARD_STOP，task #17）：**

复盘是证据驱动的——每条结论引用具体 commit 或文件。判定流程：

```bash
FEATURE_BRANCH=$(alloy _state read openspec/changes/<name> feature_branch 2>/dev/null)
COMMIT_COUNT=$(git log "${FEATURE_BRANCH}..HEAD" --oneline 2>/dev/null | wc -l | tr -d ' ')
echo "本 change 累计 commit 数: $COMMIT_COUNT"
```

- `COMMIT_COUNT == 1` 时：可能符合"单 commit 小修跳过"条件，但 **🔴 USER_GATE（必须 AskUserQuestion，不得 agent 自动选）：**

  > 本 change 仅 1 个 commit，是否跳过 retrospective？
  > (a) 不跳过——正常生成（推荐：即使小改也常有可记录的洞察）
  > (b) 跳过——写入 retrospective.md 仅含 "Skipped: single-commit fix, no insights"
  >
  > [HARD_STOP] agent 不得自动选 (b)。即使 COMMIT_COUNT == 1，跳过也必须用户明确选择 (b)。
  > 违反字面 = 违反精神：哪怕"用户上次也选了跳过所以这次猜跳过"，也是违反——每次必须 ask。

- `COMMIT_COUNT > 1`：直接生成 retrospective，不询问跳过。

**retrospective.md 审查窗口（🔴 USER_GATE）：**

> 制品 [2/2] retrospective ✓ 完成
> [展示 retrospective.md 完整内容]
> 🔴 USER_GATE（必须 AskUserQuestion）: 确认锁定 retrospective
> (a) 确认并继续提交
> (b) 需要调整——重新生成（禁直接编辑），重展示审查窗口
>
> 违反字面 = 违反精神：禁 agent 基于"内容看起来挺全"自动跳过此 USER_GATE。

选 (a)：审批时间 + hash 锁定 + commit（一个 commit 包含所有累积变更——retrospective + 阶段完成时间 + worktree 状态）（§5.2.1 git add 限路径）：
```bash
APPROVAL_TIME=$(date "+%Y-%m-%d %H:%M:%S")
sed -i '' "s/| retrospective |.*| 待确认 |/| retrospective | $(alloy _record approver openspec/changes/<name>) | — | ${APPROVAL_TIME} |/" openspec/changes/<name>/retrospective.md
COMPLETED_AT="${APPROVAL_TIME}"
alloy _state merge openspec/changes/<name> phase_timings "{\"apply\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
HASH=$(alloy _record compute openspec/changes/<name> retrospective)
alloy _record write openspec/changes/<name> retrospective "$HASH" "$APPROVAL_TIME" "$(alloy _record approver openspec/changes/<name>)"
# §5.2.1: git add 限路径，禁 -A——openspec/changes/<name>/ 是该 change 的根目录，不会扩散
git add openspec/changes/<name>/
git commit -m "docs(<name>): retrospective 已确认"
```

选 (b)：重新生成（不是直接编辑），重新展示审查窗口。

---

### 完成

```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply — DONE    │
│ 启动时间: phase_timings.apply.started_at
│ 完成时间: phase_timings.apply.completed_at
│ 耗时: completed_at - started_at
└──────────────────────────────────────┘

→ Change: <name>  Phase: applied  Worktree: <path 或 当前分支>
→ 制品: plans ✓ verify ✓ retrospective ✓
→ 代码变更已提交  验证: <PASS 或 N 个 WARN>
```

**apply 完成后不要自动进入 archive** — archive 是人工闸门，留给用户做 QA。

**通过 `alloy _guard` 校验并推进 phase（⛔ HARD_STOP §5.2.3 路径 B 降级）：**

降级路径详见 `commands/alloy/references/phase-downgrade-path.md`（apply 阶段降级 → `planned`）。**禁止 agent 自动 `git reset --hard` / `git checkout .` 清场（§3.5.1）。** 违反字面 = 违反精神：哪怕"清理一下让流程重启"也算违反——退出 skill 让用户决策是唯一合法路径。

```bash
alloy _guard openspec/changes/<name> applied --apply
# §5.2.1 git add 限路径，禁 -A
git add openspec/changes/<name>/.alloy.yaml
git commit -m "chore(<name>): phase → applied"
```

`git commit` 失败 → ⛔ `[HARD_STOP] phase commit 失败，apply 中止。.alloy.yaml 变更未提交时 archive 状态不一致。检查 git 状态后重试，禁止在 commit 失败时继续。`

```
💡 建议执行 QA 测试或浏览器测试，确认后再进入 archive。
准备好后，运行 /alloy:archive 进入归档阶段。
```
