# apply-worktree.md

apply Step 1 worktree 创建后的状态记录完整流程。

## 检测逻辑

worktree 创建完成后，检测实际位置并写入状态文件：

```bash
echo "  正在检测 worktree 实际状态..."

# 判断是否已在 worktree 中：GIT_DIR != GIT_COMMON 表示在 linked worktree 中
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)

if [ "$GIT_DIR" != "$GIT_COMMON" ]; then
  # 已在 worktree 中，获取实际路径和分支名
  WORKTREE_PATH=$(cd "$(git rev-parse --show-toplevel)" 2>/dev/null && pwd -P)
  WORKTREE_BRANCH=$(cd "$WORKTREE_PATH" && git branch --show-current)
  alloy _state write openspec/changes/<name> worktree "$WORKTREE_PATH"
  alloy _state write openspec/changes/<name> worktree_branch "$WORKTREE_BRANCH"
  alloy _state write openspec/changes/<name> worktree_created_at "$(date '+%Y-%m-%d %H:%M:%S')"
  echo "  ✓ worktree 已记录: 分支=$WORKTREE_BRANCH  路径=$WORKTREE_PATH"
  # commit 确保断点恢复时 state 不丢失
  git add openspec/changes/<name>/.alloy.yaml
  git diff --cached --quiet || git commit -m "chore(<name>): record worktree state"
else
  # EnterWorktree 失败后的 git worktree fallback
  # 优先检测 .claude/worktrees/（EnterWorktree 原生路径），回退 .worktrees/
  WT_PATH=""
  for CANDIDATE in ".claude/worktrees/<name>" ".worktrees/<name>"; do
    if [ -d "$CANDIDATE" ]; then
      WT_PATH=$(cd "$CANDIDATE" 2>/dev/null && pwd -P)
      break
    fi
  done
  if [ -n "$WT_PATH" ]; then
    WORKTREE_BRANCH=$(cd "$WT_PATH" && git branch --show-current 2>/dev/null)
    alloy _state write openspec/changes/<name> worktree "$WT_PATH"
    alloy _state write openspec/changes/<name> worktree_branch "$WORKTREE_BRANCH"
    alloy _state write openspec/changes/<name> worktree_created_at "$(date '+%Y-%m-%d %H:%M:%S')"
    echo "  ✓ worktree fallback 已记录: 分支=$WORKTREE_BRANCH  路径=$WT_PATH"
    # 提交 source repo 的 state
    git add openspec/changes/<name>/.alloy.yaml
    git diff --cached --quiet || git commit -m "chore(<name>): record worktree state"
    # worktree 内也写入并提交——bash cd 不跨工具调用持久化
    cd "$WT_PATH" && \
      alloy _state write openspec/changes/<name> worktree "$WT_PATH" && \
      alloy _state write openspec/changes/<name> worktree_branch "$WORKTREE_BRANCH" && \
      alloy _state write openspec/changes/<name> worktree_created_at "$(date '+%Y-%m-%d %H:%M:%S')" && \
      git add openspec/changes/<name>/.alloy.yaml && \
      git diff --cached --quiet || git commit -m "chore(<name>): record worktree state (worktree)"
  else
    echo "  ℹ 未检测到 worktree，按用户选择记录"
    alloy _state write openspec/changes/<name> worktree skipped
  fi
fi
```

## 状态记录字段

| 字段 | 值 | 写入时机 |
|------|-----|---------|
| `worktree` | 有效路径 / `skipped` / `null` | 创建后或用户跳过时 |
| `worktree_branch` | 分支名（如 `worktree-<name>`） | 创建后 |
| `worktree_created_at` | `%Y-%m-%d %H:%M:%S` | 创建后 |

这些数据是断点恢复的关键——Agent 重入时通过 `alloy _guard worktree-status` 读取。
