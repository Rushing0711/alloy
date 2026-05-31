# 阶段时间持久化与流程修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 阶段时间持久化到 `.alloy.yaml` + 3 个流程 bug 修复

**Architecture:** 所有改动在 `commands/alloy/*.md` 文件中。每个命令进入时写入 `phase_timings.<phase>.started_at`，完成时写入 `completed_at`。apply 的 verify 步骤后重录 tasks hash，archive 的 commit 改用 `git add -A openspec/`。

**Tech Stack:** Markdown (SKILL.md) — 只改命令文件

---

## 文件结构

| 文件 | 改动内容 |
|------|---------|
| `commands/alloy/start.md` | DONE 框时间改为读 `phase_timings.start` |
| `commands/alloy/plan.md` | 头部框 + DONE 框读写 `phase_timings.plan` |
| `commands/alloy/apply.md` | 头部框 + DONE 框 + tasks hash 重录 |
| `commands/alloy/archive.md` | 头部框 + DONE 框 + git add -A |
| `commands/alloy/finish.md` | 头部框 + DONE 框读写 `phase_timings.finish` |

---

### Task 1: start.md — 写入 phase_timings.start

**Files:**
- Modify: `commands/alloy/start.md`

start 阶段不设头部框读写（start 是入口路由）。只在 DONE 框前写入 `phase_timings`。

- [ ] **Step 1: 在 DONE 框之前写入 phase_timings**

找到 start.md 的"### 完成"段落（约行 158），在 DONE 框渲染之前，插入写入 `started_at` 和 `completed_at` 的步骤：

```markdown
### 完成

**记录阶段时间：**

```bash
STARTED_AT=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('start',{}).get('started_at',''))" 2>/dev/null || echo "")
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")

if [ -z "$STARTED_AT" ]; then
  STARTED_AT=$(alloy _state read openspec/changes/<name> created_at)
fi

# 更新 phase_timings
alloy _state write openspec/changes/<name> phase_timings "{\"start\":{\"started_at\":\"$STARTED_AT\",\"completed_at\":\"$COMPLETED_AT\"}}"
```
```

- [ ] **Step 2: DONE 框启动时间改为读 started_at**

DONE 框的"启动时间"从 `<created_at>` 改为读取 `phase_timings.start.started_at`，fallback 到 `created_at`。

- [ ] **Step 3: Commit**

```bash
git add commands/alloy/start.md
git commit -m "feat(start): phase_timings 写入"
```

---

### Task 2: plan.md — 头部框 + DONE 框读写时间

**Files:**
- Modify: `commands/alloy/plan.md`

- [ ] **Step 1: 头部框前写入 started_at**

找到 `### [Step 1/3] 确认 Change` 段落中头部框（约行 26-29），在头部框渲染之前，加入写入 `phase_timings.plan.started_at`：

```markdown
**记录阶段开始时间：**
```bash
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
# 读取已有 phase_timings，更新 plan.started_at
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
d.setdefault('plan',{})['started_at']='$COMPLETED_AT'
print(json.dumps(d))
" | xargs -0 alloy _state write openspec/changes/<name> phase_timings
```

- [ ] **Step 2: 头部框"启动时间"改为读 phase_timings.plan.started_at**

将头部框的 `<TIMESTAMP>` 改为读取 `phase_timings.plan.started_at`，fallback 到 `<TIMESTAMP>`。

- [ ] **Step 3: DONE 框前写入 completed_at**

找到 plan.md 的"### Step 3/3：完成"段落，DONE 框之前写入 `phase_timings.plan.completed_at`（逻辑同上）。

- [ ] **Step 4: DONE 框时间改为读 phase_timings**

DONE 框"启动时间"从 `<created_at>` 改为 `phase_timings.plan.started_at`；"完成时间"用 `phase_timings.plan.completed_at`；"耗时"用两时间戳计算。

- [ ] **Step 5: Commit**

```bash
git add commands/alloy/plan.md
git commit -m "feat(plan): phase_timings 读写"
```

---

### Task 3: apply.md — 头部框 + DONE 框 + tasks hash 重录

**Files:**
- Modify: `commands/alloy/apply.md`

- [ ] **Step 1: 头部框前写入 started_at**

同 Task 2 Step 1，写入 `phase_timings.apply.started_at`。

- [ ] **Step 2: 头部框"启动时间"改为读 phase_timings**

同 Task 2 Step 2。

- [ ] **Step 3: Step 4 verify 中 tasks hash 重录**

在 apply.md 的 Step 4/5（制品层验证）中，`/opsx:verify` 调用之后、verify.md 审查窗口之前，加入：

```markdown
**tasks.md checkbox 已更新，重录 hash：**
```bash
HASH=$(alloy _record compute openspec/changes/<name> tasks)
alloy _record write openspec/changes/<name> tasks "$HASH" "$(date "+%Y-%m-%d %H:%M:%S")" "$(alloy _record approver openspec/changes/<name>)"
```
```

- [ ] **Step 4: DONE 框前写入 completed_at + 时间改为读 phase_timings**

同 Task 2 Step 3-4，写入 `phase_timings.apply.completed_at`。

- [ ] **Step 5: Commit**

```bash
git add commands/alloy/apply.md
git commit -m "feat(apply): phase_timings 读写 + tasks hash 重录"
```

---

### Task 4: archive.md — 头部框 + DONE 框 + git add -A

**Files:**
- Modify: `commands/alloy/archive.md`

- [ ] **Step 1: 头部框前写入 started_at**

同 Task 2 Step 1，写入 `phase_timings.archive.started_at`。

- [ ] **Step 2: 头部框"启动时间"改为读 phase_timings**

同 Task 2 Step 2。

- [ ] **Step 3: git commit 改用 -A**

找到 archive.md 的 Step 2/3 中 git commit 命令（约行 73-76），将：

```bash
git add openspec/specs/ openspec/changes/archive/ 2>/dev/null
git commit -m "chore(<name>): Delta Spec 已同步并归档" 2>/dev/null
```

替换为：

```bash
git add -A openspec/ 2>/dev/null
git commit -m "chore(<name>): Delta Spec 已同步并归档" 2>/dev/null
```

- [ ] **Step 4: DONE 框前写入 completed_at + 时间改为读 phase_timings**

同 Task 2 Step 3-4，写入 `phase_timings.archive.completed_at`。

- [ ] **Step 5: Commit**

```bash
git add commands/alloy/archive.md
git commit -m "feat(archive): phase_timings 读写 + git add -A 修复残留"
```

---

### Task 5: finish.md — 头部框 + DONE 框读写时间

**Files:**
- Modify: `commands/alloy/finish.md`

- [ ] **Step 1: 头部框前写入 started_at**

同 Task 2 Step 1，写入 `phase_timings.finish.started_at`。

- [ ] **Step 2: 头部框"启动时间"改为读 phase_timings**

同 Task 2 Step 2。

- [ ] **Step 3: DONE 框前写入 completed_at + 时间改为读 phase_timings**

同 Task 2 Step 3-4，写入 `phase_timings.finish.completed_at`。

- [ ] **Step 4: Commit**

```bash
git add commands/alloy/finish.md
git commit -m "feat(finish): phase_timings 读写"
```

---

### Task 6: 端到端验证

- [ ] **Step 1: 验证接续后时间不丢失**

完整跑 start → plan → 退出 → `/alloy:start` 接续 → 确认 plan 头部框显示正确的历史 `started_at`

- [ ] **Step 2: 验证 DONE 框时间正确**

每个阶段 DONE 框的启动时间、完成时间、耗时均来自 `phase_timings`

- [ ] **Step 3: 验证 tasks hash 重录**

apply 阶段 tasks.md checkbox 更新后 guard 校验通过

- [ ] **Step 4: 验证 archive 残留文件不阻断 finish**

archive 后 finish，不再出现 checkout 被 block
