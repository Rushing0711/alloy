# apply-worktree.md

apply Step 1 worktree 路径占用检查、创建后状态记录、分支锁定校验。

## 路径占用检查（⛔ PRECONDITION_FAIL，task #10）

`git worktree add` 在目标路径已存在时会失败；agent 不得用 `git worktree remove --force` 或 `rm -rf` 自动清理——目标路径可能是用户之前未归档的工作（被 alloy 早期版本遗留 / 用户手动创建 / 同名 change 重启）。

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
TARGET_PATH="$REPO_ROOT/.claude/worktrees/<name>"
TARGET_BRANCH="worktree-<name>"

if [ -e "$TARGET_PATH" ] || git worktree list --porcelain | grep -qF "worktree $TARGET_PATH"; then
  echo "⛔ [PRECONDITION_FAIL] worktree 目标路径已被占用："
  echo "  路径: $TARGET_PATH"
  echo "  目录存在: $([ -e "$TARGET_PATH" ] && echo 是 || echo 否)"
  echo "  已注册为 git worktree: $(git worktree list --porcelain | grep -qF "worktree $TARGET_PATH" && echo 是 || echo 否)"
  echo ""
  echo "  禁止：agent 自动运行 git worktree remove --force / rm -rf $TARGET_PATH /"
  echo "        git worktree prune 强行清理。这些路径可能是用户之前未归档的工作。"
  echo "  违反字面 = 违反精神：哪怕看似\"覆盖一下让 apply 继续\"，也算违反禁令——"
  echo "  必须 USER_GATE 让用户决策。"
fi
```

路径已占用 → 🔴 USER_GATE：

> 目标路径 `.claude/worktrees/<name>` 已被占用。
> 选项：
> (a) 复用现有 worktree——直接 `EnterWorktree(path=...)` 进入，跳过创建（要求该路径已是有效 git worktree 且分支为 `worktree-<name>`，否则降级到 (b)）
> (b) 重命名当前 change——退出 skill，让用户用 `/alloy:start <new-name>` 重新发起，或手动重命名 change 目录
> (c) 中止 apply——`alloy _state write openspec/changes/<name> worktree blocked` 后退出，待用户清理后重新运行

- 选 (a)：检测分支匹配后 `EnterWorktree(path=".claude/worktrees/<name>")`，跳到"创建后状态记录"
- 选 (b)：退出 skill 并提示用户重命名后重跑
- 选 (c)：写入 worktree=blocked 后退出 skill

路径未占用 → 执行创建：

```bash
git worktree add .claude/worktrees/<name> -b worktree-<name> <feature_branch>
```

再用 `EnterWorktree(path=".claude/worktrees/<name>")` 进入。路径偏好 `.claude/worktrees/<name>`（`.claude/` 是 alloy 固定目录），分支命名 `worktree-<name>`（与 EnterWorktree 内置一致，archive 清理时无需猜测）。

## 创建后状态记录

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

## Worktree 内分支锁定（⛔ PRECONDITION_FAIL，task #18）

进入 worktree 后必须验证当前分支与状态记录一致——子 agent 后续在错误分支编辑 = 用户主分支被污染。

```bash
WORKTREE_PATH=$(alloy _state read openspec/changes/<name> worktree)
EXPECTED_BRANCH="worktree-<name>"

if [ "$WORKTREE_PATH" != "skipped" ] && [ "$WORKTREE_PATH" != "blocked" ] && [ -d "$WORKTREE_PATH" ]; then
  ACTUAL_BRANCH=$(git -C "$WORKTREE_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ "$ACTUAL_BRANCH" != "$EXPECTED_BRANCH" ]; then
    echo "⛔ [PRECONDITION_FAIL] worktree 内分支 ($ACTUAL_BRANCH) 与预期 ($EXPECTED_BRANCH) 不一致"
    echo "  可能原因：用户在 worktree 内手动切换了分支 / 旧 worktree 残留 / 复用 (a) 进入了错误 worktree"
    echo "  禁止：agent 自动 git checkout 切换分支——可能丢弃用户未提交的工作（§3.5.1）。"
    echo "  必须：USER_GATE 让用户决策修复方式（手动切回 / 退出 skill 重建 worktree / 复用前确认分支）。"
    exit 1
  fi
fi
```
