# Alloy Start 阶段工作流改进设计

## 动机

Start 阶段在长期使用中暴露了三个问题：分支创建时机不合理、/opsx 命令预检不一致、制品缺少生成时间戳。

## 一、分支前置

### 问题

当前 start 阶段流程：
```
brainstorming → 确认方案 → change name → /opsx:new → 生成 draft.md → 分支 → 提交
```
draft.md 在非 feature 分支上生成，直到后续 git checkout 才切到正确分支。

### 改动

将分支创建移至 draft.md 生成之前：
```
brainstorming → 确认方案 → change name → /opsx:new → 分支 → 生成 draft.md → 提交
```

### 涉及文件

- `commands/alloy/start.md` — 调整步骤 6（分支选择）到 draft 生成之前

### 影响

- draft.md 从一开始就在正确分支上，避免无谓的跨分支文件移动
- 分支名已知（默认 `feature/<change-name>`），仅需用户确认即可

---

## 二、/opsx 命令全阶段预检 + 审计补充

### 问题

三个阶段对 /opsx 命令的预检不一致：

| 阶段 | 使用的 /opsx 命令 | 预检了？ |
|------|-----------------|---------|
| start | `/opsx:new` | 否 |
| plan | `/opsx:continue` | 是 |
| apply | `/opsx:verify` | 否 |

同时 retrospective §4 技能审计的 start 阶段只列了 `opsx:explore` 和 `superpowers:brainstorming`，遗漏了 `/opsx:new`。

### 改动

1. **start 阶段预检** 新增 `/opsx:new` 命令检测（与 plan.md 检测 `/opsx:continue` 的方式一致）
2. **apply 阶段预检** 新增 `/opsx:verify` 命令检测
3. **retrospective §4 start 阶段审计清单** 新增 `/opsx:new` 行

### 涉及文件

- `commands/alloy/start.md` — 预检新增 `/opsx:new`
- `commands/alloy/apply.md` — 预检新增 `/opsx:verify`
- `openspec/schemas/alloy/templates/retrospective.md` — §4 新增 `/opsx:new` 行
- `openspec/schemas/alloy/instructions/retrospective.md` — §4 新增 `/opsx:new` 行

---

## 三、制品头部加生成时间戳

### 问题

所有制品模板（draft/proposal/design/specs/tasks/plans）头部缺少生成时间。
retrospective.md 同样缺少，且其 §0 全周期时间线表中 retrospective 行的时间也往往为空。

verify.md 是唯一有生成时间头的模板（`> 生成时间: <timestamp>`）。

### 改动

1. **所有模板头部加 `> 生成时间: <timestamp>`** — draft.md / proposal.md / design.md / specs.md / tasks.md / plans.md / retrospective.md
2. **retrospective.md 的 §0 全周期时间线表** retrospective 行填入实际生成时间

### 涉及文件

- `openspec/schemas/alloy/templates/draft.md`
- `openspec/schemas/alloy/templates/proposal.md`
- `openspec/schemas/alloy/templates/design.md`
- `openspec/schemas/alloy/templates/specs.md`
- `openspec/schemas/alloy/templates/tasks.md`
- `openspec/schemas/alloy/templates/plans.md`
- `openspec/schemas/alloy/templates/retrospective.md`

---

## 影响范围

所有改动均限于模板文件和命令文件，不涉及 TypeScript 源码、schema 图或测试逻辑。
