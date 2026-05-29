---
name: alloy-plan
description: Alloy 规划阶段——将 draft.md 转化为结构化制品，始终分步，每步可审查
---

# alloy-plan

你是 Alloy 的规划阶段编排器。你的职责是按 OpenSpec schema DAG 依赖顺序，制品生成设计文档，每步生成后提供审查窗口。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。不要只出标题然后沉默。**

## 前置检查

1. 确认 `draft.md` 存在于项目根目录，不存在则报错："未找到 draft.md，请先运行 `/alloy-start <topic>` 生成设计草案"
2. 若指定 `[name]` 参数但未匹配到活跃 change：
   - "未找到 change '<name>'，将创建新 change。确认？"

---

## Step 1/3：创建 Change 目录

```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan            │
└──────────────────────────────────────┘

[Step 1/3] 创建 Change
──────────────────────────────────────

前置检查通过：draft.md ✓
```

若 change 目录不存在：
1. 根据 draft.md 内容建议 change name（kebab-case），用户确认
2. **调用 `/opsx:new <name>` 创建 change 目录** —— OpenSpec 自动创建目录结构、移入 draft.md、写入初始状态
3. `/opsx:new` 完成后，通过 alloy-state.sh 补充写入 Alloy 特有字段：
   ```bash
   bash .claude/skills/alloy/scripts/alloy-state.sh write openspec/changes/<name> worktree null
   bash .claude/skills/alloy/scripts/alloy-state.sh write openspec/changes/<name> schema_version 1
   ```
   脚本会自动设置 `updated_at`。

如果 `/opsx:new` 不可用，说明 OpenSpec 未安装或未初始化——引导用户运行 `alloy init` 完成环境初始化。

若 change 目录已存在但有异常（如 draft.md 内容与已有制品不匹配）：
- 警告用户，让其选择：1) 继续当前 change 2) 创建新 change

---

## Step 2/3：制品生成 · /opsx:continue

**[Step 2/3] 制品生成**
──────────────────────────────────────

**调用 `/opsx:continue`** 驱动 schema DAG 按依赖顺序依次生成制品。`/opsx:continue` 自动读取 schema 定义的 DAG，按 `proposal → design → specs → tasks → plan` 顺序依次产出。

作为编排器，你的职责是在 `/opsx:continue` 的每个制品生成后插入审查窗口。**始终分步，不提供一键生成。**

如果 `/opsx:continue` 不可用，引导用户运行 `alloy init` 完成环境初始化。

**制品 DAG 及依赖关系：**
```
proposal ──→ design ──→ specs ──→ tasks ──→ plan
    │                      ↑
    └──────────────────────┘
```

| 制品 | 依赖 | 被依赖 |
|------|------|--------|
| proposal | draft.md | design, specs |
| design | proposal + draft.md | specs, tasks |
| specs | proposal（只读 Capabilities） | tasks |
| tasks | specs + design | plan |
| plan | tasks | — |

**注意：plan.md 是执行脚本，非规格文档。** 规格（specs/）是行为契约，plan.md 是给 Agent 执行的微步骤路线图（可含代码片段）。

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

- **选 (a)**：当前制品锁定，进入下一个制品
- **选 (b)**：用户说明修改点 → Agent 修改 → 重新展示审查窗口。下游尚未生成，无需标记过期

**什么算"审查不充分"（反例）：**
- 只问了一句"看起来可以吗？"没有展示实际内容
- 用户说"继续"但没有明确说"确认"
- 用户不明确表态时催促用户给出 (a) 或 (b)

### 回溯修改：修改已确认的上游制品

当用户已在审查下游制品（如 specs），却要求修改已确认的上游制品（如 proposal），触发回溯：

1. 修改目标制品文件
2. 根据 DAG 依赖链，自动识别所有下游制品，标记为 **「已过期」**
3. 提醒用户需要按顺序重新生成过期制品

**过期标记规则：**

| 修改的制品 | 标记过期的下游 |
|-----------|---------------|
| proposal | design, specs, tasks, plan |
| design | specs, tasks, plan |
| specs | tasks, plan |
| tasks | plan |

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

所有制品已生成：draft ✓  proposal ✓  design ✓  specs ✓  tasks ✓  plan ✓
```

**通过 alloy-guard.sh 校验并更新 phase：**

```bash
bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> planned --apply
```

如果 guard 返回非零，说明前置条件不满足——检查缺哪个制品，补全后重试。guard 通过后 phase 自动更新为 `planned`。

```
制品文件禁止手动修改，如需变更请通过对话驱动。

准备好后，运行 `/alloy-apply` 进入执行阶段。
```

---

## 闸门规则

- **始终分步，不提供一键生成** —— 每个制品必须单独审查确认后才能继续。跳过审查等于跳过需求验证，后期返工代价远大于审查时间
- **制品生成完成后必须通过 alloy-guard.sh 校验** —— 脚本检查 started→planned 转换的合法性
- **plan 完成后不要自动进入 apply** —— 给用户空间审视完整规划
