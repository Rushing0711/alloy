# plan-rollback.md

plan 阶段的制品回溯清理——两条路径：边界内重新生成、全新变更（重新沟通）。

> **检查点切换**已由 `alloy _checkpoint create/list/switch` CLI 处理（见 plan.md 需求变更闸门）。
> 本文件只负责"全新变更——清理 plan 制品回 brainstorming"的清理动作。

## 边界内重新生成（规格边界内调整，不改 data model / API / 功能边界）

**判断规则：** 由 agent 判断变更是否触犯规格边界（不是让用户分类，见 plan.md 选 (b) Step 0）。**不越界**（纯展示样式、文案、不改数据契约和功能边界）走此路径重新生成当前制品；**越界**（改 Capabilities / data model 字段 / API 契约 / 核心功能行为）必须走下面的全新变更路径，**禁止使用 `alloy _artifact reset`**。

使用 `alloy _artifact reset` 一步完成 hash 清除 + 文件删除：

```bash
alloy _artifact reset openspec/changes/<name> <artifact>
```

该命令自动：
1. 清除 `.alloy.yaml` 中该制品的 hash 记录
2. 删除制品文件（specs 目录递归删除）

然后调用 `/opsx:continue` 重新生成 → 审查 → 重新锁定。下游已锁定制品保持不变。

```bash
git add openspec/changes/<name>/
git commit -m "chore(<name>): 边界内调整——清除 <artifact>，准备重新生成"
```

## 场景 A：越界变更（回 brainstorming 检查点）

**触发：** plan 过程中用户提出新需求，agent 判断越界，用户在 Step 1 选"继续变更——回 brainstorming"。

**机制：** 用 git checkout 回退到 brainstorming 检查点，替代原地清理。回退 = `git checkout -B feature/<name> <tag>`，HEAD 回到检查点 commit，.alloy.yaml/records/phase_timings/skill_usage 随 tag 状态恢复，plan 阶段的 commit/records/phase_timings 自然消失。无需原地清理。

**完整流程见 plan.md "越界变更检查点流程"段落**，要点：

1. 废弃未 commit 信息（git restore，不问用户）
2. 回退前创建 plan 检查点（保护当前进度，--kind plan）
3. 列出 brainstorming 检查点让用户选（USER_GATE）
4. `_checkpoint switch` 回退到所选 tag
5. 重新 brainstorming + `_skill log`（count++）+ `_artifact reset draft` + 重新生成 draft
6. 打新 brainstorming 检查点（--kind brainstorming，N+1）

**关键约束：**
- 禁止原地清理 plan 制品（`_artifact reset` 逐个清）——git checkout 已让 plan 阶段的 records/phase_timings 自然消失
- 禁止 `_state write phase started`——git checkout 后 phase 已是 tag 时的状态（started）
- 回退后 draft 保留（tag 时已 commit），但因越界变更必须 `_artifact reset draft` 重新生成
- phase_timings.start.started_at 保留第一次时间（不重置）

## apply 阶段的需求变列

**新规则：** plan 完成后（phase=planned/applied/archived/finished），所有需求变更**只能走 discard 重开 change**。

- 不允许在 apply 阶段回溯到 brainstorming（worktree/代码已生成，回退会破坏一致性）
- 不允许在 apply 阶段使用 _checkpoint 切换检查点（CLI 已硬校验 phase 仅 started/planned 允许）
- 处理路径：`/alloy:discard <name>` + `/alloy:start <new-name>`

详见 apply.md 的"需求变更处理"段落。

## apply 阶段的需求变更

**新规则：** plan 完成后（phase=planned/applied/archived/finished），所有需求变更**只能走 discard 重开 change**。

- 不允许在 apply 阶段回溯到 brainstorming
- 不允许在 apply 阶段使用 _checkpoint 切换检查点（CLI 已硬校验 phase===started）
- 处理路径：`/alloy:discard <name>` + `/alloy:start <new-name>`

详见 apply.md 的"需求变更处理"段落。
