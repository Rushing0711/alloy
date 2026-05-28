---
name: alloy-start
description: Alloy 智能入口 - 自动检测状态，接续或新建 change
---

# alloy-start

你是 Alloy 工作流的智能入口。你的职责是自动检测当前状态并引导用户进入正确的流程阶段。

**关键行为规则：**
- **调用任何外部命令/技能前，MUST 先输出标题 + 状态文本（如"正在..."）。严禁只输出标题后沉默。**
- **顺序：1) 输出 `---` 分隔标题 → 2) 输出状态描述 → 3) 发起调用。**

## 状态检测

首先，扫描 `openspec/changes/*/.alloy.yaml`，统计活跃 change（phase != archived）：

1. 读取每个 `.alloy.yaml` 的 `phase` 和 `worktree` 字段
2. 活跃 change = phase 不是 `archived` 的 change

## 路由逻辑

### 情况 A：无活跃 change + 有 topic 参数

用户输入了 `/alloy-start <topic>`，开始全新流程。

**Step 1 — 输出状态确认：**

```
## Alloy · Pre-OpenSpec 阶段 · 需求探索

未检测到活跃 change，开始新的工作流程。

主题：<topic>
```

**Step 2 — 上下文探查（MUST，不可跳过）：**

**MUST 按以下顺序执行：**
1. 先输出阶段标题和状态提示
2. 再执行探查

```
---
### Step 1/2：上下文探查
---

正在探查项目上下文和需求空间...
```

**自行执行上下文探查（不要调用外部命令）：**
- 列项目文件结构（`ls`、`find`）、读 README、package.json 等了解技术栈
- 新项目（无现有代码）→ Web 搜索同类产品方案、技术可行性、最佳实践
- 存量项目（有现有代码）→ 读代码库关键文件，了解架构、模块边界、集成点、约束
- 搜索完成后总结关键发现

explore 完成前，DO NOT 进入 brainstorming。

**Step 3 — 需求设计（MUST，不可跳过）：**

先输出阶段标题，再调用技能：

```
---
### Step 2/2：需求设计 · superpowers:brainstorming
---

基于上下文探查结果，进行交互式需求设计...
```

然后调用 `superpowers:brainstorming` skill：
- 基于 explore 的探查结果，进行多轮 Q&A
- 提出 2-3 个方案选项，对比利弊，推荐最优方案
- 获得用户设计审批后，产出 `draft.md`

**Step 4 — 完成提示：**

```
---
### Alloy Start 完成
---

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

输出恢复提示，自动接续：

```
---
## Alloy Start：接续已有 Change
---

检测到活跃 change：<name>
当前阶段：<phase>
已完成制品：<列出已有制品>
下一步：<建议操作>
```

然后从当前 phase 断点恢复：

| 当前 phase | 恢复行为 |
|-----------|----------|
| `started` | 继续 `/alloy-plan` |
| `planned` | 继续 `/alloy-apply` |
| `applied` | 提示用户：`/alloy-finish` 或继续修改 |
| `finished` | 提示用户：`/alloy-archive` |

### 情况 E：有多个活跃 change

列出所有活跃 change，让用户选择：

```
## Alloy Start：多个活跃 Change

检测到多个活跃 change：
  1. login-feature (planned) - 已完成 proposal, design, specs, tasks, plan
  2. payment-fix   (started) - 已完成 draft.md

请选择要接续的 change（输入编号），或 `/alloy-start --new <topic>` 开新 change。
```

---

## 行为约束

- **每次调用技能/命令前 MUST 输出 `---` 分隔的阶段标题**，格式：`### Phase N/M：<阶段名称>（<技能名>）`
- **闸门规则：** 在用户确认前，DO NOT 创建 change 目录或写入 `.alloy.yaml`
- **上下文推断：** 必须按上述路由逻辑准确分发，不得跳过状态检测
- **断点恢复：** phase + worktree 字段 + 文件存在性三者交叉验证，不可仅依赖 phase 字段
