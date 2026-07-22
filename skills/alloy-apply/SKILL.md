---
name: alloy-apply
description: 执行应用阶段--将 plan 落地为代码。手动调用 /alloy-apply。
spec: 01-product-spec/03-apply-spec.md
behaviors:
  preconditions: 12
  hard_stops:    31
  user_gates:    7
  warns:         3
  artifacts: [verify, retrospective]
  transitions_to: applied
  external_calls: [opsx:verify, superpowers:using-git-worktrees, superpowers:subagent-driven-development, superpowers:executing-plans, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:requesting-code-review]
---

# alloy-apply

## REQUIRED BACKGROUND

**REQUIRED BACKGROUND:** Understand alloy-shared

你是 Alloy 的执行阶段编排器。按 plans.md 任务实现，内部遵循 TDD，执行完毕自动验证和复盘。

```
[HARD_STOP] NO CODE WITHOUT TDD + NO ARTIFACT EDITING
先写测试再写代码；已生成制品禁止直接编辑，必须重新生成
违反字面 = 违反精神：哪怕"小改一行 case 不补测试"或"直接编辑 verify.md 换措辞"，也算违反 Iron Law
```

**核心原则：先 TDD 再代码，先验证再复盘。** 所有阶段制品（verify / retrospective）以 hash-lock + 单独 commit 入 records，禁直接编辑。

**交互规则:** `🔴 STOP` 等价 `USER_GATE`--首次呈现即必须调平台原生交互工具(禁"先文本展示 1./2. 再等用户打字")。Claude Code: `AskUserQuestion`;OpenCode: `question`;Pi: `alloy-question`。完整规则 + 平台调用示例见 `alloy-shared/references/interaction-style.md`;USER_GATE pending/clear/reset 流程见 `alloy-shared/references/gate-ceremony.md`。跳过 USER_GATE / 批量打包 / 基于内容跳过 = 违反 Iron Law。

**状态符号:** `⛔` = HARD_STOP / PRECONDITION_FAIL,`🔴` = USER_GATE,`⚠️` = WARN(完整含义见 `alloy-shared/references/hard-stop-meaning.md`)。

**输出规则:** 阶段入口/出口按 `alloy-shared/references/phase-frame.md` 输出 Phase 框 + Step 标题 + 块引用 + 引导行。skill md 中的 Phase 框代码块是必须输出到终端的格式,不是文档示例。完整规范见 `docs/specification/02-visual-spec.md`。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

---

### Red Flags（第三层防御——任一借口出现即 STOP）

主文件保留 7 条核心借口，完整 14 条见 `references/rationalizations.md`。

| 借口 | 现实 |
|------|------|
| "先写代码再补测试" | TDD 次序不可颠倒。提速靠并行子任务，不靠砍测试（Iron Law 第一层）。 |
| "用户要改需求，直接改" | 需求变更必须走 tasks.md checkbox 闸门。已编码→开新 change，未编码→回溯，禁直接改 plans.md。 |
| "verify.md 措辞不太顺，直接编辑改一下" | 制品禁直接编辑——任何变更必须重新生成 + 重新 hash-lock。违反字面 = 违反精神。 |
| "verify FAIL 是小问题，retro 写'已知 FAIL'继续" | FAIL 必须修复回到 Step 2。带 FAIL 进 archive 阶段 = spec 与代码偏差永久封存。 |
| "single-commit 修复不需要 retrospective，自动跳过" | retrospective 跳过判定必须 USER_GATE，agent 不得自动选"跳过"（task #17）。 |
| "先文本列 1./2. 选项让用户思考，再调 AskUserQuestion 双保险" | ⛔ HARD_STOP：双重呈现违规——首次呈现必须是平台原生交互工具调用,不是文本。哪怕"先展示选项让用户思考"、"文本+工具双保险",也算违反。常见模式:thinking 决策"用 AskUserQuestion"但执行时先输出纯文本选项(决策→执行断裂)。 |
| "Claude Code agent 手动 git worktree add,不用 EnterWorktree" | ⛔ HARD_STOP：Claude Code agent 必须用 EnterWorktree 工具创建 worktree,路径 `.claude/worktrees/<name>`。手动 git worktree add 不解绑 session cwd,后续命令需 cd 切换(易错)。EnterWorktree 的 session 解绑是关键,cd 替代不了。 |

## 前置检查

**进入阶段时，必须输出以下 Phase 框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [3/5] · Phase: Apply           │
│ 启动时间: phase_timings.apply.started_at │
└──────────────────────────────────────┘
```

### [Step 0/5] 前置检查

**⛔ HARD_STOP（阶段入口必执行）：先记录阶段开始时间**

```bash
alloy _phase start openspec/changes/<name> apply
```

> 必须在 Step 0 任何前置检查之前执行——`_skill log` / `_artifact commit` 都依赖 `phase_timings.apply.started_at` 已存在，跳过会导致后续命令 PRECONDITION_FAIL。
>
> `alloy _phase start` 原子完成：幂等写 `phase_timings.apply.started_at` + git add 限路径 + commit。产生独立的"阶段开始"commit（仅 .alloy.yaml），不并入后续制品 commit。

**1. plans.md 存在（PRECONDITION_FAIL）：** 文件不存在 → ⛔ `[PRECONDITION_FAIL] plans.md 不存在，apply 拒绝执行。请先运行 /alloy-plan 完成 plan 阶段。` 然后退出 skill。

**2. phase 路由（PRECONDITION_FAIL）：**

```bash
alloy _guard precheck openspec/changes/<name> applying,applied
```

phase=applying 或 applied 时通过（applied 为断点重入）。不匹配 → ⛔ `[PRECONDITION_FAIL]`，读取 `alloy-shared/references/phase-routing.md` 自动跳转。

**3. git 仓库（PRECONDITION_FAIL）：**

```bash
git rev-parse --git-dir
```

失败 → ⛔ `[PRECONDITION_FAIL] 项目还不是 git 仓库。请先运行 /alloy-start 完成初始化。`

**4. Skill 预检（PRECONDITION_FAIL）：** cmd: opsx/verify, skill: using-git-worktrees subagent-driven-development executing-plans test-driven-development requesting-code-review verification-before-completion

调 `alloy _precheck --cmd "opsx/verify" --skill "using-git-worktrees subagent-driven-development executing-plans test-driven-development requesting-code-review verification-before-completion"` 检测(多 agent 适配,详见 `alloy-shared/references/skill-precheck.md`)。任一缺失 → ⛔ `[PRECONDITION_FAIL] skill 缺失，引导 alloy init，不存在降级处理`。agent 不得自行模拟缺失 skill 的行为。

**5. 多 change 并行 apply 检测（WARN，task #14）：** apply 单 change 串行（subagent 内部并行 OK）——同期多个 change 同时 apply 会导致 git 操作竞争（branch 切换、worktree 创建、commit 写入相互干扰）。

读取 `references/precheck.md` 执行检测。WARN 不阻断——仅提示。

提交前置状态（worktree 创建前确保 .alloy.yaml 变更已落地；若 `_phase start` 之后无新变更则自动跳过）：
```bash
# §5.2.1: git add 限路径(原子命令完成 add + commit,幂等;禁 -A 无路径)
alloy _chore-commit openspec/changes/<name> --msg "chore(<name>): apply 阶段开始前状态快照" --paths "openspec/changes/<name>/.alloy.yaml"
```

前置检查通过：plans.md ✓  phase ✓  git ✓  技能 ✓

> 共 5 步：隔离 → 任务实现 → 代码验证 → 制品验证 → 复盘

---

## 需求变更闸门

**apply 阶段的需求变更处理分两档，由两个标志位决定：**

**标志位检测**（agent 执行，结果决定走哪一档）：
```bash
# 标志位 1：worktree 是否创建（读 .alloy.yaml worktree 字段）
WORKTREE=$(alloy _state read openspec/changes/<name> worktree)
# worktree=skipped 或 null → 未创建 worktree
# worktree=<路径> → 已创建 worktree

# 标志位 2：SDD/EP 是否启动（读 skill_usage）
SKILL_USAGE=$(alloy _state read openspec/changes/<name> skill_usage)
# 含 subagent-driven-development 或 executing-plans → 已启动代码生成
# 都不含 → 未启动
```

**档位 A：apply 早期（worktree 未创建 + SDD/EP 未启动）→ 允许回退到 brainstorming**

两个标志位都满足"未创建/未启动"时，apply 阶段仍可回退。走 plan.md 的检查点回退流程：
- 回退前创建 progress 检查点（`_checkpoint create --kind progress --reason "apply 早期回退前快照"`）——保护当前 apply 进度，供放弃变更时切回
- 列出 brainstorming 检查点让用户选（USER_GATE，筛选 brainstorming- 前缀）
- `_checkpoint switch` 回退到所选 brainstorming 检查点(CLI 内部自动清理未 commit 变更,agent 禁跑 git restore)
- 重走 start.md 步骤 9-11（brainstorming → draft → 检查点 → _phase complete start）→ 重新走 plan → 重新进 apply

> apply 早期回退成本极低（无 worktree、无代码），强行 discard 重开太重。复用 plan 阶段的检查点回退机制即可。

**档位 B：apply 中后期（worktree 已创建 或 SDD/EP 已启动）→ 只能 discard 重开**

任一标志位不满足（worktree 已创建 或 SDD/EP 已启动）时，回退会破坏 worktree 隔离或丢失代码。此时只能 discard。

> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具(AskUserQuestion/question)调用自动 clear 或手动 `alloy _guard user-gate pass` 降级。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require openspec/changes/<name> apply:requirement-change
```

🔴 USER_GATE（必须平台原生交互工具）：检测到需求变更，根据标志位结果选择路径：

**档位 A（apply 早期）选项：**
> 检测到需求变更。当前处于 apply 早期（worktree 未创建 + 代码未生成），可回退到 brainstorming。
> 1. 回退到 brainstorming 检查点（走 plan.md 检查点回退流程）
> 2. 取消变更，继续当前 apply

**档位 B（apply 中后期）选项：**
> 检测到需求变更。apply 中后期（worktree 已创建 或 代码已生成），回退会破坏一致性。
> 1. 放弃当前 change，开新 change——执行 `/alloy-discard <name>` 后 `/alloy-start <new-name>`
> 2. 取消变更，继续当前 apply

> ⛔ [HARD_STOP] 禁直接编辑 plans.md/specs 制品承载需求变更。无论档位 A 还是 B，制品修改都必须通过"重新生成"（reset + 重新走流程）或"discard 重开"实现，不可直接 Edit。
> 违反字面 = 违反精神：哪怕"只改一行 spec 描述"，直接编辑都会让制品 hash 与 records 失配。

## 执行步骤

### [Step 1/5] 隔离环境设置

> [HARD_STOP §3.5.1] worktree / branch 操作链路上严禁 agent 自动 `git worktree remove --force` / `git worktree prune --force` / `git branch -D` / `rm -rf .claude/worktrees/<name>` / `rm -rf .worktrees/<name>` / `git reset --hard` 任意一个清场(两种 worktree 路径都覆盖:Claude Code 用 `.claude/worktrees/`,OpenCode 用 `.worktrees/`;Pi 不支持 worktree,不会产生这些路径)。
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

- `on-feature` → ✓ 合规：当前在 feature 分支（非 main），符合 Alloy 工作流推荐——所有 change 工作应在 feature 分支进行，main 只接收合入
- `on-main` / `feature-missing` / `feature-lost:<branch>` / `on-other:<branch>` → ⛔ `[PRECONDITION_FAIL] 分支位置异常`：
  - on-main：在主分支，不允许创建 worktree——plan 阶段 commit 在 feature 分支上
  - feature-missing / feature-lost：feature_branch 状态记录与实际不符
  - on-other：当前位于第三分支

  详细分类与修复选项见 `alloy-shared/references/branch-validation.md`。**禁止 agent 自动 `git checkout` 切换或 `git branch -m` 重命名——可能丢弃用户未提交工作（§3.5.1）。**

**主分支确认：** 读取 `alloy-shared/references/main-branch-detection.md`。若 `openspec/config.yaml` 已有 `alloy.main_branch`，直接用，跳过确认。

分支验证通过后,加载 `using-git-worktrees` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`):
- Claude Code / OpenCode: 调 `skill({ name: "using-git-worktrees" })`
- **完整执行技能 Step 0-4**（检测 + consent + 创建 + 项目设置 + 基线测试），不再限制仅 Step 0
- **前置条件（alloy init 已配置）：** Claude Code 的 `.claude/settings.json` 含 `worktree.baseRef: head`，EnterWorktree 从当前 feature 分支分出（非 origin/main），base ref 正确。
- **传入 name=`<name>`**（change 名）：所有 agent 统一用此 name 作为分支名(`worktree-<name>`)和 worktree 目录名

> ⛔ [HARD_STOP] worktree 创建按 agent 平台分两种路径,各自必须用对应方式,禁混用:
> - **Claude Code agent:** 必须用 `EnterWorktree(name)` 工具创建,路径 `.claude/worktrees/<name>`(EnterWorktree 硬编码,不可改)。禁手动 `git worktree add`。
> - **OpenCode agent:** 调 `alloy _worktree-create <change-dir>` 原子命令创建,路径 `.worktrees/<name>`,分支 `worktree-<name>`。命令内部完成 git worktree add + _state write 三字段 + commit。OpenCode 的 bash 工具有 `workdir` 参数,agent 后续每个 bash 命令传 `workdir=<worktree>` 进入 worktree 执行。
> 违反字面 = 违反精神:
> - Claude Code agent:哪怕"手动 git worktree 更可控"、"路径换一下无影响"、"superpowers 技能引导手动创建",也算违反--
>   - `EnterWorktree` 解绑 session cwd,后续 CLI 命令自动在 worktree 执行;手动 `git worktree add` 不解绑,agent 需 `cd` 切换(易错,且 cd 不解绑 session)
>   - `.claude/worktrees/` 是 alloy 约定(与 `.claude/settings.json` / `.claude/commands/` 一致)
>   - 手动创建的 worktree 路径记录到 state,archive 阶段 `_worktree-cleanup` 用 state 路径清理,路径不一致虽不致命但偏离约定
> - OpenCode agent:必须走 `alloy _worktree-create` 建到 `.worktrees/<name>`,禁手动建到其他路径(如 `.git/worktrees/` 或项目根下自定义目录)
> - **`.worktrees/` 已由 `alloy init` 写入 .gitignore**(运行时规则块),无需重复检测或添加。禁用 `git check-ignore .worktrees` 检测--`.worktrees` 目录不存在时,`git check-ignore .worktrees`(不带斜杠)对 `.worktrees/`(带斜杠的目录规则)返回 exit 1,误判为"未忽略"。如需校验,用 `grep -q '^.worktrees/' .gitignore`。
> 常见违规模式:
> - Claude Code agent 手动 `mkdir -p .worktrees && git worktree add .worktrees/<name>`--应该用 `EnterWorktree(name)` 工具
> - Claude Code agent 认为"手动更可控"绕过 EnterWorktree--EnterWorktree 的 session 解绑是关键,手动 cd 替代不了
- **必须等用户明确选择（创建/跳过）后才继续。模糊回复（"嗯"、"好吧"）不算同意。**

> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具(AskUserQuestion/question)调用自动 clear 或手动 `alloy _guard user-gate pass` 降级。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require openspec/changes/<name> apply:worktree-choice
```

> **Pi 下此 gate 自动通过**:guard 检测 `PI_CODING_AGENT=true` 直接返回 `✓ 自动通过(Pi 不支持 worktree)` + 输出 `-> 走 skipped 路径`。agent 按输出走下方"用户选择不创建"段,Claude Code/OpenCode 正常调问答工具问用户。

🔴 USER_GATE（必须平台原生交互工具）: 确认 worktree 选择。**选项描述必须如实映射任务规模,禁说反：**

> question 文案要求(header 突出决策性,禁用模糊技术描述):
> - header: "是否创建 worktree?"
> - question: "apply 阶段是否创建 worktree 隔离?(任务大→创建,任务小→跳过)"
> - 选项 label + description 见下方,禁改 label 加"推荐"后缀

> Worktree 隔离当前工作区，在独立目录+独立分支执行 apply，不影响 feature 分支现场。
> - **特点：** 执行期间可随时切回 feature/main 分支处理其他任务，apply 工作不受干扰
> - 选项描述（必须如实映射,禁说反）：
>   - 1. 创建 worktree：**适合任务大/执行久**（多子任务、需 TDD 迭代）。创建独立工作目录,执行期间可随时切回其他分支
>   - 2. 跳过，直接在 feature 分支执行：**适合任务小/快速完成**
>
> ⛔ [HARD_STOP] 禁把 worktree 描述成"任务极简适合"——worktree 是任务大才用,任务极简应跳过。
> 违反字面 = 违反精神：哪怕"想让用户选 worktree 所以描述得吸引人",也算违反——描述必须如实反映适用场景,不可为引导用户选择而说反。
>
> **禁加"推荐"后缀**——选项 label 不得加"（推荐）"等引导性标签。worktree 适合任务大,小任务加"推荐"会误导用户。让用户按任务规模自选,禁 agent 用"推荐"标签 bias 用户决策。

```bash
alloy _skill log openspec/changes/<name> apply superpowers:using-git-worktrees
# _skill log 写入后必须 commit——后续 worktree 创建基于 HEAD，
# 不 commit 会导致此条记录在 worktree 中丢失
alloy _chore-commit openspec/changes/<name> --msg "chore(<name>): 记录 using-git-worktrees 技能使用" --paths "openspec/changes/<name>/.alloy.yaml"
```

> **[HARD_STOP] `_skill log` 后必须立即 commit，禁止未 commit 就 EnterWorktree。**
> 违反字面 = 违反精神：哪怕"先检查 worktree 状态再 commit"、"commit 前先验证环境"——也禁止跳过 commit。
> worktree 从 feature HEAD checkout，未 commit 的 skill_usage 记录不在 HEAD 里 → worktree 内 .alloy.yaml 缺失这条记录 + feature 分支残留未提交变更。
> **EnterWorktree 前必须校验主仓 clean：**
> ```bash
> DIRTY=$(git status --porcelain)
> if [ -n "$DIRTY" ]; then
>   echo "⛔ [HARD_STOP] 主仓有未提交变更，禁止 EnterWorktree"
>   git status --short
>   echo "  先 commit 再创建 worktree——worktree 基于 HEAD，未 commit 的变更不会带入 worktree"
>   exit 1
> fi
> ```

**用户选择不创建：** `alloy _state write openspec/changes/<name> worktree skipped`,然后 commit（与 worktree 创建路径一样,_skill log + state write 后必须 commit,避免 .alloy.yaml 残留未提交变更）：
```bash
alloy _chore-commit openspec/changes/<name> --msg "chore(<name>): 记录 worktree 决策 skipped" --paths "openspec/changes/<name>/.alloy.yaml"
```
> commit message 用"记录 worktree 决策 skipped",不用"记录 using-git-worktrees 技能使用（skipped）"——前者明确这是 worktree 决策记录,与上方 _skill log commit 语义区分;后者含"using-git-worktrees"会与上方 commit 看起来重复。
跳到 Step 1 完成框。

**用户选择创建：** 按 agent 平台分两种路径创建 worktree:

- **Claude Code agent:** 用 `EnterWorktree(name)` 工具创建,路径 `.claude/worktrees/<name>`(EnterWorktree 硬编码)。session cwd 自动解绑到 worktree。创建后在 worktree 内手动写三字段(下方"创建后状态记录")。
- **OpenCode agent:** 调 `alloy _worktree-create <change-dir>` 原子命令创建,路径 `.worktrees/<name>`,分支 `worktree-<name>`。命令内部完成 git worktree add + _state write 三字段 + commit,agent 不手动 git worktree add / _state write / mkdir .worktrees。OpenCode 的 bash 工具有 `workdir` 参数,agent 后续每个 bash 命令传 `workdir=<worktree>` 进入 worktree 执行。

```bash
# OpenCode:原子创建 worktree(含 state 三字段 + commit)
alloy _worktree-create openspec/changes/<name>
```

> ⛔ [HARD_STOP] 禁用 feature 分支名建 worktree:
> - 错误:`git worktree add .worktrees/feature/<name> -b feature/<name>` -- feature 分支已存在且已被主仓 checkout,fatal
> - 正确:worktree 分支名约定 `worktree-<name>`(alloy _worktree-create 自动用此约定)
> - Claude Code 用 EnterWorktree(路径 `.claude/worktrees/<name>`),OpenCode 用 `alloy _worktree-create`(路径 `.worktrees/<name>`)

**创建后状态记录 + worktree 内分支锁定**：

- Claude Code:EnterWorktree 创建后,在 worktree 内手动写三字段(`alloy _state write` x3 + commit);OpenCode:`_worktree-create` 已自动完成,跳过此步
- 技能执行完毕后，**必须验证已在 worktree 内**（`GIT_DIR != GIT_COMMON`），否则 ⛔ PRECONDITION_FAIL--禁 fallback 到主仓写入（元信息写到 feature 分支会导致 worktree 内状态分裂）
- ⛔ [HARD_STOP] 在 worktree 内**必须**写入 worktree / worktree_branch / worktree_created_at **三字段**并 commit（断点恢复）。三字段缺一不可——worktree_created_at 漏写会导致 archive 阶段时间链断裂。
  违反字面 = 违反精神：哪怕"worktree 路径已记录、created_at 可推断"、"先写两个字段后面补",也算违反——worktree_created_at 是 worktree 创建时间的唯一来源,archive 阶段清理 worktree 时需要这个字段计算 worktree 存活时长。
  常见违规模式:agent 只写 worktree + worktree_branch 两字段,漏 worktree_created_at。
- 进入后校验 HEAD == `worktree-<name>`（task #18）；不一致 ⛔ PRECONDITION_FAIL，**禁 agent 自动 git checkout 切换。**

> ⛔ [HARD_STOP] **OpenCode worktree cwd 隔离**(无 EnterWorktree 工具,session cwd 不自动解绑):
> - Claude Code 用 `EnterWorktree` 创建 worktree 后,session cwd 自动解绑到 worktree,后续所有 Bash/Write 默认在 worktree 内执行
> - **OpenCode 走 `alloy _worktree-create`,session cwd 不解绑**,仍在主仓。OpenCode bash 工具有 `workdir` 参数,agent 每次调用传 `workdir=<worktree>` 进入;write/edit 工具必须用 worktree 绝对路径前缀,否则文件落主仓污染 feature 分支
> - worktree 路径从 state 读取:`WORKTREE_PATH=$(alloy _state read openspec/changes/<name> worktree)`
>
> **必跑命令**(worktree 创建后,Step 2 及之后所有操作前):
> ```bash
> WORKTREE_PATH=$(alloy _state read openspec/changes/<name> worktree)
> # OpenCode:bash 命令传 workdir 参数;Claude Code 已由 EnterWorktree 解绑可跳过
> ```
>
> **⛔ write/edit 工具路径规则(关键,与 bash 独立)**:
> - OpenCode 的 write/edit 工具与 bash 是**独立进程,不共享 cwd**。bash 里传 `workdir` **不影响** write/edit 工具的路径解析
> - write/edit 工具用相对路径时,按 session cwd(主仓)解析,文件落主仓
> - **write/edit 工具必须用 worktree 绝对路径前缀**:`<WORKTREE_PATH>/openspec/changes/<name>/verify.md` / `<WORKTREE_PATH>/scripts/hello.sh`
> - 禁用相对路径 `openspec/changes/<name>/verify.md`(落主仓)/ 主仓绝对路径 `/主仓/openspec/...`(绕过 worktree)
>
> 违反字面 = 违反精神:哪怕"相对路径也能写文件"、"传 workdir 一次就够了"(每个新 Bash 调用需重新传)、"write 工具传 workdir 会传染"(不会,独立进程)、"用绝对路径替代 workdir",也算违反--OpenCode 的 Bash 工具每次调用需显式传 workdir,write/edit 工具独立进程也不共享 bash cwd,不传 workdir 或不用 worktree 绝对路径就落主仓。
> 常见违规模式:
> - agent 创建 worktree 后,bash 命令不传 `workdir`(OpenCode),但 write 工具用相对路径 `write openspec/changes/<name>/verify.md` -> verify.md 落主仓,_artifact commit 在 worktree 内找不到 verify.md 失败
> - agent 在一个 Bash 里传 `workdir` 后以为 write 工具也在 worktree,实际 write 工具独立进程不共享 cwd,文件落主仓
> - agent 用主仓绝对路径 `/主仓/scripts/hello.sh` 创建文件,绕过 worktree 隔离
> - agent 以为"bash 传 workdir 后 write 也在 worktree",实际 write 工具 cwd 还是主仓

**Step 1/5 完成：**
```
> [Step 1/5] 隔离环境 — 已跳过 / 就绪
> 源分支: <feature_branch>  Worktree: <path>/<branch> 或 N/A
> 分支锁: HEAD == worktree-<name> ✓
```

### [Step 2/5] 任务实现

**REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development 或 superpowers:executing-plans（USER_GATE 二选一）

**REQUIRED SUB-SKILL:** Use superpowers:test-driven-development

```
[HARD_STOP] TDD 次序不可颠倒——RED → GREEN → REFACTOR
违反字面 = 违反精神：哪怕"只改一行 case 没必要先写测试"，也算违反 Iron Law 第一层
```

**幂等检查：** 读取 `tasks.md` checkbox 状态。已勾选任务 TDD 测试仍通过，自然跳过；从第一个未勾选开始。

> **worktree 内读制品用相对路径**：worktree 创建后(Claude Code 用 EnterWorktree 解绑 session cwd / OpenCode agent 传 workdir 参数)，session cwd 已是 worktree 根目录，读 `openspec/changes/<name>/` 下制品用相对路径即可。用 worktree 绝对路径前缀会路径重复，导致 `No such file or directory`。
>
> 正例：`cat openspec/changes/<name>/tasks.md`
> 反例:`cat .claude/worktrees/<name>/openspec/changes/<name>/tasks.md`(Claude Code 路径重复) / `cat .worktrees/<name>/openspec/...`(其他 agent 同理)

**先分析，再展示推荐方案：**

1. 读取 `plans.md` frontmatter 的 `strategy` + `reason`
2. 读取 `tasks.md`，分析任务特征（数量、独立性、耦合度）
3. 展示推荐方案，用户可覆写:
   - **subagent-driven-development** — 任务多（≥3）、相互独立、涉及不同文件/模块
   - **executing-plans** — 任务少（1-2）、紧密耦合、共享状态

   > ⛔ [HARD_STOP] 禁误述 SDD/EP 适用场景——SDD 适合"任务多（≥3）、相互独立",**不是"简单快速"**;EP 适合"任务少（1-2）、紧密耦合",不是"复杂"。
   > 违反字面 = 违反精神：哪怕"简化描述方便用户选",也算违反——描述必须对齐上方设计语义,误述会误导用户选错策略。

4. 🔴 USER_GATE（必须平台原生交互工具）: 选择执行策略（`subagent-driven-development` / `executing-plans`）。必须等用户选择后才加载技能。

   > **多 agent 适配（命令执行顺序,必读）:**
   > - **Claude Code / OpenCode:** 先设 gate(下方命令),再调问答工具问用户选 SDD/EP,根据选择走对应路径。
   > - **Pi:** ⛔ [HARD_STOP] **禁调问答工具问 SDD/EP**--Pi 无原生 subagent,选 SDD 也会被 guard 强制走 EP。Pi agent 直接调下方 `_guard user-gate require` 命令(检测 `PI_CODING_AGENT=true` 自动通过 + 输出 `-> 走 EP 路径`),按输出走下方"EP 路径"段。
   > - 违反字面 = 违反精神:哪怕"用户想看选项再决定",Pi 也不许问--问 SDD 选项对 Pi 是误导(选了也走 EP),浪费一轮交互。

   ⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

   ```bash
   alloy _guard user-gate require openspec/changes/<name> apply:sdd-ep-choice
   ```

   > **worktree 模式下 OpenCode 必须传 `workdir` 参数:** worktree 创建后,OpenCode 的 bash 工具 session cwd 不解绑(不像 Claude Code 的 EnterWorktree),调本命令必须传 `workdir=<worktree-path>`(如 `.worktrees/<name>` 对应的绝对路径)。主仓调会被 `worktree-create` 写入的 state 触发 HARD_STOP 拦截:`worktree 模式下,此命令必须在 worktree 内执行,当前在主仓`。
   > 正例:`bash(command="alloy _guard user-gate require openspec/changes/<name> apply:sdd-ep-choice", workdir="/path/to/.worktrees/<name>")`
   > 反例:`bash(command="alloy _guard user-gate require openspec/changes/<name> apply:sdd-ep-choice")`(主仓调,被拦)
   > Claude Code 不传 workdir(EnterWorktree 已解绑 session cwd)。

   > ⛔ [HARD_STOP] options label 必须用技能全称 `subagent-driven-development` / `executing-plans`，禁缩写（SDD/EP）——SDD 缩写会被误解为 "Single Developer Direct"（单开发者直接执行），与实际 "Subagent-Driven Development"（子 agent 驱动）语义相反。
   > 违反字面 = 违反精神：哪怕"缩写更简洁用户易选"，也算违反——缩写歧义导致 agent 误述描述（把 SDD 说成"任务少、简单直接"），误导用户选错策略。
   > options description 必须对齐 L269 设计语义：`subagent-driven-development` = 任务多（≥3）、相互独立、涉及不同文件/模块；`executing-plans` = 任务少（1-2）、紧密耦合、共享状态。禁反转描述（把 SDD 说成"任务少/简单"、EP 说成"任务多/复杂"均算违反）。
   > 常见违规模式：label 用"SDD 直接执行"/"Subagent 并行"等自造缩写，description 把 SDD 描述成"单开发者直接执行，适合任务少"——这反转了 SDD 实际语义（子 agent 驱动，适合任务多）。

   > **决策不回写 plans.md**——plans 仅保留 plan 阶段的推荐快照，apply 可覆写。

**SDD 路径：**

**⛔ HARD_STOP：先记录技能使用，再加载技能——`_skill log` 是必执行命令，不是可选。** 跳过 `_skill log` = skill_usage 缺失 = 后续无法证明技能已加载，违反 Iron Law。
```bash
alloy _skill log openspec/changes/<name> apply superpowers:subagent-driven-development
alloy _skill log openspec/changes/<name> apply test-driven-development --via subagent-driven-development
alloy _skill log openspec/changes/<name> apply spec-compliance-review --via subagent-driven-development
alloy _skill log openspec/changes/<name> apply code-quality-review --via subagent-driven-development
```

加载 `subagent-driven-development` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`),由其驱动分派子 agent -> 每个独立 TDD + code review(transitive 激活):
- Claude Code / OpenCode: 调 `skill({ name: "subagent-driven-development" })`
- Pi: `read .pi/skills/subagent-driven-development/SKILL.md`

**构造子 agent prompt 前,必须先读取 worktree 路径:**

```bash
WORKTREE_PATH=$(alloy _state read openspec/changes/<name> worktree 2>/dev/null)
```

> ⛔ [HARD_STOP] 子 agent prompt 必须传 `WORKTREE_PATH`(从 state 读取)作为工作目录,禁传主仓路径。
> 子 agent 所有文件操作必须用 worktree 路径或相对路径(相对 worktree 根目录),禁用主仓绝对路径。
> 违反字面 = 违反精神:哪怕"主仓路径也能写文件"、"绝对路径更清晰",也算违反——子 agent 在主仓写文件 = 文件不在 worktree 分支 = worktree commit 缺失 + 主仓 working tree 污染 + archive 阶段 merge 冲突。
> 常见违规模式:
> - 子 agent prompt 传"项目路径: /主仓/路径",子 agent 用主仓路径创建文件(scripts/ + tasks.md 落到主仓 working tree,worktree 分支 commit 缺失)
> - 子 agent 用绝对路径 /主仓/scripts/hello.sh 创建文件,而非 worktree 路径 /主仓/.claude/worktrees/<name>/scripts/hello.sh
> - 子 agent 默认 cwd 是主仓(不是 worktree),用相对路径创建文件落到主仓

**构造子 agent 任务描述时，必须注入以下指令到任务描述末尾：**
> 工作目录: `<WORKTREE_PATH>`(worktree 路径,从 state 读取)。所有文件操作必须用 worktree 路径或相对路径(相对 worktree 根目录),禁用主仓绝对路径。
>
> 实现完成时，在**同一个 commit** 中包含：实现代码 + 测试 + `openspec/changes/<name>/tasks.md` 中你负责的 task checkbox 从 `- [ ]` 改为 `- [x]`（含父级和子级）。不要分两个 commit。
>
> ⛔ [HARD_STOP] 禁用 `git commit --amend` 实现"同一个 commit"——"同一个 commit"指**一次性 `git add` 实现+测试+tasks.md 再单个新 `git commit`**,不是"先 commit 实现再 `--amend` 加 tasks.md"。amend 改写历史,违反"创建新 commit 而非 amend"全局规则。
> 违反字面 = 违反精神：哪怕"amend 后历史更干净",也算违反——必须一次性 git add 两者再新 commit。retrospective 不得把 amend 当 win 正向强化。
>
> ⛔ [HARD_STOP] 禁批量后置 checkbox——实现 commit 不含 tasks.md、所有任务完成后才批量勾选 + 单独 relock,也是违规。"同一个 commit"要求每个 task 的实现 commit **当即**含该 task 的 checkbox 勾选,不是最后统一勾选。
> 违反字面 = 违反精神：哪怕"批量勾选效率高",也算违反——批量后置 = checkbox 不反映实时进度 = 回溯断点失效。每个 task 完成时当即勾选 + commit。

**EP 路径：** 四步显式加载补偿（EP 不 transitive 激活 TDD/spec 合规/code review）：

> ⛔ [HARD_STOP] `_skill log` 必须在对应技能**实际加载后立即**执行，禁预录。预录 = skill_usage 不反映真实使用轨迹 = retrospective §4 审计失真。
> 违反字面 = 违反精神：哪怕"先打完 log 再干活效率高"，也算违反——skill_usage 必须反映真实加载顺序。

加载 `test-driven-development` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`)(设定 TDD 预期,RED->GREEN->REFACTOR 成为硬约束),加载后立即 log:
- Claude Code / OpenCode: 调 `skill({ name: "test-driven-development" })`
- Pi: `read .pi/skills/test-driven-development/SKILL.md`
   ```bash
   alloy _skill log openspec/changes/<name> apply superpowers:test-driven-development
   ```
2. 加载 `executing-plans` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`,逐步执行 plans.md,每步遵循 TDD),加载后立即 log:
   - Claude Code / OpenCode: 调 `skill({ name: "executing-plans" })`
   - Pi: `read .pi/skills/executing-plans/SKILL.md`
   ```bash
   alloy _skill log openspec/changes/<name> apply superpowers:executing-plans
   ```
3. Spec 合规审查（Agent 自检：每个 checkbox ↔ 代码实现，无 over-building，排除范围未碰，不通过→修复→重审）
加载 `requesting-code-review` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`)(代码审查闸门--所有代码变更必须经审查才进 Step 3),加载后立即 log:
- Claude Code / OpenCode: 调 `skill({ name: "requesting-code-review" })`
- Pi: `read .pi/skills/requesting-code-review/SKILL.md`
   ```bash
   alloy _skill log openspec/changes/<name> apply superpowers:requesting-code-review
   ```

---

#### Step 2/5 子 agent commit 通用规则（SDD/EP 共享）

每个子 agent 任务的 commit 必须满足以下三条硬规则——任一违反即拒绝合入。读取 `references/subagent-commit.md` 获取完整 bash 与措辞，要点：

1. **分支再校验**（⛔ PRECONDITION_FAIL，task #18）—— `git rev-parse --abbrev-ref HEAD` ≠ `worktree-<name>` 时退出，禁 agent 自动 `git checkout` 切回。
2. **git add 限路径**（⛔ HARD_STOP §5.2.1）—— 精确路径，禁 `-A`/`-a`/`.`。违反字面 = 违反精神：哪怕"反正只有这一个文件"也禁 `-A`，副作用文件会被一并 commit。判断不准 🔴 USER_GATE。
3. **stash 残留检查**（⚠️ WARN，task #19）—— commit 前 `git stash list`，非空播报让用户决策，禁 agent 自动 `git stash drop`（§3.5.1）。
4. **commit 失败禁自救**（⛔ HARD_STOP §3.5.1）—— `git commit` 失败时禁自动 `git reset --hard` / `git checkout .` / `git restore .` / `git stash` / `git clean -fd` 清场。违反字面 = 违反精神：哪怕"清一下重试效率高",也算违反——破坏性命令会丢失用户已 stage 的工作,必须报告问题让用户决策。

#### Step 2/5 完成前：tasks.md hash 重锁（⛔ HARD_STOP）

子 agent 全部完成后，主 agent 必须立即调 `alloy _artifact commit tasks` 重锁 hash。子 agent 的 `git commit` 只提交了 tasks.md 文件变更，**没有重算 records 里的 hash** -- 不重锁会导致 Step 3/4 出口 `_record check` 发现 hash 不匹配触发 HARD_STOP。

```bash
alloy _artifact commit openspec/changes/<name> tasks
```

> ⛔ [HARD_STOP] 子 agent 完成后必须立即重锁 tasks hash -- 禁只 `git commit` 不重锁。
> 违反字面 = 违反精神：哪怕"子 agent 已 commit 文件变更"、"Step 4 会重锁兜底",也算违反--records 里 hash 还是旧的,Step 3/4 任何 `_record check` 都会触发 HARD_STOP,浪费 LLM 往返恢复。
> 常见违规模式:
> - agent 在子 agent commit 后只跑 `git commit` 不调 `alloy _artifact commit tasks`,Step 4 出口 `_record check` 触发 HARD_STOP
> - agent 以为"Step 4 会兜底重锁"跳过 Step 2 完成时的重锁,导致 Step 3 中途任何 hash 校验失败

> Step 4 开头的重锁段是兜底 -- 若 Step 2 完成时已重锁,Step 4 此处 `_artifact commit` 检测到 hash 未变会跳过(幂等)。

#### Step 2/5 完成前：skill_usage 校验（⛔ HARD_STOP）

进入 Step 3 前，必须验证 skill_usage 已记录 apply 阶段必需技能。跳过 `_skill log` 的 agent 无法证明技能已加载——校验失败 = Iron Law 违规。

```bash
# 校验 apply 阶段 skill_usage 包含必需技能（SDD 或 EP 路径其一）
SKILL_USAGE=$(alloy _state read openspec/changes/<name> skill_usage 2>/dev/null)

# 检查 executing-plans 或 subagent-driven-development（至少一个）
if ! echo "$SKILL_USAGE" | grep -qE '"skill":"(superpowers:)?(subagent-driven-development|executing-plans)"'; then
  echo "⛔ [HARD_STOP] skill_usage 缺失：未记录 subagent-driven-development 或 executing-plans"
  echo "  apply Step 2 必须执行 _skill log 记录执行策略技能。"
  echo "  禁止：agent 自动补 _skill log 后继续——记录必须反映真实加载。"
  exit 1
fi

# 检查 test-driven-development
if ! echo "$SKILL_USAGE" | grep -qE '"skill":"(superpowers:)?test-driven-development"'; then
  echo "⛔ [HARD_STOP] skill_usage 缺失：未记录 test-driven-development"
  exit 1
fi

# 检查审查技能——按实际路径分别校验（审查是 apply 质量闸门，漏记 = retrospective §4 审计缺失）
if echo "$SKILL_USAGE" | grep -qE '"skill":"(superpowers:)?subagent-driven-development"'; then
  # SDD 路径：内嵌两阶段审查（spec 合规 + 代码质量），必须各记一条
  if ! echo "$SKILL_USAGE" | grep -q '"skill":"spec-compliance-review"'; then
    echo "⛔ [HARD_STOP] skill_usage 缺失：SDD 路径未记录 spec-compliance-review"
    echo "  SDD 每个 task 后必做 spec 合规审查，必须 _skill log 留痕。"
    echo "  禁止：agent 自动补记——记录必须反映真实做过的审查。"
    exit 1
  fi
  if ! echo "$SKILL_USAGE" | grep -q '"skill":"code-quality-review"'; then
    echo "⛔ [HARD_STOP] skill_usage 缺失：SDD 路径未记录 code-quality-review"
    echo "  SDD 每个 task 后必做代码质量审查，必须 _skill log 留痕。"
    exit 1
  fi
else
  # EP 路径：显式补 requesting-code-review 作为代码审查闸门
  if ! echo "$SKILL_USAGE" | grep -qE '"skill":"(superpowers:)?requesting-code-review"'; then
    echo "⛔ [HARD_STOP] skill_usage 缺失：EP 路径未记录 requesting-code-review"
    echo "  EP 不 transitive 激活代码审查，必须显式加载 + _skill log 留痕。"
    exit 1
  fi
fi

echo "✓ skill_usage 校验通过：apply 阶段必需技能 + 审查技能已记录"
```

#### Step 2/5 完成前：主仓清洁度校验（worktree 模式，⛔ PRECONDITION_FAIL）

worktree 模式下，所有子 agent 变更应落在 worktree 分支。主仓工作目录若 dirty，说明子 agent 误用主仓绝对路径 Edit，变更"游离"在 feature 工作目录——破坏 worktree 隔离。读取 `references/subagent-commit.md` 规则 4-5 执行完整校验：

```bash
alloy _guard main-clean openspec/changes/<name>
```

跳过 worktree 模式（`worktree=skipped`）不跑此校验——主仓 dirty 是正常的。

### [Step 3/5] 代码层验证

**REQUIRED SUB-SKILL:** Use superpowers:verification-before-completion

加载 `verification-before-completion` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`)--代码行为验证:
- Claude Code / OpenCode: 调 `skill({ name: "verification-before-completion" })`
- Pi: `read .pi/skills/verification-before-completion/SKILL.md`

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

1. 加载 `openspec-verify-change` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`)执行 7 项检查(结构校验 -> 任务完成 -> Delta Spec 同步 -> Design/Specs 一致性 -> 实现信号 -> 路由泄漏检测 -> 延期任务对照):
   - Claude Code / OpenCode: 调 `skill({ name: "openspec-verify-change" })`
   - Pi: `read .pi/skills/openspec-verify-change/SKILL.md`
   禁跑 `openspec verify`(不是 opsx:verify 的 CLI 等价物,必须加载 `openspec-verify-change` skill)。
   ```bash
   alloy _skill log openspec/changes/<name> apply opsx:verify
   ```
2. 输出必须重写为与 `instructions/verify.md` 和 `templates/verify.md` 一致的语言，不直接透传 CLI 输出。检查结果（PASS/FAIL/WARNING）保留作为事实依据。

> ⛔ [HARD_STOP] verify.md 必须创建在 `openspec/changes/<name>/verify.md`——禁创建到 worktree 根目录或其他位置。
> 违反字面 = 违反精神:哪怕"先创建到根目录后面 mv 过去"、"worktree 根目录方便临时查看",也算违反——verify.md 是 change 制品,必须一诞生就在 change 目录内,创建到外部 + mv 自救 = 制品路径错位 + git add 漏文件。
> 常见违规模式:
> - agent 在 worktree 根目录创建 verify.md,再用 mv 移到 openspec/changes/<name>/——创建位置错误 + mv 自救 = 制品路径错位
> - agent 用相对路径 `verify.md` 而非 `openspec/changes/<name>/verify.md`——cwd 在 worktree 根目录时会创建到错误位置

**opsx:verify 失败处理（⛔ HARD_STOP）：**

> ⛔ [HARD_STOP] opsx:verify 7 项有 FAIL → 修复 → 回到 Step 2（SDD），禁带 FAIL 继续 Step 5。
> 违反字面 = 违反精神：哪怕"FAIL 仅 1 项 retro 写一笔继续"，也算违反——FAIL 必须先修到 PASS。
> WARNING 项可继续，但需在 retrospective §2 Misses 记录。

**tasks.md checkbox 已更新，重录 hash——原子命令 `alloy _artifact commit` 内部完成 hash 重算 + records 更新 + git add 限路径 + commit（§5.2.1）：**

> ⛔ [HARD_STOP] tasks 重锁必须先于 verify 锁定**串行**完成。禁在同一消息并行调用 `alloy _artifact commit tasks` 与 `alloy _artifact commit verify`——并行发出会导致 git commit 顺序倒置（verify 在前、tasks 在后），hash 链与设计时序错位。
> 违反字面 = 违反精神：哪怕"两个命令看似独立"，git index 和 `.alloy.yaml` records 是共享资源，并行写会竞态。必须等 tasks 重锁 commit 完成后，才进入 verify 审查窗口 + 锁定。

```bash
alloy _artifact commit openspec/changes/<name> tasks
```
> tasks 在 plan 阶段已首次锁定，apply 阶段 checkbox 变更后 hash 改变，`_artifact commit` 检测到 hash 不同允许重新锁定（N3），产生独立的 "relock tasks" commit。**禁止用旧命令 `_record compute/write` 手动重录——绕过原子 commit 会导致 records 更新混入后续 verify commit，hash 链与 git 历史错位。**

**verify.md 审查窗口（🔴 USER_GATE）：**

> 制品 [1/2] verify ✓ 完成
> [展示 verify.md 完整内容]
> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具(AskUserQuestion/question/alloy-question)调用自动 clear 或手动 `alloy _guard user-gate pass` 降级。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require openspec/changes/<name> apply:lock-verify
```

> 🔴 USER_GATE（必须平台原生交互工具）: 确认锁定 verify
> 1. 确认并继续——hash-lock + commit
> 2. 需要调整——重新生成 verify.md（禁直接编辑），重展示审查窗口
>
> 违反字面 = 违反精神：哪怕 verify.md 看似"明显合理"，没经过用户明确选择 1 = 不算授权。
> 禁止 agent 基于"diff 短"或"全 PASS"自动跳过此 USER_GATE，必须完整阅读 diff。

选 1：hash 锁定 + commit——原子命令 `alloy _artifact commit` 内部完成 hash 计算 + records 写入 + git add 限路径 + commit：
```bash
alloy _artifact commit openspec/changes/<name> verify
```

选 2：agent **必须先调 `alloy _guard user-gate reset openspec/changes/<name> apply:lock-verify`**(把 gate 从 gate_history 移除 + 重新设为 pending_gate),再重新生成 verify.md(不是直接编辑),重新展示审查窗口。
> 原因:hook-guard 检测到问答工具调用时无条件 clear pending_gate + 加入 gate_history,用户选"需要调整"本意是拒绝通过 gate,语义被吞了。reset 恢复 gate 状态,重新生成后 agent 调 require(幂等)+ 问答工具重新询问。

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

**生成 retrospective（机械数据由 CLI 预生成）：**

1. 跑 CLI 生成 §0/§4 机械数据骨架（直接写 retrospective.md）：
   ```bash
   alloy _retro scaffold openspec/changes/<name>
   ```
   > CLI 从 `.alloy.yaml` + `git log` + `git tag` 权威生成 §0 量化全景（含全周期时间线、制品审批链、commit 汇总、阶段耗时 + 阶段间隔、检查点使用、任务完成比、变更规模、验证状态、完整提交链）和 §4 技能审计（全部 skill_usage 不漏）。跨 session 中断也能完整生成——不依赖会话记忆。

2. 读 `instructions/retrospective.md` 的"Step 2 定性分析"，用 Edit 补充定性章节：§1 Wins（evidence 格式）、§2 Misses（🔴 blocking / 🟡 painful / 📌 nit）、§3 Plan Deviations、§5 Surprises、§6 Promote Candidates（`→ Promote to: memory` 的条目在 archive 阶段写入 memory）、§7 偏差分类（compliance deviations,勾选本 cycle 观察到的偏差类型）,以及 §4 的 Deliberately Skipped Skills 三问。

   > **§0/§4 机械数据由 CLI 填好，agent 只读不改。** agent 职责仅限定性章节（§1/§2/§3/§5/§6/§7 + §4 Skipped 三问）。

**Retrospective 跳过判定（🔴 USER_GATE + ⛔ HARD_STOP，task #17）：**

复盘是证据驱动的——每条结论引用具体 commit 或文件。判定流程：

```bash
FEATURE_BRANCH=$(alloy _state read openspec/changes/<name> feature_branch 2>/dev/null)
COMMIT_COUNT=$(git log "${FEATURE_BRANCH}..HEAD" --oneline 2>/dev/null | wc -l | tr -d ' ')
echo "本 change 累计 commit 数: $COMMIT_COUNT"
```

- `COMMIT_COUNT == 1` 时：可能符合"单 commit 小修跳过"条件，但 **🔴 USER_GATE（必须平台原生交互工具，不得 agent 自动选）：**

  > 本 change 仅 1 个 commit，是否跳过 retrospective？
  > 1. 不跳过——正常生成（推荐：即使小改也常有可记录的洞察）
  > 2. 跳过——写入 retrospective.md 仅含 "Skipped: single-commit fix, no insights"
  >
  > [HARD_STOP] agent 不得自动选 2。即使 COMMIT_COUNT == 1，跳过也必须用户明确选择 2。
  > 违反字面 = 违反精神：哪怕"用户上次也选了跳过所以这次猜跳过"，也是违反——每次必须 ask。

- `COMMIT_COUNT > 1`：直接生成 retrospective，不询问跳过。

**retrospective.md 审查窗口（🔴 USER_GATE）：**

> 制品 [2/2] retrospective ✓ 完成
> [展示 retrospective.md 完整内容]
> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具(AskUserQuestion/question/alloy-question)调用自动 clear 或手动 `alloy _guard user-gate pass` 降级。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require openspec/changes/<name> apply:lock-retrospective
```

> 🔴 USER_GATE（必须平台原生交互工具）: 确认锁定 retrospective
> 1. 确认并继续提交
> 2. 需要调整——重新生成（禁直接编辑），重展示审查窗口
>
> 违反字面 = 违反精神：禁 agent 基于"内容看起来挺全"自动跳过此 USER_GATE。

选 1：分两步——先制品 commit，再阶段完成 commit（制品 commit 不含 phase_timings，阶段完成 commit 不含制品）：
```bash
# 1. 制品 commit：hash-lock + records + git add 限路径 + commit（原子命令）
#    审批信息（审批人/hash/时间）由 _artifact commit 写入 records，retrospective.md 正文
#    不含 retrospective 自身的审批栏（scaffold 生成的审批链只列 retrospective 之前的制品）。
alloy _artifact commit openspec/changes/<name> retrospective

# 校验本阶段完成状态(verify + retrospective + state 字段)——失败则修复后重试,禁跳过
# _verify 失败时 && 短路,禁继续推进 phase
# ⛔ [HARD_STOP] _verify 和 _phase complete 必须同一 Bash 命令 && 连接,禁拆成两个命令
# 拆开(如 _verify && echo OK || echo FAIL 后单独 _phase complete)绕过短路保护,_verify 失败时 agent 可能仍继续
alloy _verify phase-exit apply openspec/changes/<name> && alloy _phase complete openspec/changes/<name> apply
```

> 注意：步骤 1 和 2 是两个独立 commit。步骤 1 仅含 retrospective.md + records，步骤 2 仅含 .alloy.yaml 的 phase_timings + phase 字段。

选 2：agent **必须先调 `alloy _guard user-gate reset openspec/changes/<name> apply:lock-retrospective`**(把 gate 从 gate_history 移除 + 重新设为 pending_gate),再重新生成(不是直接编辑),重新展示审查窗口。
> 原因:hook-guard 检测到问答工具调用时无条件 clear pending_gate + 加入 gate_history,用户选"需要调整"本意是拒绝通过 gate,语义被吞了。reset 恢复 gate 状态,重新生成后 agent 调 require(幂等)+ 问答工具重新询问。

---

### 完成

**阶段完成时，必须输出以下 Phase 完成框到终端**:
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

**phase 推进已在 Step 5 retrospective 审查通过后由 `alloy _phase complete openspec/changes/<name> apply` 原子完成**（completed_at + phase→applied + commit）。此处不再重复推进。

**§5.2.3 路径 B 降级（HARD_STOP）：** 若 `_phase complete` 失败（commit 失败等不可恢复状态），降级路径（apply 阶段降级 → `planned`）：

```bash
# 用户须手动回滚 phase：
alloy _state set openspec/changes/<name> phase planned
git checkout HEAD~1 -- "openspec/changes/<name>/.alloy.yaml"  # 撤销 phase commit 中的状态变更
git reset HEAD~1                                              # 退回 phase commit
```

> 禁止 agent 自动 `git reset --hard` / `git checkout .` 清场（§3.5.1）。违反字面 = 违反精神：哪怕"清理一下让流程重启"也算违反——退出 skill 让用户决策是唯一合法路径。详见 `alloy-shared/references/phase-downgrade-path.md`。

> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具(AskUserQuestion/question/alloy-question)调用自动 clear 或手动 `alloy _guard user-gate pass` 降级。

> ℹ️ `apply:phase-complete` gate 已由 `_phase complete apply` 自动设。以下 `user-gate require` 命令幂等可省略--agent 也可手动调(覆盖相同值,无冲突)。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require openspec/changes/<name> apply:phase-complete
```

🔴 USER_GATE（必须平台原生交互工具调用）: apply 阶段完成,下一步?

> ⛔ [HARD_STOP] 必须用平台原生交互工具调用——禁纯文本列选项 / 禁直接 `Skill` 加载下一阶段 / 禁纯文本"运行 /alloy-archive"提示 / 禁提示用户手动输入命令。
> 违反字面 = 违反精神:哪怕"纯文本效果一样"、"直接 Skill 更流畅"、"用户已授权提示一下也行",也算违反——AskUserQuestion 强制结构化选项,避免 agent 用模糊措辞让用户回 yes 蒙混过关（§4.1）。
> 常见违规模式:
> - 纯文本输出"运行 /alloy-archive 进入归档阶段"让用户手动输入
> - 纯文本列"1. 进入 archive / 2. 暂停 / 3. 其他"让用户回复
> - 用户选 1 后提示"请运行 /alloy-archive"让用户手动输入——应直接 Skill 加载

> 选项:
> - 1. 进入 archive 阶段——加载 `alloy-archive` skill 推进归档
> - 2. 暂停——执行 QA 测试 / 浏览器测试 / 查看状态(`alloy status`)
> - 3. 其他——用户自定义下一步

> 用户选 1 后,agent **必须直接加载 `alloy-archive` skill(多 agent 适配,见 `alloy-shared/references/skill-loading.md`):
- Claude Code / OpenCode: 调 `skill({ name: "alloy-archive", args: "<change-name>" })`
- Pi: `read .pi/skills/alloy-archive/SKILL.md`(read 后按 SKILL.md 指引执行,change name 通过上下文传入)**

> ⛔ [HARD_STOP] 禁止输出"请运行 /alloy-xxx"让用户手动输入命令--用户已在 USER_GATE 授权,阶段转换已触发,再让用户输入命令 = 违反 Iron Law。
> 违反字面 = 违反精神:哪怕"提示一下更友好"、"用户可能想暂停",也算违反--用户要暂停会在 USER_GATE 选"暂停",选"进入"就是授权直接加载。
> 用户选 2 后,agent **必须先调 `alloy _guard user-gate reset openspec/changes/<name> apply:phase-complete`**(把 gate 从 gate_history 移除 + 重新设为 pending_gate),再停止,输出"已暂停。建议执行 QA 测试或浏览器测试,确认后运行 /alloy-archive <name> 继续。"
>   原因:hook-guard 检测到问答工具调用时无条件 clear pending_gate + 加入 gate_history,用户选"暂停"本意是拒绝通过 gate,语义被吞了。reset 恢复 gate 状态,用户"继续"时 agent 调 require(幂等)+ 问答工具重新询问。
> 用户选 3 后,agent 同样调 reset,再停止,等用户后续命令。
