# Alloy 核心机制修复设计

> 日期：2026-05-30
> 状态：已确认
> 覆盖问题：命令文件去重、writing-plans 集成、hash 交接、制品命名、阶段间决策传递、change 创建时机

---

## 一、命令文件去重

### 现状

`commands/alloy/*.md`（冒号）和 `commands/alloy-*.md`（横线）各 8 个文件，内容完全相同，手动维护。

### 设计

**冒号版是唯一源文件**，横线版在部署时自动生成。

**部署逻辑改造（`src/core/skills.ts` `deployCommands()`）：**

1. 冒号 agent：直接拷贝 `commands/alloy/*.md` 到目标目录
2. 横线 agent：从 `commands/alloy/*.md` 读取内容，自动转换后写入横线命名文件
   - 文件名映射：`start.md` → `alloy-start.md`
   - Frontmatter 转换：`name: "Alloy: Start"` → `name: "Alloy-Start"`
3. 删除 `commands/alloy-start.md` 等 8 个横线源文件（不再纳入 git 追踪）

**对 AI Agent 透明**——部署逻辑内部处理，command 文件中所有引用仍用 `alloy:` 冒号格式。

---

## 二、writing-plans 集成

### 现状

plan 阶段通过 `/opsx:continue` 按 DAG 生成全部制品，plan.md 由 AI 模拟生成，writing-plans 技能从未加载。

### 设计

**`/alloy:plan` 流程变更：**

- `/opsx:continue` 只驱动 proposal → design → specs → tasks
- tasks 审批通过后，加载 `superpowers:writing-plans` 技能
- writing-plans 在生成 plans.md 前询问 SDD/串行决策
- 决策写入 plans.md 的 YAML frontmatter

**plans.md 生成格式：**

```yaml
---
strategy: sdd
reason: 任务独立、可并行
---
# 执行计划
...
```

**`/alloy:apply` 策略选择变更：**

- 读取 plans.md header 中的 strategy
- 将 planning 决策作为推荐项展示，用户仍可二选一

```
[Step 2/5] 执行策略选择
──────────────────────────────────────

任务分析：<N 个任务，哪些独立/哪些耦合>

推荐方案：SDD（规划阶段建议）
理由：任务独立、可并行

1. SDD — 派发子 agent 并行执行（推荐）
2. 串行执行 — 当前 session 逐步实现
```

- 用户不明确选择时，默认采用推荐方案

---

## 三、Hash 交接机制

### 现状

阶段间无确定性验证，Agent 记忆不可靠。`.alloy.yaml` 无制品完整性记录。

### 设计

### AlloyState 新增字段

```typescript
interface ArtifactRecord {
  artifact: string;      // 制品 ID：proposal / design / specs / tasks / plans
  hash: string;          // sha256(file_content_bytes)，仅依赖文件内容
  approved_at: string;   // ISO 8601 UTC
  approver: string;      // 审批人标识（git config user.name），纯审计，不参与 hash
}
```

`AlloyState` 新增 `records: ArtifactRecord[]`。

### Hash 计算

- 单文件：`sha256(file_content_bytes)`
- 多文件制品（specs/）：目录内所有文件按路径排序后拼接，`sha256(concat(sorted_file_contents))`

### 写入时机

每个制品审批通过（用户选 (a)）时，Agent 调用：
```bash
alloy _record write openspec/changes/<name> <artifact> <hash> <approved_at> <approver>
```

由 `alloy-state.sh` 管理 `.alloy.yaml` 的 `records` 数组。

### Guard 校验

`alloy-guard.sh` 在 planned → applied 转换时校验：

1. 读取 records 中的 hash 与当前文件 hash 逐一对比
2. 不匹配 → `[FAIL]` 列出被篡改的制品，拒绝转换
3. 用户确认后可重新 hash（改文件视为重新审批），但 guard 不会自动重算——需用户感知后操作

### 文件命名

records 中的制品 ID 与 schema.yaml 的 artifact id 一致：
- `proposal` → `proposal.md`
- `design` → `design.md`
- `specs` → `specs/` 目录
- `tasks` → `tasks.md`
- `plans` → `plans.md`

---

## 四、制品命名调整

### 变更

`plan` → `plans`，`plan.md` → `plans.md`

### 理由

前一步是 `tasks`（任务清单），这一步调整为 `plans`（执行计划），复数形式更贴切——plans 是包含多个执行步骤的计划集，而非单一规划。

### 影响文件

| 文件 | 变更 |
|------|------|
| `schema.yaml` | artifact id、generates、requires、apply.requires |
| `commands/alloy/plan.md` | 文件名不变，内部引用更新 |
| `commands/alloy/apply.md` | plan.md → plans.md |
| `commands/alloy/archive.md` | plan.md → plans.md |
| `commands/alloy/start.md` | 制品名称更新 |
| `commands/alloy/finish.md` | 引用更新 |
| `docs/alloy-design.md` | 全文引用更新 |
| `templates/plan.md` → `templates/plans.md` | 模板文件重命名 |

---

## 五、阶段间 SDD 决策传递

### 决定

**plan + apply 不合并。** 通过 plans.md header 传递 SDD 决策。

### 流程

```
plan 阶段                      apply 阶段
───────────                    ───────────
writing-plans 询问            读取 plans.md header
  → SDD / 串行                → 展示推荐方案
  → 写入 header                → 用户可选覆写
  → 生成 plans.md              → 按决策执行
```

### 无 plans.md header 时

如果 plans.md 没有 strategy header（兼容旧 change），apply 回退到当前行为——分析任务特征后现场询问。

---

## 六、Change 创建时机前移

### 现状

draft.md 放在项目根目录，change 目录在 plan 阶段才创建。`.alloy.yaml` 的 `created_at` 记录的是 plan 阶段的时间戳，不反映 change 的真正诞生时间。

### 问题

- 多个 change 并行时，根目录只能有一份 draft.md
- `created_at` 不准确

### 设计

**`/opsx:new` 从 plan 前移到 start 末尾。**

新 start 流程：

```
start:  explore + brainstorming → 用户确认方案
        → Agent 根据 draft 内容建议 change name（kebab-case）
        → 用户确认 name
        → /opsx:new <name> → 创建 change 目录
        → draft.md 写入 change 目录
        → alloy _state write → .alloy.yaml 初始化（phase=started, created_at=当前时间）
```

plan 阶段因此简化——change 目录已存在，跳过创建步骤，直接进入制品生成。

**`/alloy:plan` Step 1 变化：** 从"创建 Change 目录"变为"确认 Change 目录"，检查 draft.md 存在且 `.alloy.yaml` phase 为 `started`，不一致时报错。

**`/alloy:start` 变化：** 末尾新增 change 创建步骤——建议 name、用户确认、调用 `/opsx:new`、写入状态。

**`created_at` 准确性：** change 目录创建即记录时间戳，反映真实的"诞生"时刻。

---

## 七、Commit 粒度调整

### 现状

每阶段末尾一次 `git add -A` + commit，粒度太粗，无法精准回溯单个制品的变更。

### 设计

**一个制品审批通过 → hash 锁定 → git commit，形成不可篡改链。**

| 阶段 | 制品 | 触发时机 |
|------|------|---------|
| start | draft.md | 审批 + hash → commit |
| plan | proposal.md | 审批 + hash → commit |
| | design.md | 审批 + hash → commit |
| | specs/ | 审批 + hash → commit |
| | tasks.md | 审批 + hash → commit |
| | plans.md | writing-plans 审批 + hash → commit |
| apply | 代码变更 | SDD 过程中每次成功验证后 commit |
| | verify.md | 审批 + hash → commit |
| | retrospective.md | 审批 + hash → commit |
| archive | delta spec + 归档移动 | 归档后 commit |

commit message 格式：`<type>(<change-name>): <artifact> 已确认`，如 `plan(login-feat): proposal 已确认`。

### 联动影响

- **Hash 记录写入后立即 commit**——`alloy _record write` 之后，Agent 执行 `git add` + `git commit`
- **plan 阶段需要 git 检查**——start 末尾创建 change 后已有一次 commit，但 plan 开始前需确认 git 可用
- **apply 末尾的 `git add -A` 删除**——改为每个制品独立 commit，不再一把全量提交
