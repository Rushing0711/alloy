# Alloy 设计文档

Alloy 是一套融合 OpenSpec 和 Superpowers 的开发工作流工具。入口在 AI Agent 内部（Claude Code、Cursor 等），CLI 辅助初始化和诊断。

---

## 一、命令参考

### CLI 命令（终端执行）

| 命令 | 参数 | 说明 |
|------|------|------|
| `alloy init` | `[path]` | 项目初始化：检测环境 → 安装依赖 → 部署 schema + skill |
| | `--skip-claude-md` | 跳过 CLAUDE.md 注入 |
| | `--scope <global\|project>` | 安装范围，默认 global |
| `alloy status` | `[path]` | 查看所有活跃 change 总览 |
| | `--json` | JSON 格式输出 |
| `alloy doctor` | `[path]` | 诊断：版本兼容性、文件一致性 |
| | `--json` | JSON 格式输出 |
| `alloy update` | `[path]` | 更新 Alloy skill 文件到最新版 |
| `alloy --version` | | 版本号 |
| `alloy --help` | | 帮助 |

### Slash Command（Agent 内部执行）

| 命令 | 参数 | 说明 |
|------|------|------|
| `/alloy:start` | `[topic]` | 智能入口：自动检测状态，接续或新建 |
| `/alloy:plan` | `[name]` | 逐制品生成设计文档，始终分步，每步可审查 |
| `/alloy:apply` | `[name]` | 执行：隔离 workspace → SDD → 验证 → 复盘 |
| `/alloy:finish` | `[name]` | 收尾：merge / PR / keep / discard |
| `/alloy:archive` | `[name]` | 归档（硬校验 phase=finished，否则拒绝） |
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

无活跃 change + 有 topic:
  → 全新开始: explore + brainstorming → draft.md
  → Agent 根据 draft.md 内容建议 change name
  → 用户确认 → 创建 openspec/changes/<name>/
  → 移入 draft.md → 写入 .alloy.yaml → phase=started

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

前置检查: draft.md 存在
逐制品生成: proposal → design → specs → tasks → plan
每步生成后有审查窗口，可确认或要求修改
始终分步，不提供一键生成

审查期间可沟通调整上游制品（如"把 proposal 第 3 点改一下"），
Agent 根据 DAG 依赖自动识别下游制品过期并重做。
plan 完成后不允许手动修改制品文件，变更需通过对话驱动。
```

### alloy apply

```
/alloy:apply [name]（省略时从当前活跃 change 推断）

前置检查: plan.md 存在
verify 在 apply 内部闭环，失败则循环修复直到通过，不通过不结束 apply。

执行步骤:
  1. .alloy.yaml → phase=planned，worktree 字段标记开始
  2. superpowers:using-git-worktrees → 创建隔离 workspace
  3. superpowers:subagent-driven-development → 逐任务执行
       （SDD 内部遵循 TDD + 自带 spec review + code quality review）
  4. superpowers:verification-before-completion  → 代码行为验证
        + openspec-verify-change                 → verify.md
     → 验证失败则修复后重新验证，直到通过
  5. retrospective.md（证据驱动复盘，模板参考 superpowers-bridge 的 retrospective 指令，
     适配 Alloy 制品名和技能清单）
phase → applied
```

### alloy finish

```
/alloy:finish [name]（省略时从当前活跃 change 推断）

前置检查: verify.md 存在, 人工测试已通过（用户确认）
执行: superpowers:finishing-a-development-branch
  → 4 选项:
      1. 本地 merge → "代码已合入。是否现在归档？ /alloy:archive <name>"
      2. 创建 PR    → "PR 已创建。审查通过后 /alloy:archive <name>"
      3. 保持分支   → "分支已保留。后续可 /alloy:archive 或 /alloy:discard"
      4. 丢弃       → 清理完毕，流程结束

选 PR 后，审查反馈通过自然对话处理，Agent 内部遵循
superpowers:receiving-code-review 行为规范（验证优先、不盲从、技术推理）。
phase → finished（仅选项 1, 2, 3；选项 4 不写 phase）
```

### alloy archive

```
/alloy:archive [name]（省略时从当前活跃 change 推断）

前置检查（硬拒绝）: phase = finished
执行: openspec archive -y
  → sync delta spec + 归档到 archive/YYYY-MM-DD-<name>/
phase → archived
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
  ├── applied / finished        → 删 change 目录 + worktree + 分支
  ├── finished（已 merge）      → 警告"代码已合入 main，discard 仅清理 change 目录，不撤销 merge"
  └── archived                  → 硬拒绝

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
  制品状态: draft ✓  proposal ✓  design ✗  specs ✗  tasks ✗  plan ✗
  下一步:  继续 alloy plan，等待 design 生成

一致性检查（随 status 自动执行）:
  ├── worktree 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留"
  └── git worktree list 中有孤立 worktree → ⚠️ 提示清理
```

---

## 三、状态文件

每个 change 目录内包含 `.alloy.yaml`，CLI 和 Agent 读写，用户通过 `/alloy:status` 查看：

```yaml
# openspec/changes/<name>/.alloy.yaml
phase: started | planned | applied | finished | archived
worktree: null | ".worktrees/<name>"
schema_version: 1
created_at: "2026-05-28"
updated_at: "2026-05-28"
```

| 字段 | 读写 | 含义 |
|------|------|------|
| `phase` | CLI + Agent | 当前阶段，决定 `/alloy:start` 的恢复路径 |
| `worktree` | apply 阶段写入 | null=未创建；有值=apply 已开始，恢复时跳过创建 |
| `schema_version` | alloy init 写入 | 格式演进时用于兼容解析 |
| `created_at` | alloy start 写入 | change 创建时间 |
| `updated_at` | phase 变更时写入 | 最后状态变更时间，调试和排序用 |

断点恢复：`/alloy:start` 检测到活跃 change → 读 phase + worktree + 文件系统 → 自动从断点继续。不设子步骤状态——Agent 通过检查文件存在性自判断。

---

## 四、制品依赖 DAG

```
Pre-OpenSpec:
  draft.md ← explore + brainstorming 产出

Schema DAG:
  proposal  ← 读 draft.md
    ├──→ specs     ← 依赖 proposal（不读 draft，防止行为 spec 被技术细节污染）
    │      └──→ tasks   ← 依赖 specs + design
    │            └──→ plan   ← 依赖 tasks（隐含 superpowers:writing-plans）
    │
    └──→ design   ← 依赖 proposal（读 draft.md，受 proposal 范围约束）

Apply:
  apply  ← 依赖 plan
    ├── git-worktrees  ← 隐含 superpowers:using-git-worktrees
    ├── subagent-dev   ← 隐含 superpowers:subagent-driven-development
    │                       （SDD 内部含 TDD + code-review）
    ├── verify         ← 隐含 verification-before-completion
    │                        + openspec-verify-change → verify.md
    └── retrospective  →  retrospective.md（模板参考 superpowers-bridge）

所有制品存放于 openspec/changes/<name>/ 目录内，不需外部指针。
```

---

## 五、架构

```
用户输入 /alloy:*
       │
       ▼
  SKILL.md（Agent 内执行）
  ├── 阶段检测（读 .alloy.yaml + 文件系统）
  ├── 流程编排（按 phase 分发到对应子步骤）
  ├── 审查窗口（逐制品确认）
  └── 调用 OpenSpec CLI + Superpowers skill
       │
       ▼
  大模型（内容层）
  ├── 写文档（proposal / design / specs / tasks / plan / retrospective）
  ├── 写代码（subagent 逐任务执行）
  └── 交互（explore Q&A / brainstorming 设计审批）
```

```
CLI（终端）
  alloy init / status / doctor / update
  ├── 确定性强（TypeScript 逻辑）
  ├── 安装依赖（OpenSpec CLI + Superpowers skill）
  ├── 部署文件（schema + skill + shell 脚本）
  └── 诊断（版本兼容性 + 文件一致性）
```

| 层 | 在哪运行 | 内容 | 可靠性 |
|----|---------|------|--------|
| CLI | 终端 | 安装、诊断、状态总览 | 确定性强（TypeScript） |
| Skill | Agent 内部 | 流程编排、阶段检测、审查窗口 | 硬约束（SKILL.md 指令 + guard 脚本） |
| AI 内容 | Agent 内部 | 文档生成、代码生成、交互决策 | 柔性（AI 发挥，人类审查） |

核心工作流（start / plan / apply / finish / archive / fix / discard）全部在 Agent 内以 slash command 运行。CLI 只做辅助——安装、诊断、查看状态总览。

---

## 六、安装与初始化

### compat.yaml

随 Alloy npm 包发布，不暴露到用户项目。定义兼容范围（doctor 诊断用）和安装版本（init 安装用）：

```yaml
# Alloy 包内置
compatible:
  openspec: ">=1.3.0 <2.0.0"
  superpowers: ">=5.0.0 <6.0.0"

install:
  openspec: "@fission-ai/openspec@1"
  superpowers: "obra/superpowers@5"
```

- `compatible` — `alloy doctor` 诊断用，超出范围警告但不阻断
- `install` — `alloy init` 钉住大版本，确保安装的组合经过测试

### 内置兜底（vendor）

Alloy 包内预置了一份 Superpowers skill 文件（`vendor/superpowers/`），版本与 `compat.yaml` 中 `install.superpowers` 锁定。网络可用时从 registry 拉取最新；内部网络不可用时使用内置兜底：

```
npm install -g @alloy/cli
  └── vendor/superpowers/
        ├── brainstorming/SKILL.md
        ├── using-git-worktrees/SKILL.md
        ├── subagent-driven-development/SKILL.md
        ├── verification-before-completion/SKILL.md
        ├── finishing-a-development-branch/SKILL.md
        ├── systematic-debugging/SKILL.md
        └── receiving-code-review/SKILL.md
```

`alloy update` 时检查更新，同步替换 vendor 目录中的文件。不内置 OpenSpec——npm 能访问就能安装，不能访问的话 Alloy CLI 本身也无法安装。

### alloy init --scope

`--scope` 控制 Alloy skill 安装位置。Claude Code 的 skill 加载合并全局和项目两个来源，同名 skill **项目级优先于全局**。

```
alloy init 检测已有 Alloy skill：

  ├── 兼容的全局版本已安装
  │     → 跳过 skill 部署，直接使用全局版
  │
  ├── 不兼容的全局版本已安装
  │     → ⚠️ 提示版本冲突，给两个选择：
  │       1) alloy update 升级全局版
  │       2) --scope project 安装到项目级（覆盖同名全局 skill）
  │
  ├── 全局未安装
  │     → 默认 --scope global 安装
  │
  └── --scope project 显式指定
        → 无条件安装到项目 .claude/skills/alloy/
```

典型场景：

```
场景 A：新手上路
  npm install -g @alloy/cli
  alloy init → 默认装全局 skill
  → 所有项目可用 /alloy:*，无需重复安装

场景 B：版本兼容
  npm install -g @alloy/cli@latest  ← v1.3（新）
  cd old-project
  alloy init → 检测到全局 skill v1.0（不兼容 CLI v1.3）
  → 用户选 --scope project → 项目级装 v1.3 skill
  → 其他老项目继续用旧版，互不影响

场景 C：内网离线
  alloy init → npx skills add 超时 / registry 不可达
  → 从 vendor/superpowers/ 复制到目标平台 skills 目录
  → 离线可用
```

### alloy init 流程

```
$ npm install -g @alloy/cli
$ cd your-project
$ alloy init

  🔍 检测环境...
     Node.js v22 ✓
     git ✓
     AI 平台: Claude Code ✓  Cursor ✓  Codex ✗
     Alloy skill 全局: ✗ 未安装

  📦 选择安装目标（空格选择，回车确认）：
     [x] Claude Code
     [x] Cursor
     [ ] Codex（未安装，灰掉）

  📥 安装 OpenSpec CLI...
     ✓ @fission-ai/openspec@1 （v1.5.0）

  📥 安装 Superpowers...
     ✓ Claude Code → obra/superpowers@5 （v5.1.0）
     ✓ Cursor → obra/superpowers@5 （v5.1.0）

  🚀 部署 Alloy...
     ✓ Claude Code → ~/.claude/skills/alloy/（global）
     ✓ Cursor → ~/.cursor/skills/alloy/（global）
     ✓ 项目 schema → openspec/schemas/alloy/
     ✓ CLAUDE.md → 已追加 Alloy 工作流提示

  🩺 兼容性检查...
     ✓ OpenSpec v1.5.0（兼容范围 >=1.3.0 <2.0.0）
     ✓ Superpowers v5.1.0（兼容范围 >=5.0.0 <6.0.0）

  ✅ Alloy 就绪！
     在 Claude Code 中输入 /alloy:start <topic> 开始工作
```

- AI 平台必须由用户预先安装（Claude Code、Cursor 等），否则灰掉无法勾选
- OpenSpec 和 Superpowers 由 alloy init 自动安装，钉住 compat.yaml 中指定的版本
- CLAUDE.md 自动注入 Alloy 工作流提示（可用 `--skip-claude-md` 跳过），注入内容用注释标记包围，方便 `alloy update` 时替换

### alloy update

```
alloy update [path]
  → 拉取 Alloy 最新版 skill 文件
  → 更新到各已安装平台的 skills/alloy/ 目录
  → 更新 vendor/superpowers/（内置兜底）
  → 更新 CLAUDE.md 中的 Alloy 标记区域
```

---

## 七、关键设计决策

| # | 决策 | 理由 |
|----|------|------|
| 1 | `/alloy:start` 作为唯一入口，默认接续 | 用户只需记住一个命令，降低心智负担 |
| 2 | plan 始终分步，不提供一键生成 | 每步审查的价值大于省下的几秒 |
| 3 | `.alloy.yaml` per-change，非全局 | 天然支持多 change 并行，discard 只需删目录 |
| 4 | Agent 内流程 + CLI 辅助 | 核心工作流依赖 AI 编排能力，CLI 只做确定性操作 |
| 5 | alloy init 自动安装 OpenSpec + Superpowers | 用户从零到可用只需两条命令（install + init） |
| 6 | compat.yaml 钉版本 | init 装已验证的组合，doctor 警告超出范围的非兼容风险 |
| 7 | CLAUDE.md 自动注入（可选跳过） | 让未来 session 知道项目归 Alloy 管，可跳过不强制 |
| 8 | verify 在 apply 内部闭环 | 失败则循环修复直到通过，不引入外部回退状态 |
| 9 | discard 全阶段可用，archived 硬拒绝 | started/planned 阶段无代码沉淀，可自由丢弃 |
| 10 | fix 以 apply 为 spec 变更分水岭 | 无代码（phase< applied）并入当前 change；有代码新开 change |
| 11 | receiving-code-review 嵌入 agent 指令 | 行为规范非管道步骤，减少命令数，降低使用门槛 |
| 12 | SDD 内部自带 TDD + code review | Alloy 不重复声明 SDD 的实现细节 |
| 13 | retrospective 模板参考 superpowers-bridge | 有指导的 AI 生成，7 节结构，证据驱动 |
| 14 | 不设子步骤状态追踪 | phase + worktree + 文件检查足够 Agent 判断恢复位置 |
