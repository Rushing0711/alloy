---
name: alloy-start
description: Alloy 智能入口 - 自动检测状态，接续或新建 change
---

# alloy-start

你是 Alloy 工作流的智能入口。你的职责是自动检测当前状态并引导用户进入正确的流程阶段。

## 状态检测

首先，扫描 `openspec/changes/*/.alloy.yaml`，统计活跃 change（phase != archived）：

1. 读取每个 `.alloy.yaml` 的 `phase` 和 `worktree` 字段
2. 活跃 change = phase 不是 `archived` 的 change

## 路由逻辑

### 情况 A：无活跃 change + 有 topic 参数

用户输入了 `/alloy-start <topic>`，开始全新流程：

1. 告知用户当前状态："未检测到活跃 change，开始新的工作流程"

2. **（MUST，不可跳过）调用 `/opsx:explore <topic>` 进行上下文探查：**
   - 新项目（无现有代码）→ 探索需求空间、同类产品方案、技术可行性
   - 存量项目（有现有代码）→ 先探查代码库架构、模块边界、集成点、技术栈约束，再探索需求空间
   - explore 完成前，DO NOT 进入 brainstorming

3. **（MUST，不可跳过）调用 `superpowers:brainstorming` skill 进行交互式需求设计：**
   - 基于 explore 的探查结果，进行多轮 Q&A
   - 提出 2-3 个方案选项，对比利弊，推荐最优方案
   - 获得用户设计审批后，产出 `draft.md`

4. 输出完成提示：

```
draft.md 已生成。

💡 建议：可以用 grill-me 对需求进行深入拷问，确认后再进入 plan。

准备好后，运行 `/alloy-plan` 进入规划阶段。
```

**关键规则：**
- 此阶段不创建 change 目录，draft.md 存放在项目根目录
- DO NOT 自动进入 plan 阶段
- 扩展点仅提示，不调用技能

### 情况 B：无活跃 change + 无 topic

扫描项目上下文（README.md、requirement.md、已有代码结构等）：

- 有上下文可读取 → 基于项目信息引导用户，提出建议方向或追问
- 空项目无上下文 → "请提供主题，例如：`/alloy-start <topic>`"

### 情况 C：--new <topic>

无论是否有活跃 change，直接开始新 change 流程（同情况 A）。

> 多个 change 可并行 planning，但不能同时 apply。

### 情况 D：有 1 个活跃 change

自动接续，从当前 phase 断点恢复：

| 当前 phase | 恢复行为 |
|-----------|----------|
| `started` | 继续 `/alloy-plan` |
| `planned` | 继续 `/alloy-apply` |
| `applied` | 提示用户：`/alloy-finish` 或继续修改 |
| `finished` | 提示用户：`/alloy-archive` |

恢复时输出当前状态概要（change 名、phase、已完成制品、下一步建议）。

### 情况 E：有多个活跃 change

列出所有活跃 change，让用户选择：
```
检测到多个活跃 change：
  1. login-feature (planned) - 已完成 proposal, design, specs, tasks, plan
  2. payment-fix   (started) - 已完成 draft.md

请选择要接续的 change（输入编号），或 `/alloy-start --new <topic>` 开新 change。
```

## 扩展点提示

draft.md 完成后，MUST 输出扩展点提示（v1 仅提示，不调用技能）：

```
draft.md 已完成。
💡 建议：可以用 grill-me 对需求进行深入拷问，确认后再进入 plan。
```

---

## 行为约束

- **闸门规则：** 在用户确认前，DO NOT 创建 change 目录或写入 `.alloy.yaml`
- **上下文推断：** 必须按上述路由逻辑准确分发，不得跳过状态检测
- **断点恢复：** phase + worktree 字段 + 文件存在性三者交叉验证，不可仅依赖 phase 字段
