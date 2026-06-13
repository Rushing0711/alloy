# apply 子 agent commit 三规则（SDD/EP 共享）

apply Step 2/5 内每个子 agent 任务的 commit 必须满足以下三条硬规则——任一违反即拒绝合入。

## 1. 分支再校验（⛔ PRECONDITION_FAIL，task #18）

子 agent 任务开始时再次校验当前分支 = `worktree-<name>`，防 subagent 中途被 `git checkout` 切换：

```bash
EXPECTED_BRANCH="worktree-<name>"
ACTUAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$ACTUAL_BRANCH" != "$EXPECTED_BRANCH" ] && [ "$(alloy _state read openspec/changes/<name> worktree)" != "skipped" ]; then
  echo "⛔ [PRECONDITION_FAIL] 子 agent 当前分支 ($ACTUAL_BRANCH) ≠ 预期 ($EXPECTED_BRANCH)"
  echo "  禁止：agent 自动 git checkout 切回 worktree-<name>。"
  echo "  必须：退出子 agent 让用户检查，可能上一个子 agent 切换了分支或 worktree 失效。"
  exit 1
fi
```

## 2. git add 规则（⛔ HARD_STOP，§5.2.1）

只用精确路径，不用 `-A`/`-a`/`.`。违反字面 = 违反精神：哪怕"反正只有这一个文件"，也禁止 `-A`——agent 看不到的副作用文件可能被一并提交。commit 前检查 untracked 文件：

- 构建产物（`.vite/`、`dist/`、`node_modules/` 等）追加 `.gitignore`
- 项目源码按精准路径 add（如 `git add src/foo.ts tests/foo.test.ts`）
- 判断不准时 🔴 USER_GATE 询问用户

```bash
# 反例（禁用）：git add -A / git add . / git add -a
# 正例：git add <精确路径列表>
git add src/<具体文件>.ts tests/<具体测试>.test.ts
```

## 3. stash 残留检查（⚠️ WARN，task #19）

commit 前必须运行：

```bash
if [ -n "$(git stash list)" ]; then
  echo "⚠️ [WARN] 检测到 stash 残留："
  git stash list
  echo ""
  echo "  stash 残留可能是用户之前未完成的工作。继续 commit 不会丢失 stash，"
  echo "  但用户可能需要先 git stash pop 或 drop。"
  echo "  禁止：agent 自动 git stash drop / git stash clear（§3.5.1）。"
fi
```

WARN 不阻断 commit，但提醒 agent 在 commit 完成后向用户播报 stash 列表，让用户决定后续处理。
