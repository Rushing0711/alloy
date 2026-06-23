# apply-worktree.md

apply Step 1 worktree 创建后状态记录、分支锁定校验。

## 前置说明

worktree 创建由 `superpowers:using-git-worktrees` 技能驱动（EnterWorktree 优先，git worktree fallback），agent 不手动 `git worktree add`。本文件仅负责**创建后**的状态记录与分支锁定。

alloy init 已为 Claude Code agent 配置 `.claude/settings.json` 的 `worktree.baseRef: head`，EnterWorktree 从当前 feature 分支分出（非 origin/main），plan 阶段 commit 不丢失。其他 agent 无 EnterWorktree，技能走 git worktree fallback。

## 创建后验证：必须在 worktree 内（⛔ PRECONDITION_FAIL）

using-git-worktrees 技能执行完毕后，agent 必须已在 worktree 内（EnterWorktree 进入或 git fallback cd 进入）。**强制验证**——元信息写到 feature 分支会导致 worktree 内状态分裂（worktree 从旧 commit checkout，看不到主仓后续写入的 worktree 元信息）：

```bash
# 判断是否已在 worktree 中：GIT_DIR != GIT_COMMON 表示在 linked worktree 中
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)

# submodule guard：GIT_DIR != GIT_COMMON 在 submodule 内也成立
SUPERPROJECT=$(git rev-parse --show-superproject-working-tree 2>/dev/null)

if [ "$GIT_DIR" = "$GIT_COMMON" ] || [ -n "$SUPERPROJECT" ]; then
  echo "⛔ [PRECONDITION_FAIL] 不在 worktree 内（GIT_DIR == GIT_COMMON 或在 submodule 中）"
  echo "  using-git-worktrees 技能执行后 agent 必须已在 worktree 内。"
  echo "  可能原因："
  echo "    1. EnterWorktree 失败且 git worktree fallback 未执行"
  echo "    2. 技能执行中断或 agent 未完整执行 Step 1a/1b"
  echo "    3. agent 在主仓执行了状态写入（错误位置）"
  echo ""
  echo "  禁止：在主仓 feature 分支写入 worktree 元信息（会导致 worktree 内状态分裂）。"
  echo "  必须：退出 skill 让用户排查 using-git-worktrees 技能执行情况。"
  exit 1
fi
```

验证通过 → 获取实际路径和分支名（技能可能用 EnterWorktree 或 git fallback，路径不一定完全一致）：

```bash
WORKTREE_PATH=$(cd "$(git rev-parse --show-toplevel)" 2>/dev/null && pwd -P)
WORKTREE_BRANCH=$(cd "$WORKTREE_PATH" && git branch --show-current)
```

## 状态记录（在 worktree 内写入 + commit）

**关键：** 以下命令在 worktree 内执行，commit 落在 worktree 分支（非主仓 feature 分支）。

```bash
alloy _state write openspec/changes/<name> worktree "$WORKTREE_PATH"
alloy _state write openspec/changes/<name> worktree_branch "$WORKTREE_BRANCH"
alloy _state write openspec/changes/<name> worktree_created_at "$(date '+%Y-%m-%d %H:%M:%S')"
echo "  ✓ worktree 已记录: 分支=$WORKTREE_BRANCH  路径=$WORKTREE_PATH"
# commit 确保断点恢复时 state 不丢失（落在 worktree 分支）
git add openspec/changes/<name>/.alloy.yaml
git diff --cached --quiet || git commit -m "chore(<name>): 记录 worktree 信息"
```

## Worktree 创建后反显（必须输出到终端）

状态记录完成后，必须输出以下反显框，让用户清楚 worktree 的路径、分支、源分支、创建时间——后续切回主仓处理其他任务时需要这些信息：

```
> ┌─ Worktree 已就绪 ──────────────────────────
>   路径:       $WORKTREE_PATH
>   分支:       $WORKTREE_BRANCH
>   源分支:     feature/<name>（plan 阶段 commit 保留在此分支）
>   创建时间:   $(date '+%Y-%m-%d %H:%M:%S')
> ─────────────────────────────────────────────
>
> 后续操作：
>   - 在 worktree 内执行 apply 任务实现
>   - 切回主仓：cd <主仓路径>（worktree 保留，apply 结束前不要手动 remove）
>   - archive 阶段会合并 worktree 分支到 feature 分支并清理
```

## 状态记录字段

| 字段 | 值 | 写入时机 |
|------|-----|---------|
| `worktree` | 有效路径 / `skipped` / `null` | 创建后或用户跳过时 |
| `worktree_branch` | 分支名（如 `worktree-<name>`） | 创建后 |
| `worktree_created_at` | `%Y-%m-%d %H:%M:%S` | 创建后 |

这些数据是断点恢复的关键——Agent 重入时通过 `alloy _guard worktree-status` 读取。

## Worktree 内分支锁定（⛔ PRECONDITION_FAIL，task #18）

进入 worktree 后必须验证当前分支与预期一致——子 agent 后续在错误分支编辑 = 用户主分支被污染。

```bash
WORKTREE_PATH=$(alloy _state read openspec/changes/<name> worktree)
EXPECTED_BRANCH="worktree-<name>"

if [ "$WORKTREE_PATH" != "skipped" ] && [ "$WORKTREE_PATH" != "blocked" ] && [ -d "$WORKTREE_PATH" ]; then
  ACTUAL_BRANCH=$(git -C "$WORKTREE_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ "$ACTUAL_BRANCH" != "$EXPECTED_BRANCH" ]; then
    echo "⛔ [PRECONDITION_FAIL] worktree 内分支 ($ACTUAL_BRANCH) 与预期 ($EXPECTED_BRANCH) 不一致"
    echo "  可能原因：用户在 worktree 内手动切换了分支 / 旧 worktree 残留 / 技能 fallback 用了不同分支名"
    echo "  禁止：agent 自动 git checkout 切换分支——可能丢弃用户未提交的工作（§3.5.1）。"
    echo "  必须：USER_GATE 让用户决策修复方式（手动切回 / 退出 skill 重建 worktree）。"
    exit 1
  fi
fi
```
