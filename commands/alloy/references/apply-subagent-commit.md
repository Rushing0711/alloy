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

## 4. 路径隔离（⛔ HARD_STOP，worktree 模式）

**worktree 模式下，所有 Edit/Write 操作必须用 worktree 内路径，禁用主仓绝对路径。**

违反字面 = 违反精神：哪怕"两个路径内容看起来一样"、"主仓路径更短"，主仓路径的 Edit 会污染 feature 分支工作目录——变更不在 worktree 分支 commit 链里，也不在 feature 分支 HEAD 里，成为"游离的 modified"，破坏 hash 链 + 导致 archive merge 冲突。

**正例（worktree 内路径）：**
```
/Users/<project>/.claude/worktrees/<name>/openspec/changes/<name>/tasks.md
/Users/<project>/.claude/worktrees/<name>/src/foo.ts
```

**反例（主仓绝对路径，禁用）：**
```
/Users/<project>/openspec/changes/<name>/tasks.md   ← 污染 feature 工作目录
/Users/<project>/src/foo.ts                          ← 同上
```

**判断方法：** agent 在 worktree 内执行（`GIT_DIR != GIT_COMMON`），所有文件操作用相对路径或 `git rev-parse --show-toplevel` 返回的 worktree 根路径。禁用用户最初 cd 的主仓路径。

**跳过 worktree 模式（`worktree=skipped`）：** 无此约束——所有变更直接在 feature 分支工作目录，用主仓路径即可。

## 4.1 .alloy.yaml 覆盖保护（⛔ HARD_STOP，worktree 模式）

**worktree 模式下，禁止用宽路径 `git add openspec/` 或 `git add .claude/` 批量提交——可能把 worktree 内的旧 .alloy.yaml（worktree 字段为 null）commit 覆盖正确版本。**

违反字面 = 违反精神：哪怕"只是恢复 alloy 基础文件"、"worktree 里缺 .claude/ 目录"，宽路径 add 会让 .alloy.yaml 被旧版本覆盖，worktree/worktree_branch/worktree_created_at 字段丢失，archive 后审计信息缺失。

**反例（禁用）：**
```bash
git add openspec/ .claude/ .gitignore          # 宽路径，可能覆盖 .alloy.yaml
git add openspec/changes/                       # 同上
git add .                                       # 同上 + 违反 §5.2.1
```

**正例（精确路径）：**
```bash
git add openspec/changes/<name>/.alloy.yaml     # 仅 .alloy.yaml
git add openspec/changes/<name>/tasks.md        # 仅 tasks.md
git add src/foo.ts tests/foo.test.ts            # 仅源码
```

**commit 前校验（worktree 模式下，涉及 .alloy.yaml 变更时）：**
```bash
# 确认 .alloy.yaml 的 worktree 字段不为 null（apply 阶段写入后不应被覆盖）
WORKTREE_FIELD=$(grep '^worktree:' openspec/changes/<name>/.alloy.yaml | awk '{print $2}')
if [ "$WORKTREE_FIELD" = "null" ] || [ -z "$WORKTREE_FIELD" ]; then
  # apply 阶段已写入 worktree 字段后，若 commit 前发现变回 null，说明被旧版本覆盖
  if [ "$(alloy _state read openspec/changes/<name> worktree)" != "null" ] && \
     [ "$(alloy _state read openspec/changes/<name> worktree)" != "skipped" ]; then
    echo "⛔ [HARD_STOP] .alloy.yaml 的 worktree 字段为 null，但 state 记录有值"
    echo "  可能原因：宽路径 git add 把旧版 .alloy.yaml 覆盖了正确版本"
    echo "  修复：git checkout HEAD -- openspec/changes/<name>/.alloy.yaml 恢复，再用精确路径 add"
    exit 1
  fi
fi
```

## 4.2 禁止"恢复 alloy 基础文件到 worktree"操作（⛔ HARD_STOP）

**worktree 模式下，禁止 agent 主动 `git add` 主仓的 `.claude/` / `openspec/schemas/` / `openspec/config.yaml` / `.gitignore` 等 alloy 基础文件到 worktree 分支。**

违反字面 = 违反精神：worktree 从 feature 分支 checkout，alloy 基础文件已在 worktree 内。agent 误以为"worktree 缺文件"而恢复，实际是 worktree 创建时的正常状态。恢复操作会引入主仓旧版 .alloy.yaml，覆盖 worktree 字段。

**worktree 内缺少 alloy 基础文件时的正确处理：**
- 不主动恢复——这些文件在 feature 分支已有，archive merge 时会合入
- 若确实缺失（如 worktree 创建异常），退出 skill 让用户排查，禁 agent 自行 `git add` 恢复



## 5. 主仓清洁度校验（⛔ PRECONDITION_FAIL，worktree 模式，Step 2 完成后）

worktree 模式下，Step 2 所有子 agent 完成后、进入 Step 3 前，必须校验**主仓工作目录 clean**——所有变更应落在 worktree 分支，主仓不应有 modified。

```bash
WORKTREE=$(alloy _state read openspec/changes/<name> worktree)
if [ "$WORKTREE" != "skipped" ] && [ -n "$WORKTREE" ] && [ "$WORKTREE" != "null" ]; then
  # 切到主仓根目录校验（worktree 模式下 agent 当前在 worktree 内）
  MAIN_ROOT=$(git rev-parse --git-common-dir | xargs dirname)
  cd "$MAIN_ROOT"
  DIRTY=$(git status --porcelain)
  if [ -n "$DIRTY" ]; then
    echo "⛔ [PRECONDITION_FAIL] 主仓工作目录有未提交变更（worktree 模式下应全部落在 worktree 分支）"
    git status --short
    echo ""
    echo "  可能原因：子 agent 用主仓绝对路径 Edit 了文件，绕过 worktree 隔离（见上方规则 4）"
    echo "  修复路径："
    echo "    1) 确认 worktree 分支已有正确版本（git log worktree-<name> --oneline）"
    echo "    2) 丢弃主仓误改：git checkout -- <误改文件>"
    echo "  禁止：agent 自动 git checkout -- 丢弃变更——必须用户确认 worktree 分支版本正确后手动丢弃。"
    exit 1
  fi
fi
```

**跳过 worktree 模式：** 不跑此校验——主仓 dirty 是正常的（任务实现的变更在 feature 工作目录）。
