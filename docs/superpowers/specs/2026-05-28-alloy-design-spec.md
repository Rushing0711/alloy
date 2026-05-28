# Alloy 设计规格

Alloy 是一套融合 OpenSpec 和 Superpowers 的开发工作流编排工具。入口在 AI Agent 内部（Claude Code），CLI 辅助初始化和诊断。

> 本文档为 brainstorming 产出，保持概要级别，聚焦设计决策和架构边界。详细的边界条件、输出格式、交互流程以 [alloy-design.md](../../alloy-design.md) 为权威参考。

---

## 一、整体架构与 v1 范围

### 架构分层

```
用户输入 /alloy-*
       │
       ▼
  SKILL.md（Agent 内执行）
  ├── 阶段检测（读 .alloy.yaml + 文件系统）
  ├── 流程编排（按 phase 分发到对应子步骤）
  ├── 审查窗口（逐制品确认）
  ├── 扩展点提示（v1 仅提示、不调用技能）
  └── 调用 OpenSpec CLI + Superpowers skill
       │
       ▼
  大模型（内容层）
  ├── 写文档（proposal / design / specs / tasks / plan / retrospective）
  ├── 写代码（subagent 逐任务执行，SDD + TDD）
  └── 交互（explore Q&A / brainstorming 设计审批）
```

```
CLI（终端）
  alloy init / status / doctor / update
  ├── 确定性强（TypeScript 逻辑）
  ├── 安装依赖（OpenSpec CLI + Superpowers skill）
  ├── 部署文件（schema + skill）
  └── 诊断（版本兼容性 + 文件一致性）
```

三层可靠性：

| 层 | 在哪运行 | 内容 | 可靠性 |
|----|---------|------|--------|
| CLI | 终端 | 安装、诊断、状态总览 | 确定性强（TypeScript） |
| Skill | Agent 内部 | 流程编排、阶段检测、审查闸门 | 硬约束（SKILL.md 指令 + guard 脚本） |
| AI 内容 | Agent 内部 | 文档生成、代码生成、交互决策 | 柔性（AI 发挥，人类审查） |

### v1 范围

| 决策 | 选择 | 理由 |
|------|------|------|
| 平台 | **仅 Claude Code** | 团队统一使用，v1 聚焦质量 |
| Schema | **从零构建**，参考 superpowers-bridge + Comet | 零技术债，不留已知问题 |
| 扩展点 | **SKILL.md 硬编码提示**，不调用技能 | 可靠性优先，v2 再升级为可配置闸门 |
| 安装范围 | 默认 `--scope global` | 团队统一环境 |

---

## 二、命令体系

### 8 条 Slash Command

| 命令 | 参数 | 用途 |
|------|------|------|
| `/alloy-start` | `[topic]` `[--new <topic>]` | 智能入口：自动检测状态，接续或新建 |
| `/alloy-plan` | `[name]` | 逐制品生成设计文档，始终分步，每步可审查 |
| `/alloy-apply` | `[name]` | 执行：隔离 workspace → SDD(TDD) → verify → retrospective |
| `/alloy-finish` | `[name]` | 收尾：merge / PR / keep / discard |
| `/alloy-archive` | `[name]` | 归档（硬校验 phase=finished） |
| `/alloy-fix` | — | Bug 修复入口：诊断 → 分流 |
| `/alloy-discard` | `[name]` | 放弃当前 change，清理 worktree + 分支 + 目录 |
| `/alloy-status` | `[name]` | 查看指定 change 的阶段、制品状态、下一步 |

带 `[name]` 的命令省略时，从 `openspec/changes/*/.alloy.yaml` 自动推断当前活跃 change。

上下文推断规则：扫描 → 仅 1 个活跃 → 自动选中；多个 → 提示选择；无活跃 → 报错提示先 `alloy start`。

### 4 条 CLI 命令

| 命令 | 用途 |
|------|------|
| `alloy init` | 项目初始化：检测环境 → 安装依赖 → 部署 schema + skill |
| `alloy status` | 查看所有活跃 change 总览，附带一致性检查 |
| `alloy doctor` | 诊断：版本兼容性、文件一致性 |
| `alloy update` | 更新 Alloy skill 文件到最新版 |

### 命令行为详述

#### alloy start

```
/alloy-start [topic] [--new <topic>]

无活跃 change + 有 topic:
  → 全新开始: explore + brainstorming → draft.md（项目根目录，临时存放）

无活跃 change + 无 topic:
  → Agent 扫描项目上下文（README、requirement.md、已有代码等）
    ├── 有上下文 → 基于项目信息引导，提出建议方向或追问
    └── 空项目 → "请提供主题: alloy start <topic>"

--new <topic>:
  → 无论是否有活跃 change，直接开始新 change 流程
  → 多个 change 可并行 planning，但不能同时 apply

有 1 个活跃 change:
  → 自动接续，从 phase 断点继续

有多个活跃 change:
  → 列出所有活跃 change，用户选择接续哪个
```

#### alloy plan

```
/alloy-plan [name]

前置检查: draft.md 存在
逐制品生成: proposal → design → specs → tasks → plan
每步生成后有审查窗口，可确认或要求修改
始终分步，不提供一键生成
phase → planned
```

#### alloy apply

```
/alloy-apply [name]

前置检查: plan.md 存在
执行步骤:
  1. 记录 worktree 到 .alloy.yaml
  2. using-git-worktrees → 创建隔离 workspace
  3. subagent-driven-development → 逐任务执行（内部含 TDD + code review）
  4. verification-before-completion + openspec-verify-change → verify.md
     → 验证失败则修复后重新验证，直到通过
  5. retrospective.md（证据驱动复盘）
phase → applied
```

#### alloy finish

```
/alloy-finish [name]

前置检查: verify.md 存在, 人工测试已通过（用户确认）
执行: finishing-a-development-branch
  → 4 选项: 本地 merge / 创建 PR / 保持分支 / 丢弃
phase → finished（选项 1,2,3），选项 4 不写 phase 直接进入 discard
```

#### alloy archive

```
/alloy-archive [name]

前置检查（硬拒绝）: phase = finished
执行: openspec archive -y → sync delta spec + 归档
phase → archived
```

#### alloy fix

```
/alloy-fix

1. 环境感知：
   ├── 在 worktree 内 → "当前在 worktree <path>，在此修复并提交"
   └── 不在 worktree → "在当前分支 <branch> 修复并提交"
   （告知用户操作位置，不自动跳转）

2. systematic-debugging → 根因定位

3. 分流:
   不改 spec → TDD 修复 → verification → 直接 PR
   需改 spec:
     ├── 有活跃 change 且 phase < applied → 并入当前 change
     └── 无活跃 change 或 phase ≥ applied → 新开 change
```

#### alloy discard

```
/alloy-discard [name]

phase 行为:
  ├── started / planned         → 仅删 change 目录
  ├── applied / finished        → 删 change + worktree + 分支
  ├── finished（已 merge）      → 警告，仅清理 change 目录
  └── archived                  → 硬拒绝

确认: "输入 'discard <name>' 确认"
```

#### alloy status

```
/alloy-status [name]

输出指定 change: 阶段、change 名、路径、制品状态、下一步
自动附带一致性检查: worktree 残留警告、孤立 worktree 提示
```

### v1 扩展点提示

v1 不调用外部技能，仅在关键节点给出提示：

**start 阶段完成后：**
```
draft.md 已完成。
💡 建议：可以用 grill-me 对需求进行深入拷问，确认后再进入 plan。
→ 继续进入 /alloy-plan
```

**apply 完成后、finish 之前：**
```
retrospective.md 已生成。
💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 finish。
→ 继续进入 /alloy-finish
```

后续版本将扩展点升级为可配置闸门（对话驱动，HARD GATE 阻断流程）。

---

## 三、Schema 制品 DAG

### 依赖图

```
draft.md（Pre-OpenSpec，brainstorming 产出，项目根目录临时存放）
  │
  ▼
proposal  ← 读 draft.md，提取 Why/What/Capabilities
  │
  ├──→ specs     ← 依赖 proposal，只读 Capabilities（故意不读 draft.md）
  │      │
  │      └──→ tasks   ← 依赖 specs + design
  │            │
  │            └──→ plan   ← 依赖 tasks，隐含 superpowers:writing-plans
  │
  └──→ design   ← 依赖 proposal（instruction 读 draft.md，受 proposal 范围约束）

apply  ← 依赖 plan
  ├── worktree         ← superpowers:using-git-worktrees
  ├── subagent         ← superpowers:subagent-driven-development
  │                       （内部含 TDD + code review）
  ├── verify           ← openspec-verify-change → verify.md
  │     └── 失败 → 循环修复直到通过
  └── retrospective    → retrospective.md
```

### 逐依赖理由

| 边 | 理由 |
|----|------|
| proposal 读 draft | 从 draft 决策链中提取范围。draft 在 schema 之外，由 instruction 读取 |
| specs → proposal | 按 Capabilities 列表逐项写 Delta Spec，只关心行为边界 |
| specs ∅→ draft | **故意不读。** 防止行为 spec 被技术实现细节污染 |
| design → proposal | 约束技术方案不超出 proposal 的 Capabilities 范围 |
| design 读 draft | 重组 draft 中的技术决策 |
| tasks → specs + design | 需 specs 告诉"做什么" + design 告诉"怎么做" |
| plan → tasks | 将粗粒度 checkbox 拆为 TDD 微步骤 |

### 与 superpowers-bridge 的关键差异

| 点 | superpowers-bridge | alloy schema |
|----|-------------------|-------------|
| 首个制品 | brainstorm.md（在 change 目录内） | draft.md（change 目录外，临时存放） |
| DAG 时序 | verify/retro 有"有意的时序不对齐"（已承认的设计问题） | 修正：verify/retro 明确为 apply 子步骤，无 DAG 时序矛盾 |
| apply 范围 | 含 archive + PR | 仅到 retrospective，finish/archive 独立命令 |
| planner | 无显式区分 | plan 隐含 writing-plans，生成 TDD 微步骤 |
| extension | 无 | 预留扩展提示点（v2 升级为闸门） |

### 制品产出总览

| 制品 | 阶段 | 产出方式 |
|------|------|----------|
| `draft.md` | Pre-OpenSpec | explore + brainstorming 交互产出 |
| `proposal.md` | plan | Agent 生成 |
| `design.md` | plan | Agent 生成 |
| `specs/` | plan | Agent 生成 |
| `tasks.md` | plan | Agent 生成 |
| `plan.md` | plan | Agent 生成（隐含 writing-plans） |
| `verify.md` | apply | openspec-verify-change 脚本产出 |
| `retrospective.md` | apply | Agent 生成 |

---

## 四、状态管理

### .alloy.yaml

每个 change 一个状态文件，天然支持多 change 并行：

```yaml
# openspec/changes/<name>/.alloy.yaml
phase: started | planned | applied | finished | archived
worktree: null | ".worktrees/<name>"
schema_version: 1
created_at: "2026-05-28"
updated_at: "2026-05-28"
```

| 字段 | 读写者 | 用途 |
|------|--------|------|
| `phase` | CLI + Agent | 决定 `/alloy-start` 的断点恢复路径 |
| `worktree` | apply 写入 | null=未创建；有值=跳过创建直接恢复 |
| `schema_version` | init 写入 | 格式演进兼容 |
| `created_at` | start 写入 | change 创建时间 |
| `updated_at` | phase 变更时写入 | 最后状态变更时间 |

不设子步骤状态。Agent 通过文件存在性自判断——plan.md 存在 → phase ≥ planned，verify.md 存在 → apply 已完成。

### Phase 状态流转

```
started → planned → applied → finished → archived
                                      ↘ (discard，不写 phase，清理后删除)
```

- **started**：draft.md 已移入 change 目录
- **planned**：plan.md 已生成
- **applied**：verify.md + retrospective.md 已生成
- **finished**：人类确认收尾完成
- **archived**：delta spec 已合并归档，硬拒绝 discard

### 断点恢复

`/alloy-start` 检测到活跃 change → 读 phase + worktree + 文件系统 → 自动从断点继续。

---

## 五、CLI 设计

### alloy init

```
alloy init [path] [--scope global|project] [--skip-claude-md]

检测环境 → 安装依赖 → 部署 schema + skill → 兼容性检查
```

流程：
1. 检测 Node.js、git、Claude Code 是否已安装
2. 安装 OpenSpec CLI（`@fission-ai/openspec@1`）+ Superpowers（`obra/superpowers@5`），版本钉在 compat.yaml
3. 从零创建 alloy schema → 写入 `openspec/schemas/alloy/`
4. 部署 SKILL.md 到 `~/.claude/skills/alloy/`（global）或 `.claude/skills/alloy/`（project）
5. 注入 CLAUDE.md 工作流提示（用 `--skip-claude-md` 跳过）
6. 兼容性检查通过即完成

**内置兜底：** vendor 目录预置 Superpowers skill 文件，网络不可用时从 vendor 复制。

**版本冲突处理：** 检测到不兼容的全局 Alloy skill → 提示冲突，用户可选 upgrade 或 project scope。

### alloy status

```
alloy status [path] [--json]
```

扫描 `openspec/changes/*/.alloy.yaml`，输出所有活跃 change 的 phase、制品完成度、下一步建议。自动附带 worktree 残留和孤立 worktree 警告。

### alloy doctor

```
alloy doctor [path] [--json]
```

诊断两项：
- 版本兼容性：OpenSpec/Superpowers 是否在 compat.yaml 范围内
- 文件一致性：.alloy.yaml 的 phase 与实际文件是否匹配

### alloy update

```
alloy update [path]
```

拉取最新 Alloy skill 文件 → 更新 skills/alloy/ 目录 → 更新 vendor → 替换 CLAUDE.md 中 Alloy 标记区域。

### compat.yaml

随 Alloy npm 包发布，不暴露到用户项目：

```yaml
compatible:
  openspec: ">=1.3.0 <2.0.0"
  superpowers: ">=5.0.0 <6.0.0"

install:
  openspec: "@fission-ai/openspec@1"
  superpowers: "obra/superpowers@5"
```

---

## 六、实现组件

| 组件 | 内容 | 参考来源 |
|------|------|----------|
| CLI（TypeScript） | init / status / doctor / update | 参考 Comet 架构分层 |
| Slash Commands | 8 条 SKILL.md + 子步骤 prompt 模板 | 自行设计，参考 Comet 闸门风格 |
| Schema + Templates | alloy schema（从零构建） | 参考 superpowers-bridge artifact 定义 |
| Shell 脚本 | guard / state / archive（闸门校验、状态管理和归档） | 参考 Comet guard 模式 |
| 测试 | CLI 单元测试 + shell 脚本 Bats 测试 | — |

### 依赖稳定性

| 依赖 | 状态 | 风险 |
|------|------|:--:|
| OpenSpec CLI | npm 包，版本化管理 | 低 |
| Superpowers skill | npx skills add 安装，版本化管理 | 低 |
| Claude Code | slash command 机制稳定 | 低 |
| Node.js + git | 基础环境 | 低 |

---

## 七、关键设计决策汇总

| # | 决策 | 理由 |
|----|------|------|
| 1 | v1 仅 Claude Code | 团队统一平台，聚焦质量 |
| 2 | Schema 从零构建，参考 superpowers-bridge + Comet | 零技术债，不留已知 DAG 时序问题 |
| 3 | `/alloy-start` 唯一入口，默认接续 | 降低心智负担 |
| 4 | plan 始终分步，不提供一键生成 | 每步审查的价值大于省下的几秒 |
| 5 | `.alloy.yaml` per-change，非全局 | 天然支持多 change 并行 |
| 6 | Agent 内流程 + CLI 辅助 | 核心工作流依赖 AI 编排，CLI 只做确定性操作 |
| 7 | compat.yaml 钉版本 | init 装已验证的组合，doctor 警告非兼容风险 |
| 8 | verify 在 apply 内部闭环 | 失败循环修复直到通过，不外泄状态 |
| 9 | finish 和 archive 拆分为独立命令 | 中间夹人工测试，不假设 AI 实现正确 |
| 10 | archive 硬校验 phase=finished | 只有人类确认的 change 才能归档 |
| 11 | discard 全阶段可用，archived 硬拒绝 | started/planned 无代码沉淀，可自由丢弃 |
| 12 | fix 以 apply 为 spec 变更分水岭 | 无代码并入当前 change，有代码新开 change |
| 13 | SDD 内部自带 TDD + code review | Alloy 不重复声明 SDD 的实现细节 |
| 14 | 不设子步骤状态追踪 | phase + worktree + 文件检查足够判断恢复位置 |
| 15 | v1 扩展点仅提示、不调用技能 | 可靠性优先，v2 升级为可配置 HARD GATE |
| 16 | receiving-code-review 嵌入 agent 指令 | 行为规范非管道步骤，减少命令数 |
| 17 | brainstorming 产出 draft.md，在 change 目录之外 | 范围确定后命名有依据，schema DAG 无时序问题 |

---

## 八、风险与缓解

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| Superpowers skill 行为变更导致编排失效 | 中 | compat.yaml 钉版本 + alloy update 同步 vendor |
| OpenSpec schema 格式演进 | 低 | alloy schema 独立构建，不依赖上游 schema |
| plan 阶段上下文溢出 | 低 | 逐制品分步 + SDD subagent 上下文隔离 |
| 并行 change 冲突 | 低 | OpenSpec 目录隔离 + worktree 独立 |
| Agent 不遵循 SKILL.md 闸门指令 | 中 | 参考 Comet 用 shell 脚本做 HARD STOP 校验，不可跳过 |

---

## 九、推荐开发路径

1. **原型验证**（第 1-2 周）——写 `/alloy-start` + `/alloy-plan` 的 SKILL.md，在 Claude Code 中跑通 Pre-OpenSpec → 规划阶段
2. **CLI + Schema**（第 3-5 周）——alloy init / status / doctor / update + alloy schema 从零构建
3. **完整流程**（第 6-8 周）——补全 apply / finish / archive / fix / discard 的 SKILL.md + shell 脚本
4. **测试 + 文档 + 推广**（第 9-10 周）——单元测试、团队推广、反馈收集
