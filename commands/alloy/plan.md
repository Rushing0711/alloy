---
name: "Alloy: Plan"
description: Alloy 规划阶段 - draft.md 完成后进入
category: Workflow
tags: [alloy, workflow]
spec: 01-product-spec/02-plan-spec.md
behaviors:
  preconditions: 7
  hard_stops:    11
  user_gates:    7
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

  **commit 后必须等待用户明确指示才生成下一个制品**——不可自动调用 `/opsx:continue` 生成下游。用户响应"继续"/"下一个"等明确指令后，才进入下一制品流程。

  生成下一制品前校验上游 hash：`alloy _record check openspec/changes/<name> <upstream>`，失败 → ⛔ PRECONDITION_FAIL（上游被破坏，必须修复后才能继续生成下游）。

- **选 (b)：** 用户提出修改后，**先分类再行动**：

  > [HARD_STOP] 分类不清前禁执行 `alloy _artifact reset`。
  > 违反字面 = 违反精神：哪怕"看起来像措辞修正"，分类不清就是分类不清——必须 USER_GATE 让用户明确。

  - **需求变更**（功能增删、行为变更、用户主动提出"加入/删除/修改"功能）→ 走检查点流程（两步 USER_GATE）：

    **[HARD_STOP] 流程顺序：前置检查（working tree clean）→ Step 1（是否创建检查点）→ Step 2（选去向）。**
    **违反字面 = 违反精神：agent 不允许先列检查点或先切换——必须先问用户是否保存当前进度。**
    **哪怕"用户已经说要回到某个检查点"，也必须先完成 Step 1 确认是否保存当前进度。**
    **用户说"回到某检查点"不等于"放弃当前进度"——当前进度可能需要保存为新检查点。**

    **[HARD_STOP] 禁止 agent 自行 `git stash` / `git reset` / 手动 `git tag` 处理未提交变更。**
    **违反字面 = 违反精神：git stash 绕过 CLI 校验 + 用户无法追踪 stash 去向，git reset 违反 §3.5.1。**
    **检查点（checkpoint）是 git tag 指向 HEAD commit，未提交变更不在 tag 保护范围内。**
    **`alloy _checkpoint create` CLI 已内置 working tree clean 校验，dirty 时拒绝创建。**

    **前置检查——working tree 是否 clean（避免未提交变更在切换检查点时丢失）：**
    ```bash
    DIRTY=$(git status --porcelain 2>/dev/null)
    if [ -n "$DIRTY" ]; then
      echo "⚠️ 检测到未提交变更——检查点是 git tag 指向 HEAD commit，未提交变更不会被 tag 保护。"
    fi
    ```

    🔴 USER_GATE（AskUserQuestion）：检测到未提交变更，如何处理？
    > 当前 working tree 有未提交变更，请选择：
    > (a) commit 后继续——`git add <精确路径> && git commit` 锁定当前状态
    > (b) 不 commit 直接创建检查点（⚠️ 风险：切换到其他检查点时，未提交变更可能丢失或残留）
    > (c) 取消需求变更
    >
    > ⛔ [HARD_STOP] 禁止 agent 自动 `git stash` 兜底——stash 内容对用户不可见、
    > 无法关联到检查点、后续可能被误 pop 到错误分支。选 (a) 或 (b) 由用户明确决定。

    选 (a) 提交后自动进入 Step 1。选 (b) 直接进入 Step 1（风险自担）。

    **Step 1 — 🔴 USER_GATE（AskUserQuestion）：是否创建检查点当前进度？**

    > 检测到需求变更，决定是否保存当前 plan 进度。
    > (a) 创建检查点——打 tag 保护当前 commit，将来可切回
    > (b) 不创建检查点——当前 commit 链不再有 tag 保护，切走后将被 git gc 遗忘
    >
    > 注意：选"暂存"后，无论后续选 (a) 重新沟通还是 (c) 回到某 tag，
    > 当前进度都会被 alloy-checkpoint-<name>-<ts> tag 保存，可随时通过 alloy _checkpoint list 查看。

    选 (a) 创建检查点：
    ```bash
    alloy _checkpoint create openspec/changes/<name>
    ```
    > 该命令读取当前 records/phase/时间，在 HEAD 打带注释 tag。注释格式：锁定制品列表 + phase + 时间。

    选 (b) 不创建检查点：跳过 checkpoint create，直接进入 Step 2。

    **Step 2 — 🔴 USER_GATE（AskUserQuestion）：选择去向**

    先列出可恢复的 checkpoint tag（如果有）：
    ```bash
    alloy _checkpoint list openspec/changes/<name>
    ```

    > AskUserQuestion: 选择去向
    > (a) 回到某个检查点——从上方列表选择 tag，切换分支到该 tag
    > (b) 重新沟通——清理 plan 制品，回到 brainstorming（draft 保留）
    > (c) 取消调整，继续当前审查
    >
    > 若 `alloy _checkpoint list` 显示"（无 checkpoint tag）"，(a) 选项不可用。

    选 (a) 回到某 tag：
    ```bash
    alloy _checkpoint switch openspec/changes/<name> <用户选择的tag>
    ```
    > 该命令内部：git checkout -B feature/<name> <tag>。
    > **[HARD_STOP §3.5.1 例外]** _checkpoint switch 是 git reset 的合法形式：当且仅当用户
    > 在 Step 1 已确认创建检查点（或主动选不创建放弃当前进度）后才允许，由 CLI 内置 phase 校验保护。
    > 切换后 phase/records/phase_timings 自动回到 tag 状态。
    >
    > **切换后必须读取 records 状态，从第一个缺失制品开始 plan：**
    > CLI 会输出"已锁定制品"和"缺失制品"列表。agent 必须根据缺失列表从第一个缺失制品开始生成，
    > **禁止跳过**——哪怕"用户之前已经确认过某制品"，切回旧检查点后该制品可能未锁定，必须重新生成+审查。
    > 违反字面 = 违反精神：哪怕"design 看起来已经生成过"，records 没有记录 = 没有审查 = 必须重新走。

    选 (b) 重新沟通：执行全新变更回溯（详见 `commands/alloy/references/plan-rollback.md` 场景 A），然后加载 `superpowers:brainstorming` 重新讨论。**此类场景禁止使用 `alloy _artifact reset`。**

    选 (c)：回到审查窗口，重新展示制品内容。

  - **轻量修正**（措辞/格式，不改变功能边界）→ 🔴 USER_GATE：确认走轻量修正路径（仅限用户明确说"措辞/格式调整"）。确认后：`alloy _artifact reset openspec/changes/<name> <artifact>` → `/opsx:continue` 重新生成 → **diff 审查窗口（见下方"轻量修正 diff USER_GATE"）** → 重新审查。下游已锁定制品保持不变。

  **判断规则：** 用户主动提出"加入/删除/修改功能"= 需求变更，直接回溯，不问路径。只有用户明确说"措辞/格式调整"才走轻量修正（且需 🔴 USER_GATE 确认）。不确定时默认需求变更。

  **无论哪条路径，都不直接编辑已生成的制品文件**（违反字面 = 违反精神：制品禁直接编辑）。

**轻量修正 diff USER_GATE（HARD_STOP，task L3）：** reset + 重新生成后、重新审查前，必须采集 diff 并让用户物理确认——agent 不得基于 `/opsx:continue` 返回成功直接进入审查窗口。

```bash
# 重新生成后，先 diff 再审查
DIFF_OLD=$(git show HEAD:"openspec/changes/<name>/<artifact>.md" 2>/dev/null)
DIFF_NEW=$(cat "openspec/changes/<name>/<artifact>.md" 2>/dev/null)
```

🔴 USER_GATE（必须 AskUserQuestion）：

> 轻量修正 diff：
> ```
> [git diff HEAD -- openspec/changes/<name>/<artifact>.md | head -100]
> ```
> 确认变更仅涉及措辞/格式（不改变功能边界）：
> (a) 确认——仅措辞/格式，继续锁 hash
> (b) 发现功能变更——放弃轻量修正，回到需求变更路径重新分类
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

