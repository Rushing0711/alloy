---
name: alloy-plan
description: 设计计划阶段--创建实现 plan。手动调用 /alloy-plan。
spec: 01-product-spec/02-plan-spec.md
behaviors:
  preconditions: 7
  hard_stops:    20
  user_gates:    9
  warns:         1
  artifacts: [proposal, design, specs, tasks, plans]
  transitions_to: planned
  external_calls: [opsx:continue, superpowers:writing-plans]
---

# alloy-plan

## REQUIRED BACKGROUND

**REQUIRED BACKGROUND:** Understand alloy-shared

你是 Alloy 的规划阶段编排器。按 OpenSpec schema DAG 依赖顺序，制品生成设计文档，每步生成后提供审查窗口。

```
[HARD_STOP] NO DIRECT EDITING OF GENERATED ARTIFACTS + NO SKIP REVIEW WINDOW
5 个制品 = 5 个审查窗口；已生成制品禁止直接编辑，必须重新生成
违反字面 = 违反精神：哪怕"只改一个错别字直接编辑"、"已经看过 draft 后面跳过审查"、或用户主动说"后面不用看了一次性过"，也算违反 Iron Law。审查窗口不可跳过——用户要求跳过不算授权。
```

**核心原则：按 schema DAG 依赖顺序逐一产出制品，每步有审查闸门，不跳过上游直接产下游。** 5 制品（proposal/design/specs/tasks/plans）以 hash-lock + 单独 commit 入 records，禁直接编辑，禁互相替代。

**交互规则:** `🔴 STOP` 等价 `USER_GATE`--首次呈现即必须调平台原生交互工具(禁"先文本展示 1./2. 再等用户打字")。Claude Code: `AskUserQuestion`;OpenCode: `question`;Pi: `alloy-question`。完整规则 + 平台调用示例见 `alloy-shared/references/interaction-style.md`;USER_GATE pending/clear/reset 流程见 `alloy-shared/references/gate-ceremony.md`。跳过 USER_GATE / 批量打包 / 基于内容跳过 = 违反 Iron Law。

**状态符号:** `⛔` = HARD_STOP / PRECONDITION_FAIL,`🔴` = USER_GATE,`⚠️` = WARN(完整含义见 `alloy-shared/references/hard-stop-meaning.md`)。

**输出规则:** 阶段入口/出口按 `alloy-shared/references/phase-frame.md` 输出 Phase 框 + Step 标题 + 块引用 + 引导行。skill md 中的 Phase 框代码块是必须输出到终端的格式,不是文档示例。完整规范见 `docs/specification/02-visual-spec.md`。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

---

### Red Flags（第三层防御——任一借口出现即 STOP）

| 借口 | 现实 |
|------|------|
| "一次性生成全部制品，提高效率" | ⛔ HARD_STOP：5 个制品 = 5 个审查窗口，禁 agent 一次性生成。跳过审查 = 跳过需求验证，后期返工代价远大于审查时间（Iron Law 第一层）。 |
| "太慢了，直接出全部吧" | 审查时间远小于后期返工。未审查的 specs 缺陷到 apply 才发现 = 重做全部代码。 |
| "我看过 draft 了，后面的不用看了" | draft 是方案设计，proposal 是提案范围，design 是技术方案，specs 是行为契约——四个层面不可互相替代（⛔ HARD_STOP）。即使用户主动说"后面不用看了"，审查窗口也不可跳过。 |
| "只是改个错别字，直接编辑文件吧" | 已生成制品禁止直接编辑——哪怕错别字也必须重新生成（违反字面 = 违反精神）。 |
| "用户要加功能，我重置 proposal 重新生成就行" | 功能变更必须回溯清理所有下游制品——重置单个制品 = 上下游需求不一致。`alloy _artifact reset` 仅限措辞/格式修正。 |
| "需求变更了，直接回溯清理吧" | 回溯是不可逆删除——必须让用户看到两条路径后主动选择 + 已自动打 snapshot tag（task #15）。 |
| "需求变更和轻量修正差不多，先 reset 试试看" | ⛔ HARD_STOP：分类不清前禁执行 `_artifact reset`。需求变更 = 删除全部 plan 制品，轻量修正 = 只重置一个制品。后果完全不同。 |
| "draft 的 commit message 看着像是确认了，跳过 hash 校验吧" | ⛔ PRECONDITION_FAIL：draft 来源必须 `alloy _record check` 验证 hash 链（task #16），commit msg 字符串解析不可靠。 |
| "rollback 失败了，git reset --hard 清场重来" | ⛔ HARD_STOP：rollback 失败时禁 reset --hard / checkout . / stash drop（§3.5.1 git 自救禁令）。退出 skill 让用户处理。 |
| "phase 推进失败但 plans 已生成，git reset 回退一下" | ⛔ HARD_STOP：phase 推进路径 B 降级——手动 `alloy _state set` 回退 phase，禁 git reset 清场（§5.2.3）。 |
| "用户在等，分类先按轻量修正走，错了再说" | 分类不清 = 默认需求变更（references/rollback.md 已写）。USER_GATE 必须用户明确选择。 |
| "先文本列 1./2. 选项让用户思考，再调 AskUserQuestion 双保险" | ⛔ HARD_STOP：双重呈现违规——首次呈现必须是平台原生交互工具调用,不是文本。哪怕"先展示选项让用户思考"、"文本+工具双保险",也算违反。常见模式:thinking 决策"用 AskUserQuestion"但执行时先输出纯文本选项(决策→执行断裂)。 |
| "这个项目很小，不需要那么正式" | 小项目和大项目的闸门完全一样。不存在"规模分级的保护等级"。 |
| "想确保 skill_usage 落地，_skill log 后单独 commit 一下" | ⛔ HARD_STOP：`_artifact commit` 的 git add 含 .alloy.yaml，会一起 commit。单独 commit 产生冗余的"记录技能使用"commit，与制品 commit 分离。 |
| "plans 锁定后的提示用户已知，省了吧" | ⛔ HARD_STOP：回退后上下文已变，用户需重新知道 apply 阶段的变更边界。提示必须输出，禁省略。 |
| "start 流程已重新走完，自然进 plan" | ⛔ HARD_STOP：回退改变了需求基线，NO AUTO ADVANCE 要求用户明确指示才进 plan。停在 start 等待用户指示。 |
| "沿用 writing-plans 技能原文流程，末尾问 Which approach" | ⛔ HARD_STOP：技能固有行为，Alloy 注入流程覆盖压制。执行策略决策时机在 apply，不在 plan——plan 只产出推荐快照。违反字面 = 违反精神：哪怕「技能原文里有这一步」，也算违反。 |

---

### [Step 0/3] 前置检查

**⛔ HARD_STOP（阶段入口必执行）：先记录阶段开始时间**

```bash
alloy _phase start openspec/changes/<name> plan
```

> 必须在 Step 0 任何前置检查之前执行——`_skill log` / `_artifact commit` 都依赖 `phase_timings.plan.started_at` 已存在，跳过会导致后续命令 PRECONDITION_FAIL。
>
> `alloy _phase start` 原子完成：幂等写 `phase_timings.plan.started_at` + git add 限路径 + commit。产生独立的"阶段开始"commit（仅 .alloy.yaml），不并入后续制品 commit。

1. **change 目录存在 + draft.md 存在**（⛔ PRECONDITION_FAIL）：
   - change 不存在 → 引导 `/alloy-start <name>` 创建
   - draft.md 缺失 → 异常状态，引导重新运行 `/alloy-start`

2. **phase 校验**（⛔ PRECONDITION_FAIL）：`alloy _guard precheck openspec/changes/<name> planning`
   - phase ≠ planning 时读取 `alloy-shared/references/phase-routing.md` 自动跳转
   - 路由不到合法状态 → ⛔ PRECONDITION_FAIL

3. **git 仓库检查**（⛔ PRECONDITION_FAIL）：`git rev-parse --git-dir`，失败 → 引导初始化或退出。

4. **Skill 预检**（⛔ PRECONDITION_FAIL）：cmd: opsx/continue, skill: writing-plans
   调 `alloy _precheck --cmd "opsx/continue" --skill "writing-plans"` 检测(多 agent 适配,详见 `alloy-shared/references/skill-precheck.md`)。任一不可用 → 引导 `alloy init`，不存在降级。

5. **draft 来源验证**（⛔ PRECONDITION_FAIL，task #16）：用 hash 链验证 draft 完整性，**禁用 commit msg 字符串解析**：

   ```bash
   if ! alloy _record check openspec/changes/<name> draft 2>/dev/null; then
     echo "⛔ PRECONDITION_FAIL: draft hash 验证失败"
     echo "  原因：draft.md 内容与 records 中记录的 hash 不一致"
     echo "  可能：draft 被手动编辑 / records 被破坏 / 未经完整 start 流程"
     echo "  禁止：agent 自动接受不一致的 draft 继续生成下游制品"
     echo ""
     echo "🔴 USER_GATE: 选择处理路径"
     echo "  1. 回溯到 /alloy-start 重新确认 draft"
     echo "  2. 强制继续——下游制品将基于不可信 draft 生成（不推荐）"
   fi
   ```

   `_record check` 命令已存在并被 archive/apply/finish 使用，参照实现保持一致。

6. **多 change 并行检查**（⚠️ WARN）：扫描其他 change 是否处于 plan/apply 阶段，提示用户 plan 阶段是单 change 串行（避免 schema DAG 跨 change 干扰）：

   ```bash
   PARALLEL=$(alloy _guard parallel-phase started,planned,applied)
   if [[ "$PARALLEL" == parallel:* ]]; then
     echo "⚠️ WARN: 检测到 ${PARALLEL#parallel:} 个活跃 change,建议串行处理"
     alloy _guard parallel-phase started,planned,applied | tail -n +2
   fi
   ```

7. **分支位置校验**（⛔ PRECONDITION_FAIL）：plan 阶段在 feature 分支上工作——start 已写入 `feature_branch` 并切换。若用户手动切回主分支后跑 plan，制品 commit 会污染主分支历史。复用 apply 的 `branch-position` 守卫：

   ```bash
   alloy _guard branch-position openspec/changes/<name>
   ```

   - `on-feature` → ✓ 合规：当前在 feature 分支（非 main），符合 Alloy 工作流推荐
   - `on-main` → ⛔ `[PRECONDITION_FAIL] 当前在主分支，plan 禁止在主分支执行——制品 commit 会污染主分支历史。请切换到 feature_branch 或回 /alloy-start 重新初始化分支。`
   - `feature-missing` / `feature-lost:<branch>` → ⛔ `[PRECONDITION_FAIL] feature_branch 状态记录与实际不符。读取 alloy-shared/references/branch-validation.md 修复。`
   - `on-other:<branch>` → ⛔ `[PRECONDITION_FAIL] 当前位于第三分支 <branch>，非 feature_branch。请切换到 feature_branch。`

   **禁止 agent 自动 `git checkout` 切换——可能丢弃用户未提交工作（§3.5.1）。**

前置检查通过：draft.md ✓ phase=planning ✓ git ✓ 技能 ✓ draft hash ✓ 分支位置 ✓

---

### [Step 1/3] 确认 Change

**进入阶段时，必须输出以下 Phase 框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan            │
│ 启动时间: phase_timings.plan.started_at
└──────────────────────────────────────┘
```

draft.md 来源已在 Step 0 完成 hash 验证（task #16）。本步聚焦 phase 校验和路由：

1. 阶段校验：`alloy _guard precheck openspec/changes/<name> planning`（已在 Step 0 通过，本步幂等重检）
2. **若 phase 不匹配：** 读取 `alloy-shared/references/phase-routing.md` 自动跳转到对应 skill。
3. **若 change 不存在或 draft.md 缺失：** 引导 `/alloy-start <name>`——前序阶段完全没做时保留 ⛔ PRECONDITION_FAIL。

前置检查通过：draft.md ✓ phase=planning ✓ git ✓ 技能 ✓ draft hash ✓

---

### [Step 2/3] 制品生成 · /opsx:continue + writing-plans

**REQUIRED SUB-SKILL:** Use superpowers:writing-plans

**每个制品必须通过 `/opsx:continue` 生成。禁止手动编写制品文件。**

加载 `openspec-continue-change` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`),传入 change name。`opsx:continue` 自动获取 schema 指令并生成制品--不要自行编写,不要一次生成多个。
- Claude Code / OpenCode: 调 `skill({ name: "openspec-continue-change" })`
- Pi: `read .pi/skills/openspec-continue-change/SKILL.md`

**⛔ HARD_STOP：每次调用 `/opsx:continue` 生成制品前必须 `_skill log`。** 跳过 = skill_usage 缺失 = count 不反映实际调用次数。
> count 语义是"技能实际调用次数"——plan 阶段每生成一个制品调用一次 opsx:continue，count 应累加。
> 违反字面 = 违反精神：哪怕"已经 log 过一次了"、"只是复用已加载的技能"——每次调用都要 log，count 才能准确。
>
> **`_skill log` 只写 .alloy.yaml 不单独 commit**——由随后的 `_artifact commit` 一起 commit（_artifact commit 的 git add 含 .alloy.yaml）。
> ⛔ 禁止在 `_skill log` 后自己跑 `git commit`——会产生冗余的"记录技能使用"commit，与制品 commit 分离。违反字面 = 违反精神：哪怕"想确保 skill_usage 落地"，也禁单独 commit。
```bash
# 每次调用 /opsx:continue 生成制品前执行（proposal/design/specs/tasks/plans 各一次）
alloy _skill log openspec/changes/<name> plan opsx:continue
```

**制品 DAG：** `proposal → design → specs → tasks → plans`（specs 还依赖 proposal 只读 Capabilities）

**git add 规则（§5.2.1 内嵌约束，HARD_STOP）：** 每个制品 commit 必须用精确路径（`openspec/changes/<name>/`），禁 `-A`/`-a`/`.`。违反字面 = 违反精神：哪怕"反正只改一个 markdown 文件"，也禁止 `-A`——agent 看不到的副作用文件可能被一并提交。

**git 自救禁令（§3.5.1 内嵌约束，HARD_STOP）：** 制品生成或 commit 失败时禁 `git checkout .` / `git restore .` / `git reset --hard` / `git stash` / `git clean -fd`——退出 skill 让用户处理是唯一合法路径。

**制品进度扫描**（调用 `/opsx:continue` 之前）：
```bash
alloy _progress artifacts openspec/changes/<name>
```
从第一个缺失/hash-mismatch 的制品开始生成。全部 done 时 🔴 USER_GATE：所有制品已锁定，确认推进 phase（确认 / 重新审查某个制品——指定制品名）。

> ⛔ [HARD_STOP] 禁用 `openspec status` 检测制品状态——openspec CLI 不识别 alloy 的 hash 锁定,会误报制品未 commit（如 specs 状态显示 "ready" 但 alloy 已 hash-lock）,导致重复 `_skill log` + 重复 `opsx:continue`。
> 违反字面 = 违反精神：哪怕"openspec status 看起来也能用",也会因不识别 hash 锁定而误判。必须用 `alloy _progress artifacts`。

> ⛔ [HARD_STOP] `opsx:continue` 是 skill(`openspec-continue-change`),**不是 openspec CLI 子命令**。禁止跑 `openspec continue`--该命令不存在,会报 `error: unknown command 'continue'`。必须加载 `openspec-continue-change` skill(Claude Code/OpenCode 调 `skill({ name: "openspec-continue-change" })`,Pi `read .pi/skills/openspec-continue-change/SKILL.md`),skill 内部会调正确的 openspec CLI 子命令。
> 违反字面 = 违反精神:哪怕"openspec continue 看起来是对应 CLI",也是 agent 脑补的错误映射。详见 `alloy-shared/references/opsx-commands.md`。

> [N/M] 是阶段内局部编号（M=5），不输出全局制品进度。全局进度由 `alloy status` 管理。

### 逐个制品审查流程

**[HARD_STOP] 即使用户主动说"后面不用看了"、"一次性过完"、"效率太低了"，审查窗口也不可跳过。** 5 个制品 = 5 个审查窗口——用户要求跳过不算授权。

**[HARD_STOP] 禁连续生成——每个制品必须走完"生成 → 展示 → USER_GATE 响应 → commit"完整流程，才生成下一个。** 违反字面 = 违反精神：哪怕"一次性生成 3 个再一起审查"，也算跳过审查窗口。两个制品 commit 时间差过小（如同一秒）= 未等待用户响应 = Iron Law 违规。

每个制品生成后,设 USER_GATE pending + 展示完整内容 + 🔴 USER_GATE 审查窗口:

> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具(AskUserQuestion/question/alloy-question)调用自动 clear 或手动 `alloy _guard user-gate pass` 降级。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require openspec/changes/<name> plan:lock-<artifact>
```

> 制品 [N/5] \<artifact\> ✓ 完成
> [展示制品完整内容]

🔴 USER_GATE（必须平台原生交互工具调用,首次呈现即调--禁先文本列选项）: 确认锁定 <artifact>

> ⛔ [HARD_STOP] 必须用平台原生交互工具调用--禁先文本输出"确认并继续 / 需要调整"再调工具。
> 违反字面 = 违反精神:哪怕"先展示选项让用户思考"、"文本+工具双保险",也算违反--首次呈现必须是平台原生交互工具调用,不是文本。
> 常见违规模式:agent 先输出"🔴 USER_GATE: 确认锁定 <artifact>(确认并继续 / 需要调整)"文本,再等用户回复--这是纯文本呈现,违反首次呈现原则。

选项:
- 1. 确认并继续 -- hash 锁定 + commit,生成下一个制品
- 2. 需要调整 -- 回到 brainstorming 重新设计

- **选 1：** hash 锁定 + commit——原子命令 `alloy _artifact commit` 内部完成 hash 计算 + records 写入（自动刷新 updated_at）+ git add 限路径 + commit：
  ```bash
  alloy _artifact commit openspec/changes/<name> <artifact>
  ```

  **commit 成功后直接生成下一个制品**——用户在审查窗口选"确认并继续"即授权进入下一制品，无需再次确认。输出简短进度提示后立即生成下游：
  ```
  > 制品 [N/5] <artifact> ✓ 已锁定，生成下一个制品 <next_artifact>...
  ```
  **最后一个制品（plans）锁定后输出以下完整模板（含需求变更提示，禁省略）：**
  ```
  > 制品 [5/5] plans ✓ 已锁定
  > 所有制品已锁定，推进 phase。
  >
  > 提示：apply 阶段早期的需求变更处理
  > - apply 早期（worktree 未创建 + SDD/EP 未启动）：仍可回退到 brainstorming 处理需求变更，走检查点回退流程
  > - apply 中后期（worktree 已创建 或 SDD/EP 已启动）：只能 /alloy-discard 重开
  > 详见 apply.md 的"需求变更闸门"。
  ```
  > ⛔ [HARD_STOP] plans 锁定后的输出必须含上述需求变更提示，禁省略。违反字面 = 违反精神：哪怕"提示用户已知"，也禁跳过——用户需要明确知道 apply 阶段的变更边界。

  > [HARD_STOP] 此处"直接生成下一个"不等于跳过审查——下一个制品生成后仍必须展示完整内容 + 🔴 USER_GATE 审查窗口，用户选"需要调整"可中断。违反字面 = 违反精神：哪怕"用户上一个选了确认，这个肯定也会确认"，也禁跳过下一个制品的审查窗口（§3 第 174 行 HARD_STOP 仍然生效）。

  生成下一制品前校验上游 hash：`alloy _record check openspec/changes/<name> <upstream>`，失败 → ⛔ PRECONDITION_FAIL（上游被破坏，必须修复后才能继续生成下游）。

- **选 2：** agent **必须先调 `alloy _guard user-gate reset openspec/changes/<name> plan:lock-<artifact>`**(把 gate 从 gate_history 移除 + 重新设为 pending_gate)。然后用户提出修改后，**agent 先判断是否触犯规格边界，给出判断 + 理由 + 建议，再由用户决断**：
> 原因:hook-guard 检测到问答工具调用时无条件 clear pending_gate + 加入 gate_history,用户选"需要调整"本意是拒绝通过 gate,语义被吞了。reset 恢复 gate 状态,重新生成后 agent 调 require(幂等)+ 问答工具重新询问。

  > [HARD_STOP] 无论变更大小，禁止用 Edit/Write 直接编辑已生成的制品文件。
  > 违反字面 = 违反精神：哪怕"只加一个字段""只改一行样式描述"，直接编辑都会让制品 hash 与 records 失配。修改只能通过"重新生成"（reset + /opsx:continue）或"回 brainstorming"实现。

  **Step 0 — agent 判断规格边界（agent 自主判断，禁止把分类甩给用户）：**

  > [HARD_STOP] 禁止用 AskUserQuestion 让用户在"需求变更 / 轻量修正"之间选分类。
  > 违反字面 = 违反精神：分类是 agent 的判断职责——agent 给结论，用户只在结论基础上决断去向。

  判断标准：
  - **越界**（触犯规格边界）= 改动 proposal 的 Capabilities / data model 字段 / API 契约 / 核心功能行为
  - **不越界**（规格边界内调整）= 纯展示样式、文案、不改数据契约和功能边界的调整

  例：列表加斑马线 = 不越界（纯展示）；增加截止日期 = 越界（新增 dueDate 字段，影响 data model + API 契约）。

  **Step 1 — 🔴 USER_GATE（平台原生交互工具）：用户基于 agent 判断决断**

  **情况一：agent 判断不越界**
  > 我判断这是规格边界内的调整：\<变更描述\>（理由：\<不触犯 data model / API / 功能边界\>）。建议重新生成 \<artifact\> 制品，下游已锁定制品不变。
  > 1. 确认——重新生成当前制品
  > 2. 我认为这其实越界了——转越界流程（回 brainstorming）
  > 3. 取消调整，继续当前审查

  选 1：`alloy _artifact reset openspec/changes/<name> <artifact>` → `/opsx:continue` 重新生成 → **diff 审查窗口（见下方"重新生成 diff USER_GATE"）** → 重新审查。下游已锁定制品保持不变。
  选 2：转入下方"越界变更检查点流程"。
  选 3：回到审查窗口，重新展示制品内容。

  **情况二：agent 判断越界**
  > 我判断这触犯规格边界：\<变更描述\>（理由：\<新增字段 / 改 API / 改功能行为，影响上游 proposal/design\>）。当前制品链不含此变更，建议回 brainstorming 重新沟通以保证所有制品一致。
  > 1. 继续变更——回 brainstorming 重新沟通（自动保存当前进度为检查点）
  > 2. 放弃变更——保持当前制品，继续当前 plan

  选 1：进入下方"越界变更检查点流程"。
  选 2：保持当前制品不动，继续当前 plan（用户放弃了此次变更）。

  ---

  **越界变更检查点流程**（情况二选 1，或情况一选 2 后进入）：

    **[HARD_STOP] 禁止 agent 自行 `git stash` / `git reset` / `git restore .` / `git checkout HEAD --` / 手动 `git tag` 处理未提交变更。**
    **违反字面 = 违反精神:哪怕"用户已 USER_GATE 授权越界回退,我自己跑 git restore 清场效率更高",也算违反--agent 跑任何 §3.5.1 禁令命令都是违规,清场必须下沉到 `alloy _checkpoint switch` 内部(CLI 跑,不经过 hook)。**
    **检查点(checkpoint)是 git tag 指向 HEAD commit,未提交变更不在 tag 保护范围。**
    **[HARD_STOP] agent 禁让用户输命令字面(如"请手动执行 `git restore .`")。**用户手动 = 用户 shell 执行,agent 不解读用户输入的命令文本。详见 `alloy-shared/references/git-self-rescue-ban.md` "用户输命令禁令"节。

    **核心机制:`alloy _checkpoint switch` 内部自动清理未提交变更 + git checkout -B 回退到 brainstorming 检查点。agent 只调 CLI,禁跑任何 git 自救命令。**
    `_checkpoint switch` 内部:检测 dirty -> `git restore --staged .` + `git restore .` 清 tracked 修改(untracked 保留,agent 重新生成时覆盖) -> `git checkout -B feature/<name> <tag>` 回退。HEAD 回到检查点 commit,.alloy.yaml/records/phase_timings/skill_usage 随 tag 状态恢复,plan 阶段的 commit/records/phase_timings 自然消失(不在 HEAD 链)。

    **执行流程:**

    1. **回退前创建 plan 检查点**(保护当前 plan 进度,用户反悔可切回;除非无新 commit 可存档):
       ```bash
       # 仅当当前 HEAD 不在最新 brainstorming 检查点时才创建(有新 commit 才需保护)
       alloy _checkpoint create openspec/changes/<name> --kind progress --reason "回退前进度快照(放弃变更回退点)"
       ```
       > **progress 检查点允许 dirty**(user-gate reset 修改的 .alloy.yaml 临时状态 + 未锁定制品 untracked 都 OK)--tag 指向当前 HEAD commit(已 commit 进度),dirty 部分不在 tag 保护范围,switch 时自动清理。brainstorming 检查点必须 clean(锚点语义严格)。

    2. **列出所有 brainstorming 检查点,让用户选回到哪个:**
       ```bash
       alloy _checkpoint list openspec/changes/<name>
       ```
       筛选 `alloy-checkpoint-<name>-brainstorming-*` 的 tag,展示给用户。

    3. **🔴 USER_GATE(平台原生交互工具):用户选回到哪个 brainstorming 检查点**
       > 检测到越界变更,选择回到哪个 brainstorming 检查点重新沟通:
       > 1. brainstorming-<N>(最新) -- 基于最新 draft 继续沟通
       > 2. brainstorming-<N-1> -- 回到上一版 draft(丢弃最新 draft)
       > ...
       > (z) 放弃变更--保持当前,继续 plan

       > 选项是 tag 名 + 注释摘要(制品/commit数/时间),禁让用户输命令。
       > 用户可选"从头开始"(brainstorming-1) 或"基于累加版本"(brainstorming-N) 继续沟通。

    4. **用户选定后执行回退**(CLI 内部自动清理未提交变更,agent 禁跑任何 git 自救命令):
       ```bash
       alloy _checkpoint switch openspec/changes/<name> <用户选择的tag>
       ```
       > `_checkpoint switch` 内部:检测 dirty -> `git restore --staged .` + `git restore .` 清 tracked 修改 -> `git checkout -B feature/<name> <tag>` 回退。
       > **[HARD_STOP §3.5.1 例外]** _checkpoint switch 是 git reset 的合法形式：当且仅当用户
       > 在上方 USER_GATE 已确认后才允许，由 CLI 内置 phase 校验保护。
       > 切换后 phase/records/phase_timings 自动回到 tag 状态（plan 阶段的全部消失）。

    5. **回退后以文件为准重新走 start 流程**(适用整个开区间:brainstorming-1 创建 -> apply worktree/代码生成前):

       > ⚠️ **上下文已过时，以文件为准。** git checkout 回退了代码和 .alloy.yaml，但你的会话上下文还停留在回退前的阶段（plan 或 apply）。**禁凭上下文记忆行动**——必须重新读 .alloy.yaml 确认当前状态，按文件状态决定下一步。

       ```bash
       # 强制读状态，以文件为准（上下文可能过时）
       alloy _state read openspec/changes/<name> phase
       alloy _state read openspec/changes/<name> records
       ```

       **按读取的 phase + records 决定下一步**：
       - phase=starting + records 有 draft -> 越界回退场景(brainstorming-N tag 在 `_phase complete` 之前打,switch 回去 phase=starting),走步骤 9-10(沟通 + reset records + 重生成 draft + 审查) + 步骤 11(`_start finalize` 收尾,和全新开始路径一致)
       - phase=started + records 无 draft -> 回到 brainstorming 前,需重新 brainstorming + 生成 draft
       - phase=started + records 有 draft(本次回退目标)-> draft 已锁定,**停在 start 阶段等待用户指示进 plan**(NO AUTO ADVANCE)
       - 其他状态 -> 异常,退出 skill 让用户排查

       > ⛔ [HARD_STOP] 步骤 10 `_artifact reset draft` 之前禁调 `alloy _start finalize`:
       > `_start finalize` 假设 records 无 draft。越界回退场景步骤 10 之前 records 有 draft,直接调 `_start finalize` 会因 hash 未变跳过 commit + `.alloy.yaml` 的 `_skill log` 修改没被 commit + `_checkpoint create brainstorming` 因 dirty 失败。
       > **必须先走步骤 10 `_artifact reset draft`**(清 records 的 draft hash),之后 records 无 draft,步骤 11 调 `_start finalize` 正常执行(CLI 拦截条件 `phase=starting + records 有 draft` 不满足)。
       > 违反字面 = 违反精神:哪怕"`_start finalize` 看起来等价于步骤 11",也算违反--时序约束,步骤 10 reset 是步骤 11 finalize 的前置。

       **[HARD_STOP] 重走 start 流程禁直接 Write + git commit,必须通过 `_artifact commit`(手动调或 `_start finalize` 内部调)来 commit draft:**
       **违反字面 = 违反精神:哪怕"Write 覆盖 draft.md 后 git commit 效率更高",也算违反--直接 git commit 不会写 records hash,导致 brainstorming 检查点创建时 draft hash 不一致(CLI 层会拦)+ 下游 _record check 失败。**
       **实测踩坑:Pi 会话 agent Write 覆盖 draft.md + git add + git commit 跳过 _artifact commit,records hash 旧,plan 阶段 _record check draft FAIL,流程卡死。**

       **本次回退是"发起变更"——重走 start.md 步骤 9-11**（用户因越界变更回来重新沟通需求）：
       - **步骤9**：`_skill log openspec/changes/<name> start superpowers:brainstorming`（called_at 更新，count++）+ 加载 brainstorming 技能**基于已有 draft 基线,只沟通变更点**(禁重走完整 brainstorming + 禁重设 topic-confirm gate)
         > ⚠️ **越界回退场景的主题和原 draft 基线都已确认**(brainstorming-N tag 锁定了 draft = 主题 + 设计都已审查通过),步骤 9 只需沟通**用户提出的变更点**,不是从头重新 brainstorming。
         > **禁重设 `start:topic-confirm` gate**--主题不变,无需重新确认。原 draft 已锁定 = 主题已确认。
         > **禁重问已有 draft 里已确认的设计要点**--只问变更点相关的决策。例:原 draft 已确认 shebang + chmod +x,用户提"支持 2 个参数",只问"2 个参数的输出格式",不重问 shebang/权限。
         > **实测踩坑:Pi 会话 agent 越界回退后重新设 topic-confirm gate + 重问 3 个设计要点(shebang/参数/输出格式),shebang 在原 draft 已确认不该重问,浪费用户时间。**
       - **步骤10**：`alloy _artifact reset openspec/changes/<name> draft`（清掉旧 draft 的 records hash,让步骤 11 的 `_start finalize` 不被 CLI 拦）-> brainstorming 产出新 draft（**禁用 `/opsx:continue`**--draft 属于 start 阶段,新 draft = 原 draft 基线 + 变更点合并）-> 审查窗口(USER_GATE 确认锁定,禁手动 `_artifact commit draft`,让步骤 11 的 `_start finalize` 内部 commit)
         > 步骤 10 reset 后 records 无 draft,步骤 11 才能调 `_start finalize`(否则 CLI 拦截 `phase=starting + records 有 draft`)。
         > 步骤 10 禁手动 `_artifact commit draft`--`_start finalize` 内部第 1 步会 commit,手动 commit 会导致 `_start finalize` 第 1 步 hash 未变幂等跳过(虽不致命,但多 1 次命令)。
       - **步骤11**：调 `alloy _start finalize openspec/changes/<name>`(4 步原子,和全新开始路径一致):
         ```bash
         alloy _start finalize openspec/changes/<name>
         ```
         > `alloy _start finalize` 原子完成 4 步(任一步失败 exit 1,不继续):
         > 1. `_artifact commit draft` -- draft hash-lock + commit(步骤 10 已 write 落盘,这里 commit)
         > 2. `_checkpoint create brainstorming` -- 打 brainstorming-(N+1) 检查点(tag 指向 draft commit)
         > 3. `_verify phase-exit start` -- start 阶段出口校验
         > 4. `_phase complete start` -- 推进 phase=started,写 completed_at
         > **顺序约束**:tag 必须在 `_phase complete` 之前打(已内化到 `_start finalize`),否则 tag 会指向阶段完成 commit 而非 draft commit。
         > start.completed_at 由 `_phase complete start` 自然写入,无需补写。

    6. **输出感知信息(自然语言,禁让用户输命令):**
       ```
       ✓ 已回退到 <选中的tag>，重新沟通完成，draft 已重新生成
       ✓ 已保存新进度为 brainstorming-<N+1>
       
       后续你可以说"列出检查点"或"我想回到某个检查点"来查看/切换检查点。
       start 阶段已完成，等待你的指示——回复"继续"或"plan"进入 plan 阶段。
       ```
       > ⛔ [HARD_STOP] 回退重新生成 draft 后，**停在 start 阶段等待用户指示**，禁自动进 plan。
       > 违反字面 = 违反精神：哪怕"start 流程已重新走完，自然进 plan"、"用户之前就在 plan 阶段"——也禁自动进 plan。用户需明确指示才进 plan（NO AUTO ADVANCE）。
       > 注意：感知信息里**禁止**出现 `alloy _checkpoint list` / `alloy _checkpoint switch` 等命令字样——
       > 用户用自然语言触发，agent 负责调用 CLI。违反字面 = 违反精神：让用户输命令"一点也不 AI"。

    **路径2：放弃变更（回到 progress-<ts>）——用户主动触发**

    用户在 plan/apply 早期任一时刻说"放弃变更"/"找回之前的进度"/"回到变更前"/"我不想改了"等自然语言时，agent：
    1. 调用 `alloy _checkpoint list openspec/changes/<name>` 获取检查点列表
    2. **筛选 progress- 前缀的 tag**（brainstorming-N 是发起变更用，不在此列）展示给用户
    3. 若无 progress-<ts> → 提示用户"无进度快照可回，当前进度是唯一的"，不切换
    4. 若有 → AskUserQuestion 让用户选具体哪个 progress-<ts>（选项是 tag 名 + 注释摘要，禁让用户输命令）
    5. 用户选定后 → 🔴 USER_GATE 确认如何处理当前进度：
       > 你选择了放弃变更，回到进度快照 \<tag 名\>（含 \<该 tag 锁定的制品\>）。
       > 当前进度（\<当前已锁定制品\>）如何处理？
       > 1. 保存当前为 progress 检查点 + 跳到所选 progress-<ts>
       > 2. 放弃当前 + 跳到所选 progress-<ts>
       > 3. 取消——保持当前，不切换

    选 1：先 `alloy _checkpoint create --kind progress --reason "放弃变更前保存当前"` → 再 `alloy _checkpoint switch <tag>`。
    选 2：直接 `alloy _checkpoint switch <tag>`(CLI 内部自动清理未 commit 变更,agent 禁跑 git restore)。
    选 3：不切换，继续当前。

    > 切换后 phase/records/phase_timings 自动回到 tag 状态（progress-<ts> 含打点时的完整状态）。
    > **切换后必须读取 records 状态，从第一个缺失制品开始 plan/apply：**
    > CLI 会输出"已锁定制品"和"缺失制品"列表。agent 必须根据缺失列表从第一个缺失制品开始生成，
    > **禁止跳过**——哪怕"用户之前已经确认过某制品"，切回旧检查点后该制品可能未锁定，必须重新生成+审查。
    > 违反字面 = 违反精神：哪怕"design 看起来已经生成过"，records 没有记录 = 没有审查 = 必须重新走。
    >
    > **不补写 start.completed_at**——progress-<ts> 含打点时的真实状态（start 已完成则含 completed_at，未完成则不含），切回即恢复，无需补写。

    **路径1：发起变更（回到 brainstorming-N）——用户主动触发**

    用户在 plan/apply 早期任一时刻说"增加功能"/"改需求"/"变更"/"我要改 XXX"等自然语言时，agent：
    1. 调用 `alloy _checkpoint list openspec/changes/<name>` 获取检查点列表
    2. **筛选 brainstorming- 前缀的 tag**（progress-<ts> 是放弃变更用，不在此列）展示给用户
    3. 若无 brainstorming-N → 提示用户"无 draft 锚点可回，需先完成 start 生成 draft"，不切换
    4. 若有 → AskUserQuestion 让用户选具体哪个 brainstorming-N（选项是 tag 名 + 注释摘要）
    5. 用户选定后 -> 执行"越界变更检查点流程"的步骤 1 + 步骤 4-6(路径1 不在越界检测场景,未 commit 信息由 _checkpoint switch 内部清理;跳过步骤 2-3 的 USER_GATE--路径1 步骤 3 已完成检查点选择):
       - **步骤1**:回退前打 progress-<ts>(保护当前 plan 进度,供放弃变更时切回)
       - **步骤4**:`_checkpoint switch` 到所选 brainstorming-N
       - **步骤5-6**:重走 start 9-11 + 输出感知信息

  **无论哪条路径，都不直接编辑已生成的制品文件**（违反字面 = 违反精神：制品禁直接编辑）。

**重新生成 diff USER_GATE（HARD_STOP，task L3）：** 不越界路径（情况一选 1）reset + 重新生成后、重新审查前，必须采集 diff 并让用户物理确认——agent 不得基于 `/opsx:continue` 返回成功直接进入审查窗口。

```bash
# 重新生成后，先 diff 再审查
DIFF_OLD=$(git show HEAD:"openspec/changes/<name>/<artifact>.md" 2>/dev/null)
DIFF_NEW=$(cat "openspec/changes/<name>/<artifact>.md" 2>/dev/null)
```

🔴 USER_GATE（必须平台原生交互工具）：

> 重新生成 diff：
> ```
> [git diff HEAD -- openspec/changes/<name>/<artifact>.md | head -100]
> ```
> 确认变更仍在规格边界内（不改 data model / API / 功能边界）：
> 1. 确认——边界内调整，继续锁 hash
> 2. 发现越界变更——放弃重新生成，转越界流程（回 brainstorming）
> 3. 放弃调整——回退到 reset 前状态（`git checkout HEAD -- openspec/changes/<name>/<artifact>.md`）

**[HARD_STOP]** agent 不得基于 "diff 看起来没改功能" 自动选 1——必须用户物理选择（interaction-style.md "沉默 ≠ 授权"）。diff 必须截前 100 行防爆量，但禁 agent 基于 "diff 短" 跳过调用。（违反字面 = 违反精神：制品禁直接编辑）。

**审查窗口只展示制品内容，不打印 schema instructions 模板。**

### tasks 审批后 → writing-plans

加载 `writing-plans` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`)生成 plans.md:
- Claude Code / OpenCode: 调 `skill({ name: "writing-plans" })`
- Pi: `read .pi/skills/writing-plans/SKILL.md`

- 传入 tasks + specs + design 作为上下文
- **遵循 writing-plans 完整原始流程**——从任务拆解到执行交接
- 保存路径：`openspec/changes/<name>/plans.md`（非默认的 `docs/superpowers/plans/`）
- writing-plans 分析任务特征后，将**推荐**策略写入 frontmatter（`strategy` + `reason`）——此为 plan 阶段推荐快照，非最终决策

**Alloy 流程覆盖（注入 writing-plans）：** 传入 tasks + specs + design 时，追加以下流程覆盖指令到 writing-plans 调用上下文，参照 start.md 对 brainstorming 的同款手法：

```
**Alloy 流程覆盖：** 本调用在 Alloy plan 流程内，writing-plans 完成后产出是
openspec/changes/<name>/plans.md，不是 docs/superpowers/plans/ 文件。

## 执行策略（strategy）—— 闸门节点

plan 阶段只产出「推荐」，不决策。决策在 apply。

[HARD_STOP] writing-plans 末尾「Two execution options / Which approach?」
询问在 Alloy 流程内必须跳过——执行策略决策时机在 apply，不在 plan。

无例外：
- 不要「用户在 plan 阶段就想选」——时机未到
- 不要「先问 plan 阶段，apply 再确认一次」——重复询问制造决策漂移
- 不要「writing-plans 技能原文里有这一步」——技能固有行为，Alloy 注入覆盖

违反字面 = 违反精神：哪怕「沿用技能原文流程」，也算违反——
Alloy 委托 skill 时注入流程覆盖是该模式的设计，不是可选。

writing-plans 应做：分析任务特征 → 将推荐策略写入 plans.md frontmatter
strategy + reason 字段（此为 plan 阶段推荐快照，非最终决策）。

请跳过 writing-plans checklist 中的「Invoke implementation skill」步骤
（apply 阶段才加载 SDD/EP）。

**交互风格：** 使用 AskUserQuestion，不用纯文本 1.2.3.。
```

```bash
alloy _skill log openspec/changes/<name> plan superpowers:writing-plans
```

plans.md frontmatter 格式：
```yaml
---
strategy: sdd
reason: <writing-plans 执行交接环节的策略分析理由>
---
```

plans 审批通过后，用 `alloy _artifact commit openspec/changes/<name> plans` 锁定制品（仅制品 + records，不含 phase_timings）。phase 推进由 Step 3 的 `alloy _phase complete` 独立完成——制品 commit 与阶段完成 commit 分离。

**plan 阶段 skill_usage 校验（⛔ HARD_STOP）：** 进入 Step 3 前，验证 opsx:continue 已记录。

```bash
SKILL_USAGE=$(alloy _state read openspec/changes/<name> skill_usage 2>/dev/null)
if ! echo "$SKILL_USAGE" | grep -qE '"skill":"opsx:continue"'; then
  echo "⛔ [HARD_STOP] skill_usage 缺失：未记录 opsx:continue"
  echo "  plan Step 2 每个制品必须通过 /opsx:continue 生成并 _skill log 记录。"
  echo "  禁止：agent 自动补 _skill log 后继续——记录必须反映真实加载。"
  exit 1
fi
echo "✓ skill_usage 校验通过：opsx:continue 已记录"
```

---

### [Step 3/3] 完成

```bash
alloy _state read openspec/changes/<name> records
```

**阶段完成时，必须输出以下 Phase 完成框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan — DONE     │
│ 启动时间: phase_timings.plan.started_at
│ 完成时间: phase_timings.plan.completed_at
│ 耗时: completed_at - started_at
└──────────────────────────────────────┘

→ Change: <name>  Phase: planned
→ 制品: draft ✓ proposal ✓ design ✓ specs ✓ tasks ✓ plans ✓
```

**hash 链尾扫（⛔ HARD_STOP，task L2）：** 在 phase 推进前对全部 6 个制品（draft + proposal + design + specs + tasks + plans）逐条校验——这是 phase 锁定前最后一次完整性校验，任何 hash 不匹配都必须暴露给用户。

```bash
# 原子命令 _record scan 内部完成：遍历 6 制品 + 检查文件/目录存在 + 检查 hash 一致 + 输出 ✓/✗
# specs 是目录型工件,scan 内部已特判（用 -d 检查目录,其他用 -f 检查文件）
alloy _record scan "openspec/changes/<name>"
```

> scan 退出码 0 = 全部 hash 一致,1 = 有断裂（✗ 输出具体制品 + 问题：文件缺失 / 无 record / hash 不匹配）。
> scan 失败时 ⛔ HARD_STOP,🔴 USER_GATE：
> - 1. 回溯到对应制品重新审查（scan 输出哪个制品 hash 不匹配,让用户决定回退到哪个制品重新生成）
> - 2. 显示 git log 让用户排查（`git log --oneline openspec/changes/<name>/`）
> - 3. 中止 plan 阶段退出 skill
>
> 禁止：agent 自动补 `_record write` 修复 hash——必须 🔴 USER_GATE 让用户选择处理路径。

**[HARD_STOP]** agent 不得基于 "_guard 也会校验" 跳过尾扫——_guard 校验与尾扫是独立防线，尾扫逐条命名文件确保"全量 6/6"，_guard 内部实现可能只校验 records 中存在的条目（文件存但 records 不存的 tainted artifact 会漏掉）。

**记录完成时间并推进 phase**——原子命令 `alloy _phase complete` 内部完成 completed_at 写入（自动刷新 updated_at）+ phase 推进 + git add 限路径 + commit。hash 尾扫通过后调用：
```bash
# 校验本阶段完成状态(5 制品 + state 字段)——失败则修复后重试,禁跳过
# ⛔ [HARD_STOP] _verify 和 _phase complete 必须同一 Bash 命令 && 连接,禁拆成两个命令
# 拆开(如 _verify && echo OK || echo FAIL 后单独 _phase complete)绕过短路保护,_verify 失败时 agent 可能仍继续
alloy _verify phase-exit plan openspec/changes/<name> && alloy _phase complete openspec/changes/<name> plan
```

`_phase complete` 不做 hash 校验——尾扫是 skill 层的独立防线（见上方），CLI 只负责原子写入。返回非零时检查 git 状态。

**§5.2.3 路径 B 降级（HARD_STOP）：** 如果 guard --apply 推进 phase 成功，但后续命令意外失败（不可恢复状态），**禁 agent 运行 `git reset --hard` / `git checkout .` 清场**。降级路径：

```bash
# 手动回退 phase（仅限用户确认后执行）
alloy _state set openspec/changes/<name> phase started
# 不要 reset 已 commit 的制品——hash 链保留，用户可重入 plan 阶段决定下一步
```

违反字面 = 违反精神：哪怕"只是为了让流程干净"，也禁 reset 清场——制品 hash 链是用户的工作记录。

**plans 完成后不要自动进入 apply** — 给用户空间审视完整规划。

> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具(AskUserQuestion/question/alloy-question)调用自动 clear 或手动 `alloy _guard user-gate pass` 降级。

> ℹ️ `plan:phase-complete` gate 已由 `_phase complete plan` 自动设。以下 `user-gate require` 命令幂等可省略--agent 也可手动调(覆盖相同值,无冲突)。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require openspec/changes/<name> plan:phase-complete
```

🔴 USER_GATE（必须平台原生交互工具调用）: plan 阶段完成,下一步?

> ⛔ [HARD_STOP] 必须用平台原生交互工具调用——禁纯文本列选项 / 禁直接 `Skill` 加载下一阶段 / 禁纯文本"运行 /alloy-apply"提示 / 禁提示用户手动输入命令。
> 违反字面 = 违反精神:哪怕"纯文本效果一样"、"直接 Skill 更流畅"、"用户已授权提示一下也行",也算违反——AskUserQuestion 强制结构化选项,避免 agent 用模糊措辞让用户回 yes 蒙混过关（§4.1）。
> 常见违规模式:
> - 纯文本输出"运行 /alloy-apply 进入执行阶段"让用户手动输入
> - 纯文本列"1. 进入 apply / 2. 调整需求 / 3. 其他"让用户回复
> - 用户选 1 后提示"请运行 /alloy-apply"让用户手动输入——应直接 Skill 加载
> 非 Claude Code 平台按 `alloy-shared/references/interaction-style.md` §平台工具对照 降级。

> 选项:
> - 1. 进入 apply 阶段--加载 `alloy-apply` skill 推进执行
> - 2. 调整需求--回 brainstorming 重新讨论(plans 已锁定,改需求 = 越界回退)
> - 3. 其他--用户自定义下一步

> 用户选 1 后,agent **必须直接加载 `alloy-apply` skill(多 agent 适配,见 `alloy-shared/references/skill-loading.md`):
- Claude Code / OpenCode: 调 `skill({ name: "alloy-apply", args: "<change-name>" })`
- Pi: `read .pi/skills/alloy-apply/SKILL.md`(read 后按 SKILL.md 指引执行,change name 通过上下文传入)**

> ⛔ [HARD_STOP] 禁止输出"请运行 /alloy-xxx"让用户手动输入命令--用户已在 USER_GATE 授权,阶段转换已触发,再让用户输入命令 = 违反 Iron Law。
> 违反字面 = 违反精神:哪怕"提示一下更友好"、"用户可能想调整",也算违反--用户要调整会在 USER_GATE 选"调整需求",选"进入"就是授权直接加载。
> 用户选 2 后,agent **必须先调 `alloy _guard user-gate reset openspec/changes/<name> plan:phase-complete`**(把 gate 从 gate_history 移除 + 重新设为 pending_gate),再走本 SKILL.md 的"路径1:发起变更"流程(创建 plan 检查点保护当前进度 + `_checkpoint switch brainstorming-1` + 越界回退步骤 9-11):
>   - plan 完成后 phase=planned,records 有 draft/proposal/design/specs/tasks/plans,brainstorming-1 tag 存在。
>   - 走"路径1:发起变更"步骤 1(创建 plan 检查点)+ 步骤 4(`_checkpoint switch brainstorming-1`)+ 步骤 5-6(越界回退步骤 9-11:重新 brainstorming 沟通变更点 + 重生成 draft + `_start finalize`)。
>   - 跳过路径1 步骤 2-3 的 USER_GATE(用户已在 phase-complete gate 选"调整需求",意图明确,不需再问"放弃变更 vs 调整需求")。
>   原因:hook-guard 检测到问答工具调用时无条件 clear pending_gate + 加入 gate_history,用户选"调整需求"本意是拒绝通过 gate,语义被吞了。reset 恢复 gate 状态,走完越界回退后 agent 重新调 require(幂等)+ 问答工具重新询问。
> 用户选 3 后,agent 同样调 reset,再停止,等用户后续命令。

> **提示：apply 阶段早期的需求变更处理**
> apply 阶段早期（worktree 未创建 + SDD/EP 未启动）仍可回退到 brainstorming 处理需求变更，走检查点回退流程。
> 一旦 worktree 创建或 SDD/EP 启动，只能 `/alloy-discard` 重开。
> 详见 apply.md 的"需求变更闸门"。

