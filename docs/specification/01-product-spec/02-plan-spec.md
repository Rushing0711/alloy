---
behaviors:
  preconditions: 7
  hard_stops:    8
  user_gates:    5
  warns:         1
  artifacts: [proposal, design, specs, tasks, plans]
  transitions_to: planned
  external_calls: [opsx:continue, superpowers:writing-plans]
---

# alloy plan 行为规格

详见 skill 文件：`commands/alloy/plan.md`

## 命令格式

```
/alloy:plan [name]（省略时从当前活跃 change 推断）
```

## 前置检查

change 目录存在且 .alloy.yaml phase=started（/alloy:start 已完成）

若 phase 不匹配:
  → planned → 自动路由到 /alloy:apply
  → applied → 自动路由到 /alloy:apply
  → archived → 自动路由到 /alloy:finish
  → 唯一 HARD STOP：change 目录不存在、draft.md 缺失（前序阶段完全没做）

若指定 name 但 change 不存在:
  → ⚠️ "未找到 change '<name>'，请先运行 /alloy:start <topic> 创建"

若有活跃 change 但 draft.md 缺失:
  → ⚠️ 提示异常，引导重新运行 /alloy:start

## 流程

1. 确认 change 已存在 → 读取 .alloy.yaml 确认 phase=started
   （无需创建 change —— /alloy:start 已完成这一步）
2. 制品进度扫描 → 扫描已有制品（文件存在 + hash 有效），跳过已完成，
   从第一个缺失制品开始生成
3. 调用 /opsx:continue → 利用 schema DAG 按依赖顺序制品生成
4. 制品进度扫描在生成前执行，从第一个缺失制品开始，跳过已审批制品
   制品生成: proposal → design → specs → tasks（/opsx:continue 停在 tasks）
5. 调用 superpowers:writing-plans → 按原始流程生成 plans.md（含末尾执行交接），
   writing-plans 自行决定策略并写入 frontmatter。路径强制设为 openspec/changes/<name>/plans.md（非默认的 docs/superpowers/plans/）。alloy 不在 plan 阶段询问策略——apply 阶段读取 frontmatter 并给用户确认
每步生成后有审查窗口，可确认或要求修改
始终分步，不提供一键生成

审查期间可沟通调整。用户选 (b) 说明修改点后，AI 内部评估修改性质，然后呈现确认选项：
(a) 确认变更，回溯到 brainstorming / (b) 取消变更，继续当前审查。用户始终掌握最终决定权。
plan 阶段处理"构建什么"，任何需求/设计层面的调整统一回到 brainstorming 重新审视
（在当前 change 内，不创建新 change），不做就地修补。plan 完成后不允许手动修改制品文件。

## plans.md 定位

执行脚本，非规格文档。tasks.md 是"做什么"的清单（给人确认），
plans.md 是"怎么做"的剧本（给 Agent 执行，2-5 分钟微步骤粒度，可含代码片段）。
规格（specs/）是行为契约，plans.md 是执行路线图，两者不可混淆。

## 制品生成约束

**制品生成时禁止打印 instructions。** 审查窗口只展示制品内容本身，不展示 OpenSpec schema 的
instructions 模板——instructions 是给 Agent 的内部指引，不是给用户审查的输出。

**一个制品，一次提交：** 每个制品审查通过后，立即 hash-lock 并单独 git commit（而非等所有制品完成后一次性提交）。records 记录每个制品的 commit hash，确保 apply 阶段 worktree 创建时所有制品可被带入。全部提交完成后，通过 guard 校验推进 phase。

## 阶段转换

phase → planned
