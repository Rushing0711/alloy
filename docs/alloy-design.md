# Alloy 设计文档

> **目标读者：** 人类开发者 + AI Agent
> **职责：** Alloy 完整产品规格——这是 Alloy 的"真相源"。Alloy 是什么、怎么用、为什么这样设计，都以本文档为准。
> **不放入：** 构建/测试命令 → 见 [alloy-dev-guide.md](alloy-dev-guide.md)；Skill 编写经验 → 见 [skill-writing-guide.md](skill-writing-guide.md)；设计推导过程 → 见 [workflow-design.md](workflow-design.md)；开发背景 → 见 [project-background.md](project-background.md)。

Alloy 是一套融合 OpenSpec 和 Superpowers 的开发工作流工具。入口在 AI Agent 内部（Claude Code、Cursor 等），CLI 辅助初始化和诊断。

---

## 一、命令参考

### CLI 命令（终端执行）

| 命令 | 参数 | 说明 |
|------|------|------|
| `alloy init` | `[path]` | 项目初始化：检测环境 → 安装依赖 → openspec init → 部署 schema + skill |
| | `--inject-claude-md` | 注入 CLAUDE.md（默认关闭） |
| | `--scope <global\|project>` | 安装范围，默认 project |
| `alloy status` | `[path]` | 查看所有活跃 change 总览 |
| | `--json` | JSON 格式输出 |
| `alloy doctor` | `[path]` | 诊断：版本兼容性、文件一致性 |
| | `--json` | JSON 格式输出 |
| `alloy update` | `[path]` | 更新 Alloy skill 文件到最新版 |
| `alloy completion` | `[bash\|zsh\|pwsh] [--install]` | 生成 shell 补全脚本，--install 自动注册 |
| `alloy --version` | | 版本号 |
| `alloy --help` | | 帮助 |

### Slash Command（Agent 内部执行）

| 命令 | 参数 | 说明 |
|------|------|------|
| `/alloy:start` | `[topic]` | 智能入口：自动检测状态，接续或新建 |
| `/alloy:plan` | `[name]` | 制品生成设计文档，始终分步，每步可审查 |
| `/alloy:apply` | `[name]` | 执行：隔离 workspace → SDD → 代码验证 → 制品验证 → 复盘 |
| `/alloy:archive` | `[name]` | 归档：sync delta spec → 合并主 spec → 移入 archive/ |
| `/alloy:finish` | `[name]` | 收尾：代码合入 + 现场清理（merge / PR / keep） |
| `/alloy:fix` | — | Bug 修复入口：诊断 → 分流（apply 为分水岭） |
| `/alloy:discard` | `[name]` | 放弃当前 change，清理 worktree + 分支 + 目录 |
| `/alloy:status` | `[name]` | 查看指定 change 的阶段、制品状态、下一步 |

带 `[name]` 的命令省略时从当前活跃 change 的上下文推断。

**上下文推断：** 扫描 `openspec/changes/*/.alloy.yaml` → 仅 1 个活跃 change 自动选中 → 多个则提示选择 → 无活跃 change 报错，提示先 `alloy start`。

---

## 二、命令行为

### alloy start

```
/alloy:start [topic]

状态检测:
  → 检查 openspec/config.yaml 是否存在（项目就绪标记）
  → 不存在则引导运行 alloy init
  → 扫描 openspec/changes/*/.alloy.yaml（活跃 change）

无活跃 change + 有 topic:
  → 全新开始: explore + brainstorming → draft.md（唯一产出，包含 Why/What/关键决策/范围边界）
  → brainstorming 的详细设计论述写入 draft.md"关键决策"章节，不单独产出 superpowers spec 文件
  → brainstorming 确认后，调用 /opsx:new 创建 change，将 draft.md 移入 change 目录
  → 写入 .alloy.yaml（phase=started），hash+commit（draft.md + .alloy.yaml）
  → draft.md 存放在 change 目录内（openspec/changes/<name>/draft.md），非项目根目录

无活跃 change + 无 topic:
  → Agent 扫描项目上下文（README、requirement.md、已有代码等）
    ├── 有上下文 → 基于项目信息引导，提出建议方向或追问
    └── 空项目无可读上下文 → "请提供主题: alloy start <topic>"

有 1 个活跃 change:
  → 自动接续，从 phase 断点继续

有多个活跃 change:
  → 列出所有活跃 change，用户选择接续哪个

--new <topic>:
  → 无论是否有活跃 change，直接开始新 change 流程
  → 多个 change 可并行 planning，但不能同时 apply（一个 session 只能有一个工作中的 worktree）
```

### alloy plan

```
/alloy:plan [name]（省略时从当前活跃 change 推断）

前置检查: change 目录存在且 .alloy.yaml phase=started（/alloy:start 已完成）

若指定 name 但 change 不存在:
  → ⚠️ "未找到 change '<name>'，请先运行 /alloy:start <topic> 创建"

若有活跃 change 但 draft.md 缺失:
  → ⚠️ 提示异常，引导重新运行 /alloy:start

流程:
  1. 确认 change 已存在 → 读取 .alloy.yaml 确认 phase=started
     （无需创建 change —— /alloy:start 已完成这一步）
  2. 调用 /opsx:continue → 利用 schema DAG 按依赖顺序制品生成
制品生成: proposal → design → specs → tasks（/opsx:continue 停在 tasks）
  3. 调用 superpowers:writing-plans → 基于 tasks 生成 plans.md
每步生成后有审查窗口，可确认或要求修改
始终分步，不提供一键生成

审查期间可沟通调整上游制品（如"把 proposal 第 3 点改一下"），
Agent 根据 DAG 依赖自动识别下游制品过期并重做。
plan 完成后不允许手动修改制品文件，变更需通过对话驱动。

**plans.md 定位：** 执行脚本，非规格文档。tasks.md 是"做什么"的清单（给人确认），
plans.md 是"怎么做"的剧本（给 Agent 执行，2-5 分钟微步骤粒度，可含代码片段）。
规格（specs/）是行为契约，plans.md 是执行路线图，两者不可混淆。

**制品生成时禁止打印 instructions。** 审查窗口只展示制品内容本身，不展示 OpenSpec schema 的
instructions 模板——instructions 是给 Agent 的内部指引，不是给用户审查的输出。

**一个制品，一次提交：** 每个制品审查通过后，立即 hash-lock 并单独 git commit（而非等所有制品完成后一次性提交）。records 记录每个制品的 commit hash，确保 apply 阶段 worktree 创建时所有制品可被带入。全部提交完成后，通过 guard 校验推进 phase。
phase → planned
```

### alloy apply

```
/alloy:apply [name]（省略时从当前活跃 change 推断）

前置检查（3 项）:
  1. plans.md 存在
  2. alloy-guard.sh 确认 phase = planned
  3. git 仓库检测 — 不是仓库时，展示选项让用户选择立即初始化还是稍后自行处理（有感决策，不静默 init）

技能预检（5 个 Superpowers 技能可用性，缺一 STOP）

执行步骤（共 5 步，验证失败回到 Step 2 修复）:
  1. superpowers:using-git-worktrees → 隔离环境设置。
     技能内置询问环节，用户可选择创建 worktree 或在当前目录直接工作。
     Agent 不重复建造选择闸门。结果写入 .alloy.yaml（worktree 路径或 null）。
  2. 任务实现。Agent 从 plans.md header 读取执行策略（SDD 并行 vs 串行），作为推荐方案展示给用户确认。
     用户可选择 SDD（并行子 agent）或串行执行。用户选择后加载对应技能按内部指引执行。
  3. superpowers:verification-before-completion → 代码层验证（测试通过、行为正确）
  4. /opsx:verify → 制品层验证（7 项结构化检查 → verify.md）。
     CLI 输出语言不由 Agent 控制，Agent 必须将 verify.md 重写为与指令/模板一致的语言。
  5. 纯 AI 生成 → retrospective.md（全周期复盘，§0-§6）。
     §0 量化全景：三来源自动收集——.alloy.yaml records（制品审批链）+ git log（全分支按 type/阶段分组）+ 文件系统（任务完成比、变更规模、测试覆盖信号）。
     §4 全周期技能审计：Agent 自报 start/plan/apply 三阶段 11 项技能/命令使用情况。同一 session 亲历，无需推断。
     输出语言与指令/模板上下文保持一致，代码标识符和 commit hash 保持原始语言。

验证通过后，verify.md 和 retrospective.md 各自 hash-lock + 单独 git commit，再通过 guard 校验。
phase → applied
```

### alloy archive

```
/alloy:archive [name]（省略时从当前活跃 change 推断）

前置检查（硬拒绝）: phase = applied + verify.md 存在且 Overall Decision 不是 FAIL

执行:
  1. /opsx:archive → sync delta spec + 归档到 archive/YYYY-MM-DD-<name>/
  2. 跨周期反馈：读取 retrospective.md §6 Promote Candidates，将 Promote to: memory 的条目写入 ~/.claude/memory/，让教训进入后续 session
  3. git add + git commit → 提交归档变更（delta spec 合并 + 归档移动）
  4. phase → archived

archive 只做 spec 归档和归档提交，不涉及代码合并。代码合入由 /alloy:finish 完成。
```

### alloy finish

```
/alloy:finish [name]（省略时从当前活跃 change 推断）

独立命令，两种使用场景：
  1. /alloy:archive 完成后 → 代码合入与现场清理
  2. 手动调用 → archive 时选了 keep，后续想 merge / PR

前置检查: phase = archived（spec 已归档）

执行: superpowers:finishing-a-development-branch
  → 3 选项:
      1. 本地 merge → phase → finished，完成
      2. 创建 PR    → phase → finished，"PR 已创建，等待审查"
      3. 保持分支   → phase 保持 archived，"分支已保留"

finish 纯做代码收尾，不涉及 spec 变更。若 PR 审查引出 spec 级修改，应走新 change。

选 PR 后，审查反馈通过自然对话处理，Agent 内部遵循
superpowers:receiving-code-review 行为规范（验证优先、不盲从、技术推理）。
```

### alloy fix

```
/alloy:fix

1. 环境感知：
   ├── 在 worktree 内 → "当前在 worktree <path>，在此修复并提交"
   └── 不在 worktree → "在当前分支 <branch> 修复并提交"
   （告知用户操作位置，不自动跳转）

2. superpowers:systematic-debugging → 根因定位

3. 分流：

   不改 spec（实现偏离现有 spec）:
     → TDD 修复 → verification-before-completion → 直接 PR

   需改 spec（spec 需新增或修正）:
     ├── 有活跃 change 且 phase < applied（无代码落地）
     │     → "spec 变更可并入当前 change <name>。回到 /alloy:plan 更新制品。"
     │     → 无需开新 change
     │
     └── 无活跃 change 或 phase ≥ applied（已有代码落地）
           → "修复需要变更 spec。开新 change: /alloy:start <建议名称>"
           → 不自动创建（让用户感知后手动发起）
```

### alloy discard

```
/alloy:discard [name]（省略时从当前活跃 change 推断）

phase 行为：
  ├── started / planned         → 仅删 change 目录（无 worktree / 分支）
  ├── applied / archived        → 删 change 目录 + worktree + 分支
  └── finished                  → [HARD STOP] 不可 discard

确认提示: "将删除以下内容，不可恢复:
  - Change: <name>
  - Worktree: <path>（如有）
  - Branch: <name>（如有）
  - 目录: <change dir>
  输入 'discard <name>' 确认"

确认后清理:
  1. git worktree remove <path> --force（如存在）
  2. git branch -D <name>（如存在且未合并）
  3. rm -rf openspec/changes/<name>/
```

### alloy status

```
/alloy:status [name]（省略时显示所有活跃 change 总览）

输出指定 change 详情:
  阶段:    planned
  Change:  login-feature
  路径:    openspec/changes/login-feature/
  制品状态: draft ✓  proposal ✓  design ✗  specs ✗  tasks ✗  plans ✗
  下一步:  继续 alloy plan，等待 design 生成

worktree 一致性检查（worktree 残留/孤儿/git worktree list 孤立）由 alloy doctor 统一诊断。
```

### alloy doctor

```
alloy doctor [path] [--json]

诊断内容:
  1. 版本兼容性（7 项健康检查）:
     Node.js / OpenSpec / Superpowers / Alloy / Schema / Commands / Environment
     每项返回 pass / warn / fail，依据 compat.yaml 中的版本约束判断

  2. 文件一致性（双向检查）:
     ├── worktree 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留"
     ├── worktree 字段为 null 但 .worktrees/<name>/ 目录存在 → ⚠️ "worktree 孤儿"（状态写入缺失）
     └── git worktree list 中有孤立 worktree → ⚠️ 提示清理

--json: 以 JSON 格式输出 healthResults + consistencyWarnings
```

---

## 三、终端输出视觉规范

Alloy 的 Slash Command 在终端输出进度提示时，遵循统一的编号和视觉体系。写技能时参考此规范。

### 三层编号

| 层级 | 标签格式 | 示例 | 视觉处理 |
|------|---------|------|---------|
| Phase（阶段） | `Alloy [N/5] · Phase: Name` | `Alloy [2/5] · Phase: Plan` | Unicode 框线框住，粗体，宽度 38 字符 |
| Step（步骤） | `[Step N/M]` + 下划线 | `[Step 2/3] 制品生成` | 黄色下划线，与 Phase 框同宽（38 字符） |
| Artifact（制品） | `制品 [N/M] <name> ✓` | `制品 [3/5] specs ✓ 完成` | `>` 块引用底色 + 粗体 |

### 状态标签

| 标签 | 颜色 | 含义 | 使用场景 |
|------|------|------|---------|
| `[PASS]` | 绿色 | 检查通过 | guard 脚本校验、前置检查 |
| `[FAIL]` | 红色 | 检查失败 | 阻断性问题 |
| `[HALT]` | 红色 | 硬阻断 | phase 不合法、制品缺失 |
| `[WARN]` | 黄色 | 警告 | 非致命提醒（网络不可达等） |
| `[DONE]` | 绿色 | 阶段结束 | Phase 完成标题 |

### 模板示例

**Phase 入口：**
```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan            │
└──────────────────────────────────────┘
```

**Step 标题：**
```
[Step 2/3] 制品生成
──────────────────────────────────────
```

**Artifact 审查窗口（块引用底色）：**
```
> 制品 [3/5] specs ✓ 完成
>
> [展示制品完整内容]
>
> → 下一个：tasks（依赖 specs + design）
> → (a) 确认  (b) 调整
```

**Phase 完成：**
```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan — DONE     │
└──────────────────────────────────────┘
```

### Phase 入口模板（统一宽度 38 字符）

| Phase | 框内文本 |
|-------|---------|
| Start | `Alloy [1/5] · Phase: Start` |
| Plan | `Alloy [2/5] · Phase: Plan` |
| Apply | `Alloy [3/5] · Phase: Apply` |
| Archive | `Alloy [4/5] · Phase: Archive` |
| Finish | `Alloy [5/5] · Phase: Finish` |

### 使用原则

- **Phase 框** 仅在阶段入口和完成时输出，不在中间步骤重复
- **Step 下划线** 每进入新步骤时输出
- **Artifact 块引用** 用于制品的审查窗口和交互节点
- 颜色通过 ANSI 转义码输出，与 Comet 的绿色/红色/黄色约定保持一致

---

## 四、状态文件

每个 change 目录内包含 `.alloy.yaml`，CLI 和 Agent 读写，用户通过 `/alloy:status` 查看：

```yaml
# openspec/changes/<name>/.alloy.yaml
phase: started | planned | applied | archived | finished
worktree: null | ".worktrees/<name>"
schema_version: 1
created_at: "2026-05-28T09:00:00"
updated_at: "2026-05-28T15:30:00"
records:
  - artifact: proposal
    hash: "abc123"
    committed_at: "2026-05-28T09:15:00"
    approver: "human"
  - artifact: design
    hash: "def456"
    committed_at: "2026-05-28T09:30:00"
    approver: "human"
```

| 字段 | 读写 | 含义 |
|------|------|------|
| `phase` | CLI + Agent | 当前阶段，决定 `/alloy:start` 的恢复路径 |
| `worktree` | apply 阶段写入 | null=未创建；有值=apply 已开始，恢复时跳过创建 |
| `schema_version` | alloy init 写入 | 格式演进时用于兼容解析 |
| `created_at` | alloy start 写入 | change 创建时间 |
| `updated_at` | phase 变更时写入 | 最后状态变更时间，调试和排序用 |
| `records` | plan/apply 阶段写入 | 每个制品提交后的 hash 记录，格式 `ArtifactRecord[]`，含 artifact/hash/committed_at/approver |

断点恢复：`/alloy:start` 检测到活跃 change → 读 phase + worktree + 文件系统 → 自动从断点继续。不设子步骤状态——Agent 通过检查文件存在性自判断。

### 阶段闸门检查规则

`alloy-guard.sh` 在每个阶段转换时进行硬校验。只验证 phase 转换合法性不管制品完整性，会导致制品缺失在下阶段才暴露（如 started→planned 缺 specs 却成功推进，apply 阶段才发现——错误发生在 plan 阶段）。

**每个转换的必检清单（以 schema DAG 为准）：**

| 转换 | 必检制品 | 说明 |
|------|---------|------|
| started → planned | proposal, design, specs/, tasks, plans | plan 阶段 5 个产出全部存在 |
| planned → applied | plans | 执行依赖 plans.md |
| applied → archived | verify | 归档依赖 verify.md |
| archived → finished | — | 仅校验 phase 转换合法性 |

**设计原则：** "不设子步骤状态"指不追踪每个制品的生成进度（用文件存在性自判断），但阶段闸门必须用 DAG 产出清单做完整性验证。两者不矛盾——前者是状态粒度，后者是防火墙。

---

## 五、制品依赖 DAG

```
Pre-OpenSpec:
  draft.md ← explore + brainstorming 产出

Schema DAG（8 个制品）:
  proposal  ← 读 draft.md
    ├──→ specs     ← 依赖 proposal（不读 draft，防止行为 spec 被技术细节污染）
    │      └──→ tasks   ← 依赖 specs + design
    │            └──→ plans   ← 依赖 tasks（由 superpowers:writing-plans 生成，独立步骤）
    │                  └──→ verify     ← 依赖 plans（apply 阶段产出）
    │                        └──→ retrospective ← 依赖 verify（apply 阶段产出）
    │
    └──→ design   ← 依赖 proposal（读 draft.md，受 proposal 范围约束）

Apply:
  apply  ← 依赖 plans
    ├── precheck      ← git 仓库检测（有感选择）+ 5 个 Superpowers 技能可用性检查
    ├── 隔离环境设置   ← 隐含 superpowers:using-git-worktrees（用户可选，非强制）
    ├── 任务实现       ← 用户选择执行策略:
    │                      superpowers:subagent-driven-development（并行，任务独立时）
    │                      or superpowers:executing-plans（串行，任务耦合时）
    │                      （SDD 内部含 TDD + code-review）
    ├── 代码层验证     ← superpowers:verification-before-completion
    ├── 制品层验证     ← /opsx:verify → verify.md（7 项结构化检查）
    ├── 复盘          → retrospective.md（全周期审计，§0 量化全景 + §4 三阶段技能审计 + §1-§6 定性）
    ├── git commit    ← verify.md hash-locked + 单独提交
    └── 复盘提交       ← retrospective.md hash-locked + 单独提交，再通过 guard 校验更新 phase

所有制品存放于 openspec/changes/<name>/ 目录内，不需外部指针。
```

### Schema

Alloy schema 从零构建，参考 `superpowers-bridge`（社区 schema）和 Comet，修正其已知问题：

| 项目 | superpowers-bridge | Alloy |
|------|-------------------|-------|
| schema 名 | `superpowers-bridge` | `alloy` |
| 制品数 | 8 个 | 8 个（draft/proposal/design/specs/tasks/plans/verify/retrospective） |
| 首个制品 | `brainstorm.md`（在 change 目录内） | `draft.md`（start 阶段创建 change 后移入 change 目录） |
| DAG 时序 | verify/retro 在 DAG 中但 apply 后才产出（已承认的设计问题） | verify/retro 在 DAG 中，依赖 plans/verify，apply 阶段产出 |
| apply 范围 | 含 archive + PR | 仅到 retrospective（archive + finish 为收尾阶段） |
| 指令存放 | 内联在 schema.yaml | 独立 `instructions/*.md` 文件 |
| 构建方式 | — | 从零构建，保留完全掌控力 |

`alloy init` 部署时从零创建 schema → 写入 `openspec/config.yaml`（`schema: alloy`）。

#### Schema 校验

OpenSpec 在加载 schema.yaml 时进行严格格式校验，字段不合法会阻断 `/opsx:new` 和 `openspec status`。

**校验规则（来自实际踩坑）：**

| 字段 | 要求 | 错误示例 |
|------|------|---------|
| `version` | number，非 string | `"1"` → 应为 `1` |
| `artifacts[].description` | 必填 string | 缺少此字段 |
| `apply.requires` | 必填 array，至少 1 项 | 缺少此字段 |

**修改 schema 后的验证命令：**

```bash
# 方式 1：列出 schema，加载失败即 schema 不合法
openspec schemas

# 方式 2：通过现有 change 加载 schema 验证
openspec status --change <change-name>
```

两种方式都会加载并校验 schema.yaml，任一失败则 schema 不合法。推荐修改 schema 后立即运行 `openspec schemas` 验证。

### 平台兼容

v1 仅支持 Claude Code。团队统一使用 Claude Code，聚焦质量而非覆盖面。后续版本视需求扩展其他平台。

### 扩展点

v1 在关键节点给出提示，不调用外部技能（可靠性优先）。后续版本升级为可配置的 HARD GATE 闸门。

**start 阶段完成后：**
```
draft.md 已完成。
💡 建议：可以用 grill-me 对需求进行深入拷问，确认后再进入 plan。
```

**apply 完成后、archive 之前：**
```
retrospective.md 已生成，所有变更已提交。
💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 archive。
```

---

## 六、架构

```
用户输入 /alloy-*
       │
       ▼
  SKILL.md（Agent 内执行）
  ├── 阶段检测（读 .alloy.yaml + 文件系统）
  ├── 流程编排（按 phase 分发到对应子步骤）
  ├── 审查窗口（制品确认）
  └── 调用 OpenSpec CLI + Superpowers skill
       │
       ▼
  大模型（内容层）
  ├── 写文档（proposal / design / specs / tasks / plans / retrospective）
  ├── 写代码（subagent 优先，无 subagent 时降级为直接执行）
  └── 交互（explore Q&A / brainstorming 设计审批）
```

```
CLI（终端）
  alloy init / status / doctor / update
  ├── 确定性强（TypeScript 逻辑）
  ├── 安装依赖（OpenSpec CLI + Superpowers skill）
  ├── 部署文件（schema + skill）
  ├── 诊断（版本兼容性 + 文件一致性）
  └── 内部命令（_state / _guard / _record / _archive）供 Agent 调用
```

| 层 | 在哪运行 | 内容 | 可靠性 |
|----|---------|------|--------|
| CLI | 终端 | 安装、诊断、状态总览、内部命令（_state/_guard/_record/_archive） | 确定性强（TypeScript） |
| Skill | Agent 内部 | 流程编排、阶段检测、审查窗口 | 硬约束（SKILL.md 指令 + CLI 内部命令） |
| AI 内容 | Agent 内部 | 文档生成、代码生成、交互决策 | 柔性（AI 发挥，人类审查） |

核心工作流（start / plan / apply / finish / archive / fix / discard）全部在 Agent 内以 slash command 运行。CLI 只做辅助——安装、诊断、查看状态总览。

---

## 七、安装与初始化

### compat.yaml

随 Alloy npm 包发布，不暴露到用户项目。定义兼容范围（doctor 诊断用）和安装版本（init 安装用）：

```yaml
# Alloy 包内置
compatible:
  node: ">=18.0.0"
  openspec: ">=1.3.0 <2.0.0"
  superpowers: ">=5.0.0 <6.0.0"
  alloy: ">=0.1.0"
  schema: 1

install:
  openspec: "@fission-ai/openspec@1"
  superpowers: "obra/superpowers@5"
```

- `compatible` — `alloy doctor` 诊断用，超出范围警告但不阻断
- `install` — `alloy init` 钉住大版本，确保安装的组合经过测试

### alloy init --scope

`--scope` 控制 Alloy 和 Superpowers skill 文件的安装位置。OpenSpec CLI 始终全局安装（npm 包），`openspec/` 目录始终在项目内创建——全局共享的 skill 文件与项目级的需求追踪目录是分开的。

Claude Code 的 skill 加载合并全局和项目两个来源，同名 skill **项目级优先于全局**。

```
alloy init --scope project（默认）:
  Alloy skills      → .claude/skills/alloy/
  Superpowers       → .claude/skills/（项目级）
  OpenSpec CLI      → npm install -g（始终全局）
  openspec init     → <项目路径>
  openspec/ 目录    → <项目路径>/openspec/（始终项目级）

alloy init --scope global:
  Alloy skills      → ~/.claude/skills/alloy/
  Superpowers       → ~/.claude/plugins/（全局级，带 -g flag）
  OpenSpec CLI      → npm install -g（始终全局）
  openspec init     → ~/（全局 OpenSpec 命令）
  openspec/ 目录    → <项目路径>/openspec/（始终项目级，由 deploySchema 创建）
```

### alloy init 流程

```
$ npm install -g @alloy/cli
$ cd your-project
$ alloy init

  🔍 检测环境...
     Node.js v18+ ✓
     git ✓
     Claude Code ✓

  📥 OpenSpec CLI...
     ✓ @fission-ai/openspec@1 （v1.5.0）

  📂 初始化 OpenSpec 项目结构...
     ✓ openspec init 完成（项目）

  📥 Superpowers...
     ✓ Claude Code → obra/superpowers@5 （v5.1.0）

  🚀 部署 Alloy...
     ✓ Claude Code → .claude/skills/alloy/（project）
     ✓ 项目 schema → openspec/schemas/alloy/

  🩺 兼容性检查...
     ✓ OpenSpec v1.5.0（兼容范围 >=1.3.0 <2.0.0）
     ✓ Superpowers v5.1.0（兼容范围 >=5.0.0 <6.0.0）

  ✅ Alloy 就绪！
     在 Claude Code 中输入 /alloy:start <topic> 开始工作
```

关键步骤：

1. **安装 OpenSpec CLI** — `npm install -g @fission-ai/openspec@1`
2. **调用 openspec init** — `openspec init <path> --tools claude --profile custom`。传入临时 custom profile 确保全部 11 个 workflow（new / continue / verify 等）被启用。参考 Comet 的做法
3. **安装 Superpowers** — `npx skills add obra/superpowers -y --agent claude-code`（project scope 不加 `-g`）
4. **部署 Alloy skill + schema** — 从包复制 `.claude/skills/alloy*/`，写入 `openspec/schemas/alloy/`，追加 `schema: alloy` 到 `openspec/config.yaml`
5. **兼容性检查** — 根据 `compat.yaml` 校验版本

CLAUDE.md 注入默认关闭。需要时使用 `--inject-claude-md`。Claude Code 必须由用户预先安装。

OpenSpec 和 Superpowers 均由 `alloy init` 在线安装，钉住 `compat.yaml` 中指定的版本。

### alloy update

```
alloy update [path]
  → 拉取 Alloy 最新版 skill 文件
  → 更新到各已安装平台的 skills/alloy/ 目录
  → 更新 CLAUDE.md 中的 Alloy 标记区域（若存在）
```

---

## 八、关键设计决策

| # | 决策 | 理由 |
|----|------|------|
| 1 | `/alloy:start` 作为唯一入口，默认接续 | 用户只需记住一个命令，降低心智负担 |
| 2 | plan 始终分步，不提供一键生成 | 每步审查的价值大于省下的几秒 |
| 3 | `.alloy.yaml` per-change，非全局 | 天然支持多 change 并行，discard 只需删目录 |
| 4 | Agent 内流程 + CLI 辅助 | 核心工作流依赖 AI 编排能力，CLI 只做确定性操作 |
| 5 | alloy init 自动安装 OpenSpec + Superpowers | 用户从零到可用只需两条命令（install + init） |
| 6 | compat.yaml 钉版本 | init 装已验证的组合，doctor 警告超出范围的非兼容风险 |
| 7 | CLAUDE.md 注入默认关闭 | 非功能必需，减少对项目文件的侵入。需要时显式 `--inject-claude-md` |
| 8 | verify 在 apply 内部闭环，两层验证 | 代码层（verification-before-completion）+ 制品层（/opsx:verify → verify.md），任意 FAIL 回退到 SDD |
| 9 | archive 与 finish 分离，先文档后代码 | archive 提交 spec 归档，finish 处理代码合入。避免"代码合入了 spec 还没跟上"的窗口期 |
| 10 | fix 以 apply 为 spec 变更分水岭 | 无代码（phase< applied）并入当前 change；有代码新开 change |
| 11 | receiving-code-review 嵌入 agent 指令 | 行为规范非管道步骤，减少命令数，降低使用门槛 |
| 12 | SDD / 串行执行由用户选择 | Agent 从 plans.md header 读取执行策略作为推荐，用户决定使用 SDD 还是串行执行。策略在规划阶段写入，apply 阶段读取 |
| 13 | retrospective 模板参考 superpowers-bridge | 全周期审计，§0 量化全景（三来源自动收集）+ §4 三阶段技能审计（Agent 自报）+ §6 Promote Candidates 跨周期 carry-forward |
| 14 | 不设子步骤状态追踪 | phase + worktree + 文件检查足够 Agent 判断恢复位置 |
| 15 | CLI 守门，Skill 信任 | 环境依赖由 `alloy init` 确保，Skill 不做手动 fallback。依赖缺失时引导 `alloy init` |
| 16 | scope 只控制 skill 安装位置 | Alloy + Superpowers skill 受 scope 控制；OpenSpec `openspec/` 目录始终在项目内；默认 project 级别 |
| 17 | 项目就绪标记 = `openspec/config.yaml` | `alloy-start` 检查此文件判断项目是否已初始化，与 OpenSpec 自身的检测方式一致 |
| 18 | openspec init 启用 custom profile | 参考 Comet，使用临时 custom profile 确保全部 11 个 workflow 可用，避免 core profile 缺少 new/continue 等命令 |
| 19 | /alloy:finish 保留为独立命令 | archive 时选 keep 后，后续可手动调 finish 合入；无需重跑 archive |
| 20 | 制品上下文一致性决定输出语言 | 不硬编码语言要求也不绑定特定平台机制。指令/模板写什么语言，Agent 自然产出什么语言 |
| 21 | apply 关键决策点用户有感 | git 初始化、worktree 创建、执行策略（SDD vs 串行）三个决策点均展示选项让用户选择 |
| 22 | 一个制品，一次提交 | 每个制品审查通过后立即 hash-lock + 单独 git commit，records 记录 hash。避免大爆炸提交，每个制品可独立回溯、独立 revert、独立 cherry-pick |

---

## 九、开发可行性评估

### 实现范围

| 组件 | 内容 | 工作量（估） |
|------|------|:--:|
| CLI（TypeScript） | init / status / doctor / update 四条命令 | 2-3 周 |
| Slash Commands | 8 条 SKILL.md + 子步骤 prompt 模板 | 2-3 周 |
| Schema + Templates | 从零构建，参考 superpowers-bridge + Comet | 2 周 |
| Shell 脚本 | guard / state / record / archive（参考 Comet） | 1 周 |
| 测试 | CLI 单元测试 + shell 脚本 Bats 测试 | 1 周 |

### 依赖稳定性

| 依赖 | 状态 | 风险 |
|------|------|:--:|
| OpenSpec CLI | npm 包，版本化管理 | 低 |
| Superpowers skill | npx skills add 安装，版本化管理 | 低 |
| AI 平台（Claude Code 等） | slash command 机制稳定 | 低 |
| Node.js + git | 基础环境 | 低 |

### 关键风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|:--:|------|
| Superpowers skill 行为变更导致编排失效 | 中 | compat.yaml 钉版本 + alloy update 同步更新 |
| OpenSpec schema 格式演进 | 低 | alloy schema 独立构建，不依赖上游 schema |
| Agent 不遵循 SKILL.md 闸门指令 | 中 | 参考 Comet 用 shell 脚本做 HARD STOP 校验，不可跳过 |
| plan 阶段上下文溢出 | 低 | 制品分步 + SDD subagent 上下文隔离 |
| 并行 change 冲突 | 低 | OpenSpec 目录隔离 + worktree 独立 |

### 推荐开发路径

1. **原型验证**（第 1-2 周）——写 `/alloy:start` + `/alloy:plan` 的 SKILL.md，在 Claude Code 中跑通 Pre-OpenSpec → 规划阶段，验证 OpenSpec + Superpowers 组合是否如设计运作
2. **CLI + Schema**（第 3-5 周）——alloy init / status / doctor / update + alloy schema 从零构建，参考 Comet 架构
3. **完整流程**（第 6-8 周）——补全 apply / finish / archive / fix / discard 的 SKILL.md + shell 脚本
4. **测试 + 文档 + 推广**（第 9-10 周）——单元测试、团队推广、反馈收集

> 实际开发时参照 `docs/alloy-dev-guide.md`（WHAT → HOW → DO 三文档体系），
> 包含构建命令、代码约定、测试写法、踩坑记录和跨层复盘清单。
