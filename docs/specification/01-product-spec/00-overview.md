---
behaviors:
  stops: 0
  hard_stops: 0
  artifacts: []
  transitions_to: ""
  external_calls: []
---

# Alloy 产品规格——全局概览

> **目标读者：** 人类开发者 + AI Agent
> **职责：** Alloy 完整产品规格的全局视图。阶段行为细节见各阶段 spec 文件。
> **不放入：** 构建/测试命令 → 见 [alloy-dev-guide.md](../../handbook.md)；Skill 编写经验 → 见 [skill-writing-guide.md](../../reference/skill-writing-guide.md)；设计推导过程 → 见 [workflow-design.md](../background/03-workflow-evolution.md)；开发背景 → 见 [project-background.md](../background/01-origin.md)。

Alloy 是一套融合 OpenSpec 和 Superpowers 的开发工作流工具。入口在 AI Agent 内部（Claude Code、Cursor 等），CLI 辅助初始化和诊断。

---

## 一、命令参考

### CLI 命令（终端执行）

| 命令 | 参数 | 说明 |
|------|------|------|
| `alloy init` | `[path]` | 项目初始化：HOME 拦截 → 确保 git 仓库 → 安装依赖 → 部署 schema + skill |
| | `--scope <global\|project>` | 安装范围，默认 project |
| | `--inject-claude-md` | 注入 CLAUDE.md（默认关闭） |
| | `--agents <id,id,...>` | 非交互式模式，指定 AI 工具（逗号分隔），默认交互式多选 |
| `alloy status` | `[path\|name] [--json]` | 查看活跃 change 总览，指定 name 查看详情 |
| | `--json` | JSON 格式输出 |
| `alloy doctor` | `[path]` | 诊断：版本兼容性、文件一致性 |
| | `--json` | JSON 格式输出 |
| `alloy update` | `[path]` | 自动检测 scope，重新部署 skill + schema。用户模式（npm 发布版）检查 npm registry 新版本；开发模式（本地 .git 存在）直接部署本地 dist |
| `alloy completion` | `[bash\|zsh\|pwsh\|powershell] [--install]` | 生成 shell 补全脚本，--install 自动注册 |
| `alloy --version`, `-v` | | 版本号 |
| `alloy --help`, `-h` | | 帮助 |

**内部命令（Agent 调用，用户不直接使用）：**

| 命令 | 说明 |
|------|------|
| `alloy _state` | 读写 `.alloy.yaml` 状态文件（`read\|write\|init\|merge\|check\|timestamp`） |
| `alloy _skill` | 技能使用记录管理（`log\|skip`），持久化到 `skill_usage[]` |
| `alloy _guard` | 阶段转换校验 + phase 推进（校验 hash 一致性后 `--apply` 推进） |
| `alloy _record` | 制品 hash 记录管理（`compute\|write\|check\|approver`） |
| `alloy _config` | 读写 `openspec/config.yaml` 项目级配置（`read\|write`） |

### Slash Command（Agent 内部执行）

| 命令 | 参数 | 说明 |
|------|------|------|
| `/alloy:start` | `[topic]` | 智能入口：自动检测状态，接续或新建 |
| `/alloy:plan` | `[name]` | 制品生成设计文档，始终分步，每步可审查 |
| `/alloy:apply` | `[name]` | 执行：隔离 worktree → SDD → 代码验证 → 制品验证 → 复盘 |
| `/alloy:archive` | `[name]` | 归档：sync delta spec → 合并主 spec → 移入 archive/ |
| `/alloy:finish` | `[name]` | 收尾：代码合入 + 现场清理（merge / PR / keep） |
| `/alloy:fix` | — | Bug 修复入口：环境感知 → 根因诊断（含 spec 拦截） → 三分支修复 |
| `/alloy:discard` | `[name]` | 放弃当前 change，清理 worktree + 分支 + 目录 |
| `/alloy:status` | `[name]` | 查看指定 change 的阶段、制品状态、下一步 |

带 `[name]` 的命令省略时从当前活跃 change 的上下文推断。

**上下文推断：** 扫描 `openspec/changes/*/.alloy.yaml` → 仅 1 个活跃 change 自动选中 → 多个则提示选择 → 无活跃 change 报错，提示先 `alloy start`。

### 阶段 spec 文件索引

| 阶段 | spec 文件 | skill 文件 |
|------|----------|-----------|
| start | [01-start-spec.md](01-start-spec.md) | commands/alloy/start.md |
| plan | [02-plan-spec.md](02-plan-spec.md) | commands/alloy/plan.md |
| apply | [03-apply-spec.md](03-apply-spec.md) | commands/alloy/apply.md |
| archive | [04-archive-spec.md](04-archive-spec.md) | commands/alloy/archive.md |
| finish | [05-finish-spec.md](05-finish-spec.md) | commands/alloy/finish.md |
| fix | [06-fix-spec.md](06-fix-spec.md) | commands/alloy/fix.md |
| discard | [07-discard-spec.md](07-discard-spec.md) | commands/alloy/discard.md |
| CLI | [08-cli-spec.md](08-cli-spec.md) | src/cli/commands/ |

---

## 三、终端输出视觉规范

详见 [alloy-visual-spec.md](../02-visual-spec.md)——从本文档提取的独立视觉规范，以实际落地格式为准。写 Skill 时参考该文档。

---

## 四、状态文件

每个 change 目录内包含 `.alloy.yaml`，CLI 和 Agent 读写，用户通过 `/alloy:status` 查看：

```yaml
# openspec/changes/<name>/.alloy.yaml
phase: started | planned | applied | archived | finished
worktree: null | ".claude/worktrees/<name>" | "skipped"
worktree_branch: null | "worktree-<name>"   # worktree 分支名
worktree_created_at: null | "2026-05-28 09:10:00"
worktree_merged_at: null | "2026-05-28 12:00:00"  # archive 阶段合并后写入
feature_branch: "feat/login"    # 本次 change 使用的 feature 分支
schema_version: 1
created_at: "2026-05-28 09:00:00"
updated_at: "2026-05-28 15:30:00"
phase_timings:
  start:
    started_at: "2026-05-28 09:00:00"
    completed_at: "2026-05-28 09:07:35"
  plan:
    started_at: "2026-05-28 09:07:47"
    completed_at: "2026-05-28 09:15:30"
records:
  - artifact: proposal
    hash: "abc123"
    committed_at: "2026-05-28 09:15:00"
    approver: "human"
  - artifact: design
    hash: "def456"
    committed_at: "2026-05-28 09:30:00"
    approver: "human"
skill_usage:
  - skill: superpowers:brainstorming
    stage: start
    used: true
    recorded_at: "2026-05-28 09:05:00"
  - skill: opsx:continue
    stage: plan
    used: true
    count: 5
    recorded_at: "2026-05-28 09:15:00"
```

| 字段 | 读写 | 含义 |
|------|------|------|
| `phase` | CLI + Agent | 当前阶段，决定 `/alloy:start` 的恢复路径 |
| `worktree` | apply 阶段写入 | null=尚未决定；skipped=用户选择不创建；路径=已创建，恢复时跳过 |
| `worktree_branch` | apply 阶段写入 | worktree 分支名（如 `worktree-<name>`），archive 清理时用于 merge |
| `worktree_created_at` | apply 阶段写入 | worktree 创建时间 |
| `worktree_merged_at` | archive 阶段写入 | worktree 合并回 feature 分支的时间，null 表示未使用 worktree 或未合并 |
| `feature_branch` | start 阶段写入 | 本次 change 使用的 feature 分支名，discard 时用于安全清理分支 |
| `schema_version` | alloy init 写入 | 格式演进时用于兼容解析 |
| `created_at` | alloy start 写入 | change 创建时间 |
| `updated_at` | phase 变更时写入 | 最后状态变更时间，调试和排序用 |
| `phase_timings` | 各阶段写入 | 每个阶段的 `started_at` / `completed_at`，接续时不丢失耗时数据 |
| `records` | plan/apply 阶段写入 | 每个制品提交后的 hash 记录，格式 `ArtifactRecord[]`，含 artifact/hash/committed_at/approver |
| `skill_usage` | 各阶段写入 | 技能使用记录数组，格式 `SkillUsageEntry[]`，含 skill/stage/used/count/via/reason/recorded_at。retrospective §4 全周期技能审计的数据源 |

断点恢复：`/alloy:start` 检测到活跃 change → 读 phase + worktree + 文件系统 → 自动加载对应阶段命令。不设子步骤状态——Agent 通过文件存在性自判断。

### 项目级配置

`openspec/config.yaml` 是项目级配置，所有 change 共享：

```yaml
# openspec/config.yaml
schema: alloy
alloy:
  main_branch: main    # 用户确认的主分支名
```

| 字段 | 读写 | 含义 |
|------|------|------|
| `alloy.main_branch` | alloy init 阶段写入，finish/discard 读取 | 项目主分支名，分支管理和合并目标的基准 |

`alloy _config` CLI 命令用于读写项目级配置：
```bash
alloy _config read . main_branch     # 读取主分支名
alloy _config write . main_branch main  # 写入主分支名
```

### 阶段闸门检查规则

`alloy _guard` 在每个阶段转换时进行硬校验，包括 phase 转换合法性和制品完整性检查。只验证 phase 转换合法性不管制品完整性，会导致制品缺失在下阶段才暴露（如 started→planned 缺 specs 却成功推进，apply 阶段才发现——错误发生在 plan 阶段）。

**每个转换的必检清单（以 schema DAG 为准）：**

| 转换 | 必检制品 | 说明 |
|------|---------|------|
| started → planned | proposal, design, specs/, tasks, plans | plan 阶段 5 个产出全部存在 |
| planned → applied | plans | 执行依赖 plans.md |
| applied → archived | verify | 归档依赖 verify.md |
| archived → finished | retrospective | 完成依赖 retrospective.md |

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
    ├── precheck      ← git 仓库检测（有感选择）+ 6 个 Superpowers 技能可用性检查
    ├── 隔离环境设置   ← 隐含 superpowers:using-git-worktrees（用户可选，非强制）
    ├── 任务实现       ← 用户选择执行策略:
    │                      superpowers:subagent-driven-development（并行，任务独立时，内部含 TDD + code-review）
    │                      or superpowers:executing-plans（串行，任务耦合时）
    │                      （串行路径需显式补偿 TDD + code-review——executing-plans 不含这两个闸门，
    │                        apply 会在执行前加载 TDD、执行后加载 requesting-code-review）
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

v1 支持 8 个 AI 编码平台：Claude Code、CodeBuddy、Qoder（冒号版命令）、Cursor、OpenCode、Codex、Trae、Pi（横线版命令）。`alloy init` 交互式选择安装目标，冒号版和横线版自动生成到各平台目录。平台定义见 `src/core/agents.ts`。

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
  └── 内部命令（_state / _guard / _record / _config）供 Agent 调用
```

| 层 | 在哪运行 | 内容 | 可靠性 |
|----|---------|------|--------|
| CLI | 终端 | 安装、诊断、状态总览、内部命令（_state/_guard/_record/_config） | 确定性强（TypeScript） |
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
  Alloy commands   → .claude/commands/alloy/（冒号版）+ alloy-*.md（横线版）
  Superpowers      → .claude/skills/（项目级）
  OpenSpec CLI     → npm install -g（始终全局）
  openspec init    → <项目路径>
  openspec/ 目录   → <项目路径>/openspec/（始终项目级）

alloy init --scope global:
  Alloy commands   → ~/.claude/commands/alloy/（冒号版）+ alloy-*.md（横线版）
  Superpowers      → ~/.claude/plugins/（全局级，带 -g flag）
  OpenSpec CLI     → npm install -g（始终全局）
  openspec init    → ~/（全局 OpenSpec 命令）
  openspec/ 目录   → <项目路径>/openspec/（始终项目级，由 deploySchema 创建）
```

注意：HOME 拦截与 git 仓库初始化对当前目录生效，与 scope 无关。scope 只控制 skill 文件安装位置（决策 #16）。

### alloy init 流程

```
$ npm install -g @flyin-ai/alloy
$ cd your-project
$ alloy init

  **检测环境...**
     ✓ Node.js v22.0.0
     ✓ git 已安装

  **检查 git 仓库...**
     ✓ git 仓库 已存在

  **安装 OpenSpec CLI...**
     ✓ @fission-ai/openspec@1 已安装

  **初始化 OpenSpec 项目结构...**
   （调用 openspec init，带 custom profile 确保全部 11 个 workflow 启用）

  **安装 Superpowers...**
     ✓ Superpowers 已安装

  **部署 Alloy commands...**
     ✓ /path/.claude/commands/alloy/start.md（project）
     ✓ /path/.cursor/commands/alloy-start.md 等（自动生成横线版）
     ✓ 项目 schema → openspec/schemas/alloy/

  **兼容性检查...**
     ✓ Node.js v22.0.0（要求 >=18.0.0）
     ✓ OpenSpec v1.5.0（要求 >=1.3.0 <2.0.0）
     ✓ Superpowers v5.1.0（要求 >=5.0.0 <6.0.0）

  **注册 shell 补全...**
     ✓ shell 补全已注册 → ~/.zshrc

  ✅ Alloy 就绪！
   在 Claude Code / Cursor 中输入 /alloy:start <topic> 开始工作
```

关键步骤：

1. **选择 scope** — 交互式选择 project（当前目录）或 global（home 目录），也可 `--scope` 参数指定
2. **选择目标 Agent** — 交互式多选安装目标（Claude Code / Cursor / OpenCode 等 8 个平台），也可 `--agents` 非交互式指定
3. **环境检测** — `detectEnv()` 检测 Node.js 版本、git。git 缺失则 HARD STOP
4. **HOME 拦截** — 当前目录为 `$HOME` 时拒绝初始化（避免污染主目录）。无论 scope 均生效
5. **采集项目状态（不改变项目目录）** — 检测 git 仓库是否存在、HEAD 是否 unborn（无 commit）、现有 config 是否已有 main_branch、检测主分支（remote HEAD / init.defaultBranch / 本地分支匹配）
6. **USER_GATE 1：确认主分支** — 若 config 已有 main_branch 则跳过（幂等）；否则检测后让用户确认（检测值 / 自定义）
7. **USER_GATE 2：确认执行清单** — 展示将部署的文件 + git 操作（是否 git init、是否初始 commit），用户拒绝则 exit 0，项目目录零变化
8. **确保 git 仓库** — `ensureGitRepo()` 检测当前目录是否已在 git 仓库，未在则 `git init`。失败硬退出
9. **安装 OpenSpec CLI** — `npm install -g @fission-ai/openspec@1`
10. **初始化 OpenSpec 项目结构** — `openspec init <path> --tools claude --profile custom`。传入临时 custom profile 确保全部 11 个 workflow 启用
11. **安装 Superpowers** — `npx skills add obra/superpowers -y --agent claude-code`（project scope 不加 `-g`）
12. **部署 Alloy command + schema** — 从包复制 `commands/alloy/`，自动生成冒号版和横线版到各平台目录，写入 `openspec/schemas/alloy/`
13. **更新 .gitignore** — 追加 6 条规则（`docs/superpowers/` `.claude/worktrees/` `.worktrees/` `worktrees/` `.superpowers/` `*.local.*`）
14. **注入 CLAUDE.md** — 可选（`--inject-claude-md`），默认关闭
15. **写入 main_branch 配置** — `openspec/config.yaml` 写入 `alloy.main_branch: <确认值>`
16. **若 HEAD unborn：创建初始 commit 锁定 main 分支** — `git add .claude/ .gitignore openspec/config.yaml openspec/schemas/ CLAUDE.md` + `git commit -m "chore: alloy init 项目初始化"`。在 main 分支创建第一个 commit，让 main 引用文件诞生，后续 `/alloy:start` 切到 feature 分支后 main 保留。若 HEAD 已有 commit 则不自动提交，文件留工作目录，提示用户自行 commit
17. **兼容性检查** — 根据 `compat.yaml` 校验版本
18. **注册 shell 补全** — 自动检测 shell 类型，注册 `alloy completion` 到 rc 文件。失败不阻断 init

> **main 分支锁定（关键设计）：** `git init` 后 HEAD 指向 `refs/heads/main` 但引用文件不存在（unborn 状态）。若此时直接切到 feature 分支，main 永久缺失——`/alloy:finish` 阶段 `git checkout main` 会失败。alloy init 在 unborn 时创建初始 commit，让 main 分支真正诞生，从源头避免此问题。

### alloy update

```
alloy update [path]
  → 自动检测 scope（project/global）
  → 开发模式（包根目录有 .git）→ 直接重新部署本地 commands + schema
  → 用户模式（npm 发布版）→ 查 npm registry 检查版本，有新版询问确认后升级 CLI
  → 重新部署 commands + schema
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
| 14 | 不设子步骤状态，通过路由 + 幂等实现接续 | precheck 不满足时自动路由到正确命令，阶段步骤自身幂等。退出回来随便打任何命令都能自动接续 |
| 15 | CLI 守门，Skill 信任 | 环境依赖由 `alloy init` 确保，Skill 不做手动 fallback。依赖缺失时引导 `alloy init` |
| 16 | scope 只控制 skill 安装位置 | Alloy + Superpowers skill 受 scope 控制；OpenSpec `openspec/` 目录始终在项目内；默认 project 级别 |
| 17 | 项目就绪标记 = `openspec/config.yaml` | `alloy-start` 检查此文件判断项目是否已初始化，与 OpenSpec 自身的检测方式一致 |
| 18 | openspec init 启用 custom profile | 参考 Comet，使用临时 custom profile 确保全部 11 个 workflow 可用，避免 core profile 缺少 new/continue 等命令 |
| 19 | /alloy:finish 保留为独立命令 | archive 时选 keep 后，后续可手动调 finish 合入；无需重跑 archive |
| 20 | 制品上下文一致性决定输出语言 | 不硬编码语言要求也不绑定特定平台机制。指令/模板写什么语言，Agent 自然产出什么语言 |
| 21 | apply 关键决策点用户有感 | git 初始化、worktree 创建、执行策略（SDD vs 串行）三个决策点均展示选项让用户选择 |
| 22 | 一个制品，一次提交 | 每个制品审查通过后立即 hash-lock + 单独 git commit，records 记录 hash。避免大爆炸提交，每个制品可独立回溯、独立 revert、独立 cherry-pick |
| 23 | precheck 路由替代 HARD STOP | 命令 precheck 不满足时，自动转发到正确阶段命令而非报错退出。用户随便打任何命令都不会错——系统自己弄清楚该做什么 |
| 24 | 阶段时间持久化到 phase_timings | 每个阶段的 started_at / completed_at 写入 .alloy.yaml，接续时读历史值不丢失耗时数据。替代 shell 变量存储（退出即失） |
| 25 | git add 规则：`-A` 限定路径可用 | `git add -A <路径>` 可用（只扫描指定目录的新增/修改/删除），无路径限定的 `git add -A`/`-a`/`.` 禁止。防止意外文件混入提交。`.gitignore` 补齐 `*.local.*` |
| 26 | worktree 在 archive 阶段清理 | worktree 在 apply Step 1 按需创建，apply 结束时不清理（只推进 phase）。archive 阶段归档变更提交后，执行 worktree merge + remove + branch -d，写入 worktree_merged_at。finish 阶段感知不到 worktree 的存在 |
| 27 | executing-plans 路径补偿 TDD + spec 合规审查 | executing-plans 不含 TDD 和 code review 闸门，apply 在加载前先加载 TDD 设定硬约束、执行后执行 spec 合规审查（tasks.md checkbox 对代码实现）、再加 code review。串行路径共 4 步：TDD → executing-plans → spec 合规审查 → code review |
| 28 | 策略选择场景化对比 | 不只在 plans.md 写 strategy frontmatter——apply Step 2 以场景对比表格展示 SDD（多任务并行）和 executing-plans（少任务串行）的适用场景，用户根据实际任务特征选择 |
| 29 | `_guard --apply` 后补 commit | guard 校验 hash 一致性后自动推进 phase，但 phase 变更必须 commit（否则 worktree 清理或 squash merge 时未提交的变更会丢失）。每个阶段末尾 guard + commit 是固定模式 |
| 30 | 归档 commit 在 worktree 清理之前 | `/opsx:archive` 执行 `mv` 移动目录但不 git commit。如果在 worktree 中，变更必须先 commit 到 worktree 分支，否则 worktree merge 时会丢失归档操作。顺序：归档 commit → worktree 清理 → 完成时间 commit → guard commit |
| 31 | 技能使用审计持久化 | `alloy _skill log` 在每个技能加载后立即记录到 `skill_usage[]`，retrospective §4 自动读取生成全周期技能审计表。解决之前 retrospective 靠 Agent 自报（不准、会漏）的问题 |
| 32 | 交互降级策略 | 技能文件中 `AskUserQuestion` JSON 块必须附带降级文本格式。Agent 执行时检测平台能力——支持则用原生交互组件，不支持则自动降级为结构化文本选项。确保同一流程在 8 个平台体验一致 |
| 33 | HOME 目录拒绝初始化 | 主目录写入 openspec/、.gitignore 等会污染环境；可能将整个 home 变为 git 仓库。init 入口硬拦截 |
| 34 | git init 前置到 alloy init | 守门前移，符合"CLI 守门 / Skill 信任"原则（决策 #15）。`/alloy:start` 不再兜底 git init，仅校验 |
| 35 | `/alloy:start` 环境完整性检测扩展为完整集 | 入口检测 git/config/schema/commands 四项基础设施，任一缺失引导 `alloy init`。Skill 预检（具体技能加载）保持独立 |
| 36 | init 不检测 agent 是否安装 | init 职责是给选中的 agent 部署 Alloy 工作流，agent 是否安装/是否在该项目用过不影响部署（deployCommands 会自建目录）。原 Claude Code 硬检与后续的 agent 配置目录检测都无决策价值，一律删除 |

---

## 九、开发可行性评估

### 实现范围

| 组件 | 内容 | 工作量（估） |
|------|------|:--:|
| CLI（TypeScript） | init / status / doctor / update 四条命令 | 2-3 周 |
| Slash Commands | 8 条 SKILL.md + 子步骤 prompt 模板 | 2-3 周 |
| Schema + Templates | 从零构建，参考 superpowers-bridge + Comet | 2 周 |
| 内部命令（TypeScript） | _guard / _state / _record / _config | 1 周 |
| 测试 | CLI 单元测试（vitest） | 1 周 |

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
| Agent 不遵循 SKILL.md 闸门指令 | 中 | 内部命令（TypeScript）做 HARD STOP 校验，不可跳过 |
| plan 阶段上下文溢出 | 低 | 制品分步 + SDD subagent 上下文隔离 |
| 并行 change 冲突 | 低 | OpenSpec 目录隔离 + worktree 独立 |

### 推荐开发路径

1. **原型验证**（第 1-2 周）——写 `/alloy:start` + `/alloy:plan` 的 SKILL.md，在 Claude Code 中跑通 Pre-OpenSpec → 规划阶段，验证 OpenSpec + Superpowers 组合是否如设计运作
2. **CLI + Schema**（第 3-5 周）——alloy init / status / doctor / update + alloy schema 从零构建，参考 Comet 架构
3. **完整流程**（第 6-8 周）——补全 apply / finish / archive / fix / discard 的 SKILL.md + 内部命令
4. **测试 + 文档 + 推广**（第 9-10 周）——单元测试、团队推广、反馈收集

> 实际开发时参照 `docs/handbook.md`（构建、测试、调试），
> 包含构建命令、代码约定、测试写法、踩坑记录和跨层复盘清单。
