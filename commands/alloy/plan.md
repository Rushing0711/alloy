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

1. 确认 change 目录 `openspec/changes/<name>/` 存在且 `.alloy.yaml` phase 为 `started`（由 `/alloy:start` 完成），否则报错
2. 若 change 目录存在但 `draft.md` 缺失 → 异常状态，提示重新运行 `/alloy:start`
3. 若指定 `[name]` 参数但 change 不存在 → "未找到 change '<name>'，请先运行 `/alloy:start <name>` 创建 change"
4. **Skill / 命令预检：** 确认 `opsx:continue` 和 `superpowers:writing-plans` 均可用。任一不可用 → 引导 `alloy init` → STOP。不在生成过程中才暴露缺失。

---

## Step 1/3：确认 Change

**记录阶段开始时间**（用于计算耗时）：
```bash
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('plan',{})
if 'started_at' not in p:
    p['started_at']='$COMPLETED_AT'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```

```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan            │
│ 启动时间: 从 phase_timings.plan.started_at 读取
└──────────────────────────────────────┘

[Step 1/3] 确认 Change
──────────────────────────────────────
```

1. 确认 `openspec/changes/<name>/draft.md` 存在，并验证来源：
   ```bash
   git log -1 --format="%s" -- openspec/changes/<name>/draft.md
   ```
   若 commit message 不含 `feat(<name>): draft 已确认`→ ⚠️ draft.md 可能未经过完整 `/alloy:start` 流程（手工创建），提示用户确认是否继续。不阻断——但给用户知情权。
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

**若 phase 不匹配（phase != started）：**

先读取当前 phase，按以下规则自动路由：

| 当前 phase | 行为 |
|-----------|------|
| planned | "plan 已完成，自动进入 /alloy:apply" → 加载 alloy-apply 指令 |
| applied | "已进入执行阶段，自动进入 /alloy:apply" → 加载 alloy-apply 指令 |
| archived | "已归档，自动进入 /alloy:finish" → 加载 alloy-finish 指令 |
| finished | "工作流已完成" → STOP |

**实现方式：** 输出对应命令文件的完整指令，将 change name 和当前进度信息作为上下文传入。

**若 change 目录不存在或 draft.md 缺失：**
→ 引导用户先运行 `/alloy:start <name>` 创建 change。这是唯一保留 HARD STOP 的场景——前序阶段完全没做。

---

## Step 2/3：制品生成 · /opsx:continue + writing-plans

**[Step 2/3] 制品生成**
──────────────────────────────────────

**每个制品（proposal / design / specs / tasks）必须通过 `/opsx:continue` 生成。禁止手动编写制品文件。** `/opsx:continue` 自动读取 schema DAG，按 `proposal → design → specs → tasks` 顺序依次产出，每次调用生成一个制品。**tasks 是 `/opsx:continue` 生成的最后一个制品。**plans.md 由 `superpowers:writing-plans` 技能生成（见下文）。

作为编排器，你的职责是在每次 `/opsx:continue` 生成制品后插入审查窗口。**始终分步，不提供一键生成。**

**执行方式：** 使用 Skill 工具加载 `opsx:continue` 技能，传入 change name。`opsx:continue` 自动获取 schema 指令并生成对应的制品文件——不要自行编写制品内容，不要一次生成多个制品。

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

### 制品进度扫描

在调用 `/opsx:continue` 之前，先扫描哪些制品已完成（文件存在 + hash 有效）：

```bash
# 扫描已完成制品
for artifact in proposal design specs tasks plans; do
  if alloy _record check openspec/changes/<name> "$artifact" 2>/dev/null; then
    echo "  $artifact ✓"
  else
    echo "  $artifact ✗"
  fi
done
```

根据扫描结果，从第一个缺失的制品开始生成：

```
制品进度扫描:
  proposal  ✓ hash 有效 → 跳过
  design    ✓ hash 有效 → 跳过
  specs     ✗ → 从 specs 开始生成

→ /opsx:continue 从第一个缺失制品开始
```

制品全部完成（plans.md 存在且 hash 有效）时，phase 推进到 planned，提示下一步。

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
- **选 (b)**：制品未通过审查 → 停止当前 plan 流程。加载 `superpowers:brainstorming` 以现有 draft.md 为基础重新讨论，在当前 change 内修正需求——无需创建新 change。typo/措辞等纯文本修正除外——可直接修改后重新展示

**什么算"审查不充分"（反例）：**
- 只问了一句"看起来可以吗？"没有展示实际内容
- 用户说"继续"但没有明确说"确认"
- 用户不明确表态时催促用户给出 (a) 或 (b)

### 每制品审批后 hash + commit

每个制品审批通过（用户选 a）后，立即 hash 锁定并 commit：

```bash
HASH=$(alloy _record compute openspec/changes/<name> <artifact>)
APPROVED_AT=$(date "+%Y-%m-%d %H:%M:%S")
APPROVER=$(alloy _record approver openspec/changes/<name>)
alloy _record write openspec/changes/<name> <artifact> "$HASH" "$APPROVED_AT" "$APPROVER"
git add openspec/changes/<name>/
git commit -m "docs(<name>): <artifact> 已确认"
```

commit message 格式：`docs(<change-name>): <artifact> 已确认`（Conventional Commits `docs` type）。`<artifact>` 为 proposal / design / specs / tasks / plans。

**生成下一制品前，校验上游依赖制品的 hash 未被篡改：**
```bash
alloy _record check openspec/changes/<name> <upstream-artifact>
```
若 check 返回非零 → HARD STOP，hash 不匹配意味着有未审批的篡改。

| 即将生成的制品 | 需校验的上游 |
|--------------|------------|
| design | proposal |
| specs | proposal |
| tasks | specs, design |
| plans | tasks |

### tasks 审批通过后 → writing-plans 生成 plans.md

tasks 审批通过并 commit 后，**加载 `superpowers:writing-plans` 技能**生成 plans.md。

> 使用 Skill 工具加载 `superpowers:writing-plans` 技能，将 tasks + specs + design 作为上下文传入。**遵循 writing-plans 的完整原始流程**——从文件结构设计、任务拆解、代码填充，到末尾的"执行交接"（Subagent-Driven / Inline Execution 二选一）。不要在此环节插入额外的策略询问——writing-plans 自身已包含。
>
> **注意：** writing-plans 默认保存路径为 `docs/superpowers/plans/`，Alloy 要求将 plans.md 保存到 `openspec/changes/<name>/plans.md`。加载 writing-plans 时需显式指定此路径。

writing-plans 完成并保存 plans.md、用户选定执行策略后，将策略注入 plans.md 顶部作为 YAML frontmatter（用于跨 session 传递到 apply 阶段）：

```yaml
---
strategy: sdd
reason: <从 writing-plans 执行交接环节提取用户选择的理由>
---
# 执行计划
...
```

plans.md 生成后展示审查窗口，审批通过后 hash 锁定并 commit。

### 回溯修改：修改已确认的上游制品

plan 阶段处理的是"构建什么"——任何制品一旦审批通过，不允许就地修改。需求/设计层面的调整都应从 draft 根重新审视，而非打补丁。

**规则——统一回到 brainstorming：**

| 要修改的制品 | 行为 |
|------------|------|
| draft | 全部过期 → 引导 在当前 change 内回到 brainstorming 重新讨论 |
| proposal | 全部过期 → 引导 在当前 change 内回到 brainstorming 重新讨论 |
| design | 全部过期 → 引导 在当前 change 内回到 brainstorming 重新讨论 |
| specs | 全部过期 → 引导 在当前 change 内回到 brainstorming 重新讨论 |
| tasks | 全部过期 → 引导 在当前 change 内回到 brainstorming 重新讨论 |
| plans | 全部过期 → 引导 在当前 change 内回到 brainstorming 重新讨论 |

> apply 阶段的 verify / retrospective 不同——它们验证"代码是否匹配规格"，发现问题只需修正代码，不改变需求/设计。如果 verify/retrospective 暴露了规格层面的缺陷，应开新 change（`/alloy:start --new`）。

```
<artifact>.md 需要调整 ✓
→ 需求/设计变更，以下制品全部过期：draft, proposal, design, specs, tasks, plans
→ 在当前 change 内回到 brainstorming 重新讨论，更新 draft.md 后重新生成 plan 制品
```

---

## Step 3/3：完成

先读取所有 record 的时间戳用于汇总展示：
```bash
alloy _state read openspec/changes/<name> records
```

**记录阶段完成时间：**
```bash
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('plan',{})
if 'completed_at' not in p:
    p['completed_at']='$COMPLETED_AT'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
git add openspec/changes/<name>/
git commit -m "chore(<name>): 记录 plan 阶段完成时间"
```

```
┌──────────────────────────────────────┐
│ Alloy [2/5] · Phase: Plan — DONE     │
│ 启动时间: 从 phase_timings.plan.started_at 读取
│ 完成时间: 从 phase_timings.plan.completed_at 读取
│ 耗时: completed_at - started_at       │
└──────────────────────────────────────┘

→ Change: <name>
→ Phase: planned

所有制品已生成并锁定：

  制品             状态    Hash          创建时间
  ──────────────  ────    ────────────  ───────────────────
  draft           ✓       <hash>        <timestamp>
  proposal        ✓       <hash>        <timestamp>
  design          ✓       <hash>        <timestamp>
  specs           ✓       <hash>        <timestamp>
  tasks           ✓       <hash>        <timestamp>
  plans           ✓       <hash>        <timestamp>
```

每个制品已在审批时独立 commit，无需再次提交。

**通过 `alloy _guard` 校验并更新 phase：**

```bash
alloy _guard openspec/changes/<name> planned --apply
```

guard 校验 hash 一致性后自动推进 phase。如果 guard 返回非零，检查缺哪个制品或 hash 是否不匹配。

```
制品文件禁止手动修改。如需变更，回到 brainstorming 在当前 change 内重新讨论。

准备好后，运行 `/alloy:apply` 进入执行阶段。
```

---

## 闸门规则

- **git add 只用精确路径** — 永远不用 `-A`、`-a`、`.`。
  反例：`git add .` 或 `git commit -am "fix"` 会把 `todo.py`、`tasks.json` 等意外文件一起提交
- **始终分步，不提供一键生成** —— 每个制品必须单独审查确认后才能继续。跳过审查等于跳过需求验证，后期返工代价远大于审查时间
- **每制品审批后必须 hash 锁定 + commit** —— 不可篡改追踪，确保审计链完整
- **制品生成完成后必须通过 alloy _guard 校验** —— 脚本检查 started→planned 转换的合法性及 hash 一致性
- **plans 完成后不要自动进入 apply** —— 给用户空间审视完整规划
- **plan 阶段调整统一回 brainstorming** —— 需求/设计层面的任何变更从 draft 根重新审视，不做就地修补。typo/措辞修正除外。apply 阶段的 verify/retrospective 只修代码不改规格
