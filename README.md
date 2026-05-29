# Alloy

Alloy 是一套融合 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 和 [Superpowers](https://github.com/obra/superpowers) 的开发工作流编排工具。

## Alloy 是什么？

Alloy 是一个 **AI 编码 Agent 的驾驶舱**——它不写代码，而是告诉 Agent **何时写、怎么写、写完之后谁来把关**。

### 解决的问题

用 AI 辅助开发的团队通常会遇到三个痛点：

1. **需求容易偏**——Agent 理解的"要做的东西"和人类想的常常不一样，聊着聊着范围就漂了
2. **质量靠自觉**——TDD、代码审查、分支隔离全看 Agent 心情，同一个 session 里前面记得后面就忘了
3. **改完不留痕**——代码是改了，但"为什么这么改"、"这次改了哪些 spec"没有记录，下次换个人（或换个 session）就断片了

Alloy 在现有两个工具的基础上补上了这些缺口：

| 工具 | 管什么 | 各自的短板 |
|------|--------|-----------|
| **OpenSpec** | "做成什么样"——需求追踪、Delta Spec、归档审计 | 有文档没纪律：不强制 TDD、不强制审查、不强制分支隔离 |
| **Superpowers** | "怎么做"——流程闸门、TDD、系统化调试、验证 | 有纪律没档案：改了代码但没记录"这次改了什么 spec" |
| **Alloy** | "编排两者"——把规格管理和流程纪律缝成一条完整的、不可跳步的工作流 | — |

### Alloy 怎么做

Alloy 把一次开发拆成 5 个有闸门的阶段：

```
/alloy-start    → 把需求聊透（explore + brainstorming），产出设计草案
/alloy-plan     → 制品生成 proposal/design/specs/tasks/plan，每步人类审查
/alloy-apply    → 隔离环境 + SDD + TDD + verify，verify 不过不结束
/alloy-finish   → 人类决定合入/PR/保留/丢弃（人工闸门）
/alloy-archive  → Delta Spec 合入主 spec，归档审计
```

每个阶段之间有闸门——上一个阶段没完成、没审查通过，**进不了下一个阶段**。这不是靠 Agent 自觉，是靠 SKILL.md 里的硬指令和 shell 脚本的 HARD STOP 校验。

### Alloy 不是什么

- **不是一个新框架**——不引入新的 DSL、新的配置格式。制品格式沿用 OpenSpec，技能沿用 Superpowers
- **不让开发更快**——反而因为有审查窗口和闸门，会比"让 Agent 一把梭"更慢。慢是故意的：省下的时间是拿质量换的
- **不是 Comet**——Comet 也是 OpenSpec + Superpowers 的编排工具，但核心理念不同：
  - Comet 先跑 OpenSpec 生成 proposal/specs，**再**调 brainstorming 做深度设计——brainstorming 的能力没有反哺到 spec 中
  - Comet 的 finish → archive 是自动流转，缺少人工闸门——AI 按流程开发的代码不一定没偏差，不严重的偏差直接归档是不稳妥的
  - Comet 没有复盘制品（retrospective）——改完不留痕，下次换人（或换 session）就断了
  - Comet 没有设计草稿（draft.md）——需求一上来就直接进 OpenSpec artifacts，缺少一个"先把事情想清楚"的阶段
  - 一句话：Comet 给的是**速度和便利**，Alloy 给的是**掌控力和稳妥感**——每个制品有审查窗口，代码落地前有人工闸门，改完有复盘留痕

### 适合谁

- 用 Claude Code + Superpowers 做日常开发的团队
- 对 AI 生成代码的质量有要求、希望有审查机制的项目

> 项目由来与设计历程详见 [docs/project-background.md](docs/project-background.md)。

## 安装

```bash
npm install -g @alloy/cli
cd your-project
alloy init
```

`alloy init` 自动完成：检测环境 → 安装 OpenSpec CLI + Superpowers → 部署 Alloy skill 和 schema → 兼容性检查。

```bash
alloy init --scope project   # 安装到项目级（覆盖全局版本）
alloy init --skip-claude-md  # 不修改 CLAUDE.md
```

## 快速开始

在 Claude Code 中输入：

```
/alloy-start <你的需求主题>
```

Alloy 会自动引导你走完完整流程：

```
/alloy-start    → 智能入口（自动检测状态，接续或新建）
/alloy-plan     → 制品生成（proposal → design → specs → tasks → plan）
/alloy-apply    → 隔离执行（worktree + SDD(TDD) + verify + retrospective）
/alloy-finish   → 收尾（merge / PR / keep / discard，人工闸门）
/alloy-archive  → 归档（硬校验 phase=finished）
```

## 命令参考

### Slash Command（在 Claude Code 中使用）

| 命令 | 用途 |
|------|------|
| `/alloy-start [topic]` | 智能入口：自动检测状态，接续或新建 |
| `/alloy-plan [name]` | 制品生成设计文档，始终分步，每步可审查 |
| `/alloy-apply [name]` | 执行：隔离 workspace → SDD(TDD) → 验证 → 复盘 |
| `/alloy-finish [name]` | 收尾：merge / PR / keep / discard |
| `/alloy-archive [name]` | 归档（硬校验 phase=finished，否则拒绝） |
| `/alloy-fix` | Bug 修复入口：诊断 → 分流 |
| `/alloy-discard [name]` | 放弃当前 change，清理 worktree + 分支 + 目录 |
| `/alloy-status [name]` | 查看指定 change 的阶段、制品状态、下一步 |

带 `[name]` 的命令省略时自动从当前活跃 change 推断。

### CLI 命令（在终端使用）

| 命令 | 用途 |
|------|------|
| `alloy init` | 项目初始化 |
| `alloy status` | 查看所有活跃 change 总览 |
| `alloy doctor` | 诊断：版本兼容性、文件一致性 |
| `alloy update` | 更新 Alloy skill 文件到最新版 |

## 工作流概览

### 功能开发

```
requirement.md
     │
/alloy-start <topic>
     │  explore + brainstorming → draft.md
     ▼
/alloy-plan
     │  proposal → design → specs → tasks → plan
     ▼
/alloy-apply
     │  worktree + SDD(TDD) + verify + retrospective
     ▼
人工测试（人类闸门）
     │
/alloy-finish
     │  merge / PR / keep / discard
     ▼
/alloy-archive（仅 finished 后可执行）
```

### Bug 修复

```
/alloy-fix
     │  systematic-debugging → 根因定位
     ▼
  分流：
  ├── 不改 spec → TDD 修复 → verification → 直接 PR
  └── 需改 spec → 新 change 流程（/alloy-start → plan → apply → finish → archive）
```

## 核心理念

- **每步可审查**：plan 阶段制品生成，每一步人类确认后才继续
- **人工闸门**：apply 和 archive 之间夹着 finish（人类决定 merge/PR/keep/discard）
- **稳定可控 > 简便快速**：不提供跳过审查的快捷路径
- **AI 做执行，人类做决策**：Agent 负责生成和验证，人类负责审查和收尾

## 依赖

| 依赖 | 说明 |
|------|------|
| [OpenSpec CLI](https://github.com/Fission-AI/OpenSpec) | 需求管理和 Delta Spec 追踪 |
| [Superpowers](https://github.com/obra/superpowers) | 流程闸门技能（brainstorming、TDD、verification 等） |
| Claude Code | AI Agent 运行平台（v1） |
| Node.js ≥ 22 + git | 基础环境 |

`alloy init` 自动安装 OpenSpec 和 Superpowers，版本范围由 [compat.yaml](compat.yaml) 管理。

## 文档索引

| 文档 | 内容 |
|------|------|
| [alloy-design.md](docs/alloy-design.md) | 主设计文档（命令体系、状态管理、制品 DAG、架构） |
| [openspec-vs-superpowers.md](docs/openspec-vs-superpowers.md) | 原始对比分析（OpenSpec vs Superpowers） |
| [workflow-design.md](docs/workflow-design.md) | 工作流设计推导（4 阶段融合、3 种场景） |
| [skill-writing-guide.md](docs/skill-writing-guide.md) | **Skill 编写指南**（开发前必读） |
| [设计规格](docs/superpowers/specs/2026-05-28-alloy-design-spec.md) | 正式设计规格（brainstorming 产出） |
| [项目由来](docs/project-background.md) | 项目背景与设计历程 |

## 许可

MIT
