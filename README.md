# Alloy

> **本文档是给人类看的项目入口。** 如果你是 AI Agent，请读 [CLAUDE.md](CLAUDE.md)。

Alloy 是一套融合 [OpenSpec](https://github.com/Fission-AI/OpenSpec)（需求追踪）和 [Superpowers](https://github.com/obra/superpowers)（流程纪律）的开发工作流编排工具。

---

## 文档导航

| 我想… | 读这个 |
|-------|------|
| 了解 Alloy 是什么、能做什么 | 你正在看的就是——往下读 |
| 理解为什么这么设计 | [project-background.md](docs/project-background.md) — 项目起源与设计历程 |
| 看完整产品规格（命令、状态管理、制品 DAG） | [alloy-design.md](docs/alloy-design.md) — 产品"真相源" |
| 看原始工作流推导（OpenSpec+Superpowers 融合分析） | [workflow-design.md](docs/workflow-design.md) — 设计决策来源 |
| 看两个基础工具的对比分析 | [openspec-vs-superpowers.md](docs/openspec-vs-superpowers.md) |
| 构建、测试、调试 Alloy 本身 | [alloy-dev-guide.md](docs/alloy-dev-guide.md) — 开发者手册 |
| 写或改 Alloy Skill | [skill-writing-guide.md](docs/skill-writing-guide.md) — Skill 编写规范（改 SKILL.md 前必读） |
| 看 Agent 的行为约束 | [CLAUDE.md](CLAUDE.md) — Agent 专用，人类可跳过 |

### 文档角色速览

| 文档 | 角色 | 目标读者 |
|------|------|---------|
| README.md | **入口** — 项目概览 + 导航 | 人类 |
| [alloy-design.md](docs/alloy-design.md) | **WHAT** — 产品规格 | 人类 + Agent |
| [alloy-dev-guide.md](docs/alloy-dev-guide.md) | **DO** — 开发者手册 | 人类 |
| [CLAUDE.md](CLAUDE.md) | **HOW** — Agent 约束 | Agent |
| [skill-writing-guide.md](docs/skill-writing-guide.md) | **SKILL** — 编写规范 | 人类 + Agent |
| [workflow-design.md](docs/workflow-design.md) | **WHY** — 设计推导 | 人类 |
| [project-background.md](docs/project-background.md) | **STORY** — 项目故事 | 人类 |
| [openspec-vs-superpowers.md](docs/openspec-vs-superpowers.md) | **RESEARCH** — 调研对比 | 人类 |

---

## Alloy 是什么？

**Alloy 是 AI 编码 Agent 的驾驶舱。** 它不写代码，而是告诉 Agent **何时写、怎么写、写完谁来把关**。

### 为什么需要 Alloy

用 AI 编码的团队普遍遇到三个问题：

1. **需求漂移** — Agent 理解的"要做的东西"和人类想的不一样，聊着聊着范围就跑了
2. **质量靠自觉** — TDD、代码审查、分支隔离全看 Agent 当天心情，同一个 session 里前面记得后面就忘
3. **改完不留痕** — 代码改了，但"为什么这么改"、"这次变了哪些 spec"没记录，下次换人就断片

Alloy 把两个工具缝合到一起，填上各自的缺口：

| 工具 | 管什么 | 各自的短板 |
|------|--------|-----------|
| **OpenSpec** | "做成什么样" — 需求追踪、Delta Spec、归档审计 | 有文档没纪律：不强制 TDD、不强制审查、不强制隔离 |
| **Superpowers** | "怎么做" — 流程闸门、TDD、系统化调试、验证 | 有纪律没档案：改了代码但没记录"这次改了什么 spec" |
| **Alloy** | **编排两者** — 规格管理 + 流程纪律 = 完整且不可跳步的工作流 | — |

### Alloy 不是什么

- **不是新框架** — 不引入新 DSL 或配置格式。制品格式沿用 OpenSpec，技能沿用 Superpowers
- **不以"快"为卖点** — 审查窗口和闸门会让流程比"一把梭"更慢。慢是故意的：省下的时间是拿质量换的
- **不是 Comet** — Comet 也是 OpenSpec + Superpowers 编排工具，但核心差异在：
  - Comet 的 brainstorming 没有反哺到 spec；Alloy 先 brainstorm 出 draft.md，再进 OpenSpec
  - Comet 的 finish→archive 自动流转缺人工闸门；Alloy 每个阶段有审查窗口
  - Comet 没有复盘（retrospective）和设计草稿（draft.md）
  - 一句话：Comet 给**速度和便利**，Alloy 给**掌控力和稳妥感**

### 适合谁

- 用 Claude Code（或其他 AI Agent）+ Superpowers 做日常开发的团队
- 对 AI 生成代码质量有要求、希望有结构化审查机制的项目
- 需要需求追踪和审计归档的正式项目

---

## 核心特点

- **五阶段闸门工作流** — start → plan → apply → archive → finish，每个阶段之间有硬校验，上一阶段没完成进不了下一阶段
- **制品 DAG 驱动** — 8 个制品按依赖关系依次生成，schema 定义依赖图，`/opsx:continue` 自动编排
- **三层防线** — SKILL.md 指令（引导 Agent）+ shell 脚本硬校验（阻断非法转换）+ 人类审查窗口（最终决策）
- **AI 执行，人类决策** — 代码生成、验证、复盘由 Agent 完成；审查、确认、收尾由人类决定
- **关键决策点用户有感** — git 初始化、worktree 创建、执行策略（并行/串行）均展示选项让用户选择，不静默替用户做决定
- **上下文一致性** — 不硬编码语言或平台偏好，指令/模板写什么语言，Agent 自然产出什么语言

---

## 安装

```bash
npm install -g @alloy/cli
cd your-project
alloy init
```

`alloy init` 自动完成：检测环境（Node.js ≥ 22 + git + Claude Code）→ 安装 OpenSpec CLI + Superpowers → 部署 Alloy skill 和 schema → 兼容性检查。

```bash
alloy init --scope project   # 安装到项目级（默认）
alloy init --scope global    # 安装到全局
```

---

## 工作流

### 五阶段概览

```
/alloy-start    [1/5]  智能入口 — 状态检测 → 上下文探查 → 需求设计 → draft.md
/alloy-plan     [2/5]  制品生成 — proposal → design → specs → tasks → plan（每步审查）
/alloy-apply    [3/5]  隔离执行 — worktree(可选) + SDD/串行(可选) + 双层验证 + 复盘
/alloy-archive  [4/5]  归档 — Delta Spec 合并主 spec → 移入 archive/ → 提交
/alloy-finish   [5/5]  收尾 — merge / PR / keep（人工闸门）
```

### 制品 DAG

```
draft.md              ← /alloy-start 产出（需求探索 + brainstorming）
  │
  ├──→ proposal ──→ design ──→ specs ──→ tasks ──→ plan
  │        │                       ↑                    │
  │        └───────────────────────┘                    │
  │                                                     │
  └──→ (plan 完成，phase=planned)                        │
                                                         │
/alloy-apply:                                            │
  plan ──→ worktree(可选) ──→ 实现(SDD/串行) ──→ verify ──→ retrospective
                                                         │
/alloy-archive:                                          │
  verify ──→ openspec archive ──→ delta spec 合并 ──→ phase=archived
                                                         │
/alloy-finish:                                           │
  merge / PR / keep ──→ phase=finished
```

| 制品 | 阶段 | 依赖 | 说明 |
|------|------|------|------|
| `draft.md` | start | — | 需求探索 + 设计决策（change 创建后移入 change 目录） |
| `proposal.md` | plan | draft | Capabilities 列表，创建 specs 的合约 |
| `design.md` | plan | proposal + draft | 技术决策、架构、数据流 |
| `specs/*.md` | plan | proposal | 行为契约（Delta Spec，不读 draft 防技术污染） |
| `tasks.md` | plan | specs + design | 实现任务清单 |
| `plan.md` | plan | tasks | 执行剧本（微步骤，给 Agent 执行） |
| `verify.md` | apply | plan | 7 项结构化检查结果 |
| `retrospective.md` | apply | verify | 证据驱动复盘（§0-§6） |

---

## 命令参考

> 完整命令行为、参数详情、阶段闸门规则见 [alloy-design.md](docs/alloy-design.md)。下面只列概览。

### Slash Command（在 AI Agent 中使用）

| 命令 | 用途 |
|------|------|
| `/alloy-start [topic]` | 智能入口：状态检测 → 上下文探查 → 需求设计 |
| `/alloy-plan [name]` | 制品生成：proposal → design → specs → tasks → plan |
| `/alloy-apply [name]` | 隔离执行：worktree + SDD/串行 + 两层验证 + 复盘 |
| `/alloy-archive [name]` | 归档：Delta Spec 合并 + 提交 |
| `/alloy-finish [name]` | 收尾：merge / PR / keep |
| `/alloy-fix` | Bug 修复：诊断 → 分流（不改 spec / 需改 spec） |
| `/alloy-discard [name]` | 放弃 change，清理 worktree + 分支 |
| `/alloy-status [name]` | 查看阶段、制品状态、下一步 |

带 `[name]` 的命令省略时，自动从 `openspec/changes/*/.alloy.yaml` 推断活跃 change。

### CLI 命令（在终端使用）

| 命令 | 用途 |
|------|------|
| `alloy init [path]` | 项目初始化 |
| `alloy status [path]` | 活跃 change 总览（支持 `--json`） |
| `alloy doctor [path]` | 诊断：版本兼容性、文件一致性（支持 `--json`） |
| `alloy update [path]` | 更新 skill 文件到最新版 |

---

## 核心理念

- **每步可审查** — plan 阶段每个制品生成后，人类确认才能继续。不提供"一键跳过"的快捷路径
- **人工闸门** — apply 和 archive 的完成都是阻塞点，留给用户 QA 和审视的空间
- **稳定可控 > 简便快速** — 三层防线（指令 + 脚本 + 审查）确保流程不被跳过
- **Agent 做执行，人类做决策** — 生成和验证交给 Agent，审查和收尾交给人类
- **制品上下文即语言偏好** — 指令和模板写什么语言，产出就是什么语言，不绑定任何平台机制

---

## 依赖

| 依赖 | 版本 | 说明 |
|------|------|------|
| [OpenSpec CLI](https://github.com/Fission-AI/OpenSpec) | `>=1.3.0 <2.0.0` | 需求管理和 Delta Spec 追踪 |
| [Superpowers](https://github.com/obra/superpowers) | `>=5.0.0 <6.0.0` | 流程闸门技能 |
| Claude Code | — | AI Agent 运行平台（v1） |
| Node.js | ≥ 22 | 运行时 |
| git | — | 版本控制 |

---

## 许可

MIT
