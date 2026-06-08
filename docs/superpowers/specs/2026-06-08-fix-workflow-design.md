# alloy:fix 流程改进设计

> **问题：** 当前 fix.md 只管诊断分流，不管分支策略。实际使用中，修复代码时的分支管理缺失——没有 hotfix 分支创建、没有根据 change 状态选择修复位置。

## 设计目标

1. 诊断先行——先判断是代码 bug 还是 spec 变更
2. 分支后置——确认是代码 bug 后，根据 change 状态选择修复分支
3. 轻量热修——已 finish 的 change 或无归属 change 走 hotfix 分支，不走完整 alloy 周期

---

## 流程总览

```
alloy:fix 启动
    │
    ├─ Step 1: 环境感知
    │   检测当前分支、worktree 状态、活跃 change
    │
    ├─ Step 2: 根因诊断 (systematic-debugging)
    │   │
    │   ├─ 诊断结论：需改 spec
    │   │   → 引导 /alloy:start <建议名称>
    │   │   → 结束 fix 流程
    │   │
    │   └─ 诊断结论：代码 bug（不改 spec）
    │       → 用户确认诊断结论
    │       → 进入 Step 3
    │
    └─ Step 3: 分支选择 + 修复
        │
        ├─ 场景 1：有归属 change + worktree 存在
        │   → 在 worktree 内 TDD 修复 → verify → 提交
        │
        ├─ 场景 2：有归属 change + worktree 已清理
        │   → 在 feature 分支 TDD 修复 → verify → 提交
        │
        └─ 场景 3：无归属 change / change 已 finish
            → 创建 hotfix/<desc> 分支（从主分支）
            → TDD 修复 → verify → 提交 → 合并回主分支
        │
        └─ 完成后：若修复过程中发现 spec 问题 → 提示"是否需要开新 change 修正 spec？"
           正常修复 → 不提示
```

---

## Step 1: 环境感知

检测当前工作环境，供后续步骤使用：

```bash
# 检测是否在 worktree 中
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
IN_WORKTREE=$([ "$GIT_DIR" != "$GIT_COMMON" ] && echo "true" || echo "false")

# 检测活跃 change
alloy status --json 2>/dev/null

# 读取主分支配置
alloy _config read . main_branch 2>/dev/null
```

输出：
```
[Step 1/3] 环境感知
──────────────────────────────────────
当前分支: feature/login-fix
Worktree: 是（.claude/worktrees/login-fix/）
活跃 change: login-fix（phase: applied）
主分支: main
```

---

## Step 2: 根因诊断

加载 `superpowers:systematic-debugging` 技能进行系统化诊断。

**诊断结论分流：**

| 诊断结论 | 行为 |
|---------|------|
| 需改 spec | → 展示结论 + 建议 change 名 → 引导 `/alloy:start <建议名称>` → **结束 fix** |
| 代码 bug | → 展示结论 → 用户确认 → 进入 Step 3 |

**什么算"需改 spec"：**
- spec 没有描述这个边界情况，代码行为合理但 spec 需补充
- spec 描述的行为本身就是错的
- 修复需要新增 spec 中没有的 capability

**什么算"代码 bug"：**
- 函数返回值与 spec 描述不一致
- spec 说"空数组返回 []"但代码抛了异常
- 性能不达标，spec 没有性能要求

---

## Step 3: 分支选择 + 修复

确认是代码 bug 后，根据 change 状态选择修复路径。

### 场景 1：有归属 change + worktree 存在

```
[Step 3/3] 修复 · worktree 内修复
──────────────────────────────────────
归属 change: <name>（phase: applied）
Worktree: <path>
在 worktree 内修复并提交
```

修复流程：
1. TDD 修复（`superpowers:test-driven-development`）
2. 验证（`superpowers:verification-before-completion`）
3. 提交到 worktree 分支

### 场景 2：有归属 change + worktree 已清理

```
[Step 3/3] 修复 · feature 分支修复
──────────────────────────────────────
归属 change: <name>（phase: archived）
Feature 分支: <branch>
在 feature 分支修复并提交
```

修复流程：
1. TDD 修复
2. 验证
3. 提交到 feature 分支

### 场景 3：无归属 change / change 已 finish

```
[Step 3/3] 修复 · 热修分支
──────────────────────────────────────
无活跃归属 change，创建热修分支
```

**确认主分支（阻塞点）：**

读取 `openspec/config.yaml` 的 `main_branch` 配置。若未配置，自动检测并让用户确认：

```bash
# 优先读配置
MAIN_BRANCH=$(alloy _config read . main_branch 2>/dev/null)

# 未配置时自动检测
if [ -z "$MAIN_BRANCH" ] || [ "$MAIN_BRANCH" = "null" ]; then
  MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
  [ -z "$MAIN_BRANCH" ] && MAIN_BRANCH=$(git config --get init.defaultBranch 2>/dev/null)
  [ -z "$MAIN_BRANCH" ] && MAIN_BRANCH=$(git branch --list 'main' --list 'master' | head -1 | sed 's/[* ]//g')
fi
```

展示并确认：
> 主分支: `<MAIN_BRANCH>`？[Y/n]

**创建热修分支：**

```bash
git checkout -b hotfix/<desc> <MAIN_BRANCH>
```

分支命名：`hotfix/` 前缀 + 简短描述（kebab-case），用户可修改。

**关联原 change（如有）：**

如果能追溯到原 change（通过诊断阶段的环境感知），在 commit message 中注明：

```
fix: <描述>

fix-from: <原 change 名>
```

**修复流程：**

1. TDD 修复（`superpowers:test-driven-development`）
2. 验证（`superpowers:verification-before-completion`）
3. 提交：
   ```bash
   git add <精确路径>
   git commit -m "fix: <描述>"
   ```
4. 合并回主分支：
   ```bash
   git checkout <MAIN_BRANCH>
   git merge hotfix/<desc> --no-ff
   git branch -d hotfix/<desc>
   ```

---

## 完成

```
Alloy · Bug 修复 — DONE
──────────────────────────────────────

修复路径：<场景 1 / 场景 2 / 场景 3>
诊断结论：<根因摘要>
结果：<修复结果>

若修复过程中发现 spec 需要变更 → 提示运行 /alloy:start 开新 change。
正常修复完成 → 不提示。
```

---

## 与现有流程的关系

| 场景 | alloy 周期 | 制品 | 分支 |
|------|-----------|------|------|
| 1（worktree 内） | 在当前 change 内修复 | 不新增制品 | worktree 分支 |
| 2（feature 分支） | 在当前 change 内修复 | 不新增制品 | feature 分支 |
| 3（热修） | 轻量流程，不走完整周期 | 无制品 | hotfix/ 分支 |

---

## 闸门规则

- **诊断先行** — 先判断是代码 bug 还是 spec 变更，spec 变更直接引导 `/alloy:start`
- **分支后置** — 确认是代码 bug 后才选择分支策略
- **主分支确认** — hotfix 分支创建前必须确认主分支，不假设 main/master
- **TDD 必须** — 所有场景都走 TDD 修复，不跳过
- **精确 git add** — 只用精确路径，不用 `-A`/`-a`/`.`
- **spec 变更不阻断修复** — 修复过程中发现 spec 问题，完成当前修复后再提示；正常修复不提示
