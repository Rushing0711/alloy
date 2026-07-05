---
name: "Alloy: Start"
description: 新功能构思或接续已有工作时调用
category: Workflow
tags: [alloy, workflow]
spec: 01-product-spec/01-start-spec.md
behaviors:
  preconditions: 8
  hard_stops:    16
  user_gates:    8
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
有活跃 change 先 USER_GATE 路由；change 必须在独立 feature 分支；start 完成后绝不自动进 plan
违反字面 = 违反精神：哪怕"用户说了新需求"/"已经在分支上"/"分支后面再建"，也禁跳过路由直接 brainstorm
```

> **`<TIMESTAMP>`：** 每次渲染阶段头部时执行 `date "+%Y-%m-%d %H:%M:%S"` 获取本地时间。`<START_TIME>` 是"全新开始"路径中捕获的时间——agent 捕获后复用于 header 和 phase_timings。`<created_at>` 从 `.alloy.yaml` 读取。

**交互规则：** `🔴 STOP` 等价 `USER_GATE`，首次呈现即必须调用平台原生交互工具——禁"先文本展示 (a)/(b) 再等待用户打字"。Claude Code 用 `AskUserQuestion`；其他平台按 `commands/alloy/references/interaction-style.md` §平台工具对照 降级为结构化文本选项。含"沉默 ≠ 授权"通用禁令。跳过任何 USER_GATE / 批量打包 / 基于内容跳过 = 违反 Iron Law。

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

> 接续路径例外：`alloy status` 检测有活跃 change 时，意味着 init 跑过，仅做轻量校验（检查项 2 `openspec/config.yaml` 存在），避免对已有 change 的接续路径过度阻塞。

**第一步**（⛔ PRECONDITION_FAIL）：检查 `openspec/config.yaml` 是否存在——不存在则提示用户 `alloy init`，agent 不得自动初始化（init 会写 `.claude/` / 模板等关键文件，必须由用户主动触发）。

**第二步（⛔ HARD_STOP — 路由决策前置闸门）：** 运行 `alloy status` 检测活跃 change——CLI 的 `findActiveChanges` 已扫描非归档 `openspec/changes/*/` 和归档 `openspec/changes/archive/<date>-<name>/` 两级目录。**有活跃 change 时，必须先完成路由决策才能加载任何技能（包括 explore/brainstorming/opsx:new）。**

```bash
alloy status
```

> ⛠️ `alloy status` 列出所有活跃 change（phase != finished），含归档目录下的 change。归档 change 名格式 `<date>-<name>`，路径 `openspec/changes/archive/<name>`。
> 发现 phase=archived 的归档 active change 时,引导用户运行 `/alloy:finish <name>` 接续完成,不在 start 阶段接续（archived 阶段已完成,下一步是 finish）。
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

**捕获阶段启动时间（同时作为 START_TIME 和 EXPLORE_START 复用——避免两次 date 调用产生时间差）：**
```bash
date "+%Y-%m-%d %H:%M:%S"
```
> ⛔ [HARD_STOP] START_TIME 与 EXPLORE_START 必须是同一次捕获——禁两次 date 调用。
> 原因:两次 date 调用差几秒,会导致 Phase 框显示的"启动时间"与 phase_timings.started_at 不一致(实测差可达 10+ 秒)。
> START_TIME 复用于:Phase 框显示 + _state init --at + _phase start --at + _skill log opsx:explore --at。
> 必须在调用 opsx:explore 之前捕获——否则会捕获成 explore 完成时间(实测偏移可达 5+ 秒)。
> bash 变量在工具调用间不持久——将 START_TIME 输出值记在上下文中,后续步骤作为 `--at` 参数传入。
> 违反字面 = 违反精神:哪怕"两次 date 差几秒无所谓"、"先捕获一个后面再补",也算违反——时间戳不一致 = retrospective 时间链失真,无法回溯真实流程。
> 常见违规模式:
> - 在阶段入口捕获 START_TIME,又在 Step 1 入口捕获 EXPLORE_START(两次 date)
> - 在 opsx:explore 调用后才捕获(捕获成完成时间)
> - 用当前时间作为 --at 参数(不复用 START_TIME)

**进入阶段时，必须输出以下 Phase 框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
│ 启动时间: <START_TIME>
└──────────────────────────────────────┘
```

> **前置门：** Skill 预检 + git 仓库就绪已在「状态检测」第三/四步完成（⛔ PRECONDITION_FAIL）。本路径假设两者已通过。

### [Step 1] explore 探测 + 确定主题

> START_TIME 已在阶段入口捕获（同时作为 EXPLORE_START 复用），此处不重复捕获。
> 加载 opsx:explore 之前确保 START_TIME 已记在上下文中——步骤 6 补录 _skill log 时作为 `--at` 参数传入。

加载 `opsx:explore` 技能，按其指引探索项目上下文：

> ⛔ [HARD_STOP] 必须用 `Skill` 工具加载 `opsx:explore`——禁手动 `ls`/`find`/`cat`/`grep` 替代探查。
> Skill 调用的 args 必须传 topic:
> - 有 topic（用户 `/alloy:start <topic>` 带主题来）: `args: "<topic>"`——禁传 "no-topic"(传 no-topic 会让 explore 不知道用户主题,产出的探查发现不聚焦)
> - 无 topic: `args: "no-topic"` 或不传
> 违反字面 = 违反精神：哪怕"主题会在后续 USER_GATE 确认,explore 不传也行",也算违反——explore 需要围绕 topic 探测,不传 topic = explore 不知道用户想做什么,产出的探查发现不聚焦。

- **有 topic（用户 `/alloy:start <topic>` 带主题来）：** 围绕 topic + 当前项目情况探测，验证 topic 可行性、补充上下文
- **无 topic（用户 `/alloy:start` 未带主题）：** 与用户沟通探测——扫描项目（README、代码、requirement.md 等），基于探查给 2-3 个建议方向，或问用户想做什么

**交互风格：** 使用 `AskUserQuestion` 工具。详见 `commands/alloy/references/interaction-style.md`。

**额外上下文：** 扫描 `openspec/changes/archive/` 下最近 3 个 `retrospective.md`，提取 §5 意外发现、§6 值得推广、§4 技能跳过模式，作为后续 brainstorming 参考。

> explore 的产出是"主题名 + 探查发现"，不深入需求设计。深入需求在步骤 8 的 brainstorming（change 目录已存在后）进行。
>
> ⛔ [HARD_STOP] opsx:explore 的"Curious, not prescriptive"风格在 alloy 流程内不适用——explore 阶段禁任何形式的问题输出(文字讨论 / 纯文本表格 / AskUserQuestion 询问 / 代码示例 / 开放式问题如"你觉得这个方向对吗?")。
> 违反字面 = 违反精神:哪怕"explore 鼓励自然提问"、"纯文本列表高效"、"聊聊设计不算问用户",也算违反——alloy 流程的 USER_GATE 规则优先级高于 explore 风格,提问统一在主题确认 USER_GATE 用 AskUserQuestion。
> 常见违规模式:
> - agent 套用 explore"开放线程"风格,输出"选项 A/选项 B"表格 + 开放式问题——explore 风格覆盖 alloy 规则
> - 纯文本表格列举"命令行参数 vs 环境变量"等设计选项——这是 design exploration,属于 Step 8 brainstorming
> - 展示代码示例脚本("基本形态很简单:echo Hello \${name}!")
> - 用文字讨论"参数缺失时怎么办?"——这是需求设计,不是可行性验证
> - agent 认为"我没用 AskUserQuestion 问,只是用文字讨论"不算违规——文字讨论也是输出,同样违规
> explore 结束后,不输出任何设计细节文字,直接进主题确认 USER_GATE。

**主题确认 USER_GATE（🔴 AskUserQuestion）：** explore 探测后，**第一件事**必须是主题确认 AskUserQuestion，向用户确认主题：
- 有 topic → 确认该 topic 或调整
- 无 topic → 给 2-3 个建议方向让用户选，或用户自定义

> ⛔ [HARD_STOP] 主题确认 USER_GATE 不可跳过——即使 topic 明确（用户 `/alloy:start <topic>` 带主题来），也必须用 AskUserQuestion 让用户确认 topic 或调整。
> thinking 决策"使用 AskUserQuestion"后,下一个动作必须是 AskUserQuestion 工具调用——禁 thinking 决策了但实际输出纯文本选项(决策→执行断裂)。
> 违反字面 = 违反精神:哪怕"topic 已明确不用再确认"、"thinking 已决策输出文本等价"、"直接进 change name 效率高",也算违反——主题确认是 explore 与 change name 之间的必经闸门,跳过 = 用户失去调整 topic 的机会。
> explore Skill 返回后,agent 必须立即调 AskUserQuestion,不能做任何其他事情(包括输出分析文本、说"主题已确认"、或直接跳进 step 1)。
> 常见违规模式:
> - agent 判断"topic 已明确",跳过主题确认直接进 step 1
> - agent 在 explore 阶段讨论了设计细节后,说"回到 Alloy 流程,主题已确认"——跳过主题确认 USER_GATE
> - agent thinking 决策"使用 AskUserQuestion"但实际输出纯文本编号列表(1./2./3.)——决策→执行断裂
> 主题确认 USER_GATE 只确认 topic 本身——禁合并设计细节问题到本次 AskUserQuestion（详见上方 #X2 HARD_STOP）。

> 主题确认后**直接进入步骤 1（change name + 分支决策）**，不要求用户重新输入 `/alloy:start <topic>`——主题已在流程内确认。

---

用户确认主题后，执行以下步骤创建 change：

> **git 自救禁令（§3.5.1 内嵌约束，HARD_STOP）：** 步骤 1 ④ 分支创建/切换 / 步骤 10 commit 任何环节失败，禁 agent 运行 `git reset --hard` / `git checkout .` / `git restore .` / `git stash` / `git clean -fd` / `git push --force` —— 退出 skill 让用户处理是唯一合法路径。
>
> **git add 限路径（§5.2.1 内嵌约束，HARD_STOP）：** 所有 commit 用精确路径（`.claude/` `openspec/` `CLAUDE.md` 等明确列举），禁 `-A`/`-a`/`.`。违反字面 = 违反精神：哪怕"反正只改了已知文件"，也禁通配——可能把 `.superpowers/` 临时目录或测试残留一并 commit。

1. **change name + 分支决策 + 创建 + 验证**（🔴 USER_GATE 合并——一次确认 change name 与分支名；⛔ HARD_STOP 验证）：

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
   > alloy init 时已 USER_GATE 确认主分支并写入 config；若仓库无 commit 还会创建初始 commit 锁定 main 分支。start 阶段不再重复确认。git 仓库前置也已由 alloy init 保证（状态检测第零步已校验 `git rev-parse --git-dir` 通过）。

   **② 当前分支检测：**
   ```bash
   CURRENT_BRANCH=$(git branch --show-current)
   ```

   **③ change name + 分支决策 USER_GATE（🔴 AskUserQuestion，合并——一次确认 change name 与分支名）：**
   - **当前分支 = main_branch** → 选项：
     - (a) change name = `<建议名>`（kebab-case），分支 = `feature/<建议名>`（从 main 新建）← 默认
     - (b) 自定义 change name / 分支名（过白名单校验）
   - **当前分支 ≠ main_branch** → 选项：
     - (a) change name = `<建议名>`，分支 = `feature/<建议名>`（从 main 新建）← 默认
     - (b) 自定义 change name / 分支名（过白名单校验）
     - (c) change name = `<建议名>`，用当前分支（`feature_branch` = `$CURRENT_BRANCH`，跳过新建）—— 适合用户已提前创建分支想在此开发

   > **选定 change name 记为 `$CHANGE_NAME`，分支名记为 `$FEATURE_BRANCH`**——步骤 4 `_state init` 用 `$FEATURE_BRANCH` 写入 .alloy.yaml 的 feature_branch 字段，禁写死 `feature/<name>`。
   > 选 (a) 新建：`$CHANGE_NAME` = 建议名，`$FEATURE_BRANCH` = `feature/<建议名>`
   > 选 (b) 自定义：`$CHANGE_NAME` = 用户输入，`$FEATURE_BRANCH` = 用户输入（默认 `feature/<change-name>`，可调整）
   > 选 (c) 用当前：`$CHANGE_NAME` = 建议名，`$FEATURE_BRANCH` = `$CURRENT_BRANCH`

   > [HARD_STOP] **未确认时禁止继续步骤 2-9。**
   > 违反字面 = 违反精神：哪怕"name 大概就这个先建分支"，也算违反——name 是 directory + branch + records 主键。

   **④ 分支创建（选 (a)/(b) 新建时）：**
   ```bash
   git checkout -b "$FEATURE_BRANCH" "$MAIN_BRANCH"
   ```
   选 (c) 用当前：跳过创建。

   **⛔ PRECONDITION_FAIL 白名单校验**（读取 `commands/alloy/references/branch-naming.md`）：自定义分支名必须以 `feature/` `fix/` `docs/` `refactor/` `test/` `chore/` 之一开头，后缀 kebab-case，且不与主分支同名。校验失败 → USER_GATE 让用户重新输入合法名称，**禁 agent 自动改写后继续**。

   ⛔ [HARD_STOP] **stash → 分支决策 → 才能继续后续步骤。不可逾越。**
   无例外：
   - 不要"先写 proposal 再建分支"
   - 不要"先生成制品再补分支"
   - 不要"在当前分支上继续，分支后面再说"（除非用户在 USER_GATE 明确选 (c) 用当前分支）
   - 不要"分支已存在就跳过创建直接进入下一步"
   违反字面 = 违反精神：哪怕"反正马上要生成 draft，先写了再切分支"——制品必须一诞生就在正确分支上。跳过分支决策 = 制品路径错位，后续 commit 污染错误分支。

   开新 change 与接续场景统一走此分支决策 USER_GATE，不再跳过。

   **⑤ 分支验证（⛔ HARD_STOP，无 USER_GATE——技术校验通过继续，失败回退）：**
   ```bash
   CURRENT=$(git branch --show-current)
   echo "当前分支: $CURRENT | 主分支: $MAIN_BRANCH"
   ```
   `$CURRENT` = `$MAIN_BRANCH` → ⛔ HARD_STOP，回退到 ③ 重新 USER_GATE
   `$CURRENT` ≠ `$MAIN_BRANCH` → 校验通过，继续步骤 2

   > 分支验证是技术校验，不是用户决策——验证通过直接继续，失败回退重新 USER_GATE，无 USER_GATE 确认。
   > [HARD_STOP] **未通过验证时，禁止执行步骤 2-9。**

2. **opsx:new 目录冲突预检**（⛔ PRECONDITION_FAIL，task #12）

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

3. **调用 `/opsx:new <name>`** 创建 change 目录（前置：步骤 1 ⑤ 验证已通过 + 步骤 2 目录冲突已解决）

   **捕获 opsx:new 开始时间（供步骤 6 补录技能使用）：**
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

4. **初始化 state（先于 _phase start 和 _skill log，确保时间字段在最早时刻写入）：**
   ```bash
   alloy _state init openspec/changes/<name> --at "$START_TIME" --feature-branch "$FEATURE_BRANCH"
   ```
   > 顺序硬约束：`_state init` 必须在 `_phase start` / `_skill log` 之前——后两者在 .alloy.yaml 不存在时会隐式创建并用当前时间作为 created_at。`_state init` 先跑则字段写入受控。
   >
   > **`--at "$START_TIME"` 让顶层 `started_at` 回填为全周期开始时间**（`/alloy:start` 敲下时刻，= 阶段入口捕获的 START_TIME），与步骤 6 的 `_phase start --at "$START_TIME"` 同源。`created_at` 仍是文件创建时间（opsx:new 后），两者语义不同：created_at 记文件诞生，started_at 记周期起点。
   >
   > **`--feature-branch "$FEATURE_BRANCH"` 一次成型写入 feature_branch**——用步骤 1 分支决策选定的分支名（变量）,禁写死 `feature/<name>`。选 (c) 用当前分支时 `$FEATURE_BRANCH` = 当前分支名,写死会导致 .alloy.yaml 与实际分支不一致。前置：步骤 1 已完成分支决策。

5. **基础设施 commit（幂等，已提交则跳过；§5.2.1 git add 限路径）——必须在阶段开始 commit 之前：**
   ```bash
   git add .claude/ .gitignore openspec/config.yaml openspec/schemas/ 2>/dev/null
   [ -f CLAUDE.md ] && git add CLAUDE.md 2>/dev/null
   git diff --cached --quiet || git commit -m "chore: 提交 alloy 基础设施文件"
   ```

6. **补录技能使用（explore + new，带 --at 传入实际使用时间——这两个技能在 change 目录创建前/创建时执行，技能 log 只能补录）：**

   > **[HARD_STOP] 两个 `--at` 必须用各自步骤捕获的独立时间戳，禁用同一个值。**
   > 违反字面 = 违反精神：哪怕"时间差不多"、"先记一个后面改"——也禁止复用 `START_TIME` 给 opsx:new。
   > called_at 语义是"技能实际调用时间"，两个技能在不同步骤调用，时间戳必须不同。
   >
   > Step 1（opsx:explore）在 change 目录创建前执行，opsx:new 在步骤 3 创建 change 时执行。此处补录时**必须用各自执行时捕获的开始时间**（`--at`），不可用当前时间。
   >
   > brainstorming 在步骤 8（change 目录已存在后）执行，届时实时 `_skill log`，不用补录。
   >
   > **顺序：_skill log 在 _phase start 之前**——这样"记录 start 阶段开始时间"commit 时 skill_usage 已含 explore+new 记录。called_at 时间戳仍早于 phase start（用捕获的 START_TIME/OPSX_NEW_START），阶段时间链语义正确。

   ```bash
   # START_TIME / OPSX_NEW_START 在阶段入口 / 步骤 3 执行时已捕获
   # ⛔ 禁止两个 --at 用同一个值——各自独立时间戳
   alloy _skill log openspec/changes/<name> start opsx:explore --at "$START_TIME"
   alloy _skill log openspec/changes/<name> start opsx:new --at "$OPSX_NEW_START"
   ```

7. **记录 worktree + 阶段开始 commit（原子命令，在 _skill log 之后——skill_usage 已含 explore+new）：**
   ```bash
   alloy _state write openspec/changes/<name> worktree null
   alloy _phase start openspec/changes/<name> start --at "$START_TIME"
   ```
   > `alloy _phase start` 原子完成：幂等写 `phase_timings.start.started_at` + git add 限路径 + commit。产生独立的"阶段开始"commit（仅 .alloy.yaml，含 started_at + feature_branch + worktree + skill_usage[explore+new]）。
   >
   > **`--at "$START_TIME"` 必传**——Step 1（opsx:explore）在 change 目录创建前执行，`_phase start` 在步骤 7 才能调用（需 change 目录存在）。若用当前时间，started_at 会晚于 explore/new 的技能使用时间，阶段时间链语义错乱。`START_TIME` 是 start 阶段最早的动作，作为 started_at 补录时间最准确。

8. **[Step 2] 需求设计——brainstorming（change 目录已存在，实时记录技能使用）：**

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
   请跳过 brainstorming checklist 中的“Write design doc”和“Invoke writing-plans”步骤。
   **额外跳过 "User approves design" gate**——brainstorming 内不单独 USER_GATE 确认方案,讨论完设计要点后直接生成 draft.md,由 step 9 的 draft 审查 USER_GATE 作为唯一确认点(避免对 draft 重复确认 2 次)。

   **交互风格：** 使用 AskUserQuestion 组件，不用纯文本 (a)(b)(c)。
   单选用 radio，多选用 checkbox，代码方案对比用 preview。
   每次提问不超过 4 个问题，相关问题合并到一次调用。
   给出默认推荐——推荐选项在 description 中标注理由。

   **⛔ [HARD_STOP] 主题明确时简化——禁多问方向：** 用户 `/alloy:start <topic>` 带主题来时（topic 已在流程内确认）:
   - 禁给 2-3 个方向让用户选（主题已明确,不用再选方向）
   - 禁"需求已清楚,不过还有一个关键细节需要确认"式的多问
   - 直接确认设计要点（位置/行为/范围）,生成 draft
   违反字面 = 违反精神：哪怕"多问显得更仔细"、"给方向让用户选更全面",也算违反——主题明确时多问 = 浪费用户时间 = 降低体验。
   仅当用户主题模糊（如"做个工具"无具体描述）时,才给方向让用户选。
   ```

   **讨论完设计要点后,直接生成 draft.md**（不是 spec 文件）——brainstorming 内不单独 USER_GATE 确认方案,由 step 9 的 draft 审查 USER_GATE 作为唯一确认点。用户在讨论中提出调整时回到 brainstorming 继续。

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

   > [HARD_STOP] brainstorming 讨论未完成前,不要生成 draft.md——但讨论完成不需要单独 USER_GATE 确认,直接生成 draft,由 step 9 审查。
   > 违反字面 = 违反精神:哪怕"讨论差不多了先生成 draft 节省时间",也算违反——设计要点未对齐就生成 draft,后续 step 9 审查会反复回 brainstorming,效率更低。

   > **交互风格恢复:** brainstorming 已结束,恢复 §交互规则(L31)——所有 USER_GATE 首次呈现即调 AskUserQuestion。Agent 刚从 brainstorming 的"每次一个问题"模式出来,容易延续纯文本习惯。

9. **生成 `draft.md` 审查窗口——start 阶段唯一确认点（brainstorming 内不单独确认方案,此处合并为 draft 锁定 USER_GATE）：**

    > 制品 draft ✓ 完成
    > [展示 draft.md 完整内容]
    > 🔴 USER_GATE: 确认锁定 draft（确认并继续提交 / 需要调整回 brainstorming）

    选确认 → 步骤 10；选调整 → 回到步骤 8 brainstorming。

10. **提交——仅用户确认锁定后，执行以下步骤（基础设施与阶段开始已在前面独立 commit）：**

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
> **"不自动进 plan"指未经 USER_GATE 确认不能进——用户在下方 USER_GATE 明确选"进入 plan"后,agent 必须直接加载 plan skill 执行,不再要求用户手动输入命令。**

🔴 USER_GATE（必须 AskUserQuestion 工具调用）: start 阶段完成,下一步?

> ⛔ [HARD_STOP] 必须用 `AskUserQuestion` 工具调用——禁纯文本列选项 / 禁直接 `Skill` 加载下一阶段 / 禁纯文本"等待用户输入" / 禁提示用户手动输入命令。
> 违反字面 = 违反精神:哪怕"纯文本效果一样"、"直接 Skill 更流畅"、"用户已授权提示一下也行",也算违反——AskUserQuestion 强制结构化选项,避免 agent 用模糊措辞让用户回 yes 蒙混过关（§4.1）。
> 常见违规模式:
> - 纯文本输出"等待用户输入下一个命令"——不是 AskUserQuestion
> - 纯文本列"(a) 进入 plan / (b) 暂停 / (c) 其他"让用户回复
> - 用户选 (a) 后提示"请运行 /alloy:plan <name>"让用户手动输入——应直接 Skill 加载
> 非 Claude Code 平台按 `commands/alloy/references/interaction-style.md` §平台工具对照 降级。

> 选项:
> - (a) 进入 plan 阶段——加载 `alloy:plan` skill 推进制品生成
> - (b) 暂停——查看状态(`alloy status`)或思考 draft 内容
> - (c) 其他——用户自定义下一步

> 用户选 (a) 后,agent **必须直接用 `Skill` 工具加载 `alloy:plan`**(传入 change name),进入 plan 阶段——用户已在 USER_GATE 授权,阶段转换已触发,再让用户输入命令 = 多此一举。
> 用户选 (b) 后,agent 停止,输出"已暂停。需要时运行 /alloy:plan <name> 继续。"
> 用户选 (c) 后,agent 停止,等用户后续命令。

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

> ⛔ [HARD_STOP] 接续路径 Phase 框的"启动时间"必须读 state 现有 started_at(或 created_at),禁重新捕获 date。
> 违反字面 = 违反精神:哪怕"重新捕获更准确"、"state 时间戳可能过期",也算违反——接续路径 state 已有 started_at,重新捕获 = 覆盖历史 = retrospective 时间链失真。
> 常见违规模式:
> - agent 在接续路径执行 `date "+%Y-%m-%d %H:%M:%S"` 用于 Phase 框显示(实测差可达 2+ 分钟)
> - agent 用本次 session 时间作为 started_at(接续路径 state 已有 started_at,不应覆盖)
> - agent 觉得"Phase 框只是显示,重捕获无所谓"——Phase 框显示的时间会被 retrospective §4 时间链审计用到,失真 = 审计失真

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

**分支校验（⛔ PRECONDITION_FAIL）：** 接续前必须校验当前分支 = .alloy.yaml 记录的 feature_branch,避免 commit 落在错误分支：
```bash
alloy _guard branch-position openspec/changes/<name>
```
> `_guard branch-position` 内部完成：读 feature_branch + 读当前分支 + 校验一致。输出 `on-feature`（exit 0,正确）/ `on-main` / `feature-missing` / `on-other:<current>` / `feature-lost:<feature>`（exit 1,不一致）。
> exit 1 时 ⛔ PRECONDITION_FAIL：当前分支与 feature_branch 不一致,commit 会落在错误分支。请 `git checkout <feature_branch>` 后重入,或 USER_GATE 选择处理路径。
> 违反字面 = 违反精神：哪怕"当前分支也能开发",也算违反——feature_branch 是 change 的分支锚点,不一致 = 状态分裂。禁 agent 自动 `git checkout` 切换（§3.5.1）。

一致性检查：
- worktree 字段有值但路径不存在 → ⚠️ WARN 残留
- worktree 为 null 但 `.worktrees/<name>/` 存在 → ⚠️ WARN 孤儿，询问是否修复

---

> **多活跃 change 时：** 状态检测第二步的 USER_GATE 列出所有活跃 change（名称 + phase + 制品状态）让用户选接续哪个，或选"开新 change"。

