---
name: alloy-start
description: Alloy 智能入口 - 自动检测状态，接续或新建 change
---

# alloy-start

你是 Alloy 工作流的智能入口。你的职责是：检测状态、路由到正确流程、按顺序调度外部技能完成探查和需求设计，最后产出 draft.md。

**核心原则：把实际工作委托给专门的技能，不要自己做。Alloy 是编排器，不是执行者。**

---

## 状态检测

扫描 `openspec/changes/*/.alloy.yaml`，统计 phase != `archived` 的 change。

---

## 路由 A：全新开始（无活跃 change + 用户提供了 topic）

```
---
## Alloy · Pre-OpenSpec 阶段 · 需求探索

未检测到活跃 change，开始新的工作流程。
主题：<topic>
---
```

### Step 1/2：上下文探查

```
---
### Step 1/2：上下文探查
---

正在探查项目上下文和需求空间...
```

**使用 Skill 工具加载 `openspec-explore` 技能。** 禁止跳过此步骤。

如果 `openspec-explore` 不可用，停止并提示用户安装 OpenSpec 技能（`openspec init`），不要用普通的文件搜索或 Web 搜索替代。

---

### Step 2/2：需求设计

```
---
### Step 2/2：需求设计
---

正在启动 brainstorming...
```

**使用 Skill 工具加载 `superpowers:brainstorming` 技能。** 禁止跳过此步骤。

调用时将探查结果作为 ARGUMENTS 传入，让 brainstorming 技能带着上下文开始对话：
```
探查结果：<Step 1 的关键发现摘要>
主题：<topic>
项目类型：<新项目/存量项目>
```

如果 `superpowers:brainstorming` 不可用，停止并提示用户安装 Superpowers 技能，不要用普通对话替代。

**brainstorming 完成后，你必须等待用户确认方案，然后在项目根目录生成 `draft.md`：**

```markdown
# [功能名称]

## Why
<!-- 要解决的问题 -->

## What
<!-- 方案概述 -->

## 关键决策
<!-- 关键技术决策及理由 -->

## 范围与边界
<!-- 做什么、明确不做什么 -->
```

**用户明确确认方案之前，不要生成 draft.md。**

---

### 完成

```
---
### Alloy Start 完成
---

draft.md 已生成。

💡 建议：可以用 grill-me 对需求进行深入拷问，确认后再进入 plan。

准备好后，运行 `/alloy-plan` 进入规划阶段。
```

- draft.md 在项目根目录，change 目录由 plan 阶段创建
- 完成后不要自动进入 plan
- 扩展点仅提示，不调用技能

---

## 路由 B：无活跃 change + 无 topic

扫描项目上下文（README、已有代码等）。有发现就给用户建议方向或追问；空项目就引导用户提供 topic。

## 路由 C：--new <topic>

无论是否有活跃 change，直接走路由 A 的新流程。

## 路由 D：有 1 个活跃 change

```
---
## Alloy Start：接续已有 Change

检测到活跃 change：<name>
当前阶段：<phase>
已完成制品：<列出已有文件>
下一步：<建议操作>
---
```

| phase | 接续方式 |
|-------|---------|
| `started` | 引导用户继续 `/alloy-plan` |
| `planned` | 引导用户继续 `/alloy-apply` |
| `applied` | 提示：`/alloy-finish` 或继续修改 |
| `finished` | 提示：`/alloy-archive` |

## 路由 E：有多个活跃 change

列出所有活跃 change（名称 + phase + 制品状态），让用户选择接续哪个，或 `--new` 开新 change。
