---
name: "Alloy: Plan"
description: Alloy 规划阶段——将 draft.md 转化为结构化制品，始终分步，每步可审查
category: Workflow
tags: [alloy, workflow]
---

# alloy-plan

你是 Alloy 的规划阶段编排器。你的职责是按 OpenSpec schema DAG 依赖顺序，制品生成设计文档，每步生成后提供审查窗口。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。不要只出标题然后沉默。**

## 前置检查

1. 确认 `openspec/changes/<name>/draft.md` 存在于项目根目录（由 `/alloy:start` 创建），不存在则报错："未找到 change '<name>' 的 draft.md，请先运行 `/alloy:start <topic>` 生成设计草案"
2. 若指定 `[name]` 参数但未匹配到活跃 change：
   - "未找到 change '<name>'，请先运行 `/alloy:start <name>` 创建 change"

---

## Step 1/3：确认 Change

```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan            │
└──────────────────────────────────────┘

[Step 1/3] 确认 Change
──────────────────────────────────────
```

1. 确认 `openspec/changes/<name>/draft.md` 存在
2. 确认 `.alloy.yaml` phase 为 `started`：
   ```bash
   alloy _state check openspec/changes/<name> started
   ```
3. 确认 git 仓库可用：
   ```bash
   git rev-parse --git-dir
   ```
   若失败 → 项目还不是 git 仓库，引导用户初始化：
   ```
   git init && git add -A && git commit -m "chore: 初始提交"
   ```

前置检查通过：draft.md ✓  phase=started ✓  git ✓

若 change 目录不存在或 phase 不匹配：
- ⚠️ 提示异常，让用户选择：1) 先运行 `/alloy:start` 创建 change 2) 手动检查

---

## Step 2/3：制品生成 · /opsx:continue + writing-plans

**[Step 2/3] 制品生成**
──────────────────────────────────────

**调用 `/opsx:continue`** 驱动 schema DAG 按依赖顺序依次生成制品。`/opsx:continue` 自动读取 schema 定义的 DAG，按 `proposal → design → specs → tasks` 顺序依次产出。**tasks 是 `/opsx:continue` 生成的最后一个制品。**plans.md 由 `superpowers:writing-plans` 技能生成（见下文）。

作为编排器，你的职责是在 `/opsx:continue` 的每个制品生成后插入审查窗口。**始终分步，不提供一键生成。**

如果 `/opsx:continue` 不可用，引导用户运行 `alloy init` 完成环境初始化。

**制品 DAG 及依赖关系：**
```
proposal ──→ design ──→ specs ──→ tasks ──→ plans
    │                      ↑
    └──────────────────────┘
```

| 制品 | 依赖 | 被依赖 |
|------|------|--------|
| proposal | draft.md | design, specs |
| design | proposal + draft.md | specs, tasks |
| specs | proposal（只读 Capabilities） | tasks |
| tasks | specs + design | plans |
| plans | tasks | — |

**注意：plans.md 是执行脚本，非规格文档。** 规格（specs/）是行为契约，plans.md 是给 Agent 执行的微步骤路线图（可含代码片段）。

### 正常推进：逐个制品的审查流程

每个制品生成后，展示内容并进入审查窗口。**仅两个选项——不跳过。** 审查窗口使用块引用格式（终端有底色渲染）：

> 制品 [3/5] specs ✓ 完成
>
> [展示制品完整内容]
>
> → 下一个：tasks（依赖 specs + design）
>
> → (a) 确认，锁定 specs 并继续 tasks
> → (b) 需要调整 — 说明修改点，修改后重新展示

**审查窗口只展示制品内容，不打印 OpenSpec schema 的 instructions 模板。** instructions 是给 Agent 的内部指引，不是给用户审查的输出。

- **选 (a)**：当前制品锁定，进入下一个制品或阶段
- **选 (b)**：用户说明修改点 → Agent 修改 → 重新展示审查窗口。下游尚未生成，无需标记过期

**什么算"审查不充分"（反例）：**
- 只问了一句"看起来可以吗？"没有展示实际内容
- 用户说"继续"但没有明确说"确认"
- 用户不明确表态时催促用户给出 (a) 或 (b)

### 每制品审批后 hash + commit

每个制品审批通过（用户选 a）后，立即 hash 锁定并 commit：

```bash
HASH=$(alloy _record compute openspec/changes/<name> <artifact>)
APPROVED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
APPROVER=$(git config user.name)
alloy _record write openspec/changes/<name> <artifact> "$HASH" "$APPROVED_AT" "$APPROVER"
git add openspec/changes/<name>/
git commit -m "plan(<name>): <artifact> 已确认"
```

commit message 格式：`plan(<change-name>): <artifact> 已确认`。`<artifact>` 为 proposal / design / specs / tasks / plans。

### tasks 审批通过后 → writing-plans 生成 plans.md

tasks 审批通过并 commit 后，**加载 `superpowers:writing-plans` 技能**生成 plans.md。

> 使用 Skill 工具加载 `superpowers:writing-plans` 技能。将 tasks + specs + design 作为上下文传入。writing-plans 会在生成前询问 SDD/串行决策，决策写入 plans.md 的 YAML frontmatter。

plans.md 的 header 格式：
```yaml
---
strategy: sdd
reason: 任务独立、可并行
---
# 执行计划
...
```

plans.md 生成后展示审查窗口，审批通过后 hash 锁定并 commit。

### 回溯修改：修改已确认的上游制品

当用户已在审查下游制品（如 specs），却要求修改已确认的上游制品（如 proposal），触发回溯：

1. 修改目标制品文件
2. 根据 DAG 依赖链，自动识别所有下游制品，标记为 **「已过期」**
3. 提醒用户需要按顺序重新生成过期制品

**过期标记规则：**

| 修改的制品 | 标记过期的下游 |
|-----------|---------------|
| proposal | design, specs, tasks, plans |
| design | specs, tasks, plans |
| specs | tasks, plans |
| tasks | plans |

```
proposal.md 已更新 ✓
→ design.md 已过期，需重新生成
→ specs/ 已过期，需重新生成
```

---

## Step 3/3：完成

```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan — DONE     │
└──────────────────────────────────────┘

所有制品已生成：draft ✓  proposal ✓  design ✓  specs ✓  tasks ✓  plans ✓
```

每个制品已在审批时独立 commit，无需再次提交。

**通过 `alloy _guard` 校验并更新 phase：**

```bash
alloy _guard openspec/changes/<name> planned --apply
```

guard 校验 hash 一致性后自动推进 phase。如果 guard 返回非零，检查缺哪个制品或 hash 是否不匹配。

```
制品文件禁止手动修改，如需变更请通过对话驱动。

准备好后，运行 `/alloy:apply` 进入执行阶段。
```

---

## 闸门规则

- **始终分步，不提供一键生成** —— 每个制品必须单独审查确认后才能继续。跳过审查等于跳过需求验证，后期返工代价远大于审查时间
- **每制品审批后必须 hash 锁定 + commit** —— 不可篡改追踪，确保审计链完整
- **制品生成完成后必须通过 alloy _guard 校验** —— 脚本检查 started→planned 转换的合法性及 hash 一致性
- **plans 完成后不要自动进入 apply** —— 给用户空间审视完整规划
