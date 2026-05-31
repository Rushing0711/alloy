# 阶段时间持久化与流程修复设计

## 问题清单

| # | 问题 | 根因 |
|---|------|------|
| 1 | 阶段启动时间、耗时接续时丢失 | `PLAN_START`/`APPLY_START` 存 shell 变量，退出即失 |
| 2 | Archive/Finish DONE 框启动时间错误 | 模板写死 `<created_at>`（change 创建时间），非阶段开始时间 |
| 3 | tasks.md 勾选后 hash 变更，guard 校验失败 | plan 阶段 hash-locked tasks.md，apply 阶段修改其内容 |
| 4 | archive 后有未提交残留文件，block finish checkout | mv 后旧文件仍被 git 追踪，`git add openspec/specs/ openspec/changes/archive/` 不覆盖删除 |

## 方案

### 1. 阶段时间持久化

`.alloy.yaml` 增加 `phase_timings` 字段：

```yaml
phase_timings:
  start:
    started_at: "2026-05-31 21:21:53"
    completed_at: "2026-05-31 21:29:28"
  plan:
    started_at: "2026-05-31 21:29:47"
    completed_at: "2026-05-31 21:37:21"
  apply:
    started_at: "2026-05-31 21:37:49"
    completed_at: null
```

**写入时机：**
- 每个命令头部框渲染前：检查 `phase_timings.<phase>.started_at`，不存在则用当前时间写入
- 每个命令 DONE 框渲染前：写入 `phase_timings.<phase>.completed_at`

**读取时机：**
- 命令头部框"启动时间"：读 `started_at`，不存在则 `<TIMESTAMP>`
- DONE 框"启动时间"：读 `started_at`
- DONE 框"完成时间"：读 `completed_at` 或 `<TIMESTAMP>`
- DONE 框"耗时"：`completed_at - started_at`

**接续场景：** `started_at` 已有值 → 直接显示历史时间，不覆盖。

> **实现：** 通过 `alloy _state write` 写入 `phase_timings`（JSON 值）。写入命令示例：
> ```bash
> alloy _state write openspec/changes/<name> phase_timings '{"start":{"started_at":"...","completed_at":"..."},"plan":{"started_at":"..."}}'
> ```

### 2. 各命令时间显示修正

每个命令的头部框和 DONE 框，时间来源统一改为 `phase_timings`：

| 命令 | 头部框"启动时间" | DONE 框"启动时间" | DONE 框"完成时间" |
|------|----------------|------------------|------------------|
| plan | `phase_timings.plan.started_at` | 同上 | `completed_at` |
| apply | `phase_timings.apply.started_at` | 同上 | `completed_at` |
| archive | `phase_timings.archive.started_at` | 同上 | `completed_at` |
| finish | `phase_timings.finish.started_at` | 同上 | `completed_at` |

start 命令保持 `<TIMESTAMP>`（start 是入口路由，头部框只做瞬时展示）。

### 3. tasks.md hash 重录

apply 的 verify 步骤中，更新 tasks.md checkbox 后，必须显式重录 hash。在 `commands/alloy/apply.md` 的 Step 4 中，`/opsx:verify` 调用之后、verify.md 审查之前，加入：

```bash
# tasks.md checkbox 已更新，重录 hash
HASH=$(alloy _record compute openspec/changes/<name> tasks)
alloy _record write openspec/changes/<name> tasks "$HASH" "$(date "+%Y-%m-%d %H:%M:%S")" "$(alloy _record approver openspec/changes/<name>)"
```

### 4. archive commit 覆盖残留文件

`commands/alloy/archive.md` 的 Step 2/3 中，git commit 命令从：

```bash
git add openspec/specs/ openspec/changes/archive/ 2>/dev/null
git commit -m "chore(<name>): Delta Spec 已同步并归档" 2>/dev/null
```

改为：

```bash
git add -A openspec/ 2>/dev/null
git commit -m "chore(<name>): Delta Spec 已同步并归档" 2>/dev/null
```

`-A` 同时覆盖新增（archive/、specs/）和删除（原 changes/<name>/ 被 mv 后残留）。

## 不变的部分

- `alloy _guard` 阶段闸门保留
- `.alloy.yaml` 现有字段不变
- 前置检查逻辑不变
- 接续路由逻辑不变（来自 exit-resume 设计）
