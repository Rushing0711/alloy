---
name: alloy-archive
description: 归档阶段--将 change 归档。手动调用 /alloy-archive。
spec: 01-product-spec/04-archive-spec.md
behaviors:
  preconditions: 5
  hard_stops:    19
  user_gates:    3
  warns:         1
  artifacts: [delta-spec, archive]
  transitions_to: archived
  external_calls: [alloy _archive]
---

# alloy-archive

## REQUIRED BACKGROUND

**REQUIRED BACKGROUND:** Understand alloy-shared

你是 Alloy 的归档阶段编排器。验证 change 已完成执行，执行 Delta Spec 合并和归档，推进 phase 到 `archived`。

```
[HARD_STOP] NO ARCHIVE WITH FAIL
verify.md FAIL / merge 冲突 / git status dirty 任一存在 = 拒绝归档
违反字面 = 违反精神：哪怕看似"小问题"、"先归档再补"，也算违反 Iron Law。
```

**核心原则：先锁定文档证据链，再合入代码。** archive 只负责 spec 归档，代码合入由 `/alloy-finish` 完成。

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

**输出规则:** 阶段入口/出口按 `alloy-shared/references/phase-frame.md` 输出 Phase 框 + Step 标题 + 块引用 + 引导行。skill md 中的 Phase 框代码块是必须输出到终端的格式,不是文档示例。完整规范见 `docs/specification/02-visual-spec.md`。

---

### Red Flags（第三层防御--任一借口出现即 STOP）

主文件保留 5 条核心借口，完整 11 条见 `references/rationalizations.md`。

| 借口 | 现实 |
|------|------|
| "verify.md FAIL 是小问题，先归档再说" | FAIL = 阻塞问题。归档不可逆--带着 FAIL 归档意味着 spec 与代码偏差被永久封存。 |
| "spec 合并看起来没问题，直接继续" | 没看过的 spec 变更 = 代码与规格可能已分叉。审查只需 1 分钟，修复分叉需要 1 小时。 |
| "merge 冲突了，git merge --abort 一下让流程继续" | 冲突 = 代码状态未达预期，自动 abort = 隐藏真问题。退出 skill 让用户处理是唯一合法路径（§3.5.1）。 |
| "另一个 change 也在 archive，等一下吧" | 多 change 并行 archive = Delta Spec 合并顺序敏感。先归档晚开始的 = 主 spec 状态错乱。必须串行。 |
| "先文本列 1./2. 选项让用户思考，再调 AskUserQuestion 双保险" | ⛔ HARD_STOP：双重呈现违规--首次呈现必须是平台原生交互工具调用,不是文本。哪怕"先展示选项让用户思考"、"文本+工具双保险",也算违反。常见模式:thinking 决策"用 AskUserQuestion"但执行时先输出纯文本选项(决策->执行断裂)。 |

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

**⛔ HARD_STOP（阶段入口必执行）：先记录阶段开始时间**

```bash
alloy _phase start openspec/changes/<name> archive
```

> 必须在 Step 1 任何前置检查之前执行--`_skill log` / `_artifact commit` 都依赖 `phase_timings.archive.started_at` 已存在。
>
> `alloy _phase start` 原子完成：幂等写 `phase_timings.archive.started_at` + git add 限路径 + commit。产生独立的"阶段开始"commit（仅 .alloy.yaml），不并入后续操作 commit。

**0. Skill 预检：** cmd: opsx/archive

调 `alloy _precheck --cmd "opsx/archive"` 检测(多 agent 适配,详见 `alloy-shared/references/skill-precheck.md`)。不可用 -> 引导 `alloy init` -> STOP。

**1. Worktree 清洁度（PRECONDITION_FAIL）：** archive 会 commit 归档变更并合并 worktree--未 commit 的非 spec/changes 路径变更会污染结果。

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

跳过 untracked（`-uno`）--untracked 不会被 commit/merge 影响 archive。

**2. phase 检查（PRECONDITION_FAIL）：**

```bash
alloy _guard precheck openspec/changes/<name> archiving
```

不匹配时读取 `alloy-shared/references/phase-routing.md` 自动跳转。change 目录不存在 -> 引导 `/alloy-start`。

**3. verify.md 检查（PRECONDITION_FAIL）：**

```bash
alloy _guard verify-passed openspec/changes/<name>
```

FAIL -> "verify.md 有阻塞问题。请先修复。" PASS/WARNING -> 继续。

**4. 多 change 并行 archive 检测（WARN，task #14）：** Delta Spec 合并顺序敏感--同期多个 change 在 archive 状态时，先归档晚开始的可能导致主 spec 状态错乱。

```bash
PARALLEL=$(alloy _guard parallel-phase archiving,archived --exclude <name>)
if [[ "$PARALLEL" == parallel:* ]]; then
  echo "⚠️ [WARN] 检测到 ${PARALLEL#parallel:} 个其他 change 处于 archiving/archived 状态："
  alloy _guard parallel-phase archiving,archived --exclude <name> | tail -n +2
  echo ""
  echo "  Delta Spec 合并顺序敏感，建议按 archive 启动时间串行处理。"
  echo "  继续当前 archive 前请确认其他 change 不会同时归档。"
fi
```

不阻断--仅提示。

---

### [Step 2/3] Worktree 清理 + alloy _archive

```
[Step 2/3] Worktree 清理(先 merge worktree -> feature)-> alloy _archive(在 feature 分支)
先退出 worktree 并合并到 feature,再在 feature 分支执行归档--避免 archive 目录移动导致 merge 冲突
```

**流程顺序调整说明：** worktree 清理必须在 `alloy _archive` 之前--archive 操作会移动 `openspec/changes/<name>/` 到 `archive/`,若在 worktree 分支执行,merge 到 feature 时目录移动 + tasks.md 勾选导致三方合并冲突。先 merge worktree 到 feature(只有 apply 的代码/制品 commit,无目录移动),再在 feature 分支做 archive,冲突消除。

**Worktree 清理（如果 apply 期间使用了 worktree）：**

> ⛔ [HARD_STOP] worktree 清理流程的环境切换:
> 1. **在 worktree 里**：读 state(worktree / feature_branch / worktree_branch 三字段) + 展示 worktree 分支 commit 列表（.alloy.yaml 在 worktree 里,退出 worktree 后主仓读不到--此时 archive 尚未执行,change 目录还在原路径 openspec/changes/<name>/）
> 2. **USER_GATE**：确认清理 worktree
> 3. **退出 worktree 回主仓**(多 agent 适配,见下方):
>    - **Claude Code**: 调 `ExitWorktree` 工具(`action: "keep"`)
>    - **OpenCode**: 无 `ExitWorktree` 工具,后续 bash 命令传 `workdir=<主仓路径>` 切回主仓(OpenCode bash 工具有 `workdir` 参数,cd 不持久)
>    - **Pi**: 不支持 worktree,不会进 worktree 模式,无此步骤
> 4. **`alloy _worktree-cleanup <change-dir>`**：原子完成 merge + remove + branch -d + worktree_mergedat 记录（CLI 自己从 worktree 分支读 state,不传参;用原路径 openspec/changes/<name>,此时 archive 尚未执行）
>
> 违反字面 = 违反精神：哪怕"在 worktree 里 merge 效率高"、"Claude Code 用 cd 主仓替代 ExitWorktree",也算违反--worktree 里 merge 自己到自己没意义,Claude Code 的 cd 不解绑 session。
> 常见违规模式:
> - 在 worktree 里执行 `git merge worktree-<name>`（HEAD 是 worktree 分支,merge 自己）
> - 在 worktree 里执行 `git worktree remove`（删除自己 cwd,后续命令失败）
> - **Claude Code** 用 `cd /主仓` 替代 `ExitWorktree`（cd 不解绑 session,后续命令仍可能在 worktree 执行）
> - 跳过 USER_GATE 直接清理（merge 结果用户有权审查）

**① 在 worktree 里读 state + 展示 commit 列表：**

```bash
CHANGE_DIR="openspec/changes/<name>"

# 前置:确保 worktree 内的 .alloy.yaml 已 commit
# (apply 阶段或 archive 早期可能写入 .alloy.yaml 未 commit,会导致 _worktree-cleanup 的 worktree remove 失败)
alloy _chore-commit "$CHANGE_DIR" --msg "chore(<name>): 同步 .alloy.yaml 状态(archive 前置)" --paths "$CHANGE_DIR/.alloy.yaml"

WORKTREE_PATH=$(alloy _state read "$CHANGE_DIR" worktree 2>/dev/null)
FEATURE_BRANCH=$(alloy _state read "$CHANGE_DIR" feature_branch 2>/dev/null)
WORKTREE_BRANCH=$(alloy _state read "$CHANGE_DIR" worktree_branch 2>/dev/null)
```

`WORKTREE_PATH` 为空 / null / skipped -> 未使用 worktree,跳过整个 worktree 清理段,直接进 `alloy _archive`。

> ⛔ [HARD_STOP] agent 必须在 worktree 里读取这三个字段并记住--ExitWorktree 后主仓的 change 目录还没 merge,读不到 state。
> 这三个字段用于展示给用户（USER_GATE 审查 worktree 信息）。`alloy _worktree-cleanup` 自己从 worktree 分支读 state（用 `git show worktree-<name>:<change-dir>/.alloy.yaml`）,不依赖 agent 传参--解决 agent 在 feature 分支读 state 为 null 的问题。

```bash
# 展示 worktree 分支的 commit 列表（供 USER_GATE 审查将合入的内容）
echo "worktree 分支 $WORKTREE_BRANCH 的 commit 列表（将合入 feature 分支）："
git log --oneline -10 "$WORKTREE_BRANCH" 2>/dev/null
```

**② USER_GATE 确认清理：**

> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具调用自动 clear(Codex 例外:request_user_input 不触发 hook,问答后必须立即调 `alloy _guard user-gate pass`)或手动 pass 降级。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require "$CHANGE_DIR" archive:worktree-cleanup
```

🔴 USER_GATE（必须平台原生交互工具）: 确认清理 worktree?

> 选项:
> - 1. 确认并清理--merge worktree 分支到 feature + remove worktree + branch -d
> - 2. 需要检查--退出 skill 让用户审查

> 用户选 1 后继续步骤 ③;选 2 agent **必须先调 `alloy _guard user-gate reset openspec/changes/<name> archive:worktree-cleanup`**(把 gate 从 gate_history 移除 + 重新设为 pending_gate),再退出 skill。
> 原因:hook-guard 检测到问答工具调用时无条件 clear pending_gate + 加入 gate_history,用户选"需要检查"本意是拒绝通过 gate,语义被吞了。reset 恢复 gate 状态,用户重新调 /alloy-archive 时 agent 调 require(幂等)+ 问答工具重新询问。

**③ 退出 worktree 回主仓(多 agent 适配):**

**Claude Code:** 调用 `ExitWorktree` 工具,**必须用 `action: "keep"`**--禁用 `action: "remove"`。

**OpenCode:** 无 `ExitWorktree` 工具,后续 bash 命令传 `workdir=<主仓路径>` 切回主仓(OpenCode bash 工具有 `workdir` 参数,cd 不持久)。主仓路径 = git 仓库根目录(`git rev-parse --git-common-dir` 在 worktree 内返回主仓 .git 路径,其父目录即主仓根)。

**Pi:** 不支持 worktree,不会进 worktree 模式,无此步骤。

```bash
# OpenCode:后续 bash 命令传 workdir=<主仓根>
# 主仓根 = git rev-parse --git-common-dir 的父目录
# (agent 在 bash 调用时传 workdir 参数,不是 cd)
```

> ⛔ [HARD_STOP] Claude Code 必须用 `ExitWorktree` 工具,action 必须是 `keep`,不能是 `remove`。
> 原因:`remove` 会直接销毁 worktree + 丢弃 worktree 分支的 commit,跳过 `alloy _worktree-cleanup` 的 merge 步骤,worktree 工作永久丢失。
> 上方 USER_GATE "确认清理 worktree" 是授权 `alloy _worktree-cleanup` 执行 merge+remove+branch-d,**不是授权 ExitWorktree 直接 remove**。
> 违反字面 = 违反精神:哪怕"反正要清理,直接 remove 省事"、"用户已确认清理,remove 等价",也算违反--
>   - remove 跳过 merge,worktree 分支 commit 不会被合入 feature
>   - remove 后 _worktree-cleanup 无法执行(worktree 已销毁,CLI 校验失败)
>   - discard_changes: true 更是绕过新 USER_GATE 强制销毁,等同 §3.5.1 破坏性操作
> 常见违规模式:
> - agent 选 action: "remove" 觉得"省一步"--结果丢 8 个 commit,_worktree-cleanup 无法执行
> - agent 看到 ExitWorktree 安全闸门提示"未合并 commit 将丢失"后,选 discard_changes: true 强制丢弃--这是绕过 USER_GATE,违规
> - agent 把 USER_GATE "确认清理 worktree" 等同于 "授权 ExitWorktree remove"--语义错位,USER_GATE 授权的是 _worktree-cleanup 流程

> ⛔ [HARD_STOP] 退出 worktree 的方式按 agent:
> - **Claude Code**: 必须调 `ExitWorktree` 工具--禁用 `cd /主仓` / `git -C /主仓` 绕过。`ExitWorktree` 解绑 session cwd,后续 CLI 命令在主仓执行。Claude Code 的 `cd` 不解绑 session,后续命令仍可能在 worktree 执行。
> - **OpenCode**: 后续 bash 命令传 `workdir=<主仓路径>` 切回主仓(OpenCode bash 工具有 `workdir` 参数,cd 不持久)。禁用 `cd /主仓`(不持久,下一个 bash 仍回 worktree 或 instanceCtx.directory)。
> - **Pi**: 不支持 worktree,不会进 worktree 模式,无此步骤。
>
> 两种方式都必须确保后续命令在主仓 feature 分支执行(步骤 ④ 的 `alloy _worktree-cleanup` 会校验)。

**④ 调用原子 CLI 完成清理（传入 change-dir,CLI 自己从 worktree 分支读 state）:**

```bash
CHANGE_DIR="openspec/changes/<name>"
alloy _worktree-cleanup "$CHANGE_DIR"
```

> `alloy _worktree-cleanup` 原子完成:
> 1. 从 change-dir 提取 change-name,用 `git show worktree-<name>:<change-dir>/.alloy.yaml` 从 worktree 分支读 state（worktree/feature_branch）
> 2. 校验当前在主仓（不在 worktree）
> 3. 校验当前分支 = feature_branch
> 4. git merge worktree_branch 到 feature（失败报告冲突现场,禁 agent 自动 abort）
> 5. git worktree remove（有未跟踪文件时 HARD_STOP,禁 agent 自动 clean -fd）
> 6. git branch -d worktree_branch（失败禁自动 -D,报告问题让用户决策）
> 7. 记录 worktree_merged_at + commit（merge 后 change-dir 在 feature 分支存在,可写）
>
> agent 禁自行 git merge / worktree remove / branch -d 模拟--本 CLI 是唯一合法路径。
> CLI 自己从 worktree 分支读 state（用 `git show worktree-<name>:<change-dir>/.alloy.yaml`）,不依赖 agent 传参--解决 agent 在 feature 分支读 state 为 null 的问题（state 写在 worktree 分支,feature 分支读不到）。步骤 ① 读 state 是为了展示给用户审查,不是传给 CLI。

CLI 失败 -> ⛔ `[HARD_STOP]` 按 CLI 输出的指引处理（冲突 / 未跟踪文件 / branch -d 失败）,禁 agent 自动 git 自救（§3.5.1）。

未使用 worktree 时跳过步骤 ①-④,直接进 `alloy _archive`。

---

**`alloy _archive`(在 feature 分支执行,已下沉为原子 CLI):**

> archive 阶段已下沉为 `alloy _archive` 原子命令(调 openspec archive CLI + 校验 Delta Spec promote + 校验目录移动)。不调 `/opsx:archive` slash command,不跑 `openspec archive` CLI--用 `alloy _archive` 统一封装。详见 `alloy-shared/references/opsx-commands.md`。

**[HARD_STOP] 禁止 agent 跳过 `alloy _archive` 自行归档。**
**违反字面 = 违反精神：哪怕"openspec/specs/ 为空（新项目首 change）"、"看起来没有主 spec 可 sync"、"change 的 specs/ 内容简单直接 mv 过去"--也必须调用 `alloy _archive` 让 openspec archive CLI 执行。**
**新项目首 change 的 delta specs 必须作为初始主 spec 写入 openspec/specs/，不可跳过。**
**agent 自行 `mv openspec/changes/<name> openspec/changes/archive/...` = 绕过 CLI = delta specs 永久丢失 promote 机会。**

**[PRECONDITION_FAIL] `alloy _archive` 内置 worktree 防御检查--跳过步骤 ② worktree 清理直接归档会被拒绝:**
- 检查 1:当前在 worktree 内(`git rev-parse --git-dir` ≠ `--git-common-dir`)-> 拒绝
- 检查 2:.alloy.yaml 的 `worktree` 非 null/skipped 且 `worktree_merged_at` 为 null -> 拒绝(worktree=skipped 时跳过此检查,Pi 下正常)
- 拦截后提示"先调 `alloy _worktree-cleanup` 合并 worktree 分支到 feature"--回到步骤 ② 重新执行,不可在 worktree 内或未清理时强跑。

调用 `alloy _archive`，传入 change dir。该命令原子完成：调用 `openspec archive` CLI + 校验 Delta Spec promote + 校验目录移动。agent 禁自行 mkdir/cp/mv 模拟。

```bash
alloy _skill log openspec/changes/<name> archive alloy:_archive
alloy _archive openspec/changes/<name>
```

> **`alloy _archive` 输出 `-> ARCHIVE_DIR=openspec/changes/archive/<date>-<name>` 引导行**,后续步骤(delta-spec-review USER_GATE、phase complete 等)用此路径,禁手写 `ls -d openspec/changes/archive/*-<name> | sort -r | head -1`(重名/多 archive 不可靠)。agent 从输出捕获 ARCHIVE_DIR 后,在后续 bash 命令里用此变量(注意 Pi/OpenCode bash 不持久,每个 bash 需重新捕获或硬编码路径)。

**错误处理（HARD_STOP）：** `alloy _archive` 返回 PRECONDITION_FAIL -> ⛔ `[HARD_STOP] 归档中止`。**禁止：忽略错误继续后续步骤--Delta Spec 未合并时主 spec 与代码已分叉，强行推进 phase 会永久封存分叉。** 禁止 agent 自行 mkdir/cp/mv 补救--必须重调 `alloy _archive`。

> ⛔ [HARD_STOP §3.5.1] `alloy _archive` 失败时禁自动 `git reset --hard` / `git checkout .` / `git restore .` / `git stash` / `git clean -fd` 清场。
> 违反字面 = 违反精神：哪怕"工作树脏了清一下重试",也算违反--破坏性命令会丢失用户已 stage 的工作,必须报告问题让用户决策。

> `alloy _archive` 内部完成归档变更提交(git add openspec/specs/ openspec/changes/ + commit,限路径 + 幂等)。`openspec archive` CLI 内部可能产生 commit,`_archive` 兜底确保归档变更已 commit,agent 无需手写归档 commit。

**Delta Spec 合并审查（USER_GATE，task #22 强制 diff 注入）：**

合并完成后，**必须先采集 diff 写入 AskUserQuestion 上下文**，沉默不算授权--agent 不可基于"看起来没问题"自动通过。**`git diff openspec/specs/` 为空 ≠ 无需 sync--可能 sync 根本未发生（见上方 PRECONDITION_FAIL）**。空 diff 必须先回到上方硬校验确认 change 无 specs/ 才算合法跳过。

> ⛔ [HARD_STOP] USER_GATE 及后续命令必须用归档后路径 `$ARCHIVE_DIR`。
> `alloy _archive` 执行后 `openspec/changes/<name>` 已移到 `openspec/changes/archive/<date>-<name>/`,原路径 `$CHANGE_DIR` 不存在,`_guard user-gate require` 内部 `readState` 会 ENOENT 失败。
> 步骤:先解析 `$ARCHIVE_DIR`(用 `alloy _archive-dir <name>` 命令),再设 USER_GATE。
>
> ⛔ [HARD_STOP] **每个 bash 调用都必须先解析 `$ARCHIVE_DIR`**--Pi/OpenCode bash 工具无 shell state 持久化,前一个 bash 里设的变量在新 bash 调用里为空,`alloy _guard user-gate require "$ARCHIVE_DIR" ...` 会因 `$ARCHIVE_DIR` 为空报"用法"错误 + readState ENOENT。
> **推荐用 `alloy _archive-dir <name>` 命令**(替代手抄 `ls -d ... | sort -r | head -1`--OpenCode 实测 1/11 次遗漏导致空参错误):
> ```bash
> ARCHIVE_DIR=$(alloy _archive-dir <name>)
> alloy _guard user-gate require "$ARCHIVE_DIR" archive:delta-spec-review
> ```
> `_archive-dir` 命令找不到归档目录时 exit 1(无需手写 `[ -z "$ARCHIVE_DIR" ]` 检查)。
> 违反字面 = 违反精神:哪怕"上一个 bash 已捕获 ARCHIVE_DIR"、"变量名一样应该能复用",也算违反--Pi/OpenCode 每个新 bash 调用是独立进程,变量不持久。
> 常见违规模式:
> - agent 在 bash A 里 `ARCHIVE_DIR=$(alloy _archive-dir <name>)`,在 bash B 里直接 `alloy _guard user-gate require "$ARCHIVE_DIR" ...` -> `$ARCHIVE_DIR` 为空 -> "用法"错误 + ENOENT
> - agent 以为"变量名一样跨 bash 复用",实际每个 bash 是独立 shell,变量不持久
> - agent 手抄 `ls -d openspec/changes/archive/*-<name> | sort -r | head -1`(易漏)--应用 `alloy _archive-dir <name>` 替代

**解析归档后路径（后续所有命令统一用 `$ARCHIVE_DIR`）：** change 目录在 archive 阶段已移到 `openspec/changes/archive/<YYYY-MM-DD>-<name>/`,后续 `_state write` / `_phase complete` / `_guard user-gate require` 都必须用归档后路径,用原路径 `openspec/changes/<name>` 会因目录已移走而失败。

```bash
ARCHIVE_DIR=$(alloy _archive-dir <name>)
```

`_archive-dir` 命令找不到归档目录时 exit 1(无需手写 `[ -z "$ARCHIVE_DIR" ]` 检查)。

```bash
SPEC_DIFF=$(git diff --stat openspec/specs/)
SPEC_DIFF_FULL=$(git diff openspec/specs/ | head -200)  # 截 200 行防爆量
```

> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具调用自动 clear(Codex 例外:request_user_input 不触发 hook,问答后必须立即调 `alloy _guard user-gate pass`)或手动 pass 降级。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require "$ARCHIVE_DIR" archive:delta-spec-review
```

🔴 USER_GATE（必须平台原生交互工具，问题模板）：

> Delta Spec 合并结果：
> ```
> [SPEC_DIFF stat 摘要]
> ```
> 前 200 行 diff：
> ```
> [SPEC_DIFF_FULL]
> ```
> 选项：
> 1. 确认并继续提交归档变更
> 2. 调整 spec 合并内容--agent **必须先调 `alloy _guard user-gate reset "$ARCHIVE_DIR" archive:delta-spec-review`**(把 gate 从 gate_history 移除 + 重新设为 pending_gate),再退出 skill,回到 `alloy _archive` 参数调整或手动修正 spec 后重新运行
> 原因:hook-guard 检测到问答工具调用时无条件 clear pending_gate + 加入 gate_history,用户选"调整"本意是拒绝通过 gate,语义被吞了。reset 恢复 gate 状态,重新运行后 agent 调 require(幂等)+ 问答工具重新询问。

**违反字面 = 违反精神：** 哪怕 diff 看似"明显合理"或"diff 为空"，没经过用户明确选择 1 = 不算授权。禁止 agent 基于"diff 短"、"无 conflict"或"specs/ 原本为空"自动跳过此 USER_GATE。

**归档变更提交：** 由 `alloy _archive` 内部完成(git add openspec/specs/ openspec/changes/ + commit,限路径 + 幂等)。agent 无需手写归档 commit。

> `_archive` 内部完成归档变更提交后,如 commit 失败会输出 ⚠️ 提示,agent 需手动 git add openspec/specs/ openspec/changes/ && git commit 修复。

**记录完成时间并推进 phase--原子命令 `alloy _phase complete` 内部完成 completed_at 写入 + phase 推进 + git add 限路径 + commit：**

```bash
# 校验本阶段完成状态(目录在 archive/ + state 字段)--失败则修复后重试,禁跳过
# ⛔ [HARD_STOP] _verify 和 _phase complete 必须同一 Bash 命令 && 连接,禁拆成两个命令
# 拆开(如 _verify && echo OK || echo FAIL 后单独 _phase complete)绕过短路保护,_verify 失败时 agent 可能仍继续
alloy _verify phase-exit archive "$ARCHIVE_DIR" && alloy _phase complete "$ARCHIVE_DIR" archive
```

> ⛔ [HARD_STOP] `_phase complete` 只调一次--禁重复 start + complete。
> 违反字面 = 违反精神：哪怕"归档后路径需要重新记录阶段开始",也算违反--`_phase complete` 原子完成 completed_at 写入 + phase 推进,重复调用会导致 phase_timings 数据错乱(completed_at 被覆盖,phase 状态混乱)。
> 常见违规模式:第一次 `_phase complete` 后,agent 误以为"归档后路径需要重新 start",又 `_phase start` + `_phase complete`,产生重复 phase 记录。正确做法:一次 `_phase complete` 即完成,失败则按下方 HARD_STOP 处理,不重试。

`_phase complete` 失败 -> ⛔ `[HARD_STOP] archive 阶段完成失败。.alloy.yaml 变更未提交时 finish 状态不一致。检查 git 状态后重试，禁止在失败时继续执行后续步骤。`

### [Step 3/3] 完成

**§5.2.3 路径 B 降级（HARD_STOP）：** 若 `_phase complete` 失败，降级路径（archive 阶段降级 -> `applied`）：

```bash
# 用户须手动回滚 phase(用 _phase downgrade 替代 ALLOY_FORCE_PHASE=1 逃生阀):
alloy _phase downgrade "$ARCHIVE_DIR" applied
```

> 禁止 agent 自动运行 `git reset --hard` / `git checkout .` 清场（§3.5.1）。详见 `alloy-shared/references/phase-downgrade-path.md`。

**阶段完成时，必须输出以下 Phase 完成框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [4/5] · Phase: Archive - DONE  │
│ 启动时间: phase_timings.archive.started_at
│ 完成时间: phase_timings.archive.completed_at
│ 耗时: completed_at - started_at
└──────────────────────────────────────┘

-> Change: <name>  Phase: archived
-> 归档位置: archive/YYYY-MM-DD-<name>/
-> ✓ Delta Spec 已合并  ✓ Change 已归档
-> 代码合入由 /alloy-finish 处理
```

> ⛔ [HARD_STOP] 输出完成框后**必须立刻**设 USER_GATE + 问用户下一步--完成框是阶段宣告,不是流程结束。跳过下方 gate 直接进 finish = 违规(多 agent 实测踩坑:输出完成框后误判"archive 已结束",跳过 gate)。
> 违反字面 = 违反精神：哪怕"用户肯定要进 finish"、"gate 是形式主义",也算违反--gate 是流程节点,不是可选步骤。

> 设 USER_GATE pending:hook-guard 拦截非白名单写入,直到问答工具调用自动 clear(Codex 例外:request_user_input 不触发 hook,问答后必须立即调 `alloy _guard user-gate pass`)或手动 pass 降级。

> ℹ️ `archive:phase-complete` gate 已由 `_phase complete archive` 自动设。以下 `user-gate require` 命令幂等可省略--agent 也可手动调(覆盖相同值,无冲突)。

⛔ [HARD_STOP] 必须执行以下命令设置 pending_gate(不是说明,是必跑命令):

```bash
alloy _guard user-gate require "$ARCHIVE_DIR" archive:phase-complete
```

🔴 USER_GATE（必须平台原生交互工具）: archive 阶段完成,下一步?

> 选项:
> - 1. 进入 finish 阶段--加载 `alloy-finish` skill 推进代码合入
> - 2. 暂停--查看归档结果 / 检查 spec / 查看状态(`alloy status`)
> - 3. 其他--用户自定义下一步

archive 不做代码合并--代码合入由 `/alloy-finish` 处理。

> 用户选 1 后,agent **必须直接加载 `alloy-finish` skill(多 agent 适配,见 `alloy-shared/references/skill-loading.md`):
- Claude Code / OpenCode: 调 `skill({ name: "alloy-finish", args: "<change-name>" })`
- Pi: `read .pi/skills/alloy-finish/SKILL.md`(read 后按 SKILL.md 指引执行,change name 通过上下文传入)
- Codex: `$alloy-finish` 或 `read .agents/skills/alloy-finish/SKILL.md`(read 后按 SKILL.md 指引执行,change name 通过上下文传入)**

> ⛔ [HARD_STOP] 禁止输出"请运行 /alloy-finish"让用户手动输入命令--用户已在 USER_GATE 授权,阶段转换已触发,再让用户输入命令 = 违反 Iron Law。
> 用户选 2 后,agent **必须先调 `alloy _guard user-gate reset "$ARCHIVE_DIR" archive:phase-complete`**(把 gate 从 gate_history 移除 + 重新设为 pending_gate),再停止,输出"已暂停。需要时运行 /alloy-finish <name> 继续。"
>   原因:hook-guard 检测到问答工具调用时无条件 clear pending_gate + 加入 gate_history,用户选"暂停"本意是拒绝通过 gate,语义被吞了。reset 恢复 gate 状态,用户"继续"时 agent 调 require(幂等)+ 问答工具重新询问。
> 用户选 3 后,agent 同样调 reset,再停止,等用户后续命令。
> ⛔ 禁止：纯文本输出"运行 /alloy-finish 进入收尾阶段"让用户手动输入--用户已在 USER_GATE 授权,应直接加载 finish skill。
> ⛔ 禁止：用户选 1 后,agent 提示"请运行 /alloy-finish"让用户手动输入。常见违规模式:agent 输出"好的,请输入 /alloy-finish hello-script 进入收尾阶段"。
