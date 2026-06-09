# 技能使用记录持久化

> 设计日期: 2026-06-10

## 问题

retrospective.md 的 §4 全周期技能审计依赖 Agent 内存（"同一 session 亲历，无需推断"），但断点恢复后 session 已不同，导致：

1. 已使用的技能被标记为 ✗（未使用）
2. 三列格式（技能/命令 | 使用 | 原因）退化为两列，丢失了跳过原因
3. 间接激活的技能（如 SDD 内部通过 prompt 模板实现的 TDD/spec-review/code-review）无法追踪

**根因：** `AlloyState` 没有 `skill_usage` 字段，技能使用记录完全依赖 Agent 上下文。

## 设计

### 数据模型

在 `src/core/types.ts` 中新增：

```typescript
interface SkillUsageEntry {
  skill: string;           // "superpowers:brainstorming"
  stage: string;           // "start" | "plan" | "apply" | "archive" | "finish"
  used: boolean;           // true = 已使用, false = 跳过
  count?: number;          // 调用次数 (used=true 时)
  via?: string;            // 间接激活来源, 如 "subagent-driven-development"
  reason?: string;         // 跳过原因 (used=false 时)
  recorded_at: string;     // 记录时间
}
```

在 `AlloyState` 中新增：
```typescript
skill_usage: SkillUsageEntry[];  // 默认 []
```

### `alloy _skill` 命令

```bash
# 记录直接使用
alloy _skill log openspec/changes/<name> <stage> <skill_name>

# 记录间接激活
alloy _skill log openspec/changes/<name> <stage> <skill_name> --via <source>

# 记录跳过
alloy _skill skip openspec/changes/<name> <stage> <skill_name> --reason "<原因>"
```

实现：读取 `.alloy.yaml` → append/update 到 `skill_usage[]` → 写入。幂等：同一 skill+stage 组合已存在时更新。

### 全周期技能清单

| 阶段 | 技能/命令 | 调用方式 |
|------|----------|---------|
| start | `opsx:explore` | 直接 |
| start | `superpowers:brainstorming` | 直接 |
| start | `/opsx:new` | 直接 |
| plan | `/opsx:continue` (×4) | 直接 |
| plan | `superpowers:writing-plans` | 直接 |
| apply | `superpowers:using-git-worktrees` | 直接（共用） |
| apply | `/opsx:verify` | 直接（共用） |
| apply | `superpowers:verification-before-completion` | 直接（共用） |
| apply | `superpowers:subagent-driven-development` | 直接（路径 A） |
| apply | `test-driven-development` | via SDD（路径 A） |
| apply | `spec-compliance-review` | via SDD（路径 A） |
| apply | `code-quality-review` | via SDD（路径 A） |
| apply | `superpowers:test-driven-development` | 直接（路径 B） |
| apply | `superpowers:executing-plans` | 直接（路径 B） |
| apply | `superpowers:requesting-code-review` | 直接（路径 B） |
| archive | `/opsx:archive` | 直接 |
| finish | `superpowers:finishing-a-development-branch` | 直接 |

路径 A 和 B 互斥，每轮 apply 实际记录 6-7 个条目。

### retrospective 模板改动

`openspec/schemas/alloy/templates/retrospective.md` §4 改为三列格式：

```
| 技能/命令 | 使用 | 原因 |
|----------|:---:|------|
```

加 archive 和 finish 阶段。去掉 `/opsx:verify` 前的多余条目（已在 apply 共用部分）。

### retrospective 指令改动

`openspec/schemas/alloy/instructions/retrospective.md` §4 数据来源改为：

> 从 `.alloy.yaml` 的 `skill_usage[]` 字段读取。`skill_usage[]` 为空（旧 change）→ 对应行填 `—`。跳过的技能展开三问。

### 各阶段命令改动

每个 alloy 命令中，Skill 工具调用后加一条规则："立即执行 `alloy _skill log`"。

**start.md（3 处）：**
- `opsx:explore` 后
- `superpowers:brainstorming` 后
- `/opsx:new` 后

**plan.md（2 处）：**
- 每次 `/opsx:continue` 后（共 4 次）
- `superpowers:writing-plans` 后

**apply.md：**
- 共用技能：`using-git-worktrees`、`/opsx:verify`、`verification-before-completion` 各 1 处
- 路径 A：`subagent-driven-development` 后 + 3 条 `--via` 记录
- 路径 B：`test-driven-development`、`executing-plans`、`requesting-code-review` 各 1 处
- 更新 §4 引用

**archive.md（1 处）：**
- `/opsx:archive` 后

**finish.md（1 处）：**
- `superpowers:finishing-a-development-branch` 后

## 实现步骤

| 步骤 | 文件 | 内容 |
|------|------|------|
| 1 | `src/core/types.ts` | 新增 `SkillUsageEntry`，`AlloyState` 加 `skill_usage` |
| 2 | `src/cli/utils/state.ts` | `createInitialState()` 加 `skill_usage: []` |
| 3 | `src/cli/commands/internal/skill-usage.ts` | 新命令 `alloy _skill log/skip` |
| 4 | `src/cli/index.ts` | 注册 `_skill` 路由 |
| 5 | `openspec/schemas/alloy/templates/retrospective.md` | 三列格式 + archive/finish 阶段 |
| 6 | `openspec/schemas/alloy/instructions/retrospective.md` | §4 改为从 `skill_usage[]` 读取 |
| 7 | `commands/alloy/start.md` | 加 3 处 `alloy _skill log` |
| 8 | `commands/alloy/plan.md` | 加 2 处 `alloy _skill log` |
| 9 | `commands/alloy/apply.md` | 加 apply 技能记录 + 更新 §4 引用 |
| 10 | `commands/alloy/archive.md` | 加 1 处 `alloy _skill log` |
| 11 | `commands/alloy/finish.md` | 加 1 处 `alloy _skill log` |
