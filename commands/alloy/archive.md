---
name: "Alloy: Archive"
description: Alloy 归档阶段 - apply 完成后进入
category: Workflow
tags: [alloy, workflow]
---

# alloy-archive

你是 Alloy 的归档阶段编排器。你的职责是：验证 change 已完成执行，执行 Delta Spec 合并和归档，将 phase 推进到 `archived`。

**核心原则：先锁定文档证据链，再合入代码。** archive 只负责 spec 归档，代码合入由后续的 `/alloy:finish` 完成。

**捕获阶段启动时间**（命令调用后第一时间，前置检查之前）：
```bash
PHASE_START=$(date "+%Y-%m-%d %H:%M:%S")
```

---

**什么算"archive 操作不当"（反例）：**
- verify.md 的 Overall Decision 是 FAIL 但仍然继续归档——阻塞问题被无视
- 跳过 archive 直接手动 merge——Delta Spec 没有被同步，主 spec 落后于代码
- openspec archive 返回错误但忽视警告继续——"反正代码对的，spec 后面再说"

---

## 前置检查（HARD STOP）

### [Step 1/3] 前置检查

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
┌──────────────────────────────────────┐
│ Alloy [4/5] · Phase: Archive         │
│ 启动时间: $PHASE_START
└──────────────────────────────────────┘
```

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

**1. phase 检查：**

先通过 `alloy _guard` 做硬校验：
```bash
alloy _guard openspec/changes/<name> archived
```

若 guard 报错（phase 不匹配），读取当前 phase，按以下规则自动路由：

| 当前 phase | 行为 |
|-----------|------|
| started | "尚未 plan，自动进入 /alloy:plan" → 加载 alloy-plan 指令 |
| planned | "尚未 apply，自动进入 /alloy:apply" → 加载 alloy-apply 指令 |
| applied | precheck 通过，继续归档 |
| archived | "已归档，自动进入 /alloy:finish" → 加载 alloy-finish 指令 |
| finished | "工作流已完成" → STOP |

**实现方式：** 输出对应命令文件的完整指令，将 change name 和当前进度信息作为上下文传入。

**HARD STOP 保留场景：** change 目录不存在（前序阶段完全没做）→ 引导用户先运行 `/alloy:start`。

**2. verify.md 存在且 Overall Decision 不是 FAIL：**
```bash
test -f openspec/changes/<name>/verify.md && ! grep -q '^- \[x\] ❌ FAIL' openspec/changes/<name>/verify.md
```
不满足 → "verify.md 不存在或 Overall Decision 为 FAIL。请先修复阻塞问题。"

---
### [Step 2/3] /opsx:archive

> [Step 2/3] /opsx:archive
> 正在归档——Delta Spec 合并到主 spec → 移入 archive/...

使用 Slash 命令 `/opsx:archive` 执行归档。这是 OpenSpec 的标准归档命令，Alloy 不重复建造。

**Agent 执行：** 调用 `/opsx:archive`，传入 change name。该命令自动完成：
- Delta Spec 合并到主 spec（`openspec/specs/`）
- Change 目录移至 `openspec/changes/archive/YYYY-MM-DD-<name>/`
- 自有幂等检查——已归档则 Skip

**错误处理：**
- `/opsx:archive` 返回错误（权限、冲突等）→ [HARD STOP]，不推进 phase
- `/opsx:archive` 不可用（OpenSpec 未安装）→ 引导用户运行 `alloy init` 安装 OpenSpec

归档成功后，确定归档路径并处理后续步骤：

```bash
# /opsx:archive 已将 change 目录移至 archive/，后续操作使用归档路径
ARCHIVE_DIR="openspec/changes/archive/$(date +%Y-%m-%d)-<name>"
```

**读取 retrospective.md §6 Promote Candidates：** 检查是否有标记 `→ Promote to: memory` 的条目。若有，将 Why/How to apply 写入 `~/.claude/memory/` 对应的 memory 文件（feedback 类型），使其在后续 session 中自动加载。

> 这是 retrospective 从"死文档"变成"活反馈"的关键步骤——教训不跨 cycle 就不是教训。

然后记录 phase_timings.completed_at 并执行 git commit（确保归档变更被版本追踪）：
```bash
# 写入完成时间
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
TIMINGS=$(alloy _state read "$ARCHIVE_DIR" phase_timings 2>/dev/null || echo "{}")
echo "$TIMINGS" | python3 -c "
import sys,json
content = sys.stdin.read()
d = json.loads(content) if content.strip() else {}
p = d.setdefault('archive',{})
if 'completed_at' not in p:
    p['completed_at']='$COMPLETED_AT'
print(json.dumps(d))
" | while read -r val; do alloy _state write "$ARCHIVE_DIR" phase_timings "$val"; done

# 一次 commit：主 spec 更新 + 归档目录 + 原 change 目录删除 + phase_timings
git add openspec/specs/ openspec/changes/archive/ openspec/changes/<name>/
git commit -m "chore(<name>): Delta Spec 已同步并归档"
```
commit 失败必须阻断——归档变更未提交时，后续 finish 会清理分支，导致 spec 变更丢失。

> ✓ Delta Spec 已合并到主 spec
> ✓ Change 已归档到 $ARCHIVE_DIR
> ✓ 归档变更已提交

### Step 3/3：完成

**通过 `alloy _guard` 校验并推进 phase：**
```bash
alloy _guard "$ARCHIVE_DIR" archived --apply
```

```
┌──────────────────────────────────────┐
│ Alloy [4/5] · Phase: Archive — DONE  │
│ 启动时间: 从 phase_timings.archive.started_at 读取
│ 完成时间: 从 phase_timings.archive.completed_at 读取
│ 耗时: completed_at - started_at       │
└──────────────────────────────────────┘

→ Change: <name>
→ Phase: archived
→ 归档位置: archive/YYYY-MM-DD-<name>/

✓ Delta Spec 已合并到主 spec
✓ Change 已归档

> → 代码合入由 `/alloy:finish` 处理

---

## 闸门规则

- **git add 只用精确路径** — 永远不用 `-A`、`-a`、`.`。
  archive 只 add `openspec/specs/`、`openspec/changes/archive/` 和 `openspec/changes/<name>/`（原 change 目录删除），反例：`git add -A openspec/` 会把残留文件一起提交
- **phase 必须为 applied** —— 只有 apply 完成的 change 才能归档
- **verify.md 必须存在且非 FAIL** —— 阻塞问题必须先修复
- **先归档后合入** —— spec 文档先锁定，代码后通过 `/alloy:finish` 合入，避免"代码合入了 spec 还没跟上"
- **archive 不做代码合并** —— 代码合入是 `/alloy:finish` 的职责
