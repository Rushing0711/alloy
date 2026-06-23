# plan-rollback.md

plan 阶段的制品回溯清理——两条路径：轻量修正、全新变更（重新沟通）。

> **检查点切换**已由 `alloy _checkpoint create/list/switch` CLI 处理（见 plan.md 需求变更闸门）。
> 本文件只负责"全新变更——清理 plan 制品回 brainstorming"的清理动作。

## 轻量修正（措辞/格式，不改变功能边界）

**判断规则：** 只有用户明确说"措辞/格式调整"才走此路径。用户主动提出"加入/删除/修改功能"= 需求变更，**禁止使用 `alloy _artifact reset`**，必须走下面的全新变更路径。不确定时默认需求变更。

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
git commit -m "chore(<name>): 轻量修正——清除 <artifact>，准备重新生成"
```

## 场景 A：全新变更（清理 plan 制品回 brainstorming）

**触发：** plan 过程中用户提出新需求，选择"重新沟通"路径（plan.md 需求变更闸门 Step 2 选 (b)）。

**前提：** 用户在 Step 1 已经选择"是否创建检查点当前进度"。若选暂存，当前 commit 已有 alloy-checkpoint tag 保护；若选不暂存，当前 commit 链将在切换后被遗忘。

**流程：** 清理 plan 制品（保留 draft）→ 清理 phase_timings → phase 重置为 started → 回 brainstorming。

**用原子命令清理，禁 `_state write records/phase_timings`**——这两个是受管字段（N2），直接 write 会被拦截。records 用 `_artifact reset` 逐个清除（同时删文件 + 清 hash 记录），phase_timings 用 `_phase reset` 逐个清除：

```bash
# 1. 逐个清除 plan 制品（_artifact reset = 删文件 + 清 records 条目，原子操作）
#    draft 保留，只清 proposal/design/specs/tasks/plans
for ARTIFACT in proposal design specs tasks plans; do
  alloy _artifact reset openspec/changes/<name> "$ARTIFACT"
done

# 2. 逐个清除 plan/apply/archive/finish 的 phase_timings（_phase reset = 删 timing key，原子操作）
#    start 保留（brainstorming 阶段不需回退），仅清后续阶段
for PHASE in plan apply archive finish; do
  alloy _phase reset openspec/changes/<name> "$PHASE"
done

# 3. phase 重置为 started（phase 不受管，可直接 _state write）
#    回溯到 brainstorming = 回到 start 阶段，phase 必须 = started
alloy _state write openspec/changes/<name> phase started

git add openspec/changes/<name>/
git commit -m "chore(<name>): 回溯——清理 plan 制品，回到 brainstorming"
```

```
→ 制品已清理（仅保留 draft），records/phase_timings 已重置，phase=started
→ 若 Step 1 选了暂存，当前 checkpoint tag 可通过 alloy _checkpoint list 查看
→ 请运行 /alloy:start <name> 重新走需求确认流程
```

## apply 阶段的需求变更

**新规则：** plan 完成后（phase=planned/applied/archived/finished），所有需求变更**只能走 discard 重开 change**。

- 不允许在 apply 阶段回溯到 brainstorming
- 不允许在 apply 阶段使用 _checkpoint 切换检查点（CLI 已硬校验 phase===started）
- 处理路径：`/alloy:discard <name>` + `/alloy:start <new-name>`

详见 apply.md 的"需求变更处理"段落。
