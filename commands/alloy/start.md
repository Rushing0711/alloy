---
name: "Alloy: Start"
description: 新功能构思或接续已有工作时调用
category: Workflow
tags: [alloy, workflow]
spec: 01-product-spec/01-start-spec.md
behaviors:
  preconditions: 8
  hard_stops:    13
  user_gates:    9
  warns:         2
  artifacts: [draft]
  transitions_to: started
  external_calls: [opsx:explore, opsx:new, superpowers:brainstorming]
---

# alloy-start

你是 Alloy 工作流的智能入口。检测状态、路由到正确流程、调度外部技能完成探查和需求设计，产出 draft.md。

**核心原则：把实际工作委托给专门的技能，不要自己做。Alloy 是编排器，不是执行者。** draft.md 以 hash-lock + commit 入 records，禁直接编辑。

```
[HARD_STOP] ACTIVE CHANGE → ROUTE FIRST + NO WORK ON MAIN + NO SKIP BRANCH + NO AUTO ADVANCE
检测到活跃 change 时，必须先经 USER_GATE 确认去向（接续/开新/中止），
才能加载任何技能（包括 explore/brainstorming/opsx:new）。
每个 change 必须在独立 feature 分支上。开新 change 时，stash 和分支创建是不可逾越的红线。
start 完成后绝不自动进 plan。沉默 ≠ 授权。

违反字面 = 违反精神：哪怕"用户说了新需求"、"用户明确知道要做什么"、
"已经在分支上了"、"分支后面再建"，也禁跳过路由决策直接进入 brainstorm。
路由决策是技能加载的前置闸门——先确认去向，再加载对应技能。
```

> **`<TIMESTAMP>`：** 每次渲染阶段头部时执行 `date "+%Y-%m-%d %H:%M:%S"` 获取本地时间。`<START_TIME>` 是"全新开始"路径中捕获的时间——agent 捕获后复用于 header 和 phase_timings。`<created_at>` 从 `.alloy.yaml` 读取。

**交互规则：** `🔴 STOP` 等价 `USER_GATE`，必须用 `AskUserQuestion`（`commands/alloy/references/interaction-style.md`，含"沉默 ≠ 授权"通用禁令）。跳过任何 USER_GATE / 批量打包 / 基于内容跳过 = 违反 Iron Law。

**状态符号：** `⛔` = HARD_STOP / PRECONDITION_FAIL，`🔴` = USER_GATE，`⚠️` = WARN（视觉规范 §七）。

**输出规则：** 阶段入口/出口必须按 `docs/specification/02-visual-spec.md` 输出 Phase 框（`┌─┐` Unicode 单线框，38 字符宽）、Step 标题（`[Step N/M]` + 38 字符 `─` 下划线）、`>` 块引用、`→` 引导行。**skill md 中的 Phase 框代码块是必须输出到终端的格式，不是文档示例。** 制品汇总表同理。

---

### Red Flags（第三层防御——任一借口出现即 STOP）

主文件保留 5 条核心借口，完整 12 条见 `commands/alloy/references/start-rationalizations.md`。

| 借口 | 现实 |
|------|------|
| "不用建分支了，就在 main 上干吧" | ⛔ HARD_STOP：主分支污染不可逆。建分支只需 2 秒。违反字面 = 违反精神：哪怕"只是先建个目录后面再切"也算（Iron Law 第一层）。 |
| "用户说了新需求，直接 brainstorm" / "需求很明确了，不用先路由" | ⛔ HARD_STOP：有活跃 change 时，**必须先 USER_GATE 确认去向，才能加载任何技能**。哪怕用户明确描述了新需求，也要先路由。路由决策是技能加载的前置闸门。 |
| "先跳过分支创建，把 proposal 写了，后面再建" / "分支不建也能生成制品，后面补" | ⛔ HARD_STOP：跳过分支创建=制品落在错误分支。**stash + 开新分支完成后才能进行后续步骤。** 违反字面 = 违反精神：哪怕"proposal 内容已确定，先写了再建分支"也算——制品必须一诞生就在正确分支上。 |
| "不用 brainstorming，直接写代码" | brainstorming 不可跳过。跳过需求设计 = 规格和代码分叉的起点。 |
| "start 完成了，直接进 plan" / "用户没回复，我先继续" | ⛔ HARD_STOP：start 完成后绝不自动进入 plan。沉默 ≠ 授权（Iron Law 第二层）。替用户做阶段转换 = 剥夺审查机会。 |
| "openspec/changes/<name>/ 已经有了，直接复用" | ⛔ PRECONDITION_FAIL：目录已存在 = #12 冲突。USER_GATE 让用户决策（改名 / 接续 / 中止），禁 agent 自动复用——可能覆盖用户既有工作。 |
| "git init 后 reset --hard 一下，把环境清干净" | ⛔ HARD_STOP：git 操作失败禁 reset --hard / clean -fd / checkout .（§3.5.1 git 自救禁令）。退出 skill 让用户处理。 |

---

## 状态检测（前置门）

**第零步**（⛔ PRECONDITION_FAIL）：环境完整性检测——4 项基础设施任一缺失即引导 `alloy init` 退出，agent 不得自动初始化。

```bash
alloy _env check
```

> `alloy _env check` 原子完成 4 项检测（git 仓库 / openspec/config.yaml 含 schema: alloy / openspec/schemas/alloy/schema.yaml / Alloy commands start.md）。任一缺失 exit(1) 并输出缺失项列表。agent 命名规则（冒号版 `alloy/start.md` vs 横线版 `alloy-start.md`，8 种 agent 目录）的真相源在 `src/core/agents.ts` 的 `KNOWN_AGENTS`，CLI 复用——避免 md 硬编码 agent 列表与 TS 漂移。

> 接续路径例外：扫描 `openspec/changes/*/.alloy.yaml` 发现有活跃 change 时，意味着 init 跑过，仅做轻量校验（检查项 2 `openspec/config.yaml` 存在），避免对已有 change 的接续路径过度阻塞。

**第一步**（⛔ PRECONDITION_FAIL）：检查 `openspec/config.yaml` 是否存在——不存在则提示用户 `alloy init`，agent 不得自动初始化（init 会写 `.claude/` / 模板等关键文件，必须由用户主动触发）。

**第二步（⛔ HARD_STOP — 路由决策前置闸门）：** 扫描 `openspec/changes/*/.alloy.yaml`，统计 phase != `finished` 的 change。**有活跃 change 时，必须先完成路由决策才能加载任何技能（包括 explore/brainstorming/opsx:new）。**
- 0 个活跃 change → 进入统一流程（explore 探测 + 确认主题 + new change）
- 有活跃 change → 🔴 USER_GATE 让用户选：
  - (a) 接续某个活跃 change（列出可选）
  - (b) 开新 change（有 topic 用该 topic，无 topic 进统一流程 explore 探测定主题）
  - (c) 中止

> ⛔ [HARD_STOP] **活跃 change 的路由决策是技能加载的前置闸门。** 无论 topic 多明确、需求多清晰，都必须先经此 USER_GATE 确认去向，然后才能加载对应技能。
> 违反字面 = 违反精神：哪怕"用户已经说了要做什么"、"需求在 /alloy:start 时就带了"、"先 brainstorm 再路由也一样"，也算违反 Iron Law。路由在前，技能在后——顺序不可颠倒。

**开新 change 前 dirty 处理**：用户选 (b) 开新 change 后，agent 检测当前 working tree：
```bash
DIRTY=$(git status --porcelain 2>/dev/null)
```
dirty 时 → 🔴 USER_GATE：检测到未提交变更，如何处理？

**AskUserQuestion 模板（options 必须用 description 字段承载以下解释，不能只写 label）：**
- option label: "stash 暂存"
- option description: "git stash push -u -m \"alloy: <新 change 名> 开新 change 前暂存\"。为什么不 worktree？多 worktree 管理复杂，当前可能已在某个 worktree 中，再开容易混乱。为什么不 commit？未锁定的制品 commit 后引入制品锁定问题。→ stash 最干净：保护未提交改动不丢失，且不影响 alloy 流程状态。⚠️ alloy 流程不负责 stash 恢复——stash 无分支归属，恢复需人工 `git stash apply` 确认后再手动 `git stash drop` 清理。进度保护靠检查点，不靠 stash。"
- option label: "放弃未提交变更"
- option description: "git restore . 清除所有未提交变更，干净开新。⚠️ 此操作不可逆——用户在此 USER_GATE 主动选择放弃，与 §3.5.1 禁令的'agent 自动清场失败状态'语义不同（禁令针对 agent 自作主张，此处是用户授权放弃）。放弃后无法找回。"
- option label: "取消"
- option description: "取消开新 change"

**第三步**（⛔ PRECONDITION_FAIL）：「统一流程」路径强制 Skill 预检——cmd: opsx/explore opsx/new, skill: brainstorming。读取 `commands/alloy/references/skill-precheck.md` 检测，任一不可用 → 引导 `alloy init`，不存在降级。

**第四步**（⛔ PRECONDITION_FAIL）：「统一流程」路径校验 git 仓库就绪——`git rev-parse --git-dir` 失败时不再兜底 `git init`（git init 已由 `alloy init` 保证），直接引导 `alloy init`。

---

## 统一流程（无活跃 change，或用户选"开新 change"）

**触发条件：**
- 无活跃 change（无论有无 topic）
- 有活跃 change 但用户在 USER_GATE 选了"开新 change"

**捕获阶段启动时间：**
```bash
date "+%Y-%m-%d %H:%M:%S"
```
> 不要混用 bash 变量——bash 状态在两次工具调用间不持久。直接捕获 date 输出文本。

**进入阶段时，必须输出以下 Phase 框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
│ 启动时间: <START_TIME>
└──────────────────────────────────────┘
```

> **前置门：** Skill 预检 + git 仓库就绪已在「状态检测」第三/四步完成（⛔ PRECONDITION_FAIL）。本路径假设两者已通过。

### [Step 1] explore 探测 + 确定主题

**捕获 opsx:explore 开始时间（供步骤 8 补录技能使用）：**
```bash
EXPLORE_START=$(date "+%Y-%m-%d %H:%M:%S")
```
> bash 变量在工具调用间不持久——将 EXPLORE_START 输出值记在上下文中，步骤 8 补录时作为 `--at` 参数传入。

加载 `opsx:explore` 技能，按其指引探索项目上下文：

- **有 topic（用户 `/alloy:start <topic>` 带主题来）：** 围绕 topic + 当前项目情况探测，验证 topic 可行性、补充上下文
- **无 topic（用户 `/alloy:start` 未带主题）：** 与用户沟通探测——扫描项目（README、代码、requirement.md 等），基于探查给 2-3 个建议方向，或问用户想做什么

**交互风格：** 使用 `AskUserQuestion` 工具。详见 `commands/alloy/references/interaction-style.md`。

**额外上下文：** 扫描 `openspec/changes/archive/` 下最近 3 个 `retrospective.md`，提取 §5 意外发现、§6 值得推广、§4 技能跳过模式，作为后续 brainstorming 参考。

> explore 的产出是"主题名 + 探查发现"，不深入需求设计。深入需求在步骤 9 的 brainstorming（change 目录已存在后）进行。

**主题确认 USER_GATE（🔴 AskUserQuestion）：** explore 探测后，向用户确认主题：
- 有 topic → 确认该 topic 或调整
- 无 topic → 给 2-3 个建议方向让用户选，或用户自定义

> 主题确认后**直接进入步骤 1（change name 确认）**，不要求用户重新输入 `/alloy:start <topic>`——主题已在流程内确认。

---

用户确认主题后，执行以下步骤创建 change：

> **git 自救禁令（§3.5.1 内嵌约束，HARD_STOP）：** 步骤 3 分支创建/切换 / 步骤 11 commit 任何环节失败，禁 agent 运行 `git reset --hard` / `git checkout .` / `git restore .` / `git stash` / `git clean -fd` / `git push --force` —— 退出 skill 让用户处理是唯一合法路径。
>
> **git add 限路径（§5.2.1 内嵌约束，HARD_STOP）：** 所有 commit 用精确路径（`.claude/` `openspec/` `CLAUDE.md` 等明确列举），禁 `-A`/`-a`/`.`。违反字面 = 违反精神：哪怕"反正只改了已知文件"，也禁通配——可能把 `.superpowers/` 临时目录或测试残留一并 commit。

1. **建议 change name**——kebab-case，🔴 USER_GATE: 确认 change name（建议名 / 自定义）。

   > [HARD_STOP] **未确认时禁止继续步骤 2-9。**
   > 违反字面 = 违反精神：哪怕"name 大概就这个先建分支"，也算违反——name 是 directory + branch + records 主键。

2. **git 仓库前置已由 `alloy init` 保证**——状态检测第零步已校验 `git rev-parse --git-dir` 通过。本步骤无操作，进入步骤 3 分支选择。

3. **分支选择**——创建 change 目录之前完成，确保所有制品落在 feature 分支上：

   **① 主分支读取：** 主分支在 `alloy init` 阶段已确认并写入 `openspec/config.yaml`，此处直接读取：
   ```bash
   MAIN_BRANCH=$(alloy _config read . main_branch)
   if [ -z "$MAIN_BRANCH" ] || [ "$MAIN_BRANCH" = "null" ]; then
     echo "⛔ [PRECONDITION_FAIL] openspec/config.yaml 未配置 main_branch"
     echo "  主分支配置已下沉到 alloy init 阶段（项目级配置）。"
     echo "  请先运行 alloy init 完成项目初始化。"
     exit 1
   fi
   ```
   > alloy init 时已 USER_GATE 确认主分支并写入 config；若仓库无 commit 还会创建初始 commit 锁定 main 分支。start 阶段不再重复确认。

   **② 开新 change 时：** 从 main_branch 创建新分支，**不可逾越**（不走步骤 ③ 的 USER_GATE，分支创建后才能继续后续步骤）：
   ```bash
   MAIN_BRANCH=$(alloy _config read . main_branch)
   git checkout -b feature/<change-name> "$MAIN_BRANCH"
   ```
   > 从 main_branch 创建确保新 change 的 commit 链干净。若当前 working tree 有未提交变更，用户已在开新 change 前处理（stash/放弃），此处直接创建。

   ⛔ [HARD_STOP] **stash → 开新分支 → 才能继续后续步骤。这三步不可逾越。**
   无例外：
   - 不要"先写 proposal 再建分支"
   - 不要"先生成制品再补分支"
   - 不要"在当前分支上继续，分支后面再说"
   - 不要"分支已存在就跳过创建直接进入下一步"
   违反字面 = 违反精神：哪怕"反正马上要生成 draft，先写了再切分支"——制品必须一诞生就在正确分支上。跳过分支创建 = 制品路径错位，后续 commit 污染错误分支。

   开新 change 时执行完此步骤后**直接跳过步骤 ③**（分支决策 USER_GATE），进入步骤 3.5 目录冲突预检。步骤 ③ 仅限接续/非开新场景。

   **③ 接续/非开新场景的分支决策**（🔴 USER_GATE，3 种情况共用同款语义节点，**开新 change 时跳过此步**）：
   ```bash
   CURRENT_BRANCH=$(git branch --show-current)
   ```

   - **在主分支上** → ⛔ HARD_STOP："不允许在主分支开发。" → 🔴 USER_GATE: 只展示"新建分支"
   - **在 feature 分支且名称含 change 名** → 🔴 USER_GATE: 继续使用当前分支 / 新建分支
   - **在非主分支的已有分支上** → 🔴 USER_GATE: 切换到已有分支 / 新建分支

   无可用本地非主分支时 → 直接新建。

   新建分支命名：默认 `feature/<change-name>`，用户可自定义。

   **⛔ PRECONDITION_FAIL 白名单校验**（读取 `commands/alloy/references/branch-naming.md`）：自定义分支名必须以 `feature/` `fix/` `docs/` `refactor/` `test/` `chore/` 之一开头，后缀 kebab-case，且不与主分支同名。校验失败 → USER_GATE 让用户重新输入合法名称，**禁 agent 自动改写后继续**。

   通过校验后：`git checkout -b <branch-name>`

   **③ 分支验证（⛔ HARD_STOP）：** 创建/切换后必须验证才能继续：
   ```bash
   CURRENT=$(git branch --show-current)
   echo "当前分支: $CURRENT | 主分支: $MAIN_BRANCH"
   ```
   `$CURRENT` = `$MAIN_BRANCH` → ⛔ HARD_STOP，返回重新选择
   `$CURRENT` ≠ `$MAIN_BRANCH` → 🔴 USER_GATE: 确认分支状态正确

   > [HARD_STOP] **未通过验证或用户未确认时，禁止执行步骤 4-9。**

3.5. **opsx:new 目录冲突预检**（⛔ PRECONDITION_FAIL，task #12）

   ```bash
   if [ -d "openspec/changes/<name>" ]; then
     echo "⛔ PRECONDITION_FAIL: openspec/changes/<name> 已存在"
     echo "  可能原因：name 已被占用 / 旧 change 残留 / 多 session 并发"
     echo "  禁止：agent 自动覆盖（rm -rf）或自动复用——可能丢失用户既有工作"
   fi
   ```

   🔴 USER_GATE: 选择处理路径
   - (a) 改用其他 name → 回步骤 1 重新建议 change name
   - (b) 接续已有 change → 退出 start，引导用户跑 `/alloy:start`（无 topic）触发"接续"路径
   - (c) 中止本次 /alloy:start

   > [HARD_STOP] agent 不得自动选 (a) / (b) / (c)——必须由用户明确决策。
   > 违反字面 = 违反精神：哪怕"目录看起来是空的"或"看起来是上次中断的"，也禁 agent 自动复用。

4. **调用 `/opsx:new <name>`** 创建 change 目录（前置：步骤 3 ③ 验证已通过 + 步骤 3.5 目录冲突已解决）

   **捕获 opsx:new 开始时间（供步骤 8 补录技能使用）：**
   ```bash
   OPSX_NEW_START=$(date "+%Y-%m-%d %H:%M:%S")
   ```

   调用后验证创建结果——**必须检查 `.openspec.yaml`**（这是 `openspec new change` 生成的标志，含 `schema: alloy` + `created: <当天日期>`）：
   ```bash
   if [ ! -f "openspec/changes/<name>/.openspec.yaml" ]; then
     echo "⛔ PRECONDITION_FAIL: /opsx:new 创建失败——.openspec.yaml 缺失"
     echo "  .openspec.yaml 由 openspec new change 生成，是 opsx:new 真正执行的标志。"
     echo "  可能原因："
     echo "    1. agent 跳过 opsx:new，手动建目录（.alloy.yaml 可由 _state init 生成，但 .openspec.yaml 只能由 openspec new change 生成）"
     echo "    2. openspec CLI 未安装或版本不兼容"
     echo "  禁止：alloy 补写 .openspec.yaml（这是 OpenSpec 的事，alloy 不接管）。"
     echo "  必须：退出 skill 让用户排查 opsx:new / openspec CLI。"
     exit 1
   fi
   ```

5. **初始化 state（先于 _phase start 和 _skill log，确保时间字段在最早时刻写入）：**
   ```bash
   alloy _state init openspec/changes/<name> --at "$EXPLORE_START" --feature-branch "feature/<name>"
   ```
   > 顺序硬约束：`_state init` 必须在 `_phase start` / `_skill log` 之前——后两者在 .alloy.yaml 不存在时会隐式创建并用当前时间作为 created_at。`_state init` 先跑则字段写入受控。
   >
   > **`--at "$EXPLORE_START"` 让顶层 `started_at` 回填为全周期开始时间**（`/alloy:start` 敲下时刻，= Step 1 捕获的 EXPLORE_START），与步骤 7 的 `_phase start --at "$EXPLORE_START"` 同源。`created_at` 仍是文件创建时间（opsx:new 后），两者语义不同：created_at 记文件诞生，started_at 记周期起点。
   >
   > **`--feature-branch "feature/<name>"` 一次成型写入 feature_branch**，省去后续 `_state write feature_branch`。前置：步骤 3 已创建并切换到 feature 分支。

6. **基础设施 commit（幂等，已提交则跳过；§5.2.1 git add 限路径）——必须在阶段开始 commit 之前：**
   ```bash
   git add .claude/ .gitignore openspec/config.yaml openspec/schemas/ 2>/dev/null
   [ -f CLAUDE.md ] && git add CLAUDE.md 2>/dev/null
   git diff --cached --quiet || git commit -m "chore: alloy init 项目初始化"
   ```

7. **补录技能使用（explore + new，带 --at 传入实际使用时间——这两个技能在 change 目录创建前/创建时执行，技能 log 只能补录）：**

   > **[HARD_STOP] 两个 `--at` 必须用各自步骤捕获的独立时间戳，禁用同一个值。**
   > 违反字面 = 违反精神：哪怕"时间差不多"、"先记一个后面改"——也禁止复用 `EXPLORE_START` 给 opsx:new。
   > called_at 语义是"技能实际调用时间"，两个技能在不同步骤调用，时间戳必须不同。
   >
   > Step 1（opsx:explore）在 change 目录创建前执行，opsx:new 在步骤 4 创建 change 时执行。此处补录时**必须用各自执行时捕获的开始时间**（`--at`），不可用当前时间。
   >
   > brainstorming 在步骤 9（change 目录已存在后）执行，届时实时 `_skill log`，不用补录。
   >
   > **顺序：_skill log 在 _phase start 之前**——这样"记录 start 阶段开始时间"commit 时 skill_usage 已含 explore+new 记录。called_at 时间戳仍早于 phase start（用捕获的 EXPLORE_START/OPSX_NEW_START），阶段时间链语义正确。

   ```bash
   # EXPLORE_START / OPSX_NEW_START 在 Step 1 / 步骤 4 执行时已捕获
   # ⛔ 禁止两个 --at 用同一个值——各自独立时间戳
   alloy _skill log openspec/changes/<name> start opsx:explore --at "$EXPLORE_START"
   alloy _skill log openspec/changes/<name> start opsx:new --at "$OPSX_NEW_START"
   ```

8. **记录 worktree + 阶段开始 commit（原子命令，在 _skill log 之后——skill_usage 已含 explore+new）：**
   ```bash
   alloy _state write openspec/changes/<name> worktree null
   alloy _phase start openspec/changes/<name> start --at "$EXPLORE_START"
   ```
   > `alloy _phase start` 原子完成：幂等写 `phase_timings.start.started_at` + git add 限路径 + commit。产生独立的"阶段开始"commit（仅 .alloy.yaml，含 started_at + feature_branch + worktree + skill_usage[explore+new]）。
   >
   > **`--at "$EXPLORE_START"` 必传**——Step 1（opsx:explore）在 change 目录创建前执行，`_phase start` 在步骤 8 才能调用（需 change 目录存在）。若用当前时间，started_at 会晚于 explore/new 的技能使用时间，阶段时间链语义错乱。`EXPLORE_START` 是 start 阶段最早的动作，作为 started_at 补录时间最准确。

9. **[Step 2] 需求设计——brainstorming（change 目录已存在，实时记录技能使用）：**

   **捕获 superpowers:brainstorming 开始时间（实时记录，不用补录）：**
   ```bash
   BRAINSTORM_START=$(date "+%Y-%m-%d %H:%M:%S")
   alloy _skill log openspec/changes/<name> start superpowers:brainstorming --at "$BRAINSTORM_START"
   ```

   加载 `superpowers:brainstorming` 技能，传入探查结果和主题：

   ```
   探查结果：<Step 1 关键发现摘要>
   主题：<topic>
   项目类型：<新项目/存量项目>

   **Alloy 流程覆盖：** 本调用在 Alloy start 流程内，brainstorming 完成后产出是 draft.md
   （openspec/changes/<name>/draft.md），不是 docs/superpowers/specs/ 文件。
   请跳过 brainstorming checklist 中的"Write design doc"和"Invoke writing-plans"步骤。

   **交互风格：** 使用 AskUserQuestion 组件，不用纯文本 (a)(b)(c)。
   单选用 radio，多选用 checkbox，代码方案对比用 preview。
   每次提问不超过 4 个问题，相关问题合并到一次调用。
   给出默认推荐——推荐选项在 description 中标注理由。
   ```

   **用户确认方案后，生成 draft.md**（不是 spec 文件）。用户要求调整时回到 brainstorming 继续。

   ```markdown
   # [功能名称]

   ## Why
   <!-- 要解决的问题 -->

   ## What
   <!-- 方案概述 -->

   ## 关键决策
   <!-- brainstorming 中确定的关键技术决策及理由 -->

   ## 范围与边界
   <!-- 做什么、明确不做什么 -->
   ```

   > [HARD_STOP] **用户明确确认方案之前，不要生成 draft.md。**
   > 违反字面 = 违反精神：哪怕"内容已经基本明确再补审查"，也算违反——审查窗口是 USER_GATE，不可后置。

   > **交互风格恢复（HARD_STOP）：** brainstorming 已结束。从此刻起，所有 `🔴 USER_GATE` 必须恢复使用 `AskUserQuestion` 工具（`commands/alloy/references/interaction-style.md`），不用纯文本 (a)(b)(c)。Agent 刚从 brainstorming 的"每次一个问题"模式出来，容易延续纯文本习惯——这是 Iron Law 违规。违反字面 = 违反精神：哪怕"就这一个确认用文本也行"，也算违反——USER_GATE 必须 AskUserQuestion。

10. **生成 `draft.md` 审查窗口——start 阶段唯一的制品闸门：**

    > 制品 draft ✓ 完成
    > [展示 draft.md 完整内容]
    > 🔴 USER_GATE: 确认锁定 draft（确认并继续提交 / 需要调整回 brainstorming）

    选确认 → 步骤 11；选调整 → 回到步骤 9 brainstorming。

11. **提交——仅用户确认锁定后，执行以下步骤（基础设施与阶段开始已在前面独立 commit）：**

    **commit 1/3——draft 制品 hash-lock + records（原子命令，内部完成 hash 计算 + records 写入 + git add 限路径 + commit；不含 phase_timings）：**
    ```bash
    alloy _artifact commit openspec/changes/<name> draft
    ```

    **打 brainstorming-1 检查点（draft 已锁定的锚点，plan 阶段越界变更回退点）——必须在 `_phase complete` 之前，让 tag 指向 draft commit 而非阶段完成 commit：**
    ```bash
    alloy _checkpoint create openspec/changes/<name> --kind brainstorming --reason "draft 已锁定，brainstorming 锚点"
    ```
    > 此检查点作为 plan 阶段越界变更的回退锚点。回退到此 = 回到"draft 已锁定，准备进 plan"的状态，重新 brainstorming + 重新生成 draft。
    > 每次回退后重新生成 draft 会打 brainstorming-2/3/...，保留需求累加历史。
    > **顺序约束:必须在 `_artifact commit draft` 之后、`_phase complete start` 之前。** 若放在 `_phase complete` 之后，tag 会指向阶段完成 commit（含 phase_timings 变更），回退后 phase_timings 状态错乱。

    **commit 2/3——start 阶段完成（原子命令，内部完成 completed_at 写入 + git add 限路径 + commit；start 不推进 phase，保持 started）：**
    ```bash
    alloy _phase complete openspec/changes/<name> start
    ```

---

### 完成

**阶段完成时，必须输出以下 Phase 完成框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start — DONE    │
│ 启动时间: phase_timings.start.started_at
│ 完成时间: phase_timings.start.completed_at
│ 耗时: completed_at - started_at
└──────────────────────────────────────┘

→ Change: <name>  Phase: started
→ 制品: draft ✓
```

> [HARD_STOP] **start 阶段到此结束。**
> 不要自动运行 `/alloy:plan`，不要生成 plan 阶段制品，不要调用 `opsx:continue` 或 `writing-plans`。
> 违反字面 = 违反精神：哪怕"用户上次也是接 plan 这次猜跳过 USER_GATE"或"draft 已锁定流程很顺"，也算违反 Iron Law（NO AUTO ADVANCE）。
> **你的唯一操作：展示完成信息，等待用户输入下一个命令。**

> **§5.2.3 路径 B 边界说明：** start 是 phase 推进起点（无前序 phase），phase=started 写入失败时降级路径只有"重跑 /alloy:start"——不存在 phase 回退场景。本阶段无 §5.2.3 适用空间。

---

## 接续（用户选"接续某个活跃 change"）

```
[HARD_STOP] 接续路径只读 state，禁重置 feature_branch / worktree / phase 等字段
违反字面 = 违反精神：哪怕"字段看起来不对"也禁 agent 用 _state write 重置——字段异常 → PRECONDITION_FAIL 退出
```

**进入阶段时，必须输出以下 Phase 框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
│ 启动时间: phase_timings.start.started_at 或 created_at
└──────────────────────────────────────┘

→ 检测到活跃 change：<name>（phase: <phase>）
→ 已完成制品：<列出>
→ 下一步：<建议操作>
```

读取 `.alloy.yaml` + 文件系统确认制品状态，按 phase 路由：

| phase | 制品状态 | 路由 |
|-------|---------|------|
| started | proposal.md 存在 | 🔴 USER_GATE: 选择继续规划（alloy-plan） / 回需求讨论（重新 start） |
| started | draft.md 存在且 hash 有效 | 🔴 USER_GATE: 选择进 plan / 回 brainstorming |
| started | draft.md 缺失或 hash 不匹配 | 重新 brainstorming |
| planned | — | 🔴 USER_GATE: 确认进入 apply 阶段（继续 / 查看状态 / 放弃 change） |
| applied | — | 🔴 USER_GATE: 确认进入 archive 阶段（继续 / 查看状态 / 放弃 change） |
| archived | — | 🔴 USER_GATE: 确认进入 finish 阶段（继续 / 查看状态） |
| finished | — | 工作流已完成 |

**所有 🔴 USER_GATE 的选项模板（同款语义节点，6 phase 共用）：**
- (a) 进入 `<目标阶段>` 继续
- (b) 查看状态（/alloy:status）
- (c) 放弃此 change（/alloy:discard）——仅 planned/applied 阶段可选

**自动跳转仅限**：用户明确选择 (a) 后才加载目标命令。

**需自动加载时：** 输出对应命令文件完整指令，将 change name 和进度信息传入。

**需用户选择时：** 先校验 draft hash（`alloy _record check openspec/changes/<name> draft`），hash 有效 → 展示选择。

一致性检查：
- worktree 字段有值但路径不存在 → ⚠️ WARN 残留
- worktree 为 null 但 `.worktrees/<name>/` 存在 → ⚠️ WARN 孤儿，询问是否修复

---

> **多活跃 change 时：** 状态检测第二步的 USER_GATE 列出所有活跃 change（名称 + phase + 制品状态）让用户选接续哪个，或选"开新 change"。

