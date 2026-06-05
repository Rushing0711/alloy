# Apply 阶段工作流改进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善 apply.md 的 worktree 生命周期、增加 executing-plans 路径的 spec 合规审查、优化策略选择文案、简化 archive.md 的 worktree 提示。

**Architecture:** 仅修改两个 skill Markdown 文件（`commands/alloy/apply.md` 和 `commands/alloy/archive.md`），不涉及 TypeScript 代码。所有改动在 apply.md 内部闭环：Step 1 提示文案更新、Step 2 执行策略文案 + spec 合规审查插入、完成阶段新增 worktree 合并清理逻辑。

**Tech Stack:** Markdown（skill 文件）

---

### Task 1: apply.md Step 1 — Worktree 提示文案更新

**Files:**
- Modify: `commands/alloy/apply.md:141-193`

- [ ] **Step 1: 替换 Step 1 隔离环境设置的头部提示**

当前（约 160-168 行）：
```
> [Step 1/5] 隔离环境设置
>
> 源分支:   <当前 git branch>
> Worktree 分支: worktree-<change-name>
> Worktree 路径: .claude/worktrees/<change-name>
>
> 加载 superpowers:using-git-worktrees...
```

替换为：
```
> [Step 1/5] 隔离环境设置
>
> 当前在 feature/<name> 分支，未在隔离 worktree 中。
>
> 分支隔离的是提交历史，但同一时间只能有一个分支在工作目录里。
> Worktree 隔离的是工作目录——每个 worktree 有独立的文件副本，可同时 checkout 不同分支。
>
> 如果你的 feature 开发期间要切到其他分支（如修紧急 bug、切 main 查东西），
> worktree 让你无需 stash/commit 当前进度，直接进另一个目录操作。
>
> 你想创建隔离 worktree 吗？
>
>   > Would you like me to set up an isolated worktree?
>   > It protects your current branch from changes.
>
> - 是 → 创建 .claude/worktrees/<name> worktree，在隔离环境中实现
> - 否 → 在当前 feature/<name> 分支直接工作
>
> 加载 superpowers:using-git-worktrees 技能...
```

- [ ] **Step 2: 同时更新 worktree 分支命名引用**

将 Step 1 中所有 `worktree-<change-name>` 改为 `feature/<change-name>--wt`。搜索整个文件确认。

### Task 2: apply.md Step 2 — 执行策略选择文案更新

**Files:**
- Modify: `commands/alloy/apply.md:216-227`

- [ ] **Step 1: 替换执行策略选择的展示文案**

当前：
```
推荐方案：<superpowers:subagent-driven-development / superpowers:executing-plans>（规划阶段建议）
理由：<来自 plans.md reason>

1. superpowers:subagent-driven-development — 派发子 agent 并行执行（推荐）
2. superpowers:executing-plans — 当前 session 逐步实现
```

替换为：
```
推荐方案：superpowers:subagent-driven-development（规划阶段建议）
理由：<来自 plans.md reason>

选择哪个？

subagent-driven-development（推荐）
  适用场景：
  - 任务多（≥3 个）、相互独立
  - 涉及不同文件/模块，可并行
  - 适合：新功能、多组件改造、跨模块变更

executing-plans
  适用场景：
  - 任务少（1-2 个）、紧密耦合
  - 共享状态或同一文件、不可拆分
  - 适合：小修小改、重构单个模块、快速修复
```

### Task 3: apply.md Step 2 — executing-plans 路径增加 Spec 合规审查

**Files:**
- Modify: `commands/alloy/apply.md:248-262`

- [ ] **Step 1: 在 executing-plans 描述中插入 spec 合规审查步骤**

当前（249-262 行）：
```
**superpowers:executing-plans 路径：** 分三步执行，确保不丢 TDD 和 code review 闸门：

**1. 先加载 `superpowers:test-driven-development` 技能设定 TDD 预期：**
- 加载后，TDD 纪律（RED→GREEN→REFACTOR）成为本次执行的硬约束
- 不在 executing-plans 内部"顺便做"——先设定预期，再执行

**2. 加载 `superpowers:executing-plans` 技能执行 plans.md 微步骤：**
- executing-plans 按 plans.md 逐步执行，每步完成后暂停审查
- 执行过程中遵循 TDD 流程（先写测试→确认失败→实现→确认通过）

**3. executing-plans 完成后，加载 `superpowers:requesting-code-review` 技能：**
- 代码审查闸门——所有代码变更必须经过审查才能进入 Step 3 验证
```

改为（增加第 3 步 spec 合规审查，原第 3 步顺延为第 4 步）：
```
**superpowers:executing-plans 路径：** 分四步执行，确保不丢 TDD、spec 合规和 code review 闸门：

**1. 先加载 `superpowers:test-driven-development` 技能设定 TDD 预期：**
- 加载后，TDD 纪律（RED→GREEN→REFACTOR）成为本次执行的硬约束
- 不在 executing-plans 内部"顺便做"——先设定预期，再执行

**2. 加载 `superpowers:executing-plans` 技能执行 plans.md 微步骤：**
- executing-plans 按 plans.md 逐步执行，每步完成后暂停审查
- 执行过程中遵循 TDD 流程（先写测试→确认失败→实现→确认通过）

**3. executing-plans 完成后，进行 Spec 合规审查（Agent 自行检查，不加载额外技能）：**
- tasks.md 的每个 checkbox → 代码中是否有对应实现？
- 代码中是否有 tasks.md 未要求的实现？（over-building）
- plan.md 中明确排除的范围 → 代码是否碰了？
- 不通过 → 修复 → 重新审查 → 通过后进入 code review

**4. 加载 `superpowers:requesting-code-review` 技能进行代码审查：**
- 代码审查闸门——所有代码变更必须经过审查才能进入 Step 3 验证
```

- [ ] **Step 2: 更新步骤描述**（第 249 行"分三步"改为"分四步"）

### Task 4: apply.md 完成阶段 — Worktree 合并清理逻辑

**Files:**
- Modify: `commands/alloy/apply.md:442-456`

- [ ] **Step 1: 在 apply 完成阶段添加 worktree 检测合并逻辑**

在 apply guard 之前（约 442 行"通过 `alloy _guard` 校验并更新 phase"注释前），插入：

```markdown
**Worktree 合并清理（如果 apply 期间使用了 worktree）：**

```bash
WORKTREE_PATH=$(alloy _state read openspec/changes/<name> worktree 2>/dev/null)
if [ "$WORKTREE_PATH" != "null" ] && [ -n "$WORKTREE_PATH" ] && [ "$WORKTREE_PATH" != "skipped" ]; then
  echo "     ℹ 检测到 worktree（$WORKTREE_PATH），正在合并回 feature 分支..."
  
  # 切回主仓库目录
  MAIN_ROOT=$(cd "$WORKTREE_PATH" && git rev-parse --show-toplevel)
  FEATURE_BRANCH=$(git branch --show-current)
  
  # 从 worktree 合并代码到 feature 分支
  cd "$MAIN_ROOT"
  git merge "feature/<name>--wt" --no-edit
  
  if [ $? -eq 0 ]; then
    # 删除 worktree 目录和分支
    git worktree remove "$WORKTREE_PATH"
    git branch -d "feature/<name>--wt"
    # 清理 worktree 状态
    alloy _state write openspec/changes/<name> worktree null
    echo "     ✓ worktree 已合并至 feature 分支并清理"
  else
    echo "     ⚠ merge 冲突，请手动解决后再继续"
    echo "     git checkout feature/<name> && git merge feature/<name>--wt"
    exit 1
  fi
fi
```

> 如果 apply 期间未使用 worktree（worktree 为 null 或 skipped），则跳过此步骤。

插入位置在"apply 阶段 commit 规则"之后、"通过 alloy guard 校验并更新 phase"之前。

### Task 5: archive.md — 简化 worktree 提示

**Files:**
- Modify: `commands/alloy/archive.md:169-177`

- [ ] **Step 1: 移除 worktree 动态检测提示**

当前（169-177 行）：
```
**根据 worktree 状态动态提示：**

```bash
alloy _state read "$ARCHIVE_DIR" worktree
```

- worktree 有值 → 代码在独立 worktree 分支上，尚未合入。运行 `/alloy:finish` 完成代码合入与现场清理。
- worktree 为 `null` → 代码在当前分支上。运行 `/alloy:finish` 完成收尾。
```

替换为：
```
> → 代码合入由 `/alloy:finish` 处理
```

### Task 6: 验证

**Files:**
- None（人工测试）

- [ ] **Step 1: 无 worktree 场景走一遍**

```bash
aldev init  # 初始化测试项目
aldev start → /alloy:start  # 创建 change
/alloy:plan                # 规划
/alloy:apply               # 执行，选"否"不建 worktree
# 确认 worktree 合并清理步骤被跳过
# 确认 spec 合规审查和 code review 正常执行
/allev:archive             # 归档
/aldev:finish              # 收尾
```

- [ ] **Step 2: 有 worktree 场景走一遍**

```bash
# 新建 change
/alloy:apply  # 选"是"建 worktree
# 在 worktree 中实现代码
# 验证 apply 结束时 worktree 自动合并回 feature/<name>
# 验证 worktree 目录被删除
# 验证 worktree 状态被清除
# /alloy:archive → 正常
# /alloy:finish → 正常合并 feature/<name> → main
```
