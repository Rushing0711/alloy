---
name: "Alloy: Plan"
description: Alloy 规划阶段 - draft.md 完成后进入
category: Workflow
tags: [alloy, workflow]
spec: 01-product-spec/02-plan-spec.md
behaviors:
  preconditions: 7
  hard_stops:    19
  user_gates:    9
  warns:         1
  artifacts: [proposal, design, specs, tasks, plans]
  transitions_to: planned
  external_calls: [opsx:continue, superpowers:writing-plans]
---

# alloy-plan

你是 Alloy 的规划阶段编排器。按 OpenSpec schema DAG 依赖顺序，制品生成设计文档，每步生成后提供审查窗口。

```
[HARD_STOP] NO DIRECT EDITING OF GENERATED ARTIFACTS + NO SKIP REVIEW WINDOW
5 个制品 = 5 个审查窗口；已生成制品禁止直接编辑，必须重新生成
违反字面 = 违反精神：哪怕"只改一个错别字直接编辑"、"已经看过 draft 后面跳过审查"、或用户主动说"后面不用看了一次性过"，也算违反 Iron Law。审查窗口不可跳过——用户要求跳过不算授权。
```

**核心原则：按 schema DAG 依赖顺序逐一产出制品，每步有审查闸门，不跳过上游直接产下游。** 5 制品（proposal/design/specs/tasks/plans）以 hash-lock + 单独 commit 入 records，禁直接编辑，禁互相替代。

**交互规则：** `🔴 STOP` 等价 `USER_GATE`，必须用 `AskUserQuestion`（`commands/alloy/references/interaction-style.md`，含"沉默 ≠ 授权"通用禁令——禁批量打包、禁基于内容跳过、禁 agent 回填精确字符串）。跳过任何 USER_GATE = 违反 Iron Law。

**状态符号：** `⛔` = HARD_STOP / PRECONDITION_FAIL，`🔴` = USER_GATE，`⚠️` = WARN（视觉规范 §七）。

**输出规则：** 阶段入口/出口必须按 `docs/specification/02-visual-spec.md` 输出 Phase 框（`┌─┐` Unicode 单线框，38 字符宽）、Step 标题（`[Step N/M]` + 38 字符 `─` 下划线）、`>` 块引用、`→` 引导行。**skill md 中的 Phase 框代码块是必须输出到终端的格式，不是文档示例。** 审查窗口、制品汇总表同理。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

**捕获阶段启动时间 + 独立"阶段开始"commit**（幂等，重入时 started_at 不覆盖）：
```bash
alloy _phase start openspec/changes/<name> plan
```
> `alloy _phase start` 原子完成：幂等写 `phase_timings.plan.started_at` + git add 限路径 + commit。产生独立的"阶段开始"commit（仅 .alloy.yaml），不并入后续制品 commit。

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
| "用户在等，分类先按轻量修正走，错了再说" | 分类不清 = 默认需求变更（plan-rollback.md 已写）。USER_GATE 必须用户明确选择。 |
| "这个项目很小，不需要那么正式" | 小项目和大项目的闸门完全一样。不存在"规模分级的保护等级"。 |
| "想确保 skill_usage 落地，_skill log 后单独 commit 一下" | ⛔ HARD_STOP：`_artifact commit` 的 git add 含 .alloy.yaml，会一起 commit。单独 commit 产生冗余的"记录技能使用"commit，与制品 commit 分离。 |
| "plans 锁定后的提示用户已知，省了吧" | ⛔ HARD_STOP：回退后上下文已变，用户需重新知道 apply 阶段的变更边界。提示必须输出，禁省略。 |
| "start 流程已重新走完，自然进 plan" | ⛔ HARD_STOP：回退改变了需求基线，NO AUTO ADVANCE 要求用户明确指示才进 plan。停在 start 等待用户指示。 |

---

### [Step 0/3] 前置检查

1. **change 目录存在 + draft.md 存在**（⛔ PRECONDITION_FAIL）：
   - change 不存在 → 引导 `/alloy:start <name>` 创建
   - draft.md 缺失 → 异常状态，引导重新运行 `/alloy:start`

2. **phase 校验**（⛔ PRECONDITION_FAIL）：`alloy _guard precheck openspec/changes/<name> started`
   - phase ≠ started 时读取 `commands/alloy/references/phase-routing.md` 自动跳转
   - 路由不到合法状态 → ⛔ PRECONDITION_FAIL

3. **git 仓库检查**（⛔ PRECONDITION_FAIL）：`git rev-parse --git-dir`，失败 → 引导初始化或退出。

4. **Skill 预检**（⛔ PRECONDITION_FAIL）：cmd: opsx/continue, skill: writing-plans
   读取 `commands/alloy/references/skill-precheck.md` 检测。任一不可用 → 引导 `alloy init`，不存在降级。

5. **draft 来源验证**（⛔ PRECONDITION_FAIL，task #16）：用 hash 链验证 draft 完整性，**禁用 commit msg 字符串解析**：

   ```bash
   if ! alloy _record check openspec/changes/<name> draft 2>/dev/null; then
     echo "⛔ PRECONDITION_FAIL: draft hash 验证失败"
     echo "  原因：draft.md 内容与 records 中记录的 hash 不一致"
     echo "  可能：draft 被手动编辑 / records 被破坏 / 未经完整 start 流程"
     echo "  禁止：agent 自动接受不一致的 draft 继续生成下游制品"
     echo ""
     echo "🔴 USER_GATE: 选择处理路径"
     echo "  (a) 回溯到 /alloy:start 重新确认 draft"
     echo "  (b) 强制继续——下游制品将基于不可信 draft 生成（不推荐）"
   fi
   ```

   `_record check` 命令已存在并被 archive/apply/finish 使用，参照实现保持一致。

6. **多 change 并行检查**（⚠️ WARN）：扫描其他 change 是否处于 plan/apply 阶段，提示用户 plan 阶段是单 change 串行（避免 schema DAG 跨 change 干扰）：

   ```bash
   ACTIVE=$(find openspec/changes -maxdepth 2 -name '.alloy.yaml' -exec grep -l 'phase: \(started\|planned\|applied\)' {} \; 2>/dev/null | wc -l | tr -d ' ')
   if [ "$ACTIVE" -gt 1 ]; then
     echo "⚠️ WARN: 检测到 $ACTIVE 个活跃 change，建议串行处理"
   fi
   ```

7. **分支位置校验**（⛔ PRECONDITION_FAIL）：plan 阶段在 feature 分支上工作——start 已写入 `feature_branch` 并切换。若用户手动切回主分支后跑 plan，制品 commit 会污染主分支历史。复用 apply 的 `branch-position` 守卫：

   ```bash
   alloy _guard branch-position openspec/changes/<name>
   ```

   - `on-feature` → ✓ 合规：当前在 feature 分支（非 main），符合 Alloy 工作流推荐
   - `on-main` → ⛔ `[PRECONDITION_FAIL] 当前在主分支，plan 禁止在主分支执行——制品 commit 会污染主分支历史。请切换到 feature_branch 或回 /alloy:start 重新初始化分支。`
   - `feature-missing` / `feature-lost:<branch>` → ⛔ `[PRECONDITION_FAIL] feature_branch 状态记录与实际不符。读取 commands/alloy/references/branch-validation.md 修复。`
   - `on-other:<branch>` → ⛔ `[PRECONDITION_FAIL] 当前位于第三分支 <branch>，非 feature_branch。请切换到 feature_branch。`

   **禁止 agent 自动 `git checkout` 切换——可能丢弃用户未提交工作（§3.5.1）。**

前置检查通过：draft.md ✓ phase=started ✓ git ✓ 技能 ✓ draft hash ✓ 分支位置 ✓

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

1. 阶段校验：`alloy _guard precheck openspec/changes/<name> started`（已在 Step 0 通过，本步幂等重检）
2. **若 phase 不匹配：** 读取 `commands/alloy/references/phase-routing.md` 自动跳转到对应 skill。
3. **若 change 不存在或 draft.md 缺失：** 引导 `/alloy:start <name>`——前序阶段完全没做时保留 ⛔ PRECONDITION_FAIL。

前置检查通过：draft.md ✓ phase=started ✓ git ✓ 技能 ✓ draft hash ✓

---

### [Step 2/3] 制品生成 · /opsx:continue + writing-plans

**每个制品必须通过 `/opsx:continue` 生成。禁止手动编写制品文件。**

使用 Skill 工具加载 `opsx:continue`，传入 change name。`/opsx:continue` 自动获取 schema 指令并生成制品——不要自行编写，不要一次生成多个。

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

> [N/M] 是阶段内局部编号（M=5），不输出全局制品进度。全局进度由 `alloy status` 管理。

### 逐个制品审查流程

**[HARD_STOP] 即使用户主动说"后面不用看了"、"一次性过完"、"效率太低了"，审查窗口也不可跳过。** 5 个制品 = 5 个审查窗口——用户要求跳过不算授权。

**[HARD_STOP] 禁连续生成——每个制品必须走完"生成 → 展示 → USER_GATE 响应 → commit"完整流程，才生成下一个。** 违反字面 = 违反精神：哪怕"一次性生成 3 个再一起审查"，也算跳过审查窗口。两个制品 commit 时间差过小（如同一秒）= 未等待用户响应 = Iron Law 违规。

每个制品生成后，展示完整内容 + 🔴 USER_GATE 审查窗口：

> 制品 [N/5] \<artifact\> ✓ 完成
> [展示制品完整内容]
> 🔴 USER_GATE: 确认锁定 <artifact>（确认并继续 / 需要调整）

- **选 (a)：** hash 锁定 + commit——原子命令 `alloy _artifact commit` 内部完成 hash 计算 + records 写入（自动刷新 updated_at）+ git add 限路径 + commit：
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
  > - apply 中后期（worktree 已创建 或 SDD/EP 已启动）：只能 /alloy:discard 重开
  > 详见 apply.md 的"需求变更闸门"。
  ```
  > ⛔ [HARD_STOP] plans 锁定后的输出必须含上述需求变更提示，禁省略。违反字面 = 违反精神：哪怕"提示用户已知"，也禁跳过——用户需要明确知道 apply 阶段的变更边界。

  > [HARD_STOP] 此处"直接生成下一个"不等于跳过审查——下一个制品生成后仍必须展示完整内容 + 🔴 USER_GATE 审查窗口，用户选"需要调整"可中断。违反字面 = 违反精神：哪怕"用户上一个选了确认，这个肯定也会确认"，也禁跳过下一个制品的审查窗口（§3 第 174 行 HARD_STOP 仍然生效）。

  生成下一制品前校验上游 hash：`alloy _record check openspec/changes/<name> <upstream>`，失败 → ⛔ PRECONDITION_FAIL（上游被破坏，必须修复后才能继续生成下游）。

- **选 (b)：** 用户提出修改后，**agent 先判断是否触犯规格边界，给出判断 + 理由 + 建议，再由用户决断**：

  > [HARD_STOP] 无论变更大小，禁止用 Edit/Write 直接编辑已生成的制品文件。
  > 违反字面 = 违反精神：哪怕"只加一个字段""只改一行样式描述"，直接编辑都会让制品 hash 与 records 失配。修改只能通过"重新生成"（reset + /opsx:continue）或"回 brainstorming"实现。

  **Step 0 — agent 判断规格边界（agent 自主判断，禁止把分类甩给用户）：**

  > [HARD_STOP] 禁止用 AskUserQuestion 让用户在"需求变更 / 轻量修正"之间选分类。
  > 违反字面 = 违反精神：分类是 agent 的判断职责——agent 给结论，用户只在结论基础上决断去向。

  判断标准：
  - **越界**（触犯规格边界）= 改动 proposal 的 Capabilities / data model 字段 / API 契约 / 核心功能行为
  - **不越界**（规格边界内调整）= 纯展示样式、文案、不改数据契约和功能边界的调整

  例：列表加斑马线 = 不越界（纯展示）；增加截止日期 = 越界（新增 dueDate 字段，影响 data model + API 契约）。

  **Step 1 — 🔴 USER_GATE（AskUserQuestion）：用户基于 agent 判断决断**

  **情况一：agent 判断不越界**
  > 我判断这是规格边界内的调整：\<变更描述\>（理由：\<不触犯 data model / API / 功能边界\>）。建议重新生成 \<artifact\> 制品，下游已锁定制品不变。
  > (a) 确认——重新生成当前制品
  > (b) 我认为这其实越界了——转越界流程（回 brainstorming）
  > (c) 取消调整，继续当前审查

  选 (a)：`alloy _artifact reset openspec/changes/<name> <artifact>` → `/opsx:continue` 重新生成 → **diff 审查窗口（见下方"重新生成 diff USER_GATE"）** → 重新审查。下游已锁定制品保持不变。
  选 (b)：转入下方"越界变更检查点流程"。
  选 (c)：回到审查窗口，重新展示制品内容。

  **情况二：agent 判断越界**
  > 我判断这触犯规格边界：\<变更描述\>（理由：\<新增字段 / 改 API / 改功能行为，影响上游 proposal/design\>）。当前制品链不含此变更，建议回 brainstorming 重新沟通以保证所有制品一致。
  > (a) 继续变更——回 brainstorming 重新沟通（自动保存当前进度为检查点）
  > (b) 放弃变更——保持当前制品，继续当前 plan

  选 (a)：进入下方"越界变更检查点流程"。
  选 (b)：保持当前制品不动，继续当前 plan（用户放弃了此次变更）。

  ---

  **越界变更检查点流程**（情况二选 (a)，或情况一选 (b) 后进入）：

    **[HARD_STOP] 禁止 agent 自行 `git stash` / `git reset` / 手动 `git tag` 处理未提交变更。**
    **违反字面 = 违反精神：git stash 绕过 CLI 校验 + 用户无法追踪 stash 去向，git reset 违反 §3.5.1。**
    **检查点（checkpoint）是 git tag 指向 HEAD commit，未提交变更不在 tag 保护范围内。**

    **核心机制：用 git checkout 回退到 brainstorming 检查点，替代原地清理。**
    回退 = `git checkout -B feature/<name> <tag>`，HEAD 回到检查点 commit，.alloy.yaml/records/phase_timings/skill_usage 随 tag 状态恢复，plan 阶段的 commit/records/phase_timings 自然消失（不在 HEAD 链）。无需原地清理。

    **执行流程：**

    1. **废弃未 commit 信息**（不问用户——未 commit = 未采纳 = 废弃）：
       ```bash
       # 检测未提交变更
       DIRTY=$(git status --porcelain 2>/dev/null)
       if [ -n "$DIRTY" ]; then
         echo "已丢弃未提交的变更（未锁定 = 未采纳，回退后无需保留）："
         echo "$DIRTY"
         git restore .
       fi
       ```
       > 显式告知用户丢弃了什么文件，但不给选择机会——流程上未锁定的制品就是中间态，不该保留。
       >
       > **[§3.5.1 例外说明]** 此处 `git restore .` 是合法例外——用户已在 Step 1 USER_GATE 确认越界回退，未 commit 的中间态明确放弃。与 line 166 禁令的"agent 自动清场失败状态"语义不同：禁令针对 agent 自作主张清场，此处是流程内已授权的丢弃。

    2. **回退前创建 plan 检查点**（保护当前 plan 进度，用户反悔可切回；除非无新 commit 可存档）：
       ```bash
       # 仅当当前 HEAD 不在最新 brainstorming 检查点时才创建（有新 commit 才需保护）
       alloy _checkpoint create openspec/changes/<name> --kind progress --reason "回退前进度快照（放弃变更回退点）"
       ```

    3. **列出所有 brainstorming 检查点，让用户选回到哪个：**
       ```bash
       alloy _checkpoint list openspec/changes/<name>
       ```
       筛选 `alloy-checkpoint-<name>-brainstorming-*` 的 tag，展示给用户。

    4. **🔴 USER_GATE（AskUserQuestion）：用户选回到哪个 brainstorming 检查点**
       > 检测到越界变更，选择回到哪个 brainstorming 检查点重新沟通：
       > (a) brainstorming-<N>（最新）—— 基于最新 draft 继续沟通
       > (b) brainstorming-<N-1> —— 回到上一版 draft（丢弃最新 draft）
       > ...
       > (z) 放弃变更——保持当前，继续 plan

       > 选项是 tag 名 + 注释摘要（制品/commit数/时间），禁让用户输命令。
       > 用户可选"从头开始"(brainstorming-1) 或"基于累加版本"(brainstorming-N) 继续沟通。

    5. **用户选定后执行回退**：
       ```bash
       alloy _checkpoint switch openspec/changes/<name> <用户选择的tag>
       ```
       > `_checkpoint switch` 内部：git checkout -B feature/<name> <tag>。
       > **[HARD_STOP §3.5.1 例外]** _checkpoint switch 是 git reset 的合法形式：当且仅当用户
       > 在上方 USER_GATE 已确认后才允许，由 CLI 内置 phase 校验保护。
       > 切换后 phase/records/phase_timings 自动回到 tag 状态（plan 阶段的全部消失）。

    6. **回退后以文件为准重新走 start 流程**（适用整个开区间：brainstorming-1 创建 → apply worktree/代码生成前）：

       > ⚠️ **上下文已过时，以文件为准。** git checkout 回退了代码和 .alloy.yaml，但你的会话上下文还停留在回退前的阶段（plan 或 apply）。**禁凭上下文记忆行动**——必须重新读 .alloy.yaml 确认当前状态，按文件状态决定下一步。

       ```bash
       # 强制读状态，以文件为准（上下文可能过时）
       alloy _state read openspec/changes/<name> phase
       alloy _state read openspec/changes/<name> records
       ```

       **按读取的 phase + records 决定下一步**：
       - phase=started + records 无 draft → 回到 brainstorming 前，需重新 brainstorming + 生成 draft
       - phase=started + records 有 draft（本次回退目标）→ draft 已锁定，**停在 start 阶段等待用户指示进 plan**（NO AUTO ADVANCE）
       - 其他状态 → 异常，退出 skill 让用户排查

       **本次回退是"发起变更"——重走 start.md 步骤 9-11**（用户因越界变更回来重新沟通需求）：
       - **步骤9**：`_skill log openspec/changes/<name> start superpowers:brainstorming`（called_at 更新，count++）+ 加载 brainstorming 技能重新沟通需求
       - **步骤10**：`alloy _artifact reset openspec/changes/<name> draft`（清掉旧 draft）→ brainstorming 产出新 draft（**禁用 `/opsx:continue`**——draft 属于 start 阶段）→ 审查窗口 → `alloy _artifact commit draft`
       - **步骤11**：打新 brainstorming-(N+1) 检查点（必须在 `_phase complete start` 之前，让 tag 指向 draft commit）→ `alloy _phase complete start`（start 重新完成，completed_at 更新为新时刻）
         ```bash
         alloy _checkpoint create openspec/changes/<name> --kind brainstorming --reason "发起变更后重新生成 draft"
         alloy _phase complete openspec/changes/<name> start
         ```
         > 顺序约束：`_artifact commit draft` → `_checkpoint create` → `_phase complete start`，与 start.md 步骤 11 一致。
         > tag 必须在 `_phase complete` 之前打，否则 tag 会指向阶段完成 commit 而非 draft commit。
         > start.completed_at 由 `_phase complete start` 自然写入，无需补写。

    7. **输出感知信息（自然语言，禁让用户输命令）：**
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
       > (a) 保存当前为 progress 检查点 + 跳到所选 progress-<ts>
       > (b) 放弃当前 + 跳到所选 progress-<ts>
       > (c) 取消——保持当前，不切换

    选 (a)：先 `alloy _checkpoint create --kind progress --reason "放弃变更前保存当前"` → 再 `alloy _checkpoint switch <tag>`。
    选 (b)：先废弃未 commit 信息（git restore）→ 直接 `alloy _checkpoint switch <tag>`。
    选 (c)：不切换，继续当前。

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
    5. 用户选定后 → 执行"越界变更检查点流程"的步骤 2 + 步骤 5-7（跳过步骤 1 的 git restore——路径1 不在越界检测场景，未 commit 信息按情况处理；跳过步骤 3-4 的 USER_GATE——路径1 步骤 4 已完成检查点选择）：
       - **步骤2**：回退前打 progress-<ts>（保护当前 plan 进度，供放弃变更时切回）
       - **步骤5**：`_checkpoint switch` 到所选 brainstorming-N
       - **步骤6-7**：重走 start 9-11 + 输出感知信息

  **无论哪条路径，都不直接编辑已生成的制品文件**（违反字面 = 违反精神：制品禁直接编辑）。

**重新生成 diff USER_GATE（HARD_STOP，task L3）：** 不越界路径（情况一选 (a)）reset + 重新生成后、重新审查前，必须采集 diff 并让用户物理确认——agent 不得基于 `/opsx:continue` 返回成功直接进入审查窗口。

```bash
# 重新生成后，先 diff 再审查
DIFF_OLD=$(git show HEAD:"openspec/changes/<name>/<artifact>.md" 2>/dev/null)
DIFF_NEW=$(cat "openspec/changes/<name>/<artifact>.md" 2>/dev/null)
```

🔴 USER_GATE（必须 AskUserQuestion）：

> 重新生成 diff：
> ```
> [git diff HEAD -- openspec/changes/<name>/<artifact>.md | head -100]
> ```
> 确认变更仍在规格边界内（不改 data model / API / 功能边界）：
> (a) 确认——边界内调整，继续锁 hash
> (b) 发现越界变更——放弃重新生成，转越界流程（回 brainstorming）
> (c) 放弃调整——回退到 reset 前状态（`git checkout HEAD -- openspec/changes/<name>/<artifact>.md`）

**[HARD_STOP]** agent 不得基于 "diff 看起来没改功能" 自动选 (a)——必须用户物理选择（interaction-style.md "沉默 ≠ 授权"）。diff 必须截前 100 行防爆量，但禁 agent 基于 "diff 短" 跳过调用。（违反字面 = 违反精神：制品禁直接编辑）。

**审查窗口只展示制品内容，不打印 schema instructions 模板。**

### tasks 审批后 → writing-plans

tasks 审批通过并 commit 后，加载 `superpowers:writing-plans` 生成 plans.md：

- 传入 tasks + specs + design 作为上下文
- **遵循 writing-plans 完整原始流程**——从任务拆解到执行交接
- 保存路径：`openspec/changes/<name>/plans.md`（非默认的 `docs/superpowers/plans/`）
- writing-plans 自行决定执行策略，写入 frontmatter（`strategy` + `reason`）

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

**hash 链尾扫（⛔ HARD_STOP，task L2）：** 在 phase 推进前对全部 6 个制品（draft + proposal + design + specs + tasks + plans）逐条执行 `alloy _record check`——这是 phase 锁定前最后一次完整性校验，任何 hash 不匹配都必须暴露给用户。

```bash
ALL_PASS=true
for ARTIFACT in draft proposal design specs tasks plans; do
  if [ ! -f "openspec/changes/<name>/${ARTIFACT}.md" ]; then
    echo "  ✗ $ARTIFACT: 文件缺失"
    ALL_PASS=false
  elif alloy _record check "openspec/changes/<name>" "$ARTIFACT" 2>/dev/null; then
    echo "  ✓ $ARTIFACT: hash 一致"
  else
    echo "  ✗ $ARTIFACT: hash 不匹配"
    ALL_PASS=false
  fi
done

echo "---"
if [ "$ALL_PASS" = "true" ]; then
  echo "✓ 全部 6 个制品 hash 链完整"
else
  echo "⛔ HARD_STOP: hash 链断裂，禁止推进 phase"
  echo "  制品文件被编辑后 hash 重算可能在单制品审查中漏过，"
  echo "  尾扫是最后一道防线——必须逐条检查全部制品。"
  echo ""
  echo "  禁止：agent 自动补 _record write 修复 hash——"
  echo "  必须 🔴 USER_GATE 让用户选择处理路径。"
  exit 1
fi
```

`$ALL_PASS` = false → ⛔ HARD_STOP，🔴 USER_GATE：
- (a) 回溯到对应制品重新审查（显示哪个制品 hash 不匹配，让用户决定回退到哪个制品重新生成）
- (b) 显示 git log 让用户排查（`git log --oneline openspec/changes/<name>/`）
- (c) 中止 plan 阶段退出 skill

**[HARD_STOP]** agent 不得基于 "_guard 也会校验" 跳过尾扫——_guard 校验与尾扫是独立防线，尾扫逐条命名文件确保"全量 6/6"，_guard 内部实现可能只校验 records 中存在的条目（文件存但 records 不存的 tainted artifact 会漏掉）。

**记录完成时间并推进 phase**——原子命令 `alloy _phase complete` 内部完成 completed_at 写入（自动刷新 updated_at）+ phase 推进 + git add 限路径 + commit。hash 尾扫通过后调用：
```bash
alloy _phase complete openspec/changes/<name> plan
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

```
制品文件禁止手动修改。如需变更，回到 brainstorming 在当前 change 内重新讨论。
准备好后，运行 /alloy:apply 进入执行阶段。
```

> **提示：apply 阶段早期的需求变更处理**
> apply 阶段早期（worktree 未创建 + SDD/EP 未启动）仍可回退到 brainstorming 处理需求变更，走检查点回退流程。
> 一旦 worktree 创建或 SDD/EP 启动，只能 `/alloy:discard` 重开。
> 详见 apply.md 的"需求变更闸门"。

