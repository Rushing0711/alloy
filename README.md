# Alloy

Alloy 是一套融合 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 和 [Superpowers](https://github.com/obra/superpowers) 的开发工作流编排工具。

**OpenSpec 管"做成什么样"（需求追踪、Delta Spec、归档审计） + Superpowers 管"怎么做"（流程闸门、TDD、系统化调试、验证） = Alloy 编排两者，提供稳定可控的 AI 辅助开发体验。**

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
/alloy:start <你的需求主题>
```

Alloy 会自动引导你走完完整流程：

```
/alloy:start    → 智能入口（自动检测状态，接续或新建）
/alloy:plan     → 逐制品生成（proposal → design → specs → tasks → plan）
/alloy:apply    → 隔离执行（worktree + SDD(TDD) + verify + retrospective）
/alloy:finish   → 收尾（merge / PR / keep / discard，人工闸门）
/alloy:archive  → 归档（硬校验 phase=finished）
```

## 命令参考

### Slash Command（在 Claude Code 中使用）

| 命令 | 用途 |
|------|------|
| `/alloy:start [topic]` | 智能入口：自动检测状态，接续或新建 |
| `/alloy:plan [name]` | 逐制品生成设计文档，始终分步，每步可审查 |
| `/alloy:apply [name]` | 执行：隔离 workspace → SDD(TDD) → 验证 → 复盘 |
| `/alloy:finish [name]` | 收尾：merge / PR / keep / discard |
| `/alloy:archive [name]` | 归档（硬校验 phase=finished，否则拒绝） |
| `/alloy:fix` | Bug 修复入口：诊断 → 分流 |
| `/alloy:discard [name]` | 放弃当前 change，清理 worktree + 分支 + 目录 |
| `/alloy:status [name]` | 查看指定 change 的阶段、制品状态、下一步 |

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
/alloy:start <topic>
     │  explore + brainstorming → draft.md
     ▼
/alloy:plan
     │  proposal → design → specs → tasks → plan
     ▼
/alloy:apply
     │  worktree + SDD(TDD) + verify + retrospective
     ▼
人工测试（人类闸门）
     │
/alloy:finish
     │  merge / PR / keep / discard
     ▼
/alloy:archive（仅 finished 后可执行）
```

### Bug 修复

```
/alloy:fix
     │  systematic-debugging → 根因定位
     ▼
  分流：
  ├── 不改 spec → TDD 修复 → verification → 直接 PR
  └── 需改 spec → 新 change 流程（/alloy:start → plan → apply → finish → archive）
```

## 核心理念

- **每步可审查**：plan 阶段逐制品生成，每一步人类确认后才继续
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
| [alloy-design.md](alloy-design.md) | 主设计文档（命令体系、状态管理、制品 DAG、架构） |
| [hybrid-workflow.md](hybrid-workflow.md) | 工作流设计推导（4 阶段融合、3 种场景） |
| [hybird.md](hybird.md) | 原始对比分析（OpenSpec vs Superpowers） |
| [设计规格](docs/superpowers/specs/2026-05-28-alloy-design-spec.md) | 正式设计规格（brainstorming 产出） |
| [项目由来](docs/project-background.md) | 项目背景与设计历程 |

## 许可

MIT
