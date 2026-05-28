# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 仓库用途

**Alloy** 是一套融合 OpenSpec（Fission-AI）和 Superpowers（obra）的开发工作流 CLI 工具设计项目。当前处于纯设计阶段，无运行时代码。

Alloy 的价值主张：用 OpenSpec 管理"构建什么"（需求追踪、Delta Spec、审计归档），用 Superpowers 管理"如何构建"（流程闸门、TDD、系统化调试、验证）。

## 核心文档及关系

| 文件 | 角色 | 内容 |
|------|------|------|
| `alloy-design.md` | **主设计文档**（权威源） | Alloy 命令体系、状态管理、制品 DAG、架构、问题方案、安装初始化 |
| `hybrid-workflow.md` | 工作流设计推导 | 4 阶段融合流程、3 种场景（新项目/存量项目/Bug 修复）、技能使用分析 |
| `hybird.md` | 原始对比分析 | OpenSpec vs Superpowers 命令/技能一览、优缺点、互补关系、官方文档精要 |

**阅读顺序：** `alloy-design.md` → `hybrid-workflow.md` → `hybird.md`（背景参考）。

## Alloy 核心设计（摘要自 alloy-design.md）

### 命令体系（8 条）

| 命令 | 用途 |
|------|------|
| `/alloy-init` | 项目级初始化：检测依赖 → 部署 schema + skill |
| `/alloy-start` | 智能入口：自动检测状态，接续或新建 |
| `/alloy-plan` | 逐制品生成设计文档，始终分步，每步可审查 |
| `/alloy-apply` | 执行：隔离 + TDD + 验证 + 复盘 |
| `/alloy-finish` | 收尾：merge / PR / keep / discard |
| `/alloy-archive` | 归档（硬校验 phase=finished） |
| `/alloy-fix` | Bug 修复入口：诊断 → 三向分流 |
| `/alloy-discard` | 放弃当前 change，清理 worktree + 分支 + 目录 |
| `/alloy-status` | 查看当前阶段、制品状态、下一步 |

带 `[name]` 的命令省略时，从 `openspec/changes/*/.alloy.yaml` 自动推断当前活跃 change。

### 三层架构

- **CLI 控制层**（TypeScript）：前置检查、状态管理、DAG 解析、文件操作——确定性强
- **Schema 制品层**：DAG 依赖定义、instruction 指令——硬约束
- **大模型内容层**：文档生成、代码生成、交互决策——柔性，人类审查

### 制品依赖 DAG

```
draft.md（Pre-OpenSpec，brainstorming 产出）
  → proposal → specs → tasks → plan（隐含 writing-plans）
  → proposal → design → tasks
apply 依赖 plan → worktree + subagent(TDD+review) + verify + retrospective
```

关键约束：specs 故意不读 draft.md（防止行为契约被技术实现细节污染）；design 读 draft 但受 proposal 范围约束。

### 每个 change 的状态文件

`openspec/changes/<name>/.alloy.yaml`：
```yaml
phase: started | planned | applied | finished | archived
worktree: .worktrees/<name>
```

### 上游依赖

Alloy 依赖 OpenSpec CLI（`@fission-ai/openspec`）和 Superpowers 技能插件。`alloy init` 仅检测不自动安装——上游依赖由用户自行管理。

## 设计约束与风格

- 所有文档和沟通使用中文；代码标识符和第三方库名保持英文
- 提交信息使用中文，格式为 `conventional-commits` 风格（如 `Alloy 设计文档：命令体系...`）
- `.gitignore` 规则：`*.local.*` 忽略本地配置覆盖文件；`docs/superpowers/`、`.worktrees/`、`worktrees/` 忽略 Superpowers 运行时产物

## 外部参考

- OpenSpec 仓库：https://github.com/Fission-AI/OpenSpec
- OpenSpec 文档：https://github.com/Fission-AI/OpenSpec/tree/main/docs
- Superpowers 仓库：https://github.com/obra/superpowers
