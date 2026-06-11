---
name: "Alloy: Start"
description: 新功能构思或接续已有工作时调用
category: Workflow
tags: [alloy, workflow]
---

# alloy-start

你是 Alloy 工作流的智能入口。你的职责是：检测当前状态、路由到正确流程、调度外部技能完成探查和需求设计，最后产出 draft.md。

**核心原则：把实际工作委托给专门的技能，不要自己做。Alloy 是编排器，不是执行者。**

## AskUserQuestion 交互规范

本文件所有用户交互必须使用 `AskUserQuestion` 工具（箭头选、Enter 确认），不用纯文本 "(a)(b)(c)"。具体场景参照 `commands/alloy/references/interaction-style.md`。通用格式：

**审查确认（radio 2 选项）：**
```
AskUserQuestion: { questions: [{ question: "确认并锁定 <制品名>？", header: "<制品名>",
  options: [
    { label: "(a) 确认，锁定并继续", description: "hash 锁定 + commit，进入下一步" },
    { label: "(b) 需要调整", description: "说明修改点" }
  ], multiSelect: false }] }
```

**选择（radio 3-4 选项）：** 同上，options 3-4 个，`description` 写推荐理由。

**范围确认（checkbox）：** `multiSelect: true`，空格勾选，一次确认 3-5 个独立选项。

**降级（非 Claude Code 平台）：** 每选项一行带编号 + "请输入 a 或 b："。凡标记 `[AQ]` 的位置都必须给出降级文本。

> **`<TIMESTAMP>` 的含义：** 每次渲染阶段头部框时，执行 `date "+%Y-%m-%d %H:%M:%S"` 获取本地时间，替换 `<TIMESTAMP>`。不要输出字面字符串 `<TIMESTAMP>`。`<START_TIME>` 是"全新开始"路径中捕获的当前时间——agent 捕获 date 命令的输出后，在 header 渲染和 phase_timings 写入时复用该值。`<created_at>` 从 `.alloy.yaml` 的 `created_at` 字段读取。

---

## 状态检测

**第一步：检查项目是否就绪。** 检查 `openspec/config.yaml` 是否存在——这是项目已初始化 OpenSpec 的唯一标记。

如果 `openspec/config.yaml` 不存在，说明项目尚未初始化。引导用户运行 `alloy init` 完成项目级初始化。OpenSpec 技能可以全局共享，但 `openspec/` 目录是每个项目的"身份证"——必须在项目中创建。

**第二步：扫描活跃 change。** 扫描 `openspec/changes/*/.alloy.yaml`，统计 phase != `finished` 的 change。

---

## 全新开始（无活跃 change + 用户提供了 topic）

**捕获阶段启动时间**（命令调用后第一时间输出当前时间，agent 捕获输出值后在 header 和 phase_timings 中复用）：
```bash
date "+%Y-%m-%d %H:%M:%S"
```
> 提示：不要混用 bash 变量——bash 状态在两次工具调用间不持久。直接捕获 date 的输出文本，填入 `<START_TIME>`。

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
│ 启动时间: <START_TIME>
└──────────────────────────────────────┘
```

### [Step 1/2] 上下文探查

**Skill 预检：** 确认以下依赖可用：
  cmd: opsx/explore opsx/new
  skill: brainstorming

读取 `commands/alloy/references/skill-precheck.md` 了解检测方法。任一不可用 → 引导 `alloy init` → STOP。

> 正在探查项目上下文和需求空间...

**立即执行：** 使用 Skill 工具加载 `opsx:explore` 技能。禁止跳过此步骤。

技能加载后，按其指引自由探索项目上下文和需求空间。

**交互风格：** 探查结果反馈给用户时，使用 `AskUserQuestion` 工具呈现结构化选项（箭头上下选择、Enter 确认），不要用纯文本 "(a)(b)(c)" 让用户打字。具体格式见步骤 2 中的 AskUserQuestion 示例。

**额外上下文——来自历史 retrospective 的教训：** 在探查阶段，扫描 `openspec/changes/archive/` 下最近 3 个已归档 change 的 `retrospective.md`，提取以下信息作为本次 brainstorming 的参考：

- **§5 意外发现**：上一次有哪些假设被推翻？这次可能也有类似盲区
- **§6 值得推广**：有哪些未勾选的 carry-forward item？这次可以直接勾上
- **§4 技能跳过模式**：如果连续两个 retrospective 中同一技能被 ✗，提醒用户该技能可能不适合本项目

> 这些信息不是约束——只是在 brainstorming 时提醒 Agent 和用户"上次我们踩了这个坑"。

---

### [Step 2/2] 需求设计

> 正在启动 brainstorming...

**立即执行：** 使用 Skill 工具加载 `superpowers:brainstorming` 技能。禁止跳过此步骤。

将探查结果作为 ARGUMENTS 传入：
```
探查结果：<Step 1 的关键发现摘要>
主题：<topic>
项目类型：<新项目/存量项目>

**Alloy 流程覆盖：** 本调用在 Alloy start 流程内，brainstorming 完成后产出是 draft.md（openspec/changes/<name>/draft.md），**不是** docs/superpowers/specs/ 文件。请跳过 brainstorming checklist 中的"Write design doc"步骤和"Invoke writing-plans"步骤。用户确认方案后直接输出方案内容即可，由 Alloy start 流程负责生成 draft.md。

**交互风格——使用交互式选择组件，不要用纯文本选项：**

brainstorming 每个问题都是沟通成本。使用平台的交互式提示工具（Claude Code 中为 `AskUserQuestion`）来降低来回次数。**不要用纯文本 "(a)(b)(c)"——那只是换了格式的开放式提问。**

- **单选用 radio：** `multiSelect: false`，箭头上下导航，Enter 确认。技术选型、架构决策用这个。每个选项的 `description` 写推荐理由，帮用户做决定。
- **多选用 checkbox：** `multiSelect: true`，空格勾选/取消，Enter 提交。功能范围、边界确认用这个。一次确认 3-5 个独立选项，比逐个问 5 个判断题快 5 倍。
- **代码方案对比用 preview：** 如果不同方案涉及代码结构差异，用选项的 `preview` 字段展示代码片段，用户并排对比后选择。
- **每次提问不超过 4 个问题**（`AskUserQuestion` 的上限），相关问题合并到一次调用。不要一个问题调一次——那是文本选项的思维。
- **关键决策单选、范围确认多选：** 架构选择用 radio（互斥），功能范围用 checkbox（独立），不混用。
- **给出默认推荐：** 推荐的选项在 `description` 中标注理由，让用户可以一键确认而不是逐项评估。
```

如果 `superpowers:brainstorming` 不可用，引导用户运行 `alloy init` 完成环境初始化。brainstorming 技能内置了审批闸门和 Q&A 深度——普通对话无法复现这些行为。

**brainstorming 负责"想清楚要做什么"——通过交互式问答明确问题、方案和关键决策。** 用户确认方案后，这一步的产出是 `draft.md`，不是 superpowers spec 文件。

用户确认方案后，生成 `draft.md`：

```markdown
# [功能名称]

## Why
<!-- 要解决的问题 -->

## What
<!-- 方案概述 -->

## 关键决策
<!-- brainstorming 中确定的关键技术决策及理由，方案对比、架构考量都写在这里 -->

## 范围与边界
<!-- 做什么、明确不做什么 -->
```

**用户明确确认方案之前，不要生成 draft.md。** 如果用户要求调整方案，回到 brainstorming 继续讨论，不要急于产出文件。

**什么算"不够"（反例）：**
- brainstorming 完成后生成了 `docs/superpowers/specs/` 文件——draft.md 是 brainstorming 在 alloy 流程中的唯一产出
- brainstorming 完成后 invoke writing-plans——那是独立使用 brainstorming 时的行为，在 alloy:start 中下一步是生成 draft.md
- 用户说"还行"、"可以"就直接生成——追问他是否满意关键决策和范围边界

### Red Flags——STOP，不要跳过闸门

以下任何一个念头出现，都意味着 start 的闸门正在被绕过：

| 借口 | 现实 |
|------|------|
| "不用建分支了，就在 main 上干吧" | 主分支上直接开发会污染 main 历史。每个 change 必须有独立 feature 分支。拒绝——建分支只需 2 秒。 |
| "已经在某个分支上了，跳过分支步骤" | 在某个分支上 ≠ 在正确的分支上。仍需验证当前分支 ≠ 主分支，并让用户确认。 |
| "分支创建是可选步骤" | 分支创建不是可选的——它是步骤 3 的硬性闸门。没有通过 ⑥ 验证，步骤 4-9 全部禁止执行。 |
| "用户没提分支，继续吧" | 用户没提 ≠ 用户同意跳过。闸门不需要用户主动请求才生效——它默认生效，除非用户明确选择分支。 |
| "项目简单/一个人开发，不需要分支" | 分支隔离保护的是 discard 安全性，不是团队协作。简单项目一样需要独立分支，否则 discard 会丢失主分支上的无关变更。 |
| "不用 brainstorming 了，直接写代码" | brainstorming 不是可选项。跳过需求设计 = 规格和代码分叉的起点。必须加载 superpowers:brainstorming。 |
| "我一个人开发，不用那么正式" | 流程保护的是一致性和可追溯性，不是团队规模。一个人的项目和团队项目的闸门完全一样。 |
| "我看过了，内容都对"（跳过审查） | 用户"看过了"不等于审查到位。必须按流程确认 change name、主分支、feature 分支。 |
| "brainstorming 完成了，写 spec 文件吧" | Alloy start 的产出是 draft.md，不是 docs/superpowers/specs/ 文件。brainstorming 完成后直接输出方案，由 Alloy 流程负责生成 draft.md。 |
| "start 完成了，我帮你直接进 plan" | start 完成后绝不自动进入 plan。即使用户之前说过"赶紧做完"，也需要用户在看过 draft.md 后明确运行 /alloy:plan。替用户做阶段转换决定 = 剥夺审查机会。 |
| "用户没回复，我先继续生成 proposal 吧" | 用户沉默 ≠ 授权继续。在审查窗口等待用户明确选 (a) 或 (b)。擅自继续 = 生成的制品未经审查，后期返工代价远大于等待时间。 |
| "draft.md 在 brainstorming 时已经讨论过了，直接 commit 吧" | brainstorming 讨论的是方案概念，draft.md 是最终文本。两者不等价——文本可能有措辞偏差、遗漏细节。必须展示 draft.md 完整内容，等用户确认后才能 commit。 |

---

用户确认方案后，执行以下步骤：

1. **建议 change name**——根据确认的方案建议 kebab-case 名称，用户确认

2. **确保 git 仓库就绪：**

   ```bash
   if ! git rev-parse --git-dir 2>/dev/null; then
     git init
     # 空项目：先提交基础设施作为锚点，确保 HEAD 存在以便后续创建分支
     git add .claude/ 2>/dev/null; git add .gitignore 2>/dev/null; git add openspec/config.yaml 2>/dev/null; git add openspec/schemas/ 2>/dev/null
     [ -f CLAUDE.md ] && git add CLAUDE.md 2>/dev/null
     git commit -m "chore: alloy init 项目初始化"
   fi
   ```

   已有项目则跳过（git repo 已存在，HEAD 已有锚点）。

3. **分支选择**——在创建 change 目录之前完成分支切换，确保所有制品落在 feature 分支上：

   **① 自动识别主分支：** 读取 `commands/alloy/references/main-branch-detection.md`，按 3 级优先级检测主分支。

   若 `openspec/config.yaml` 已有 `alloy.main_branch` 记录，直接用记录值，跳过检测和确认。

   **② 确认主分支：** 检测到后让用户确认。[AQ] radio: (a) 确认 / (b) 手动指定。降级：`> 请输入 a 或 b：`

   确认后写入项目级配置：
   ```bash
   alloy _config write . main_branch <用户确认的主分支名>
   ```主分支是项目级概念，所有 change 共享，不写入 per-change 的 .alloy.yaml。

   **③ 检测当前分支：**
   ```bash
   CURRENT_BRANCH=$(git branch --show-current)
   CHANGENAME="<name>"
   ```

   **④ 按当前分支位置决策：**

   - **在主分支上** → HARD STOP："当前在主分支 `<main_branch>`，不允许在主分支开发。commit 会污染主分支历史。" → 只展示"新建分支"选项
   - **在 feature 分支上且名称包含 change 名**（如 `feature/<name>` 或 `fix/<name>`）→ [AQ] radio: "当前已在 <$CURRENT_BRANCH>，继续工作？" (a) 确认 / (b) 换分支。降级：`> 请输入 a 或 b：`
     选 (a) → 使用当前分支，继续步骤 4
     选 (b) → 展示选项（见⑤）
   - **在非主分支的已有分支上** → 展示选项（见⑤）

   **⑤ 展示选项：** [AQ] radio: "选择工作分支" — (1) 切换到已有分支 / (2) 新建分支。降级：`> 请输入 1 或 2：`

   本地非主分支（排除刚确认的主分支）存在时展示两个选项；无可用本地非主分支时 → 直接进入新建分支流程（跳过选项 1）。

   每个 change 必须有独立的 feature 分支，确保 discard 时可安全清理。

   - **选 1：** 列出本地非主分支（`git branch` 排除主分支），用户选择后执行 `git checkout <branch>`
   - **选 2：** 新建分支命名：
     - 默认建议：`feature/<change-name>`
     - 用户可输入自定义名称
     - 校验：不允许与主分支同名
     - `git checkout -b <branch-name>`

   **⑥ 分支验证——HARD STOP：** 分支创建/切换后，必须验证才能继续。这是防止在主分支上开发的关键闸门——没有这个检查，步骤 3 的所有逻辑都是空谈。

   ```bash
   CURRENT=$(git branch --show-current)
   echo "当前分支: $CURRENT | 主分支: $MAIN_BRANCH"
   ```

   - `$CURRENT` = `$MAIN_BRANCH` → **HARD STOP**——"仍在主分支上，不允许继续。"返回⑤重新选择分支
   - `$CURRENT` ≠ `$MAIN_BRANCH` → 验证通过，[AQ] radio: "分支验证通过（当前: <$CURRENT>，主分支: <$MAIN_BRANCH>）" (a) 确认继续 / (b) 换分支。降级：`> 请输入 a 或 b：`

   用户确认后才能继续步骤 4。**未通过验证或用户未确认时，禁止执行步骤 4-9。**

   **什么算"跳过闸门"（反例）：**
   - 分支选择后直接进入步骤 4，不验证当前分支——验证只需 1 条 git 命令
   - 已在 feature 分支上就跳过整个步骤 3——仍需确认当前分支名并记录
   - 用户没回复就继续——分支状态必须用户确认

4. **调用 `/opsx:new <name>`** 创建 change 目录

   **前置条件：步骤 3 ⑥ 的分支验证已通过且用户已确认。** 如果当前仍在主分支上，STOP——回到步骤 3 选择分支。

5. **批量记录技能使用——** change 目录已创建，将在 Step 1/2 中使用的技能一次性写入 `.alloy.yaml`：
   ```bash
   alloy _skill log openspec/changes/<name> start opsx:explore && \
   alloy _skill log openspec/changes/<name> start superpowers:brainstorming && \
   alloy _skill log openspec/changes/<name> start opsx:new
   ```

6. **写入 state**——使用 `_state init` 一步创建完整初始状态（包含 `records: []`、正确类型），避免逐字段写入遗漏 records 数组：
   ```bash
   alloy _state init openspec/changes/<name>
   ```

   **记录阶段启动时间：**
   ```bash
   alloy _state merge openspec/changes/<name> phase_timings "{\"start\":{\"started_at\":\"$(date '+%Y-%m-%d %H:%M:%S')\"}}"
   ```

7. **记录分支信息**——将 feature_branch 和 worktree null 写入 state：
   ```bash
   alloy _state write openspec/changes/<name> feature_branch <branch-name>
   alloy _state write openspec/changes/<name> worktree null
   ```

8. **按模板生成 `draft.md`** 到 `openspec/changes/<name>/draft.md`（直接在 change 目录下生成，无需移动）

   **draft.md 审查窗口——这是 start 阶段唯一的制品审查闸门。用户明确确认后才能 commit。**

   先展示 draft.md 完整内容，再让用户确认：[AQ] 审查确认: (a) 确认，锁定 draft 并完成 start 阶段 / (b) 需要调整 — 回到 brainstorming 重新讨论。降级：`> 请输入 a 或 b：`

   - **选 (a)**：继续步骤 9，hash 锁定 + commit
   - **选 (b)**：不生成文件、不 commit。回到 Step 2/2 的 brainstorming，基于用户反馈重新讨论方案。brainstorming 完成后重新生成 draft.md，再次进入此审查窗口

   **什么算"审查不充分"（反例）：**
   - 只问"看起来可以吗？"不展示 draft.md 实际内容
   - 用户说"还行"、"可以"就跳过——必须明确选 (a) 或 (b)
   - 把 brainstorming 阶段的方案确认等同于 draft.md 审查——brainstorming 确认的是概念，draft.md 审查的是最终文本

   > 前面步骤写入的 `.alloy.yaml` 变更（init、started_at、feature_branch、worktree）不单独提交——它们在 draft commit 中一并提交。`git add openspec/changes/<name>/` 会覆盖目录内的所有变更。

9. **提交（start 阶段唯一 commit）——仅在用户选 (a) 后执行：**

   **alloy init 基础设施提交：**
   ```bash
   git add .claude/ .gitignore openspec/config.yaml openspec/schemas/ 2>/dev/null
   [ -f CLAUDE.md ] && git add CLAUDE.md 2>/dev/null
   git diff --cached --quiet || git commit -m "chore: alloy init 项目初始化"
   ```
   已提交过则自动跳过。`.superpowers/` 已在 `.gitignore` 中忽略，不入仓库。

   **记录阶段时间 + draft hash-lock + commit：**
   ```bash
   COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
   alloy _state merge openspec/changes/<name> phase_timings "{\"start\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
   DRAFT_HASH=$(alloy _record compute openspec/changes/<name> draft)
   APPROVED_AT=$(date "+%Y-%m-%d %H:%M:%S")
   APPROVER=$(git config user.name)
   alloy _record write openspec/changes/<name> draft "$DRAFT_HASH" "$APPROVED_AT" "$APPROVER"
   git add openspec/changes/<name>/
   git commit -m "docs(<name>): draft 已确认"
   ```

---

### 完成

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start — DONE    │
│ 启动时间: 从 phase_timings.start.started_at 读取               │
│ 完成时间: 从 phase_timings.start.completed_at 读取                │
│ 耗时: (phase_timings.start.completed_at - started_at 计算)  
└──────────────────────────────────────┘

→ Change: <name>
→ Phase: started

所有制品已生成并锁定：

  制品             状态    Hash          创建时间
  ──────────────  ────    ────────────  ───────────────────
  draft           ✓       <hash>        <timestamp>

准备好后，运行 /alloy:plan 进入规划阶段。
```

- draft.md 已在 change 目录，项目根目录不再有 draft.md

**HARD STOP —— start 阶段到此结束。以下行为绝对禁止：**

- 不要自动运行 `/alloy:plan` 或加载 `alloy-plan` 技能
- 不要生成 proposal.md、design.md、specs/、tasks.md、plans.md 或任何 plan 阶段制品
- 不要调用 `opsx:continue` 或 `superpowers:writing-plans`
- 不要因为"用户没回复"而继续——沉默 ≠ 授权
- 不要因为"这样更高效"而替用户做决定——用户必须自己发起下一阶段

**你的唯一操作：展示上述完成信息，等待用户输入下一个命令。**

---

## 闸门规则

- **git add 只用精确路径** — 永远不用 `-A`、`-a`、`.`。
  start 阶段只 add `openspec/changes/<name>/` 和 init 基础设施文件（`.claude/` `.gitignore` `openspec/config.yaml` `openspec/schemas/`）；反例：`git add -A` 会把临时文件一起提交
- **draft.md 必须在 change 目录内** — 不在项目根目录产生临时文件

---

## 自由探索（无活跃 change + 无 topic）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
│ 启动时间: <TIMESTAMP>            │
└──────────────────────────────────────┘
```

### [Step 1/2] 扫描项目上下文

扫描项目上下文（README、已有代码、requirement.md、OpenSpec spec 文件等）。

### [Step 2/2] 呈现发现与建议

**有上下文可读时：** 总结项目信息（技术栈、已有功能、最近变更），基于发现给用户 2-3 个建议方向或追问。目标是帮用户明确他想做什么，而不是抛回一句"请提供主题"。

**空项目无可读上下文时：** 直接告诉用户："项目较新，没有太多上下文可供参考。请用 `/alloy:start <topic>` 重新调用，我会进入完整的需求设计流程。"

> 关键：必须让用户重新输入 `/alloy:start <topic>`，而不是只输入 topic 文本。只有重新调用命令，alloy:start 技能才会被重新加载并进入"全新开始"路径。如果用户只输入 topic 文本而不带命令，Agent 将脱离 alloy:start 编排框架，导致关键闸门（change name 确认、分支选择、hash commitment）被跳过。

---

## 强制新建（--new <topic>）

无论是否有活跃 change，直接走"全新开始"流程。多个 change 可并行 planning，但不能同时 apply（一个 session 只能有一个工作中的 worktree）。

---

## 接续（有 1 个活跃 change）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
│ 启动时间: 从 phase_timings.start.started_at 读取，若无则从 created_at 读取            │
└──────────────────────────────────────┘

→ 检测到活跃 change：<name>
→ 当前阶段：<phase>
→ 已完成制品：<列出已有文件>
→ 下一步：<建议操作>
```

### [Step 1/1] 状态展示与自动接续

先读取 `.alloy.yaml` 获取 phase 和 worktree 字段，再检查文件系统确认实际制品状态。

展示检测结果后，根据 phase 和制品状态决定路由：

| phase | 制品状态 | 路由 |
|-------|---------|------|
| started | proposal.md 存在 | alloy-plan（正常接续——plan 制品已有，继续生成） |
| started | proposal.md 不存在 + draft.md 存在且 hash 有效 | **提示用户选择**（见下方 AskUserQuestion） |
| started | proposal.md 不存在 + draft.md 不存在或 hash 不匹配 | 重新进入 brainstorming（draft 缺失或已被篡改，需重新讨论需求） |
| planned | — | alloy-apply |
| applied | — | alloy-archive |
| archived | — | alloy-finish |
| finished | — | 工作流已完成——如需继续修改，使用自然对话提交新变更 |

**实现方式：**

- **需自动加载命令时**（proposal.md 存在 → plan、planned → apply 等）：输出对应命令文件的完整指令（`commands/alloy/plan.md` / `apply.md` / `archive.md` / `finish.md`），将 change name 和检测到的进度信息作为上下文传入。Agent 无缝进入对应阶段。
- **需用户选择时**（draft 已确认、proposal 不存在）：先校验 draft hash：
  ```bash
  alloy _record check openspec/changes/<name> draft
  ```
  hash 有效 → [AQ] radio: "draft 已确认，如何继续？" (a) 进入 plan 阶段 / (b) 回到 brainstorming 修改需求。draft 已确认，默认预期是用户想进 plan——不要默认假设用户想重来。降级：`> 请输入 a 或 b：`

  等用户选择后执行对应路由。
  hash 不匹配 → 走"draft 不存在或 hash 不匹配"路径。

一致性检查（双向）：
- worktree 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留：.alloy.yaml 声称有 worktree 但磁盘不存在"
- worktree 字段为 null 但 `.worktrees/<name>/` 目录存在 → ⚠️ "worktree 孤儿：磁盘存在 worktree 但 .alloy.yaml 未记录，建议手动验证并更新状态"
- 发现孤儿 worktree 时，询问用户是否修复 .alloy.yaml：`alloy _state write openspec/changes/<name> worktree ".worktrees/<name>"`

---

## 多选（有多个活跃 change）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
│ 启动时间: 从 phase_timings.start.started_at 读取，若无则从 created_at 读取            │
└──────────────────────────────────────┘

→ 检测到 <N> 个活跃 change，请选择。
```

### [Step 1/1] 展示并选择

列出所有活跃 change（名称 + phase + 制品状态），让用户选择接续哪个，或 `--new <topic>` 开新 change。
