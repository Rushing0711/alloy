# archive worktree 清理

archive Step 2 末段：把 worktree 分支合入 feature 分支后清理 worktree 目录。包括 silent fallback 检测、遗留 change 兼容、merge 冲突处理三段。

> **§3.5.1 git 自救禁令（HARD_STOP）：** 整段流程任何 git 失败都禁止 agent 自动 `git merge --abort` / `git reset --hard` / `git checkout .` / `git restore .` / `git stash` / `git clean -fd` / `git push --force` 任何一个。冲突现场必须报告并 USER_GATE 让用户决策。违反字面 = 违反精神。

## 段 1：读取 state + merge（merge 成功后停止，触发 USER_GATE）

```bash
WORKTREE_PATH=$(alloy _state read "$ARCHIVE_DIR" worktree 2>/dev/null)
FEATURE_BRANCH=$(alloy _state read "$ARCHIVE_DIR" feature_branch 2>/dev/null)
WORKTREE_BRANCH=$(alloy _state read "$ARCHIVE_DIR" worktree_branch 2>/dev/null)

# task #21: silent fallback 检测——区分"遗留 change"（state 字段未写但 worktree 存在）
# vs "state 缺失"（apply 阶段 state 写入失败）。后者必须 PRECONDITION_FAIL。
if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "null" ]; then
  # state 中无 worktree 字段——检查 git 实际状态
  ACTUAL_WT=$(git worktree list --porcelain | awk -v p=".claude/worktrees/<name>" '
    /^worktree / { wt = substr($0, 10) }
    wt ~ p { print wt; exit }
  ')
  if [ -n "$ACTUAL_WT" ]; then
    echo "⛔ [PRECONDITION_FAIL] 检测到 git worktree 但 .alloy.yaml 未记录："
    echo "  实际 worktree: $ACTUAL_WT"
    echo "  状态字段:    worktree=$WORKTREE_PATH"
    echo ""
    echo "  可能原因：apply 阶段 state 写入失败，archive 不能 silent fallback。"
    echo "  请用户检查 openspec/changes/<name>/.alloy.yaml 后手动修复 worktree 字段，"
    echo "  或直接 git worktree remove $ACTUAL_WT（确认无未提交工作时）。"
    exit 1
  fi
  # 真无 worktree → 跳过本段
elif [ "$WORKTREE_PATH" != "skipped" ]; then
  echo "  ℹ 检测到 worktree（$WORKTREE_PATH），正在合并回 feature 分支..."

  # 遗留 change 兼容：FEATURE_BRANCH 缺失 → 退回到 feature/<name>
  if [ -z "$FEATURE_BRANCH" ] || [ "$FEATURE_BRANCH" = "null" ]; then
    FEATURE_BRANCH="feature/<name>"
  fi

  # 遗留 change 兼容：WORKTREE_BRANCH 缺失 → 从 worktree 实际状态检测
  if [ -z "$WORKTREE_BRANCH" ] || [ "$WORKTREE_BRANCH" = "null" ]; then
    WORKTREE_BRANCH=$(git worktree list --porcelain | awk -v path="$WORKTREE_PATH" '
      /^worktree / { wt = substr($0, 10) }
      /^branch / && wt == path { gsub(/^refs\/heads\//, "", $2); print $2; exit }
    ')
    if [ -z "$WORKTREE_BRANCH" ]; then
      echo "⛔ [PRECONDITION_FAIL] 无法检测 worktree 分支名（state 缺失且 git 也无法定位）"
      echo "  请用户手动指定 worktree_branch 后重试。"
      exit 1
    fi
  fi

  # 从 worktree 分支合并代码到 feature 分支
  # ⛔ [HARD_STOP] merge 方向：在 feature 分支上 merge "$WORKTREE_BRANCH"
  # 违反字面 = 违反精神：哪怕"feature 分支名我知道直接写"、"merge feature 拿到最新",也算违反——
  #   merge 方向是 worktree 分支 → feature 分支（在 feature 分支上 merge worktree 分支）。
  #   反方向 merge（git merge feature/<name>）会丢失 worktree 工作，且 feature 分支拿不到 worktree 代码。
  #   常见违规模式：`git merge feature/<name>`——这是反方向，正确是 `git merge "$WORKTREE_BRANCH"`。
  MAIN_ROOT=$(cd "$WORKTREE_PATH" && git rev-parse --show-toplevel 2>/dev/null)
  cd "$MAIN_ROOT"

  # ⛔ [HARD_STOP] merge 前必须校验当前分支 = feature 分支
  # 禁 agent 自动 git checkout 切换（§3.5.1）——可能丢弃用户未提交工作
  # 违反字面 = 违反精神：哪怕"先切过去再 merge效率高",也算违反——自动 checkout 可能丢弃用户未提交工作。
  CURRENT=$(git branch --show-current)
  if [ "$CURRENT" != "$FEATURE_BRANCH" ]; then
    echo "⛔ [HARD_STOP] 当前分支 $CURRENT ≠ feature 分支 $FEATURE_BRANCH"
    echo "  merge 必须在 feature 分支上执行，禁在 worktree 分支上 merge feature（反方向）"
    echo "  禁止：agent 自动 git checkout 切换（§3.5.1）——可能丢弃用户未提交工作"
    echo "  必须：用户手动 git checkout $FEATURE_BRANCH 后重新运行 /alloy:archive"
    exit 1
  fi

  git merge "$WORKTREE_BRANCH" --no-edit

  if [ $? -eq 0 ]; then
    # merge 成功——停止执行，agent 必须执行下方 markdown 正文的 USER_GATE
    echo "✓ merge 成功：worktree 分支 $WORKTREE_BRANCH 已合入 feature 分支 $FEATURE_BRANCH"
    echo "  worktree 分支的 commit 列表（合入 feature 分支的内容）："
    git log --oneline -10 "$WORKTREE_BRANCH" 2>/dev/null
    echo ""
    echo "⛔ [HARD_STOP] merge 成功后必须 USER_GATE 让用户确认，禁直接清理 worktree"
    echo "  agent 必须执行下方 markdown 正文的 USER_GATE，用户选 (a) 后才能继续段 2 清理"
    exit 0
  else
    # [HARD_STOP] merge 冲突时禁止运行 git merge --abort 或任何 git 自救命令。
    # 必须报告冲突现场后调用 USER_GATE 让用户决定。
    echo "⛔ merge 冲突——worktree 工作未合入 feature 分支"
    echo ""
    echo "  冲突现场："
    git status --short
    echo ""
    echo "  合法路径："
    echo "    1) 用户手动解决冲突后 git add + git commit，再重新运行 /alloy:archive"
    echo "    2) 用户决定放弃 worktree 工作（注意：放弃前确认无未保存改动）"
    echo ""
    echo "  禁止：agent 自动运行 git merge --abort / git reset --hard /"
    echo "        git checkout . / git restore . / git stash 任何一个。"
    exit 1
  fi
fi
```

未使用 worktree 时跳过本段。

## 段 1.5：merge 成功后的 USER_GATE（HARD_STOP）

> ⛔ [HARD_STOP] `git merge "$WORKTREE_BRANCH"` 成功后，必须 🔴 USER_GATE 让用户确认 merge 结果，才能继续段 2 清理 worktree。
> 违反字面 = 违反精神：哪怕"merge 没冲突直接清理效率高"，也算违反——merge 结果是代码合入，用户有权审查 worktree 工作是否正确合入 feature 分支，清理后无法回退。
> 常见违规模式：merge 成功后直接 `git worktree remove` + `git branch -d`，跳过 USER_GATE。

USER_GATE 内容：

- 展示 worktree 分支的 commit 列表（段 1 bash 已输出 `git log --oneline -10 "$WORKTREE_BRANCH"`）
- 🔴 AskUserQuestion 选项：
  - (a) 确认并清理 worktree
  - (b) 需要检查——退出 skill 让用户审查

用户选 (a) 后执行段 2 清理。用户选 (b) 则退出 skill，让用户手动审查后再重新运行 /alloy:archive。

## 段 2：USER_GATE 确认后执行清理

> 前置：段 1 merge 成功 + 段 1.5 USER_GATE 用户选 (a) 确认并清理。

```bash
WORKTREE_PATH=$(alloy _state read "$ARCHIVE_DIR" worktree 2>/dev/null)
FEATURE_BRANCH=$(alloy _state read "$ARCHIVE_DIR" feature_branch 2>/dev/null)
WORKTREE_BRANCH=$(alloy _state read "$ARCHIVE_DIR" worktree_branch 2>/dev/null)

# worktree 可能有未跟踪文件（node_modules/ dist/ 等），git worktree remove 默认拒绝
# 先检查未跟踪文件，让用户决策；禁自动 git clean -fd / rm -rf（§3.5.1）
UNTRACKED=$(cd "$WORKTREE_PATH" && git status --porcelain --untracked-files=all | grep '^??' || true)
if [ -n "$UNTRACKED" ]; then
  # ⛔ [HARD_STOP] worktree 有未跟踪文件——必须 USER_GATE 让用户决策，禁直接 --force
  # 违反字面 = 违反精神：哪怕"这些明显是构建产物",也算违反——agent 无法判断哪些是产物哪些是用户工作,自动 --force 会丢失未跟踪文件。
  echo "⚠️ worktree 目录有未跟踪文件，git worktree remove 会失败："
  (cd "$WORKTREE_PATH" && git status --short)
  echo ""
  echo "⛔ [HARD_STOP] 未跟踪文件如何处理——必须 USER_GATE 让用户决策"
  echo "  (a) 这些是构建产物/依赖，可安全删除——用户确认后用 git worktree remove --force"
  echo "  (b) 有需要保留的文件——退出 skill 让用户手动处理"
  echo "  禁止：agent 自动 git clean -fd / rm -rf / git worktree remove --force——必须用户确认（§3.5.1）"
  exit 1
fi

git worktree remove "$WORKTREE_PATH"

# ⛔ [HARD_STOP] git branch -d 失败禁自动 -D 强制删除
# 违反字面 = 违反精神：哪怕"分支肯定合完了 -d 是误判",也算违反——
#   -d 失败说明 git 认为分支未完全合并，自动 -D 会丢失未合并 commit。
#   正确做法是报告问题让用户决策（手动检查后 -D，或排查 merge 问题）。
git branch -d "$WORKTREE_BRANCH" || {
  echo "⛔ [HARD_STOP] git branch -d 失败——worktree 分支可能未完全合并"
  echo "  worktree 分支: $WORKTREE_BRANCH"
  echo "  feature 分支: $FEATURE_BRANCH"
  echo "  可能原因：merge 方向错误（应为 git merge \"\$WORKTREE_BRANCH\"）或 worktree 分支有未合并 commit"
  echo "  禁止：agent 自动 git branch -D 强制删除——会丢失未合并 commit"
  echo "  必须：报告问题让用户决策（手动检查后 -D，或排查 merge 问题）"
  exit 1
}
# worktree_merged_at 由 archive.md 主流程内联记录，此处仅做清理
echo "  ✓ worktree 已合并至 $FEATURE_BRANCH 分支并清理"
```

> **未跟踪文件 USER_GATE 后的处理：** 若用户选 (a) 确认删除，agent 执行 `git worktree remove --force "$WORKTREE_PATH"` 后继续 `git branch -d` 步骤。若用户选 (b)，退出 skill 让用户手动处理。
