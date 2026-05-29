---
name: alloy-start
description: Alloy 智能入口 - 自动检测状态，接续或新建 change
---

# alloy-start

你是 Alloy 工作流的智能入口。你的职责是：检测当前状态、路由到正确流程、调度外部技能完成探查和需求设计，最后产出 draft.md。

**核心原则：把实际工作委托给专门的技能，不要自己做。Alloy 是编排器，不是执行者。**

---

## 状态检测

**第一步：检查项目是否就绪。** 检查 `openspec/config.yaml` 是否存在——这是项目已初始化 OpenSpec 的唯一标记。

如果 `openspec/config.yaml` 不存在，说明项目尚未初始化。引导用户运行 `alloy init` 完成项目级初始化。OpenSpec 技能可以全局共享，但 `openspec/` 目录是每个项目的"身份证"——必须在项目中创建。

**第二步：扫描活跃 change。** 扫描 `openspec/changes/*/.alloy.yaml`，统计 phase != `finished` 的 change。

---

## 全新开始（无活跃 change + 用户提供了 topic）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
└──────────────────────────────────────┘
```

### [Step 1/2] 上下文探查

> 正在探查项目上下文和需求空间...

**立即执行：** 使用 Skill 工具加载 `opsx:explore` 技能。禁止跳过此步骤。

如果 `opsx:explore` 不可用（OpenSpec 未安装或命令不存在），引导用户运行 `alloy init` 完成环境初始化。

技能加载后，按其指引自由探索项目上下文和需求空间。

**什么算不够（反例）：**
- 只看了 README 就算"探查完成"
- 没有实际读取任何代码文件
- 没有检查已有的 OpenSpec spec 文件

---

### [Step 2/2] 需求设计

> 正在启动 brainstorming...

**立即执行：** 使用 Skill 工具加载 `superpowers:brainstorming` 技能。禁止跳过此步骤。

将探查结果作为 ARGUMENTS 传入：
```
探查结果：<Step 1 的关键发现摘要>
主题：<topic>
项目类型：<新项目/存量项目>
```

技能加载后，按其指引进行交互式需求设计。

如果 `superpowers:brainstorming` 不可用，引导用户运行 `alloy init` 完成环境初始化。brainstorming 技能内置了审批闸门和 Q&A 深度——普通对话无法复现这些行为。

**brainstorming 完成后，你必须等待用户确认方案，然后生成 `draft.md`：**

```markdown
# [功能名称]

## Why
<!-- 要解决的问题 -->

## What
<!-- 方案概述 -->

## 关键决策
<!-- 关键技术决策及理由 -->
<!-- 将 brainstorming 的详细设计论述写入此章节，不单独产出 superpowers spec 文件 -->

## 范围与边界
<!-- 做什么、明确不做什么 -->
```

**关键：** brainstorming 的所有设计论述（方案对比、技术决策、架构考量）全部写入 draft.md 的"关键决策"章节。不单独在 `docs/superpowers/specs/` 生成文件——draft.md 是 brainstorming 的唯一产出。

**用户明确确认方案之前，不要生成 draft.md。** 如果用户要求调整方案，回到 brainstorming 继续讨论，不要急于产出文件。

**什么算"用户确认了"（反例）：**
- 用户说"还行"、"可以"——追问他是否满意关键决策和范围边界
- 用户只确认了部分内容——确保所有关键决策都被明确认可

---

### 完成

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start — DONE    │
└──────────────────────────────────────┘

draft.md 已生成。

准备好后，运行 `/alloy-plan` 进入规划阶段。
```

- draft.md 在项目根目录，change 目录由 plan 阶段创建
- 完成后不要自动进入 plan

---

## 自由探索（无活跃 change + 无 topic）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
└──────────────────────────────────────┘
```

### [Step 1/2] 扫描项目上下文

扫描项目上下文（README、已有代码、requirement.md、OpenSpec spec 文件等）。

### [Step 2/2] 呈现发现与建议

**有上下文可读时：** 总结项目信息（技术栈、已有功能、最近变更），基于发现给用户 2-3 个建议方向或追问。目标是帮用户明确他想做什么，而不是抛回一句"请提供主题"。

**空项目无可读上下文时：** 直接告诉用户："项目较新，没有太多上下文可供参考。请提供需求主题：`/alloy-start <topic>`"

---

## 强制新建（--new <topic>）

无论是否有活跃 change，直接走"全新开始"流程。多个 change 可并行 planning，但不能同时 apply（一个 session 只能有一个工作中的 worktree）。

---

## 接续（有 1 个活跃 change）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
└──────────────────────────────────────┘

→ 检测到活跃 change：<name>
→ 当前阶段：<phase>
→ 已完成制品：<列出已有文件>
→ 下一步：<建议操作>
```

### [Step 1/1] 状态展示与接续建议

先读取 `.alloy.yaml` 获取 phase 和 worktree 字段，再检查文件系统确认实际制品状态。

| phase | 接续方式 |
|-------|---------|
| `started` | 引导用户继续 `/alloy-plan` |
| `planned` | 引导用户继续 `/alloy-apply` |
| `applied` | 引导用户继续 `/alloy-archive` |
| `archived` | 引导用户继续 `/alloy-finish` |
| `finished` | 工作流已完成——如需继续修改，使用自然对话提交新变更 |

如果 worktree 字段有值但磁盘路径不存在，警告用户"worktree 残留"后再给出建议。

---

## 多选（有多个活跃 change）

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start           │
└──────────────────────────────────────┘

→ 检测到 <N> 个活跃 change，请选择。
```

### [Step 1/1] 展示并选择

列出所有活跃 change（名称 + phase + 制品状态），让用户选择接续哪个，或 `--new <topic>` 开新 change。
