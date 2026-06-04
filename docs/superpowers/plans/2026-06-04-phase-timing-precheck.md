# 阶段时间记录与预检机制修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 6 个阶段文件的时间记录和预检机制，修复 started_at 写入太晚和预检误判问题。

**Architecture:** 在每个阶段命令的最开头捕获 `PHASE_START` 时间，前置检查通过后写入 `.alloy.yaml`。预检统一为"前置检查"格式，使用确定性 shell 脚本检测技能可用性（项目级→用户级优先级级联）。

**Tech Stack:** Markdown (skill files), Bash (shell scripts), Python (JSON 处理)

---

## File Structure

| 文件 | 职责 | 修改类型 |
|------|------|---------|
| `commands/alloy/plan.md` | 规划阶段编排器 | 时间记录 + 预检 |
| `commands/alloy/start.md` | 智能入口 | 时间记录（step 4 写入）+ 预检 |
| `commands/alloy/apply.md` | 执行阶段编排器 | 时间记录 + 预检 |
| `commands/alloy/archive.md` | 归档阶段编排器 | 时间记录 + 预检 |
| `commands/alloy/finish.md` | 收尾阶段编排器 | 时间记录 + 预检 |
| `commands/alloy/fix.md` | Bug 修复入口 | 预检（无时间记录） |

---

## 预检脚本模板

所有阶段共用的检测脚本结构（根据每个阶段需要的技能填入不同的列表）：

```bash
MISSING=0
# 检查命令：项目级 → 用户级
for cmd in "<cmd1>" "<cmd2>"; do
  if test -f ".claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（项目级 command）"
  elif test -f "$HOME/.claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（用户级 command）"
  else echo "  ✗ ${cmd//\//:} — 未找到"; MISSING=$((MISSING+1)); fi
done
# 检查技能：项目级 skills → 用户级 skills → 用户级 plugins
for skill in "<skill1>" "<skill2>"; do
  if test -d ".claude/skills/$skill"; then echo "  ✓ superpowers:$skill（项目级 skill）"
  elif test -d "$HOME/.claude/skills/$skill"; then echo "  ✓ superpowers:$skill（用户级 skill）"
  elif for d in "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers/"*"/skills/$skill"; do test -d "$d" && break; done 2>/dev/null; then echo "  ✓ superpowers:$skill（用户级 plugin）"
  else echo "  ✗ superpowers:$skill — 未找到"; MISSING=$((MISSING+1)); fi
done
if [ "$MISSING" -gt 0 ]; then echo ""; echo "  需要先完成环境初始化。请运行: alloy init"; exit 1; fi
```

---

### Task 1: 修改 plan.md — 时间记录 + 预检

**Files:**
- Modify: `commands/alloy/plan.md`

- [ ] **Step 1: 在命令最开头添加时间捕获**

在 `**调用外部命令或技能前，先输出标题和状态描述，再执行操作。不要只出标题然后沉默。**` 之后、`## 前置检查` 之前，添加：

```markdown
**捕获阶段启动时间**（命令调用后第一时间，前置检查之前）：
```bash
PHASE_START=$(date "+%Y-%m-%d %H:%M:%S")
```
```

- [ ] **Step 2: 替换预检第 4 项为确定性检测脚本**

将原来的：
```
4. **Skill / 命令预检：** 确认 `opsx:continue` 和 `superpowers:writing-plans` 均可用。任一不可用 → 引导 `alloy init` → STOP。不在生成过程中才暴露缺失。
```

替换为：
```markdown
4. **Skill / 命令预检：** 执行以下检测脚本，确认 `opsx:continue` 和 `superpowers:writing-plans` 均可用：

   ```bash
   MISSING=0
   for cmd in "opsx/continue"; do
     if test -f ".claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（项目级 command）"
     elif test -f "$HOME/.claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（用户级 command）"
     else echo "  ✗ ${cmd//\//:} — 未找到"; MISSING=$((MISSING+1)); fi
   done
   for skill in "writing-plans"; do
     if test -d ".claude/skills/$skill"; then echo "  ✓ superpowers:$skill（项目级 skill）"
     elif test -d "$HOME/.claude/skills/$skill"; then echo "  ✓ superpowers:$skill（用户级 skill）"
     elif for d in "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers/"*"/skills/$skill"; do test -d "$d" && break; done 2>/dev/null; then echo "  ✓ superpowers:$skill（用户级 plugin）"
     else echo "  ✗ superpowers:$skill — 未找到"; MISSING=$((MISSING+1)); fi
   done
   if [ "$MISSING" -gt 0 ]; then echo ""; echo "  需要先完成环境初始化。请运行: alloy init"; exit 1; fi
   ```

   检测优先级：项目级 command → 项目级 skill → 用户级 command → 用户级 skill → 用户级 plugin。任一不可用 → 引导 `alloy init` → STOP。
```

- [ ] **Step 3: 修改 Step 1/3 时间记录代码**

将 `## Step 1/3：确认 Change` 下面的"记录阶段开始时间"代码块替换为：

```markdown
**写入阶段启动时间**（前置检查通过后，使用命令开头捕获的 `PHASE_START`）：
```bash
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('plan',{})
if 'started_at' not in p:
    p['started_at']='$PHASE_START'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```
```

同时将 header 中的 `启动时间: 从 phase_timings.plan.started_at 读取` 改为 `启动时间: $PHASE_START`。

- [ ] **Step 4: 更新前置检查通过提示**

将 `前置检查通过：draft.md ✓  phase=started ✓  git ✓` 改为 `前置检查通过：draft.md ✓  phase=started ✓  git ✓  技能 ✓`。

- [ ] **Step 5: Commit**

```bash
git add commands/alloy/plan.md
git commit -m "fix(plan): 统一时间记录和预检机制"
```

---

### Task 2: 修改 start.md — 时间记录 + 预检

**Files:**
- Modify: `commands/alloy/start.md`

- [ ] **Step 1: 修改 SESSION_START 捕获描述**

将 `**记录会话启动时间**（后续写入 phase_timings.start.started_at）：` 改为 `**捕获阶段启动时间**（命令调用后第一时间，后续写入 phase_timings.start.started_at）：`

将 `echo "SESSION_START=$(date "+%Y-%m-%d %H:%M:%S")"` 改为 `SESSION_START=$(date "+%Y-%m-%d %H:%M:%S")`（去掉 echo，直接赋值）。

- [ ] **Step 2: 在 Step 1/2 前添加预检脚本**

在 `### [Step 1/2] 上下文探查` 之后、`> 正在探查项目上下文和需求空间...` 之前，添加：

```markdown
**Skill 预检：** 执行以下检测脚本，确认 `opsx:explore` 和 `superpowers:brainstorming` 均可用：

```bash
MISSING=0
for cmd in "opsx/explore"; do
  if test -f ".claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（项目级 command）"
  elif test -f "$HOME/.claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（用户级 command）"
  else echo "  ✗ ${cmd//\//:} — 未找到"; MISSING=$((MISSING+1)); fi
done
for skill in "brainstorming"; do
  if test -d ".claude/skills/$skill"; then echo "  ✓ superpowers:$skill（项目级 skill）"
  elif test -d "$HOME/.claude/skills/$skill"; then echo "  ✓ superpowers:$skill（用户级 skill）"
  elif for d in "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers/"*"/skills/$skill"; do test -d "$d" && break; done 2>/dev/null; then echo "  ✓ superpowers:$skill（用户级 plugin）"
  else echo "  ✗ superpowers:$skill — 未找到"; MISSING=$((MISSING+1)); fi
done
if [ "$MISSING" -gt 0 ]; then echo ""; echo "  需要先完成环境初始化。请运行: alloy init"; exit 1; fi
```

检测优先级：项目级 command → 项目级 skill → 用户级 command → 用户级 skill → 用户级 plugin。任一不可用 → 引导 `alloy init` → STOP。
```

删除原来的 `如果 opsx:explore 不可用...引导用户运行 alloy init 完成环境初始化。` 这段文字（预检脚本已覆盖）。

- [ ] **Step 3: 在 step 4 添加 started_at 写入**

在 start.md 的 step 4（`alloy _state init openspec/changes/<name>`）之后，添加写入 started_at 的代码：

```markdown
**记录阶段启动时间：**
```bash
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('start',{})
if 'started_at' not in p:
    p['started_at']='$SESSION_START'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```
```

- [ ] **Step 4: 修改 step 7 只写 completed_at**

将 step 7 中的：
```bash
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
STARTED_AT="<SESSION_START>"
alloy _state write openspec/changes/<name> phase_timings "{\"start\":{\"started_at\":\"$STARTED_AT\",\"completed_at\":\"$COMPLETED_AT\"}}"
```

改为：
```bash
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('start',{})
p['completed_at']='$COMPLETED_AT'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```

- [ ] **Step 5: 删除 Step 2/2 的前置预检文字**

删除 `**前置预检：** 确认 superpowers:brainstorming 技能可用。若不可用 → 引导用户运行 alloy init 重新安装 → STOP。不在 Step 2 才发现缺失。`（已在 Step 1/2 前的预检脚本覆盖）。

- [ ] **Step 6: Commit**

```bash
git add commands/alloy/start.md
git commit -m "fix(start): 时间记录 step 4 写入 started_at，统一预检格式"
```

---

### Task 3: 修改 apply.md — 时间记录 + 预检

**Files:**
- Modify: `commands/alloy/apply.md`

- [ ] **Step 1: 在命令最开头添加时间捕获**

在 `**调用外部命令或技能前，先输出标题和状态描述，再执行操作。不要只出标题然后沉默。**` 之后、`## 前置检查` 之前，添加：

```markdown
**捕获阶段启动时间**（命令调用后第一时间，前置检查之前）：
```bash
PHASE_START=$(date "+%Y-%m-%d %H:%M:%S")
```
```

- [ ] **Step 2: 将 Step 0 预检移到前置检查中**

将 `[Step 0/5] 技能可用性预检（precheck）` 的内容移到 `## 前置检查` 章节中（在 git 仓库检查之后），并替换为确定性检测脚本：

```markdown
4. **Skill 预检：** 执行以下检测脚本，确认 6 个执行技能均可用：

   ```bash
   MISSING=0
   for skill in "using-git-worktrees" "subagent-driven-development" "executing-plans" "test-driven-development" "requesting-code-review" "verification-before-completion"; do
     if test -d ".claude/skills/$skill"; then echo "  ✓ superpowers:$skill（项目级 skill）"
     elif test -d "$HOME/.claude/skills/$skill"; then echo "  ✓ superpowers:$skill（用户级 skill）"
     elif for d in "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers/"*"/skills/$skill"; do test -d "$d" && break; done 2>/dev/null; then echo "  ✓ superpowers:$skill（用户级 plugin）"
     else echo "  ✗ superpowers:$skill — 未找到"; MISSING=$((MISSING+1)); fi
   done
   if [ "$MISSING" -gt 0 ]; then echo ""; echo "  需要先完成环境初始化。请运行: alloy init"; exit 1; fi
   ```

   检测优先级：项目级 skill → 用户级 skill → 用户级 plugin。任一缺失 → 输出缺失列表 → 引导 `alloy init` → STOP。不静默降级。
```

删除原来的 `[Step 0/5]` 整个章节。

- [ ] **Step 3: 修改时间记录代码**

将 `**记录阶段开始时间：**` 代码块改为使用 `PHASE_START`：

```markdown
**写入阶段启动时间**（前置检查通过后，使用命令开头捕获的 `PHASE_START`）：
```bash
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('apply',{})
if 'started_at' not in p:
    p['started_at']='$PHASE_START'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```
```

将 header 中的 `启动时间: <上面命令输出的 started_at 值>` 改为 `启动时间: $PHASE_START`。

- [ ] **Step 4: 更新前置检查通过提示**

将 `前置检查通过：plan.md ✓  phase=planned ✓  git仓库 ✓` 改为 `前置检查通过：plan.md ✓  phase=planned ✓  git ✓  技能 ✓`。

- [ ] **Step 5: Commit**

```bash
git add commands/alloy/apply.md
git commit -m "fix(apply): 统一时间记录和预检机制"
```

---

### Task 4: 修改 archive.md — 时间记录 + 预检

**Files:**
- Modify: `commands/alloy/archive.md`

- [ ] **Step 1: 在命令最开头添加时间捕获**

在 `**核心原则：先锁定文档证据链，再合入代码。**` 之后、`## 前置检查（HARD STOP）` 之前，添加：

```markdown
**捕获阶段启动时间**（命令调用后第一时间，前置检查之前）：
```bash
PHASE_START=$(date "+%Y-%m-%d %H:%M:%S")
```
```

- [ ] **Step 2: 修改时间记录代码**

将 `### [Step 1/3] 前置检查` 中的 `**记录阶段开始时间：**` 代码块改为：

```markdown
**写入阶段启动时间**（前置检查通过后，使用命令开头捕获的 `PHASE_START`）：
```bash
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('archive',{})
if 'started_at' not in p:
    p['started_at']='$PHASE_START'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```
```

将 header 中的 `启动时间: 从 phase_timings.archive.started_at 读取` 改为 `启动时间: $PHASE_START`。

- [ ] **Step 3: 添加技能预检**

在 `**1. phase 检查：**` 之前，添加：

```markdown
**0. Skill 预检：** 执行以下检测脚本，确认 `opsx:archive` 可用：

```bash
MISSING=0
for cmd in "opsx/archive"; do
  if test -f ".claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（项目级 command）"
  elif test -f "$HOME/.claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（用户级 command）"
  else echo "  ✗ ${cmd//\//:} — 未找到"; MISSING=$((MISSING+1)); fi
done
if [ "$MISSING" -gt 0 ]; then echo ""; echo "  需要先完成环境初始化。请运行: alloy init"; exit 1; fi
```

检测优先级：项目级 command → 用户级 command。任一不可用 → 引导 `alloy init` → STOP。
```

- [ ] **Step 4: Commit**

```bash
git add commands/alloy/archive.md
git commit -m "fix(archive): 统一时间记录和预检机制"
```

---

### Task 5: 修改 finish.md — 时间记录 + 预检

**Files:**
- Modify: `commands/alloy/finish.md`

- [ ] **Step 1: 在命令最开头添加时间捕获**

在 `**finish 只做代码层面的收尾，不涉及 spec 变更。**` 之后、`## 前置检查` 之前，添加：

```markdown
**捕获阶段启动时间**（命令调用后第一时间，前置检查之前）：
```bash
PHASE_START=$(date "+%Y-%m-%d %H:%M:%S")
```
```

- [ ] **Step 2: 修改时间记录代码**

将 `## 前置检查` 中的 `**记录阶段开始时间：**` 代码块改为：

```markdown
**写入阶段启动时间**（前置检查通过后，使用命令开头捕获的 `PHASE_START`）：
```bash
TIMINGS=$(alloy _state read openspec/changes/<name> phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('finish',{})
if 'started_at' not in p:
    p['started_at']='$PHASE_START'
print(json.dumps(d))
" | while read -r val; do alloy _state write openspec/changes/<name> phase_timings "$val"; done
```
```

将 header 中的 `启动时间: 从 phase_timings.finish.started_at 读取` 改为 `启动时间: $PHASE_START`。

- [ ] **Step 3: 替换 Step 1/3 的 Skill 预检为确定性脚本**

将 `**0. Skill 预检：** 确认 superpowers:finishing-a-development-branch 技能可用。若不可用 → 引导 alloy init → STOP。` 替换为：

```markdown
**0. Skill 预检：** 执行以下检测脚本，确认 `superpowers:finishing-a-development-branch` 可用：

```bash
MISSING=0
for skill in "finishing-a-development-branch"; do
  if test -d ".claude/skills/$skill"; then echo "  ✓ superpowers:$skill（项目级 skill）"
  elif test -d "$HOME/.claude/skills/$skill"; then echo "  ✓ superpowers:$skill（用户级 skill）"
  elif for d in "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers/"*"/skills/$skill"; do test -d "$d" && break; done 2>/dev/null; then echo "  ✓ superpowers:$skill（用户级 plugin）"
  else echo "  ✗ superpowers:$skill — 未找到"; MISSING=$((MISSING+1)); fi
done
if [ "$MISSING" -gt 0 ]; then echo ""; echo "  需要先完成环境初始化。请运行: alloy init"; exit 1; fi
```

检测优先级：项目级 skill → 用户级 skill → 用户级 plugin。任一不可用 → 引导 `alloy init` → STOP。
```

- [ ] **Step 4: Commit**

```bash
git add commands/alloy/finish.md
git commit -m "fix(finish): 统一时间记录和预检机制"
```

---

### Task 6: 修改 fix.md — 预检（无时间记录）

**Files:**
- Modify: `commands/alloy/fix.md`

- [ ] **Step 1: 替换 Skill 预检为确定性脚本**

将 `**1. Skill 预检：**` 部分替换为：

```markdown
**1. Skill 预检：** 执行以下检测脚本，确认 3 个诊断技能均可用：

```bash
MISSING=0
for skill in "systematic-debugging" "test-driven-development" "verification-before-completion"; do
  if test -d ".claude/skills/$skill"; then echo "  ✓ superpowers:$skill（项目级 skill）"
  elif test -d "$HOME/.claude/skills/$skill"; then echo "  ✓ superpowers:$skill（用户级 skill）"
  elif for d in "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers/"*"/skills/$skill"; do test -d "$d" && break; done 2>/dev/null; then echo "  ✓ superpowers:$skill（用户级 plugin）"
  else echo "  ✗ superpowers:$skill — 未找到"; MISSING=$((MISSING+1)); fi
done
if [ "$MISSING" -gt 0 ]; then echo ""; echo "  需要先完成环境初始化。请运行: alloy init"; exit 1; fi
```

检测优先级：项目级 skill → 用户级 skill → 用户级 plugin。任一缺失 → 输出缺失列表 → 引导 `alloy init` → STOP。
```

删除原来的 `任一缺失 → 输出缺失列表 → 引导 alloy init → STOP。` 文字（脚本已覆盖）。

- [ ] **Step 2: Commit**

```bash
git add commands/alloy/fix.md
git commit -m "fix(fix): 统一预检格式，添加确定性检测脚本"
```

---

### Task 7: 同步到 test_alloy 项目

**Files:**
- Modify: `../test_alloy/.claude/commands/alloy/start.md`
- Modify: `../test_alloy/.claude/commands/alloy/plan.md`
- Modify: `../test_alloy/.claude/commands/alloy/apply.md`
- Modify: `../test_alloy/.claude/commands/alloy/archive.md`
- Modify: `../test_alloy/.claude/commands/alloy/finish.md`
- Modify: `../test_alloy/.claude/commands/alloy/fix.md`

- [ ] **Step 1: 复制修改后的文件到 test_alloy**

```bash
for f in start.md plan.md apply.md archive.md finish.md fix.md; do
  cp commands/alloy/$f ../test_alloy/.claude/commands/alloy/$f
done
```

- [ ] **Step 2: 验证复制成功**

```bash
for f in start.md plan.md apply.md archive.md finish.md fix.md; do
  diff commands/alloy/$f ../test_alloy/.claude/commands/alloy/$f && echo "$f ✓"
done
```

Expected: 所有文件显示 `✓`（无差异）。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-04-phase-timing-precheck.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 每个 task 派发独立 subagent，task 间审查，快速迭代

**2. Inline Execution** - 当前 session 逐步执行，批量执行带检查点

Which approach?
