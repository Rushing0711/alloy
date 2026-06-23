---
name: "Alloy: Archive"
description: Alloy 归档阶段 - apply 完成后进入
category: Workflow
tags: [alloy, workflow]
spec: 01-product-spec/04-archive-spec.md
behaviors:
  preconditions: 6
  hard_stops:    8
  user_gates:    4
  warns:         1
  artifacts: [delta-spec, archive]
  transitions_to: archived
  external_calls: [opsx:archive]
---

# alloy-archive

你是 Alloy 的归档阶段编排器。验证 change 已完成执行，执行 Delta Spec 合并和归档，推进 phase 到 `archived`。

```
[HARD_STOP] NO ARCHIVE WITH FAIL
verify.md FAIL / merge 冲突 / memory 批量 / git status dirty 任一存在 = 拒绝归档
违反字面 = 违反精神：哪怕看似"小问题"、"先归档再补"、或用户主动说"一次过吧"要求批量打包 memory，也算违反 Iron Law。逐条 = 逐条——用户要求合并不算授权。
```

**核心原则：先锁定文档证据链，再合入代码。** archive 只负责 spec 归档，代码合入由 `/alloy:finish` 完成。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

**输出规则：** 阶段入口/出口必须按 `docs/specification/02-visual-spec.md` 输出 Phase 框（`┌─┐` Unicode 单线框，38 字符宽）、Step 标题（`[Step N/M]` + 38 字符 `─` 下划线）、`>` 块引用、`→` 引导行。**skill md 中的 Phase 框代码块是必须输出到终端的格式，不是文档示例。** 制品汇总表同理。

**捕获阶段启动时间 + 独立"阶段开始"commit**（幂等，重入时 started_at 不覆盖）：
```bash
alloy _phase start openspec/changes/<name> archive
```
> `alloy _phase start` 原子完成：幂等写 `phase_timings.archive.started_at` + git add 限路径 + commit。产生独立的"阶段开始"commit（仅 .alloy.yaml），不并入后续操作 commit。

---

### Red Flags（第三层防御——任一借口出现即 STOP）

主文件保留 5 条核心借口，完整 11 条见 `commands/alloy/references/archive-rationalizations.md`。

| 借口 | 现实 |
|------|------|
| "verify.md FAIL 是小问题，先归档再说" | FAIL = 阻塞问题。归档不可逆——带着 FAIL 归档意味着 spec 与代码偏差被永久封存。 |
| "spec 合并看起来没问题，直接继续" | 没看过的 spec 变更 = 代码与规格可能已分叉。审查只需 1 分钟，修复分叉需要 1 小时。 |
| "merge 冲突了，git merge --abort 一下让流程继续" | 冲突 = 代码状态未达预期，自动 abort = 隐藏真问题。退出 skill 让用户处理是唯一合法路径（§3.5.1）。 |
| "memory 候选都对，全部写入吧" | 单次确认承担不了全局污染风险。每条独立 USER_GATE，无例外（§5.2.2）。即使用户说"一次过吧"，逐条规则不可合并——用户要求打包不算授权。 |
| "另一个 change 也在 archive，等一下吧" | 多 change 并行 archive = Delta Spec 合并顺序敏感。先归档晚开始的 = 主 spec 状态错乱。必须串行。 |

---

## 前置检查

**进入阶段时，必须输出以下 Phase 框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [4/5] · Phase: Archive         │
│ 启动时间: phase_timings.archive.started_at
└──────────────────────────────────────┘
```

### [Step 1/3] 前置检查

**0. Skill 预检：** cmd: opsx/archive

读取 `commands/alloy/references/skill-precheck.md` 检测。不可用 → 引导 `alloy init` → STOP。

**1. Worktree 清洁度（PRECONDITION_FAIL）：** archive 会 commit 归档变更并合并 worktree——未 commit 的非 spec/changes 路径变更会污染结果。

```bash
DIRTY=$(git status --porcelain -uno)
if [ -n "$DIRTY" ]; then
  echo "⛔ [PRECONDITION_FAIL] worktree 有未提交变更，archive 拒绝执行："
  git status --short
  echo ""
  echo "  请先 commit 或 stash 保留变更。"
  echo "  禁止：git stash drop / git reset --hard / git checkout . / git restore . 直接丢弃工作（§3.5.1）。"
  exit 1
fi
```

跳过 untracked（`-uno`）——untracked 不会被 commit/merge 影响 archive。

**2. phase 检查（PRECONDITION_FAIL）：**

```bash
alloy _guard precheck openspec/changes/<name> applied
```

不匹配时读取 `commands/alloy/references/phase-routing.md` 自动跳转。change 目录不存在 → 引导 `/alloy:start`。

**3. verify.md 检查（PRECONDITION_FAIL）：**

```bash
alloy _guard verify-passed openspec/changes/<name>
```

FAIL → "verify.md 有阻塞问题。请先修复。" PASS/WARNING → 继续。

**4. 多 change 并行 archive 检测（WARN，task #14）：** Delta Spec 合并顺序敏感——同期多个 change 在 archive 状态时，先归档晚开始的可能导致主 spec 状态错乱。

```bash
PARALLEL=$(find openspec/changes -maxdepth 2 -name .alloy.yaml \
  -exec grep -l "phase: applied\|phase: archive" {} \; 2>/dev/null \
  | grep -v "/<name>/" | wc -l)
if [ "$PARALLEL" -gt 0 ]; then
  echo "⚠️ [WARN] 检测到 $PARALLEL 个其他 change 处于 applied/archive 状态："
  find openspec/changes -maxdepth 2 -name .alloy.yaml \
    -exec grep -l "phase: applied\|phase: archive" {} \; 2>/dev/null | grep -v "/<name>/"
  echo ""
  echo "  Delta Spec 合并顺序敏感，建议按 archive 启动时间串行处理。"
  echo "  继续当前 archive 前请确认其他 change 不会同时归档。"
fi
```

不阻断——仅提示。

---

### [Step 2/3] /opsx:archive

```
[Step 2/3] /opsx:archive
正在归档——Delta Spec 合并到主 spec → 移入 archive/...
```

**[HARD_STOP] 禁止 agent 跳过 `/opsx:archive` CLI 自行归档。**
**违反字面 = 违反精神：哪怕"openspec/specs/ 为空（新项目首 change）"、"看起来没有主 spec 可 sync"、**
**"change 的 specs/ 内容简单直接 mv 过去"——也必须调用 `/opsx:archive` 让 openspec archive CLI 执行。**
**新项目首 change 的 delta specs 必须作为初始主 spec 写入 openspec/specs/，不可跳过。**
**agent 自行 `mv openspec/changes/<name> openspec/changes/archive/...` = 绕过 CLI = delta specs 永久丢失 promote 机会。**

调用 `/opsx:archive`，传入 change name。该命令自动完成 Delta Spec 合并 + 目录移动。自有幂等检查——已归档则 Skip。

**错误处理（HARD_STOP）：** 返回错误 → ⛔ `[HARD_STOP] /opsx:archive 失败，归档中止`。不可用 → 引导 `alloy init`。**禁止：忽略错误继续后续步骤——Delta Spec 未合并时主 spec 与代码已分叉，强行推进 phase 会永久封存分叉。**

```bash
alloy _skill log openspec/changes/<name> archive opsx:archive
```

**Delta Spec promote 硬校验（PRECONDITION_FAIL）：** `/opsx:archive` 返回成功 ≠ spec 真被 promote——中等模型 agent 常见反模式是看到 `openspec/specs/` 为空（新项目首 change），误判"无需 sync"，自行 `mv openspec/changes/<name> openspec/changes/archive/...` 跳过 `openspec archive` CLI，导致 delta specs 永久丢失 promote 机会。必须**逐 capability 验证**主 spec 已写入。

```bash
ARCHIVE_DIR="openspec/changes/archive/$(date +%Y-%m-%d)-<name>"

if [ ! -d "$ARCHIVE_DIR" ]; then
  echo "⛔ [PRECONDITION_FAIL] 归档目录不存在: $ARCHIVE_DIR"
  echo "  /opsx:archive 未完成目录移动——可能 agent 自行实现归档跳过了 openspec archive CLI。"
  echo "  请重新调用 /opsx:archive，禁止用 git mv / mv 手动模拟归档。"
  exit 1
fi

if [ -d "$ARCHIVE_DIR/specs" ]; then
  MISSING_SPECS=""
  for CAP_DIR in "$ARCHIVE_DIR"/specs/*/; do
    [ -d "$CAP_DIR" ] || continue
    CAP=$(basename "$CAP_DIR")
    if [ ! -f "openspec/specs/$CAP/spec.md" ]; then
      MISSING_SPECS="$MISSING_SPECS $CAP"
    fi
  done

  if [ -n "$MISSING_SPECS" ]; then
    echo "⛔ [PRECONDITION_FAIL] Delta Spec 未 promote 到主 spec："
    echo "  缺失 capabilities:$MISSING_SPECS"
    echo "  归档目录: $ARCHIVE_DIR/specs/"
    echo "  主 spec:  openspec/specs/"
    echo ""
    echo "  /opsx:archive 未执行真正的 spec sync——agent 可能自行 mv 目录跳过了 openspec archive CLI。"
    echo "  即使 openspec/specs/ 原本为空（新项目首 change），delta specs 也必须作为初始主 spec 写入，不可跳过。"
    echo "  禁止用 git mv / mv 手动补齐——必须重新调用 /opsx:archive 让 openspec archive CLI 执行合并。"
    exit 1
  fi
else
  echo "ℹ️ change 无 specs/ 目录（纯 spec-less change），跳过 sync 校验"
fi
```

**Delta Spec 合并审查（USER_GATE，task #22 强制 diff 注入）：**

合并完成后，**必须先采集 diff 写入 AskUserQuestion 上下文**，沉默不算授权——agent 不可基于"看起来没问题"自动通过。**`git diff openspec/specs/` 为空 ≠ 无需 sync——可能 sync 根本未发生（见上方 PRECONDITION_FAIL）**。空 diff 必须先回到上方硬校验确认 change 无 specs/ 才算合法跳过。

```bash
SPEC_DIFF=$(git diff --stat openspec/specs/)
SPEC_DIFF_FULL=$(git diff openspec/specs/ | head -200)  # 截 200 行防爆量
```

🔴 USER_GATE（必须 AskUserQuestion，问题模板）：

> Delta Spec 合并结果：
> ```
> [SPEC_DIFF stat 摘要]
> ```
> 前 200 行 diff：
> ```
> [SPEC_DIFF_FULL]
> ```
> 选项：
> (a) 确认并继续提交归档变更
> (b) 调整 spec 合并内容——退出 skill，回到 `/opsx:archive` 参数调整或手动修正 spec 后重新运行

**违反字面 = 违反精神：** 哪怕 diff 看似"明显合理"或"diff 为空"，没经过用户明确选择 (a) = 不算授权。禁止 agent 基于"diff 短"、"无 conflict"或"specs/ 原本为空"自动跳过此 USER_GATE。

**归档变更提交（HARD_STOP §5.2.1 git add 限路径）：** 必须在 worktree 清理之前 commit，否则清理时 merge 会丢失归档操作。**禁止 `git add -A` 无路径——只 add `openspec/specs/ openspec/changes/` 两个明确路径，避免把无关 working tree 变更卷入归档 commit（§5.2.1）。**

```bash
git add openspec/specs/ openspec/changes/
git diff --cached --quiet || git commit -m "chore(<name>): 归档目录移动"
```

`git commit` 失败 → ⛔ `[HARD_STOP] 归档 commit 失败，archive 中止。检查 git 状态后重试。`

**读取 retrospective.md §6 Promote Candidates：** 标记 `→ Promote to: memory` 的条目，将 Why/How to apply 写入 `~/.claude/memory/` 对应文件。这是 retrospective 从"死文档"变"活反馈"的关键。

**memory 写入逐条确认（USER_GATE + HARD_STOP §5.2.2）：**

详细禁令见 `commands/alloy/references/interaction-style.md` "沉默 ≠ 授权"章节——批量打包是首条反模式。本阶段适用：retrospective Promote Candidates 必须**每条独立** AskUserQuestion，无论候选数量、相似度或"看起来都对"。**[HARD_STOP] 即使用户主动说"一次过吧"或"都挺合理的"，也不可合并——用户要求打包不算授权，agent 必须拒绝并逐条展示。**

逐条流程：

1. 解析 retrospective.md §6，提取每条 `→ Promote to: memory` 候选
2. 对每条候选**单独** AskUserQuestion：

   > 候选 [N/M]：写入 ~/.claude/memory/?
   > 内容：[Why + How to apply 摘要]
   > 选项：(a) 写入  (b) 跳过  (c) 修改后写入

3. (a) → 立即写入对应 memory 文件
4. (b) → 跳过，记录到 retrospective.md 末尾"Skipped from memory promotion"章节
5. (c) → 用户提供调整后的 Why/How 文本，写入修改版
6. 全部条目处理后输出汇总：N 条写入、M 条跳过、K 条修改后写入

无 Promote Candidates → 跳过本步骤。

**Worktree 清理（如果 apply 期间使用了 worktree）：** 读取 `commands/alloy/references/archive-worktree-cleanup.md` 执行完整流程。要点：

- task #21 silent fallback 检测：state 字段未写但 worktree 存在 → ⛔ PRECONDITION_FAIL，禁 silent fallback
- 遗留 change 兼容：FEATURE_BRANCH / WORKTREE_BRANCH 缺失时回退/检测，仍缺失 → ⛔ PRECONDITION_FAIL
- merge 成功 → 🔴 USER_GATE（确认并清理 / 退出审查），(a) 选清理 → `git worktree remove` + `git branch -d`
- merge 冲突 → 报告冲突现场后退出 skill。**[HARD_STOP §3.5.1] 禁 agent 自动 `git merge --abort` / `git reset --hard` / `git checkout .` / `git restore .` / `git stash` / `git clean -fd` / `git push --force` 任何一个。** 违反字面 = 违反精神。

未使用 worktree（`worktree=skipped` 或字段缺失且 git 无残留）时跳过本段。

**Worktree 合并时间记录：** worktree merge + remove + branch -d 全部成功后，写入 `worktree_merged_at`：

```bash
WORKTREE_MERGED_AT=$(date '+%Y-%m-%d %H:%M:%S')
alloy _state write "$ARCHIVE_DIR" worktree_merged_at "$WORKTREE_MERGED_AT"
```

未使用 worktree 时跳过本步。

**ExitWorktree（HARD_STOP，worktree 模式）：** worktree 清理后必须调用 `ExitWorktree` 退出 session 的 worktree 绑定，让 cwd 回到主仓。

> **[HARD_STOP] worktree remove 后必须 ExitWorktree，禁止 session 仍绑定在已删除的 worktree 目录。**
> 违反字面 = 违反精神：哪怕"后面命令用 cd 切到主仓"——也必须 ExitWorktree。
> EnterWorktree 会把 session cwd 绑定到 worktree 目录，即使 `cd /主仓` + `rm -rf worktree`，session cwd 仍注册在已删除的 worktree 目录。后续命令默认在已删除目录执行，报错 "No such file or directory"。
> ExitWorktree 解绑后 cwd 自动回到主仓，finish 阶段才能正常执行。

```
调用 ExitWorktree 工具（action: keep 或 remove 均可，worktree 已被 git worktree remove 清理）
→ session cwd 自动回到主仓 /Users/<project>
→ 后续命令在主仓执行
```

未使用 worktree 时跳过本步。

**记录完成时间并推进 phase——原子命令 `alloy _phase complete` 内部完成 completed_at 写入 + phase 推进 + git add 限路径 + commit：**

```bash
alloy _phase complete "$ARCHIVE_DIR" archive
```

`_phase complete` 失败 → ⛔ `[HARD_STOP] archive 阶段完成失败。.alloy.yaml 变更未提交时 finish 状态不一致。检查 git 状态后重试，禁止在失败时继续执行后续步骤。`

### [Step 3/3] 完成

**§5.2.3 路径 B 降级（HARD_STOP）：** 若 `_phase complete` 失败，降级路径详见 `commands/alloy/references/phase-downgrade-path.md`（archive 阶段降级 → `applied`）。**禁止 agent 自动 `git reset --hard` / `git checkout .` 清场（§3.5.1）。**

**阶段完成时，必须输出以下 Phase 完成框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [4/5] · Phase: Archive — DONE  │
│ 启动时间: phase_timings.archive.started_at
│ 完成时间: phase_timings.archive.completed_at
│ 耗时: completed_at - started_at
└──────────────────────────────────────┘

→ Change: <name>  Phase: archived
→ 归档位置: archive/YYYY-MM-DD-<name>/
→ ✓ Delta Spec 已合并  ✓ Change 已归档
→ 代码合入由 /alloy:finish 处理
```

archive 不做代码合并——代码合入由 `/alloy:finish` 处理。准备好后运行 `/alloy:finish` 进入收尾阶段。

