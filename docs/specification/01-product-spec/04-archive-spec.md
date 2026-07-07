---
behaviors:
  preconditions: 6
  hard_stops: 12
  user_gates: 3
  warns: 1
  artifacts: [delta-spec, archive]
  transitions_to: archived
  external_calls: [opsx:archive]
---

# alloy archive 行为规格

详见 skill 文件：`commands/alloy/archive.md`

## 命令格式

```
/alloy:archive [name]（省略时从当前活跃 change 推断）
```

## 前置检查（phase 路由）

→ phase = applied + verify.md 存在且非 FAIL → 通过，继续
→ phase = planned → 自动路由到 /alloy:apply
→ phase = started → 自动路由到 /alloy:plan
→ phase = archived → 自动路由到 /alloy:finish
→ 唯一 HARD STOP：change 目录不存在（前序阶段完全没做）

## 执行

**流程顺序：worktree 清理必须在 /opsx:archive 之前——archive 操作会移动目录,若在 worktree 分支执行,merge 到 feature 时目录移动 + tasks.md 勾选导致三方合并冲突。先 merge worktree 到 feature(只有 apply 的代码/制品 commit,无目录移动),再在 feature 分支做 archive,冲突消除。**

1. Worktree 清理（如果 apply 期间使用了 worktree,先 merge worktree → feature）：
   - 在 worktree 里 commit .alloy.yaml 未提交修改(避免 worktree remove 阻塞;apply 阶段或 archive 早期可能写入未 commit)
   - 在 worktree 里读 state(worktree / feature_branch / worktree_branch 三字段)
   - USER_GATE 确认清理
   - ExitWorktree 回主仓(action: keep)
   - `alloy _worktree-cleanup` 原子完成:merge worktree 分支到 feature + remove worktree + branch -d + 写 worktree_merged_at
   - 未使用 worktree（null 或 skipped）则跳过
2. /opsx:archive（在 feature 分支执行）→ sync delta spec + 归档到 archive/YYYY-MM-DD-<name>/
3. Delta Spec 合并审查（USER_GATE,展示 git diff openspec/specs/）
4. 归档变更提交：
   git add openspec/specs/ openspec/changes/
   git diff --cached --quiet || git commit -m "chore(<name>): 归档目录移动"
5. 解析归档后路径 $ARCHIVE_DIR = openspec/changes/archive/<YYYY-MM-DD>-<name>/
6. `alloy _verify phase-exit archive "$ARCHIVE_DIR" && alloy _phase complete "$ARCHIVE_DIR" archive`（同命令 && 连接,校验 + 推进 phase 到 archived）

## git add 规则

`-A` 限定路径可用（如 `git add -A openspec/specs/ openspec/changes/`），无路径限定的 `git add -A` 禁止——防止意外文件混入。

archive 只做 spec 归档和归档提交，不涉及代码合并。代码合入由 /alloy:finish 完成。
