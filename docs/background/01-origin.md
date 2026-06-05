# Alloy 项目由来

> **目标读者：** 想了解 Alloy 起源的人（人类）
> **职责：** 讲清楚"为什么会有 Alloy"——从发现两个工具，到调研对比，到融合设计，到产品化。
> **不放入：** 产品规格 → 见 [alloy-design.md](alloy-design.md)；工具对比细节 → 见 [openspec-vs-superpowers.md](openspec-vs-superpowers.md)；工作流编排推导 → 见 [workflow-design.md](../background/03-workflow-evolution.md)。

## 一、起点：两个工具的发现

2026 年初，团队在日常使用 Claude Code + Superpowers 进行 AI 辅助开发。Superpowers 提供了严谨的流程闸门——brainstorming 的设计审批、TDD 的红绿重构、verification 的完成前验证——让我们在 AI 生成代码的混沌中建立了一定的秩序。

但同时也在使用 OpenSpec 管理需求和规格。OpenSpec 的 Delta Spec 机制让我们能追踪"这次改了什么"，归档审计让每次变更都有据可查。两个工具各有长处，但它们是割裂的。

于是产生了最初的问题：**能不能把两者融合，各取所长？**

## 二、调研：OpenSpec vs Superpowers

首先做的是全面对比两个工具的能力边界。产出 [`openspec-vs-superpowers.md`](openspec-vs-superpowers.md)。

### 互补关系

```
Superpowers 擅长                    OpenSpec 擅长
─────────────────                   ─────────────────
流程纪律（闸门、TDD、审查）    ←→    文档追踪（Delta Spec、审计）
调试（systematic-debugging）   ←→    需求管理（propose、explore）
质量保障（verify、review）     ←→    变更历史（archive、spec 演进）
分支管理（git-worktrees）      ←→    多 change 并行
```

**Superpowers 管"怎么做"（流程），OpenSpec 管"做成什么样"（规格）。**

### 各自的短板

**OpenSpec 的短板：**
- 无流程纪律——不强制 TDD、不强制代码审查、不强制分支隔离
- 无测试支持——没有测试相关的 skill 或命令
- 无调试工具——bug 修复缺乏系统化诊断流程

**Superpowers 的短板：**
- 无 spec 追踪——设计文档只有最终版，没有"这次改了什么"的 delta 记录
- 无归档审计——没有版本化的变更历史
- 技能负担重——14 个 skills，实际使用中容易被跳过

## 三、融合设计：混合工作流

基于对比分析，设计了一套融合两工具的工作流。产出 [`workflow-design.md`](../background/03-workflow-evolution.md)。

核心思路：用 OpenSpec 管理需求和变更追踪，用 Superpowers 的流程闸门增强执行纪律。

### 四阶段流程 → 五阶段流程

> **演进说明：** 初版设计将 archive（文档归档）和 finish（代码合入）合并为"收尾"阶段。实际开发中将 archive 和 finish 拆分为独立阶段——先锁定文档证据链，再合入代码。当前 Alloy 工作流为 5 阶段：`start → plan → apply → archive → finish`。

| 阶段（原型） | 主要活动 | 关键工具 |
|------|----------|----------|
| Pre-OpenSpec | 需求探索、设计草案 | `/opsx:explore` + brainstorming → draft.md |
| OpenSpec 规划 | 制品生成、审查 | proposal → design → specs → tasks → plan |
| OpenSpec 执行 | 隔离开发、TDD、验证 | worktree + SDD(TDD) + verify + retrospective |
| 归档（Archive） | Delta Spec 合并、change 归档 | `/opsx:archive` |
| 代码收尾（Finish） | 本地 merge / PR / 保留分支 | `superpowers:finishing-a-development-branch` |

### 三种场景覆盖

1. **从 0 到 1 开发新项目**：需求探索 → 规划 → 执行 → 归档 → 收尾
2. **存量项目开发新功能**：代码探查 → 需求探索 → 规划 → 执行 → 归档 → 收尾
3. **Bug 修复**：诊断 → 分流（不改 spec 直接修，需改 spec 则走完整 change 流程）

## 四、Alloy 设计：从工作流到工具

有了工作流设计，下一步是把它变成一个可用的编排工具。在调研过程中发现了两个相关的社区项目：

- **[superpowers-bridge](https://github.com/JiangWay/openspec-schemas/tree/main/superpowers-bridge)**：一个 OpenSpec schema，将 Superpowers 技能嵌入到 OpenSpec 制品 DAG 中
- **[Comet](https://github.com/rpamis/comet)**：一个已发布的 npm 包，同样做 OpenSpec + Superpowers 编排，但理念不同——Comet 追求简便（hotfix/tweak 快捷路径），与我们要的"稳定可控"方向不一致

### 设计原则

| Comet 的方向 | Alloy 的方向 |
|-------------|-------------|
| 提供快捷路径（hotfix/tweak） | 不提供快捷路径，每步必审查 |
| verify 后直接 archive | finish 和 archive 拆分，中间夹人工闸门 |
| brainstorming 在 OpenSpec 之后 | brainstorming 前置为 Pre-OpenSpec，产出驱动整个规划链 |
| Shell 脚本散落执行上下文 | 脚本做确定性硬校验，不污染 Agent 上下文 |

### 设计评审

经过 brainstorming 对话，确定了以下关键决策：

- **多平台支持**：Claude Code / CodeBuddy / Qoder / Cursor / OpenCode / Codex / Trae / Pi 共 8 个平台
- **Schema 从零构建**：不 fork superpowers-bridge，避免继承已知的 DAG 时序问题
- **扩展点仅提示、不调用**：v1 可靠性优先，后续版本升级为可配置闸门
- **Agent 内流程 + CLI 辅助**：核心工作流依赖 AI 编排，CLI 只做确定性操作

产出 [`alloy-design.md`](alloy-design.md) 和 [`设计规格`](superpowers/specs/2026-05-28-alloy-design-spec.md)。

## 五、开发计划

Alloy 将按四期推进：

1. **原型验证**（第 1-2 周）：写 core 命令的 SKILL.md，跑通完整流程
2. **CLI + Schema**（第 3-5 周）：CLI 命令 + alloy schema 从零构建
3. **完整流程**（第 6-8 周）：补全所有命令和 shell 脚本
4. **测试 + 文档 + 推广**（第 9-10 周）：团队内部推广，收集反馈迭代

## 六、核心理念

> 用 AI 开发，但不依赖 AI 的自觉。每一步有闸门，每一个闸门人类可以审查。稳定可控 > 简便快速。

Alloy 的价值不在于让开发更快——而在于让 AI 辅助的开发过程**可预测、可审查、可追溯**。
