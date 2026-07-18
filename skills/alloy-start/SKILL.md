---
name: alloy-start
description: 开始 Alloy 流程--需求澄清，创建 change。手动调用 /alloy-start。
disable-model-invocation: true
spec: 01-product-spec/01-start-spec.md
behaviors:
  preconditions: 8
  hard_stops:    18
  user_gates:    8
  warns:         2
  artifacts: [draft]
  transitions_to: started
  external_calls: [opsx:explore, opsx:new, superpowers:brainstorming]
---

# alloy-start

## REQUIRED BACKGROUND

**REQUIRED BACKGROUND:** Understand alloy-shared

你是 Alloy 工作流的智能入口。检测状态、路由到正确流程、调度外部技能完成探查和需求设计，产出 draft.md。

**核心原则：把实际工作委托给专门的技能，不要自己做。Alloy 是编排器，不是执行者。** draft.md 以 hash-lock + commit 入 records，禁直接编辑。

```
[HARD_STOP] ACTIVE CHANGE → ROUTE FIRST + NO WORK ON MAIN + NO SKIP BRANCH + NO AUTO ADVANCE
有活跃 change 先 USER_GATE 路由；change 必须在独立 feature 分支；start 完成后绝不自动进 plan
违反字面 = 违反精神：哪怕"用户说了新需求"/"已经在分支上"/"分支后面再建"，也禁跳过路由直接 brainstorm
```

> **`<TIMESTAMP>`：** 每次渲染阶段头部时执行 `date "+%Y-%m-%d %H:%M:%S"` 获取本地时间。`<START_TIME>` 是"全新开始"路径中捕获的时间——agent 捕获后复用于 header 和 phase_timings。`<created_at>` 从 `.alloy.yaml` 读取。

**交互规则：** `🔴 STOP` 等价 `USER_GATE`，首次呈现即必须调用平台原生交互工具--禁"先文本展示 1./2. 再等待用户打字"。Claude Code 用 `AskUserQuestion`,OpenCode 用 `question` 工具(字段名 `multiple` 非 `multiSelect`,可选 `custom`),Pi 用 `alloy-question` 工具(alloy-question extension 注册);Copilot CLI / Gemini CLI 无原生交互工具,降级为结构化文本选项。三平台调用示例见 `alloy-shared/references/interaction-style.md` §审查窗口标准模式。含"沉默 ≠ 授权"通用禁令。跳过任何 USER_GATE / 批量打包 / 基于内容跳过 = 违反 Iron Law。

**状态符号：** `⛔` = HARD_STOP / PRECONDITION_FAIL，`🔴` = USER_GATE，`⚠️` = WARN（视觉规范 §七）。

**输出规则：** 阶段入口/出口必须按 `docs/specification/02-visual-spec.md` 输出 Phase 框（`┌─┐` Unicode 单线框，38 字符宽）、Step 标题（`[Step N/M]` + 38 字符 `─` 下划线）、`>` 块引用、`→` 引导行。**skill md 中的 Phase 框代码块是必须输出到终端的格式，不是文档示例。** 制品汇总表同理。

---

### Red Flags（第三层防御——任一借口出现即 STOP）

主文件保留 7 条核心借口，完整 14 条见 `references/rationalizations.md`。

| 借口 | 现实 |
|------|------|
| "不用建分支了，就在 main 上干吧" | ⛔ HARD_STOP：主分支污染不可逆。建分支只需 2 秒。违反字面 = 违反精神：哪怕"只是先建个目录后面再切"也算（Iron Law 第一层）。 |
| "用户说了新需求，直接 brainstorm" / "需求很明确了，不用先路由" | ⛔ HARD_STOP：有活跃 change 时，**必须先 USER_GATE 确认去向，才能加载任何技能**。哪怕用户明确描述了新需求，也要先路由。路由决策是技能加载的前置闸门。 |
| "先跳过分支创建，把 proposal 写了，后面再建" / "分支不建也能生成制品，后面补" | ⛔ HARD_STOP：跳过分支创建=制品落在错误分支。**stash + 开新分支完成后才能进行后续步骤。** 违反字面 = 违反精神：哪怕"proposal 内容已确定，先写了再建分支"也算——制品必须一诞生就在正确分支上。 |
| "不用 brainstorming，直接写代码" | brainstorming 不可跳过。跳过需求设计 = 规格和代码分叉的起点。 |
| "需求很明确，explore 后直接写代码省时间" | ⛔ HARD_STOP：需求明确不等于可以跳过流程。explore 是探测,不是实现——explore 阶段禁 Write/Edit/运行实现代码。流程存在的意义就是防止"看似简单"的需求失控。哪怕用户描述了完整的脚本逻辑,也必须走完 explore → 主题确认 → change name → 分支 → opsx:new → brainstorming → draft → plan → apply,代码在 apply 阶段才写。 |
| "start 完成了，直接进 plan" / "用户没回复，我先继续" | ⛔ HARD_STOP：start 完成后绝不自动进入 plan。沉默 ≠ 授权（Iron Law 第二层）。替用户做阶段转换 = 剥夺审查机会。 |
| "先文本列 1./2. 选项让用户思考，再调 AskUserQuestion 双保险" | ⛔ HARD_STOP：双重呈现违规——首次呈现必须是平台原生交互工具调用,不是文本。哪怕"先展示选项让用户思考"、"文本+工具双保险",也算违反。常见模式:thinking 决策"用 AskUserQuestion"但执行时先输出纯文本选项(决策→执行断裂)。 |
| "openspec/changes/<name>/ 已经有了，直接复用" | ⛔ PRECONDITION_FAIL：目录已存在 = #12 冲突。USER_GATE 让用户决策（改名 / 接续 / 中止），禁 agent 自动复用——可能覆盖用户既有工作。 |
| "git init 后 reset --hard 一下，把环境清干净" | ⛔ HARD_STOP：git 操作失败禁 reset --hard / clean -fd / checkout .（§3.5.1 git 自救禁令）。退出 skill 让用户处理。 |

---

## 状态检测（前置门,原子命令)

**一步原子检测**(⛔ PRECONDITION_FAIL + 路由决策前置闸门):

```bash
alloy _start precheck --cmd "opsx/explore opsx/new" --skill "brainstorming"
```

> `alloy _start precheck` 原子完成 5 步(5 次 LLM 往返 -> 1 次):
> 1. env check(git 仓库 + openspec/config.yaml 含 schema: alloy + schema.yaml + Alloy skills)
> 2. status 检测活跃 change(含归档目录扫描)
> 3. 捕获 START_TIME(仅统一流程)
> 4. precheck(cmd + skill 就绪检测,仅统一流程)
> 5. git 仓库就绪(已由 env check 覆盖,不单独校验)
>
> 输出含 `-> route: <unified|resume|abort>` 标注,agent 根据 route 决策:
> - `route: abort`(env 失败/precheck 失败)-> ⛔ PRECONDITION_FAIL,引导 `alloy init` 退出,agent 不得自动初始化
> - `route: resume`(有活跃 change)-> 🔴 USER_GATE 路由决策(见下方"route=resume"节)
> - `route: unified`(无活跃 change)-> 用输出里的 `-> start_time: <ts>` 作为 START_TIME,直接进入统一流程
>
> ⛔ [HARD_STOP] **禁止在 _start precheck 后重复检查已覆盖的项**--`_start precheck` 已原子完成 env check + git 校验 + status + precheck,禁再跑 `test -f openspec/config.yaml` / `git rev-parse --git-dir` / `alloy _env check` / `alloy status` / `alloy _precheck` 任何一个。
> 违反字面 = 违反精神:哪怕"显式检查更稳妥"、"确认一下不浪费多少时间",也算违反--重复检查 = 浪费 LLM 往返 = 触发限流风险(step-3.7-flash 限 10 RPM,实测 16 秒内 11 次调用即触顶 429)。

### route=resume:路由决策前置闸门

有活跃 change 时,必须先完成路由决策才能加载任何技能(包括 explore/brainstorming/opsx:new)。

🔴 USER_GATE 让用户选:
- 1. 接续某个活跃 change(从 `-> active_changes` 列表中选)
- 2. 开新 change(有 topic 用该 topic,无 topic 进统一流程 explore 探测定主题)
- 3. 中止

> ⛔ [HARD_STOP] **活跃 change 的路由决策是技能加载的前置闸门。** 无论 topic 多明确、需求多清晰,都必须先经此 USER_GATE 确认去向,然后才能加载对应技能。
> 违反字面 = 违反精神:哪怕"用户已经说了要做什么"、"需求在 /alloy-start 时就带了"、"先 brainstorm 再路由也一样",也算违反 Iron Law。路由在前,技能在后--顺序不可颠倒。

> ⚠️ 发现 phase=archived 的归档 active change 时,引导用户运行 `/alloy-finish <name>` 接续完成,不在 start 阶段接续(archived 阶段已完成,下一步是 finish)。

**开新 change 前 dirty 处理**:用户选 2 开新 change 后,agent 检测当前 working tree:
```bash
DIRTY=$(git status --porcelain 2>/dev/null)
```
dirty 时 -> 🔴 USER_GATE:检测到未提交变更,如何处理?

**AskUserQuestion 模板(options 必须用 description 字段承载以下解释,不能只写 label):**
- option label: "stash 暂存"
- option description: "git stash push -u -m \"alloy: <新 change 名> 开新 change 前暂存\"。为什么不 worktree?多 worktree 管理复杂,当前可能已在某个 worktree 中,再开容易混乱。为什么不 commit?未锁定的制品 commit 后引入制品锁定问题。-> stash 最干净:保护未提交改动不丢失,且不影响 alloy 流程状态。⚠️ alloy 流程不负责 stash 恢复--stash 无分支归属,恢复需人工 `git stash apply` 确认后再手动 `git stash drop` 清理。进度保护靠检查点,不靠 stash。"
- option label: "放弃未提交变更"
- option description: "git restore . 清除所有未提交变更,干净开新。⚠️ 此操作不可逆--用户在此 USER_GATE 主动选择放弃,与 §3.5.1 禁令的'agent 自动清场失败状态'语义不同(禁令针对 agent 自作主张,此处是用户授权放弃)。放弃后无法找回。"
- option label: "取消"
- option description: "取消开新 change"

---

## 统一流程（无活跃 change，或用户选"开新 change"）

**触发条件：**
- 无活跃 change（无论有无 topic）
- 有活跃 change 但用户在 USER_GATE 选了"开新 change"

**START_TIME 复用:** `alloy _start precheck` 输出的 `-> start_time: <ts>` 即 START_TIME(同时作为 EXPLORE_START 复用),不重复捕获。

> ⛔ [HARD_STOP] START_TIME 必须从 `_start precheck` 输出复用,禁重新 `date` 捕获。
> 原因:重新 date 会与 _start precheck 捕获的时间产生偏差,导致 Phase 框显示的"启动时间"与 phase_timings.started_at 不一致(实测差可达 10+ 秒)。
> START_TIME 复用于:Phase 框显示 + _state init --at + _phase start --at + _skill log opsx:explore --at。
> bash 变量在工具调用间不持久--将 START_TIME 输出值记在上下文中,后续步骤作为 `--at` 参数传入。
> 违反字面 = 违反精神:哪怕"重新 date 更准确"、"先捕获一个后面再补",也算违反--时间戳不一致 = retrospective 时间链失真,无法回溯真实流程。
> 常见违规模式:
> - 在统一流程入口重新 `date` 捕获 START_TIME(应从 _start precheck 输出复用)
> - 在 opsx:explore 调用后才捕获(捕获成完成时间)
> - 用当前时间作为 --at 参数(不复用 _start precheck 的 start_time)

**进入阶段时，必须输出以下 Phase 框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
│ 启动时间: <START_TIME>
└──────────────────────────────────────┘
```

> **前置门：** env check + status + precheck + git 校验已由 `alloy _start precheck` 原子完成（⛔ PRECONDITION_FAIL）。本路径假设 route=unified 已通过。

### [Step 1] explore 探测 + 确定主题

> START_TIME 已由 `alloy _start precheck` 输出复用(同时作为 EXPLORE_START),此处不重复捕获。
> 加载 opsx:explore 之前确保 START_TIME 已记在上下文中——步骤 6 补录 _skill log 时作为 `--at` 参数传入。

加载 `openspec-explore` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`),按其指引探索项目上下文:
- Claude Code / OpenCode: 调 `skill({ name: "openspec-explore", args: "<topic>" })`
- Pi: `read .pi/skills/openspec-explore/SKILL.md`(read 后按 SKILL.md 指引执行,args 通过上下文传入)

> ⛔ [HARD_STOP] 必须加载 `openspec-explore` skill--禁手动 `ls`/`find`/`cat`/`grep` 替代探查,禁跑 `openspec explore`(不存在)。
> Skill 调用的 args 必须传 topic:
> - 有 topic（用户 `/alloy-start <topic>` 带主题来）: `args: "<topic>"`——禁传 "no-topic"(传 no-topic 会让 explore 不知道用户主题,产出的探查发现不聚焦)
> - 无 topic: `args: "no-topic"` 或不传
> 违反字面 = 违反精神：哪怕"主题会在后续 USER_GATE 确认,explore 不传也行",也算违反——explore 需要围绕 topic 探测,不传 topic = explore 不知道用户想做什么,产出的探查发现不聚焦。

> ⛔ [HARD_STOP] **explore 阶段探查次数上限--主题明确时最多 1 次探查**。
> `_start precheck` 已检测过活跃 change,explore 不重复 `openspec list --json` / `alloy status`。
> 主题明确时(用户 `/alloy-start <topic>` 带主题来),explore 只做 1 次项目结构扫描(如 `ls` 项目根目录),禁多步 `ls`/`find`/`cat`/`grep`。
> 主题模糊时(无 topic),explore 最多 2 次探查(扫描项目结构 + 读关键文件)。
> 违反字面 = 违反精神:哪怕"多探查更全面"、"explore 鼓励 curious",也算违反--每次 bash 都是一次 LLM 往返,step-3.7-flash 限 10 RPM,探查过多 = 触发限流。

- **有 topic（用户 `/alloy-start <topic>` 带主题来）：** 围绕 topic + 当前项目情况探测，验证 topic 可行性、补充上下文
- **无 topic（用户 `/alloy-start` 未带主题）：** 与用户沟通探测——扫描项目（README、代码、requirement.md 等），基于探查给 2-3 个建议方向，或问用户想做什么

**交互风格：** 使用 `AskUserQuestion` 工具。详见 `alloy-shared/references/interaction-style.md`。

**额外上下文：** 扫描 `openspec/changes/archive/` 下最近 3 个 `retrospective.md`，提取 §5 意外发现、§6 值得推广、§4 技能跳过模式、§7 偏差分类,作为后续 brainstorming 参考。

> **§7 偏差分类反馈循环:** 若最近 retrospective §7 记录了高频偏差(如"AskUserQuestion 漏触发"、"纯文本列选项"),本次 session 特别注意这些偏差类型——历史偏差是未来偏差的最佳预测器。

> explore 的产出是"主题名 + 探查发现"，不深入需求设计。深入需求在步骤 4 的 brainstorming（change 目录已存在后）进行。
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
>
> ⛔ [HARD_STOP] explore 阶段禁任何实现动作——explore 是探测,不是实现。
> 禁止动作(任一触发 = 严重违规):
> - Write / Edit / NotebookEdit 创建或修改任何文件(代码 / 脚本 / 配置 / 文档)
> - 运行实现代码(chmod +x / 执行脚本 / 编译 / 运行测试 / 安装依赖)
> - mkdir 创建实现目录(如 scripts/ src/ 等,change 目录创建是 Step 1 之后的事)
> 违反字面 = 违反精神:哪怕"需求很简单先写个 demo 验证可行性"、"用户描述很明确直接实现省时间"、"explore 鼓励 visualize freely",也算违反——explore 的"visualize freely"指思考可视化(心智模型 / 架构图),不是写代码。需求再明确,也必须走完 explore → 主题确认 → change name → 分支 → opsx:new → brainstorming → draft → plan → apply 完整流程,代码在 apply 阶段才写。
> 常见违规模式:
> - agent 在 explore 阶段 Write 脚本文件 + chmod +x + 执行验证——直接跳过 8 个阶段,实现动作覆盖编排控制
> - agent 认为"用户需求明确,explore 探测后直接实现更高效"——需求明确不等于可以跳过流程,流程的存在就是为了防止"看似简单"的需求失控
> - agent 把 explore 的"thinking partner"风格当成"可以自由实现"的授权——explore 是探测伙伴,不是实现伙伴

**主题确认 USER_GATE（🔴 平台原生交互工具）：** explore 探测后，**第一件事**必须是主题确认交互工具调用，向用户确认主题：
- 有 topic → 确认该 topic 或调整
- 无 topic → 给 2-3 个建议方向让用户选，或用户自定义

> 平台工具:Claude Code `AskUserQuestion`;OpenCode `question` 工具(字段名 `multiple` 非 `multiSelect`,可选 `custom`);Pi `alloy-question` 工具。三平台完整调用示例见 `alloy-shared/references/interaction-style.md` §审查窗口标准模式。Copilot CLI/Gemini CLI 无原生工具,降级文本。

> ⛔ [HARD_STOP] 主题确认 USER_GATE 不可跳过——即使 topic 明确（用户 `/alloy-start <topic>` 带主题来），也必须用平台原生交互工具(Claude Code `AskUserQuestion` / OpenCode `question` / Pi `alloy-question`)让用户确认 topic 或调整。
> thinking 决策"使用平台原生交互工具"后,下一个动作必须是该工具调用——禁 thinking 决策了但实际输出纯文本选项(决策→执行断裂)。
> 违反字面 = 违反精神:哪怕"topic 已明确不用再确认"、"thinking 已决策输出文本等价"、"直接进 change name 效率高",也算违反——主题确认是 explore 与 change name 之间的必经闸门,跳过 = 用户失去调整 topic 的机会。
> explore Skill 返回后,agent 必须立即调平台原生交互工具,不能做任何其他事情(包括输出分析文本、说"主题已确认"、或直接跳进 step 1)。
> 常见违规模式:
> - agent 判断"topic 已明确",跳过主题确认直接进 step 1
> - agent 在 explore 阶段讨论了设计细节后,说"回到 Alloy 流程,主题已确认"——跳过主题确认 USER_GATE
> - agent thinking 决策"使用 AskUserQuestion"但实际输出纯文本编号列表(1./2./3.)——决策→执行断裂
> 主题确认 USER_GATE 只确认 topic 本身——禁合并设计细节问题到本次 AskUserQuestion（详见上方 #X2 HARD_STOP）。

> 主题确认后**直接进入步骤 1（change name + 分支决策）**，不要求用户重新输入 `/alloy-start <topic>`——主题已在流程内确认。

---

用户确认主题后，执行以下步骤创建 change：

> **git 自救禁令（§3.5.1 内嵌约束，HARD_STOP）：** 步骤 1 ④ 分支创建/切换 / 步骤 10 commit 任何环节失败，禁 agent 运行 `git reset --hard` / `git checkout .` / `git restore .` / `git stash` / `git clean -fd` / `git push --force` —— 退出 skill 让用户处理是唯一合法路径。
>
> **git add 限路径（§5.2.1 内嵌约束，HARD_STOP）：** 所有 commit 用精确路径（`.claude/` `openspec/` `CLAUDE.md` 等明确列举），禁 `-A`/`-a`/`.`。违反字面 = 违反精神：哪怕"反正只改了已知文件"，也禁通配——可能把 `.superpowers/` 临时目录或测试残留一并 commit。

1. **change name + 分支决策 + 创建 + 验证**（🔴 USER_GATE 合并——一次确认 change name 与分支名；⛔ HARD_STOP 验证）：

   **① ② 分支上下文读取（原子命令，合并主分支读取 + 当前分支检测，减少 LLM 往返）：**
   ```bash
   alloy _branch context
   ```
   > 输出 JSON: `{"main_branch":"<main>","current_branch":"<current>"}`。agent 读取后在后续命令里用对应的值(填入 `--main`/`--feature` 参数)。
   > main_branch 未配置 -> ⛔ PRECONDITION_FAIL exit 1(引导 `alloy init`)。alloy init 时已 USER_GATE 确认主分支并写入 config;若仓库无 commit 还会创建初始 commit 锁定 main 分支。start 阶段不再重复确认。git 仓库前置也已由 alloy init 保证(状态检测第零步已校验 `git rev-parse --git-dir` 通过)。

   **③ change name + 分支决策 USER_GATE（🔴 平台原生交互工具，合并——一次确认 change name 与分支名）：**
   - **当前分支 = main_branch** → 选项：
     - 1. change name = `<建议名>`（kebab-case），分支 = `feature/<建议名>`（从 main 新建）← 默认
     - 2. 自定义 change name / 分支名（过白名单校验）
   - **当前分支 ≠ main_branch** → 选项：
     - 1. change name = `<建议名>`，分支 = `feature/<建议名>`（从 main 新建）← 默认
     - 2. 自定义 change name / 分支名（过白名单校验）
     - 3. change name = `<建议名>`，用当前分支（`feature_branch` = `$CURRENT_BRANCH`，跳过新建）—— 适合用户已提前创建分支想在此开发

   > **选定 change name 记为 `$CHANGE_NAME`，分支名记为 `$FEATURE_BRANCH`**——步骤 3 `alloy _start bootstrap` 用 `$FEATURE_BRANCH` 写入 .alloy.yaml 的 feature_branch 字段，禁写死 `feature/<name>`。
   > 选 1 新建：`$CHANGE_NAME` = 建议名，`$FEATURE_BRANCH` = `feature/<建议名>`
   > 选 2 自定义：`$CHANGE_NAME` = 用户输入，`$FEATURE_BRANCH` = 用户输入（默认 `feature/<change-name>`，可调整）
   > 选 3 用当前：`$CHANGE_NAME` = 建议名，`$FEATURE_BRANCH` = `$CURRENT_BRANCH`

   > [HARD_STOP] **未确认时禁止继续步骤 2-9。**
   > 违反字面 = 违反精神：哪怕"name 大概就这个先建分支"，也算违反——name 是 directory + branch + records 主键。

   **④ ⑤ 分支创建 + 验证（原子命令，合并 git checkout -b + 验证当前分支，减少 LLM 往返）：**
   ```bash
   alloy _branch create --feature "$FEATURE_BRANCH" --main "$MAIN_BRANCH"
   ```
   选 3 用当前分支:跳过创建。
   > `alloy _branch create` 原子完成:`git checkout -b` + 验证当前分支 = feature。
   > 失败(仍在 main / checkout 失败 / 分支已存在) -> ⛔ [FAIL] exit 1,回退到 ③ 重新 USER_GATE。不自动 reset/checkout(§3.5.1 git 自救禁令)。
   > feature = main 时 ⛔ PRECONDITION_FAIL exit 1。

   **⛔ PRECONDITION_FAIL 白名单校验**（读取 `alloy-shared/references/branch-naming.md`）：自定义分支名必须以 `feature/` `fix/` `docs/` `refactor/` `test/` `chore/` 之一开头，后缀 kebab-case，且不与主分支同名。校验失败 → USER_GATE 让用户重新输入合法名称，**禁 agent 自动改写后继续**。

   ⛔ [HARD_STOP] **stash → 分支决策 → 才能继续后续步骤。不可逾越。**
   无例外：
   - 不要"先写 proposal 再建分支"
   - 不要"先生成制品再补分支"
   - 不要"在当前分支上继续，分支后面再说"（除非用户在 USER_GATE 明确选 3 用当前分支）
   - 不要"分支已存在就跳过创建直接进入下一步"
   违反字面 = 违反精神：哪怕"反正马上要生成 draft，先写了再切分支"——制品必须一诞生就在正确分支上。跳过分支决策 = 制品路径错位，后续 commit 污染错误分支。

   开新 change 与接续场景统一走此分支决策 USER_GATE，不再跳过。

   > 分支验证是技术校验，不是用户决策--验证通过(`alloy _branch create` exit 0)直接继续,失败(exit 1)回退重新 USER_GATE,无 USER_GATE 确认。
   > [HARD_STOP] **未通过验证时，禁止执行步骤 2-9。**

2. **捕获 opsx:new 开始时间 + 创建 change + 验证（原子命令，合并目录冲突预检 + openspec new change + .openspec.yaml 验证，3 次 LLM 往返 -> 1 次）：**
   ```bash
   OPSX_NEW_START=$(date "+%Y-%m-%d %H:%M:%S")
   alloy _change create "<name>"
   ```
   > `alloy _change create` 原子完成:目录冲突预检 + `openspec new change` + `.openspec.yaml` 验证。
   > 目录已存在 -> ⛔ PRECONDITION_FAIL exit 1(走 USER_GATE 让用户决策)。
   > openspec CLI 失败 -> ⛔ [FAIL] exit 1。
   > .openspec.yaml 缺失 -> ⛔ PRECONDITION_FAIL exit 1(禁 alloy 补写,退出让用户排查 openspec CLI)。

   🔴 USER_GATE(目录冲突时,`alloy _change create` exit 1): 选择处理路径
   - 1. 改用其他 name -> 回步骤 1 重新建议 change name
   - 2. 接续已有 change -> 退出 start,引导用户跑 `/alloy-start`(无 topic)触发"接续"路径
   - 3. 中止本次 /alloy-start

   > [HARD_STOP] agent 不得自动选 1 / 2 / 3--必须由用户明确决策。
   > 违反字面 = 违反精神:哪怕"目录看起来是空的"或"看起来是上次中断的",也禁 agent 自动复用。

3. **start 阶段 bootstrap（原子命令，合并 state init + infra-commit + skill log x2 + worktree write + phase start，6 次 LLM 往返 -> 1 次）：**
   ```bash
   alloy _start bootstrap openspec/changes/<name> \
     --start-at "$START_TIME" \
     --opsx-new-at "$OPSX_NEW_START" \
     --feature-branch "$FEATURE_BRANCH"
   ```
   > `alloy _start bootstrap` 原子完成 6 步(任一步失败 exit 1,不继续):
   > 1. state init(写 started_at + feature_branch,先于 phase start / skill log)
   > 2. infra-commit(基础设施 commit,幂等)
   > 3. skill log opsx:explore(补录 --at=$START_TIME)
   > 4. skill log opsx:new(补录 --at=$OPSX_NEW_START)
   > 5. state write worktree null(标记非 worktree 模式)
   > 6. phase start(写 phase_timings.start.started_at + 推进到 starting + commit)
   >
   > **[HARD_STOP] --start-at 与 --opsx-new-at 必须不同值**(已内化到 CLI,同值 exit 1)。
   > 违反字面 = 违反精神:哪怕"时间差不多"、"先记一个后面改"--也禁止复用同一时间戳。
   > called_at 语义是"技能实际调用时间",两个技能在不同步骤调用,时间戳必须不同。
   >
   > **顺序约束已内化到 CLI**:state init 在 phase start / skill log 之前;skill log 在 phase start 之前。这样"记录 start 阶段开始时间"commit 时 skill_usage 已含 explore+new 记录。called_at 时间戳仍早于 phase start(用捕获的 START_TIME/OPSX_NEW_START),阶段时间链语义正确。
   >
   > **`--start-at "$START_TIME"`** 让顶层 `started_at` 回填为全周期开始时间(`/alloy-start` 敲下时刻),与 phase start 的 `started_at` 同源。`created_at` 仍是文件创建时间(opsx:new 后),两者语义不同:created_at 记文件诞生,started_at 记周期起点。
   >
   > **`--feature-branch "$FEATURE_BRANCH"`** 一次成型写入 feature_branch--用步骤 1 分支决策选定的分支名(变量),禁写死 `feature/<name>`。选 3 用当前分支时 `$FEATURE_BRANCH` = 当前分支名。


4. **[Step 2] 需求设计——brainstorming（change 目录已存在，实时记录技能使用）：**

   **捕获 superpowers:brainstorming 开始时间（实时记录，不用补录）：**
   ```bash
   BRAINSTORM_START=$(date "+%Y-%m-%d %H:%M:%S")
   alloy _skill log openspec/changes/<name> start superpowers:brainstorming --at "$BRAINSTORM_START"
   ```

加载 `brainstorming` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`),传入探查结果和主题:
- Claude Code / OpenCode: 调 `skill({ name: "brainstorming" })`
- Pi: `read .pi/skills/brainstorming/SKILL.md`

   ```
   探查结果：<Step 1 关键发现摘要>
   主题：<topic>
   项目类型：<新项目/存量项目>

   **Alloy 流程覆盖：** 本调用在 Alloy start 流程内，brainstorming 完成后产出是 draft.md
   （openspec/changes/<name>/draft.md），不是 docs/superpowers/specs/ 文件。
   请跳过 brainstorming checklist 中的“Write design doc”和“Invoke writing-plans”步骤。
   **额外跳过 "User approves design" gate**——brainstorming 内不单独 USER_GATE 确认方案,讨论完设计要点后直接生成 draft.md,由 step 9 的 draft 审查 USER_GATE 作为唯一确认点(避免对 draft 重复确认 2 次)。

   **交互风格：** 使用 AskUserQuestion 组件，不用纯文本 1.2.3.。
   单选用 radio，多选用 checkbox，代码方案对比用 preview。
   每次提问不超过 4 个问题，相关问题合并到一次调用。
   给出默认推荐——推荐选项在 description 中标注理由。

   **⛔ [HARD_STOP] 主题明确时简化——禁多问方向：** 用户 `/alloy-start <topic>` 带主题来时（topic 已在流程内确认）:
   - 禁给 2-3 个方向让用户选（主题已明确,不用再选方向）
   - 禁"需求已清楚,不过还有一个关键细节需要确认"式的多问
   - 直接确认设计要点（位置/行为/范围）,生成 draft
   违反字面 = 违反精神：哪怕"多问显得更仔细"、"给方向让用户选更全面",也算违反——主题明确时多问 = 浪费用户时间 = 降低体验。
   仅当用户主题模糊（如"做个工具"无具体描述）时,才给方向让用户选。
   ```

   **讨论完设计要点后,用 `write` 工具落盘 draft.md 到 `openspec/changes/<name>/draft.md`**（不是 spec 文件,也不能只在 chat 里展示文本）——brainstorming 内不单独 USER_GATE 确认方案,由 step 9 的 draft 审查 USER_GATE 作为唯一确认点。用户在讨论中提出调整时回到 brainstorming 继续。

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
   > ⛔ [HARD_STOP] **必须用 `write` 工具落盘 draft.md 到 `openspec/changes/<name>/draft.md`**——禁只把 draft 内容贴在 chat 文本里展示。Step 6 `_start finalize` 会调 `alloy _record compute draft` 算 hash,文件不存在则 exit 1 触发 PRECONDITION_FAIL。
   > 违反字面 = 违反精神:哪怕"内容已确定先展示给用户看一眼"、"finalize 时再 write",也算违反——draft.md 必须在 brainstorming 结束时落盘,Step 5 审查窗口展示的是已落盘文件的内容。

   > **交互风格恢复:** brainstorming 已结束,恢复 §交互规则(L31)——所有 USER_GATE 首次呈现即调 AskUserQuestion。Agent 刚从 brainstorming 的"每次一个问题"模式出来,容易延续纯文本习惯。

5. **生成 `draft.md` 审查窗口--start 阶段唯一确认点（brainstorming 内不单独确认方案,此处合并为 draft 锁定 USER_GATE）：**

    > 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具(AskUserQuestion/question/alloy-question)调用自动 clear 或手动 `alloy _guard user-gate pass` 降级。

    ⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

    ```bash
    alloy _guard user-gate require openspec/changes/<name> start:lock-draft
    ```

    > 制品 draft.md 已用 `write` 工具落盘(Step 4)
    > [展示 draft.md 完整内容供用户审查]

    🔴 USER_GATE（必须平台原生交互工具调用,首次呈现即调--禁先文本列选项）: 确认锁定 draft

    > ⛔ [HARD_STOP] 必须用平台原生交互工具调用--禁先文本输出"确认并继续 / 需要调整"再调工具。
    > 违反字面 = 违反精神:哪怕"先展示选项让用户思考"、"文本+工具双保险",也算违反--首次呈现必须是平台原生交互工具调用,不是文本。
    > 常见违规模式:agent 先输出"🔴 USER_GATE: 确认锁定 draft(确认并继续 / 需要调整)"文本,再等用户回复--这是纯文本呈现,违反首次呈现原则。

    选项:
    - 1. 确认并继续 -- 锁定 draft,进入 start 阶段 finalize
    - 2. 需要调整 -- 回到 brainstorming 重新讨论

    选确认 -> 步骤 10；选调整 -> 回到步骤 4 brainstorming。

6. **提交--仅用户确认锁定后,执行 start 阶段 finalize（原子命令，合并 artifact commit + checkpoint + verify + phase complete，3 次 LLM 往返 -> 1 次）：**

    > ⛔ [PRECONDITION_FAIL] `_start finalize` 前置条件(任一不满足 CLI exit 1,agent 须先修复再调):
    > 1. **lock-draft gate 已 cleared**:步骤 5 的 USER_GATE 必须已用问答工具确认(hook-guard 自动 clear)或手动 `alloy _guard user-gate pass`。若 pending_gate 仍为 `start:lock-draft`,`_phase complete` 会 exit 1 拒绝推进。
    > 2. **working tree clean**(仅 .alloy.yaml 临时状态除外):`_start finalize` 内部会 `git commit`,working tree dirty 时 checkpoint create 会失败。若有非 .alloy.yaml 文件未 commit,先 commit 或 stash。
    > 3. **phase-complete gate 未提前设置**:`start:phase-complete` gate 在 `_start finalize` 成功后才设(步骤"完成"部分),提前设会阻塞 `_phase complete` exit 1。
    >
    > 违反字面 = 违反精神:哪怕"先设 phase-complete gate 防忘"、"gate 没 clear 但 finalize 应该能跑",也算违反--gate 下沉检查是物理拦截,不 clear 就 exit 1。

    ```bash
    alloy _start finalize openspec/changes/<name>
    ```
    > `alloy _start finalize` 原子完成 4 步(任一步失败 exit 1,不继续):
    > 1. artifact commit draft(hash-lock + records + commit)
    > 2. checkpoint create --kind brainstorming(draft 锚点 tag,必须在 artifact commit 之后、phase complete 之前)
    > 3. verify phase-exit start(校验 draft + state 字段;失败 exit 1,阻止 phase complete)
    > 4. phase complete(写 completed_at + 推进到 started + commit)
    >
    > **顺序约束已内化到 CLI**:checkpoint 在 artifact commit 之后、phase complete 之前(让 tag 指向 draft commit 而非阶段完成 commit);verify && phase complete 短路保护(verify 失败时 phase complete 不执行,已内化到 CLI,无需 agent 手写 `&&`)。
    >
    > 此检查点作为 plan 阶段越界变更的回退锚点。回退到此 = 回到"draft 已锁定,准备进 plan"的状态,重新 brainstorming + 重新生成 draft。
    > 每次回退后重新生成 draft 会打 brainstorming-2/3/...,保留需求累加历史。
    > **顺序约束:必须在 `_artifact commit draft` 之后、`_phase complete start` 之前(已内化到 `alloy _start finalize`)。** 若放在 `_phase complete` 之后,tag 会指向阶段完成 commit(含 phase_timings 变更),回退后 phase_timings 状态错乱。

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
> 不要自动运行 `/alloy-plan`，不要生成 plan 阶段制品，不要调用 `opsx:continue` 或 `writing-plans`。
> 违反字面 = 违反精神：哪怕"用户上次也是接 plan 这次猜跳过 USER_GATE"或"draft 已锁定流程很顺"，也算违反 Iron Law（NO AUTO ADVANCE）。
> **"不自动进 plan"指未经 USER_GATE 确认不能进——用户在下方 USER_GATE 明确选"进入 plan"后,agent 必须直接加载 plan skill 执行,不再要求用户手动输入命令。**

> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具(AskUserQuestion/question/alloy-question)调用自动 clear 或手动 `alloy _guard user-gate pass` 降级。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require openspec/changes/<name> start:phase-complete
```

🔴 USER_GATE（必须平台原生交互工具调用）: start 阶段完成,下一步?

> ⛔ [HARD_STOP] 必须用平台原生交互工具调用——禁纯文本列选项 / 禁直接 `Skill` 加载下一阶段 / 禁纯文本"等待用户输入" / 禁提示用户手动输入命令。
> 违反字面 = 违反精神:哪怕"纯文本效果一样"、"直接 Skill 更流畅"、"用户已授权提示一下也行",也算违反——AskUserQuestion 强制结构化选项,避免 agent 用模糊措辞让用户回 yes 蒙混过关（§4.1）。
> 常见违规模式:
> - 纯文本输出"等待用户输入下一个命令"——不是 AskUserQuestion
> - 纯文本列"1. 进入 plan / 2. 暂停 / 3. 其他"让用户回复
> - 用户选 1 后提示"请运行 /alloy-plan <name>"让用户手动输入——应直接 Skill 加载
> 非 Claude Code 平台按 `alloy-shared/references/interaction-style.md` §平台工具对照 降级。

> 选项:
> - 1. 进入 plan 阶段——加载 `alloy-plan` skill 推进制品生成
> - 2. 暂停——查看状态(`alloy status`)或思考 draft 内容
> - 3. 其他——用户自定义下一步

> 用户选 1 后,agent **必须直接加载 `alloy-plan` skill(多 agent 适配,见 `alloy-shared/references/skill-loading.md`):
- Claude Code / OpenCode: 调 `skill({ name: "alloy-plan", args: "<change-name>" })`
- Pi: `read .pi/skills/alloy-plan/SKILL.md`(read 后按 SKILL.md 指引执行,change name 通过上下文传入)**

> ⛔ [HARD_STOP] 禁止输出"请运行 /alloy-xxx"让用户手动输入命令--用户已在 USER_GATE 授权,阶段转换已触发,再让用户输入命令 = 违反 Iron Law。
> 违反字面 = 违反精神:哪怕"提示一下更友好"、"用户可能想暂停",也算违反--用户要暂停会在 USER_GATE 选"暂停",选"进入"就是授权直接加载。
> 用户选 2 后,agent 停止,输出"已暂停。需要时运行 /alloy-plan <name> 继续。"
> 用户选 3 后,agent 停止,等用户后续命令。

> **§5.2.3 路径 B 边界说明：** start 是 phase 推进起点（无前序 phase），phase=started 写入失败时降级路径只有"重跑 /alloy-start"——不存在 phase 回退场景。本阶段无 §5.2.3 适用空间。

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
- 1. 进入 `<目标阶段>` 继续
- 2. 查看状态（/alloy-status）
- 3. 放弃此 change（/alloy-discard）——仅 planned/applied 阶段可选

**自动跳转仅限**：用户明确选择 1 后才加载目标命令。

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
- worktree 为 null 但 `.claude/worktrees/<name>/`(Claude Code)或 `.worktrees/<name>/`(OpenCode)存在 -> ⚠️ WARN 孤儿,询问是否修复(由 `alloy doctor` 检测,覆盖多 agent 路径;Pi 不支持 worktree,不会产生这些路径)

---

> **多活跃 change 时：** 状态检测第二步的 USER_GATE 列出所有活跃 change（名称 + phase + 制品状态）让用户选接续哪个，或选"开新 change"。

