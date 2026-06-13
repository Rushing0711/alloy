---
behaviors:
  preconditions: 5
  hard_stops: 7
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

1. /opsx:archive → sync delta spec + 归档到 archive/YYYY-MM-DD-<name>/
2. 归档变更提交（必须在 worktree 清理之前——如果在 worktree 中，变更必须先 commit 到 worktree 分支，否则 merge 会丢失归档操作）：
   git add -A openspec/specs/ openspec/changes/
   git diff --cached --quiet || git commit -m "chore(<name>): 归档目录移动"
3. 跨周期反馈：读取 retrospective.md §6 Promote Candidates，将 Promote to: memory 的条目写入 ~/.claude/memory/
4. Worktree 清理（如果 apply 期间使用了 worktree）：
   读取 worktree_path / feature_branch / worktree_branch → 向下兼容检测（遗留 change 无 feature_branch/worktree_branch 时自动推断）
   → cd 主仓库 → git merge worktree_branch → git worktree remove → git branch -d
   → 写入 worktree_merged_at
   未使用 worktree（null 或 skipped）则跳过
5. 记录完成时间 + 提交（所有 .alloy.yaml 变更在 commit 之前完成）：
   git add -A openspec/specs/ openspec/changes/
   git commit -m "chore(<name>): 归档阶段完成"
6. phase → archived（通过 `alloy _guard ... --apply` + guard 后补 commit）

## git add 规则

`-A` 限定路径可用（如 `git add -A openspec/specs/ openspec/changes/`），无路径限定的 `git add -A` 禁止——防止意外文件混入。

archive 只做 spec 归档和归档提交，不涉及代码合并。代码合入由 /alloy:finish 完成。
