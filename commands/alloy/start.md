---
name: "Alloy: Start"
description: Alloy 智能入口 - 自动检测状态，接续或新建 change
category: Workflow
tags: [alloy, workflow]
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

**额外上下文——来自历史 retrospective 的教训：** 在探查阶段，扫描 `openspec/changes/archive/` 下最近 3 个已归档 change 的 `retrospective.md`，提取以下信息作为本次 brainstorming 的参考：

- **§5 意外发现**：上一次有哪些假设被推翻？这次可能也有类似盲区
- **§6 值得推广**：有哪些未勾选的 carry-forward item？这次可以直接勾上
- **§4 技能跳过模式**：如果连续两个 retrospective 中同一技能被 ✗，提醒用户该技能可能不适合本项目

> 这些信息不是约束——只是在 brainstorming 时提醒 Agent 和用户"上次我们踩了这个坑"。

---

### [Step 2/2] 需求设计

> 正在启动 brainstorming...

**前置预检：** 确认 `superpowers:brainstorming` 技能可用。若不可用 → 引导用户运行 `alloy init` 重新安装 → STOP。不在 Step 2 才发现缺失。

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

用户确认方案后，执行以下步骤：

1. **建议 change name**——根据 draft 内容建议 kebab-case 名称，用户确认
2. **调用 `/opsx:new <name>`** 创建 change 目录
3. **将 draft.md 移入 change 目录** `openspec/changes/<name>/`
4. **写入 state**：
   ```bash
   alloy _state write openspec/changes/<name> phase started
   alloy _state write openspec/changes/<name> worktree null
   alloy _state write openspec/changes/<name> schema_version 1
   alloy _state write openspec/changes/<name> created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   ```
5. **计算并记录 hash，然后 commit**：
   ```bash
   DRAFT_HASH=$(alloy _record compute openspec/changes/<name> draft)
   APPROVED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   APPROVER=$(git config user.name)
   alloy _record write openspec/changes/<name> draft "$DRAFT_HASH" "$APPROVED_AT" "$APPROVER"
   git add openspec/changes/<name>/
   git commit -m "feat(<name>): draft 已确认"
   ```

6. **分支选择**——检测 git 状态，确认工作分支：

   先获取当前分支：
   ```bash
   CURRENT_BRANCH=$(git branch --show-current)
   echo "当前分支：$CURRENT_BRANCH"
   ```

   展示选项，让用户选择：

   > **选择工作分支**
   > ──────────────────────────────────────
   > 当前在 `<$CURRENT_BRANCH>` 分支。
   >
   > **1.** 在当前分支继续 — 直接在此分支开发
   > **2.** 切换到已有分支  — 选择一个已有分支
   > **3.** 新建分支        — 创建新分支并切换

   - **选 1：** 不操作，直接继续
   - **选 2：** 展示已有分支列表（`git branch -a`），用户选择后执行 `git checkout <branch>`
     - 如果该 change 后续使用 worktree，此分支名仅作参考记录
   - **选 3：** 询问用户输入新分支名，执行 `git checkout -b <new-branch>`
     - Agent 可建议分支名（如 `<change-name>`），由用户确认

   分支选择完成后，记录到状态：
   ```bash
   alloy _state write openspec/changes/<name> worktree null
   ```

   > ⚠️ apply 阶段仍会通过 `using-git-worktrees` 再次确认隔离方式。此处的分支选择是给后续阶段一个推荐的开发分支。

---

### 完成

```
┌──────────────────────────────────────┐
│ Alloy [1/5] · Phase: Start — DONE    │
└──────────────────────────────────────┘

→ Change: <name>
→ Phase: started
→ draft.md 已锁定（hash + commit）

draft.md 已完成。
💡 建议：可以用 grill-me 对需求进行深入拷问，确认后再进入 plan。

准备好后，运行 `/alloy:plan` 进入规划阶段。
```

- draft.md 已在 change 目录，项目根目录不再有 draft.md
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

**空项目无可读上下文时：** 直接告诉用户："项目较新，没有太多上下文可供参考。请提供需求主题：`/alloy:start <topic>`"

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
| `started` | 引导用户继续 `/alloy:plan` |
| `planned` | 引导用户继续 `/alloy:apply` |
| `applied` | 引导用户继续 `/alloy:archive` |
| `archived` | 引导用户继续 `/alloy:finish` |
| `finished` | 工作流已完成——如需继续修改，使用自然对话提交新变更 |

一致性检查（双向）：
- worktree 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留：.alloy.yaml 声称有 worktree 但磁盘不存在"
- worktree 字段为 null 但 `.worktrees/<name>/` 目录存在 → ⚠️ "worktree 孤儿：磁盘存在 worktree 但 .alloy.yaml 未记录，建议手动验证并更新状态"
- 发现孤儿 worktree 时，询问用户是否修复 .alloy.yaml：`alloy _state write openspec/changes/<name> worktree ".worktrees/<name>"`

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
