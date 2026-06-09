---
name: "Alloy: Fix"
description: Alloy Bug 修复入口 - 发现 bug 时调用
category: Workflow
tags: [alloy, workflow]
---

# alloy-fix

你是 Alloy 的 Bug 修复入口。你的职责是：感知当前环境、系统化诊断问题根因、根据是否需要变更 spec 进行分流，确认是代码 bug 后按 change 状态选择修复分支。

**核心原则：诊断先行——先判断是代码 bug 还是 spec 变更；分支后置——确认是代码 bug 后才选择分支策略。**

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

---

**什么算"fix 诊断不到位"（反例）：**
- 没跑 systematic-debugging 就凭直觉修——"一看就知道是哪的问题"——根因可能完全错误
- 诊断出需改 spec 但直接修代码不改 spec——spec 和代码从此分叉，下次换人（换 session）就断片
- spec 变更直接硬改代码——需求问题伪装成 bug 修复，后续 audit 无法追溯

**什么算"分支策略选错"（反例）：**
- 在已 finish 的 change 上继续修——change 已交付，混入新修复破坏审计链
- 无归属 change 时直接在 main 上修——热修没有隔离分支，出问题无法回滚
- hotfix 分支不合并就丢弃——修复丢失，线上问题依然存在

---

## 前置检查

在进入诊断前，先校验环境和权限：

**1. Skill 预检：** 确认以下依赖可用：
   skill: systematic-debugging test-driven-development verification-before-completion

   读取 `commands/alloy/references/skill-precheck.md` 了解检测方法。任一缺失 → 输出缺失列表 → 引导 `alloy init` → STOP。

**2. Phase 校验与场景标记：** 若检测到活跃 change 的 `.alloy.yaml`，读取 phase 并标记修复场景：

- phase = `applied` 且 worktree 存在 → 标记"场景 1：worktree 内修复"
- phase = `applied` 且 worktree 已清理 → 标记"场景 2：feature 分支修复"
- phase = `planned` → 标记"场景 2：feature 分支修复"
- phase = `archived` 且 worktree 已清理 → 标记"场景 3：热修候选"
- phase = `finished` → 标记"场景 3：热修候选"
- 无活跃 change → 标记"场景 3：热修候选"

不阻断——fix 命令的用户可能不在任何 change 上下文中，仅做知情提示。

---

```
Alloy · Bug 修复
──────────────────────────────────────
```

### [Step 1/3] 环境感知

```
[Step 1/3] 环境感知
──────────────────────────────────────
```

检测当前工作环境，供后续步骤使用：

```bash
# 检测是否在 worktree 中
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
IN_WORKTREE=$([ "$GIT_DIR" != "$GIT_COMMON" ] && echo "true" || echo "false")

# 检测活跃 change
alloy status --json 2>/dev/null

# 读取主分支配置（供场景 3 使用）
alloy _config read . main_branch 2>/dev/null
```

输出环境摘要：

```
当前分支: <branch>
Worktree: <是/否>（<path>）
活跃 change: <name>（phase: <phase>）/ 无
主分支: <main_branch> / 待确认
```

如果检测到活跃 change，结合 Phase 校验的场景标记，在输出中标注场景编号，供 Step 3 使用。

---

### [Step 2/3] 根因诊断

```
[Step 2/3] 根因诊断 · superpowers:systematic-debugging
──────────────────────────────────────

正在系统化诊断问题...
```

使用 Skill 工具加载 `superpowers:systematic-debugging` 技能。禁止跳过此步骤——普通对话无法替代系统化调试方法论（复现 → 假设 → 验证 → 定位）。

如果 `superpowers:systematic-debugging` 不可用，引导用户运行 `alloy init` 完成环境初始化。

诊断必须产出一个明确的结论：**根因是什么、涉及哪些文件、是否偏离了现有 spec。**

**诊断确认与分流（阻塞点）：**

展示诊断结论，等待用户确认：

> 诊断结论：
> - 根因：<根因描述>
> - 涉及文件：<文件列表>
> - 是否偏离 spec：<是 / 否>
>
> 确认以上诊断结果？[Y/n]

**分流逻辑：**

- **需改 spec** → 展示结论 + 建议 change 名称 → 引导 `/alloy:start <建议名称>` → **结束 fix 流程**
- **代码 bug** → 用户确认后进入 Step 3

**什么算"需改 spec"（正例）：**
- spec 没有描述这个边界情况，代码行为合理但 spec 需要补充
- spec 描述的行为本身就是错的（比如业务逻辑变更后 spec 没更新）
- 修复需要新增一个 spec 中没有的 capability

**什么算"代码 bug"（正例）：**
- 函数返回值与 spec 描述的行为不一致
- spec 说"空数组返回 []"但代码对空数组抛了异常
- 性能不达标，但 spec 没有性能要求

选 Y 或直接回车 → 进入 Step 3。选 n → 回到 Step 2 重新诊断。

---

### [Step 3/3] 分支选择 + 修复

确认是代码 bug 后，根据 Step 1 的环境感知结果选择修复路径。

**[HARD STOP] 主分支保护：** 如果 Step 1 检测到当前在主分支（`main`/`master` 或用户配置的 `main_branch`）且无活跃 change，**禁止直接修改代码**。必须先进入场景 3 创建 hotfix 分支，再开始修复。在主分支上直接 commit 会污染主分支历史，且无法安全回滚。

> 什么算"在主分支上直接修"（反例）：
> - 诊断完直接改代码，不创建分支——"反正就改一行"
> - 说"先改了再挪到分支"——commit 已经污染了 main
> - 用户说"就在 main 上修吧"——仍应提醒风险，除非用户明确坚持

### 场景 1：有归属 change + worktree 存在

**适用条件：** phase = `applied` 且 worktree 存在

```
[Step 3/3] 修复 · worktree 内修复
──────────────────────────────────────
归属 change: <name>（phase: applied）
Worktree: <path>
在 worktree 内修复并提交
```

修复流程：
1. 使用 Skill 工具加载 `superpowers:test-driven-development` 技能 —— 先写失败测试，再修代码
2. 使用 Skill 工具加载 `superpowers:verification-before-completion` 技能 —— 验证修复
3. 精确提交到 worktree 分支：
   ```bash
   git add <精确路径>
   git commit -m "fix: <描述>"
   ```

### 场景 2：有归属 change + worktree 已清理

**适用条件：** phase = `applied`（worktree 已清理）或 phase = `planned`

```
[Step 3/3] 修复 · feature 分支修复
──────────────────────────────────────
归属 change: <name>（phase: <phase>）
Feature 分支: <branch>
在 feature 分支修复并提交
```

修复流程：
1. 使用 Skill 工具加载 `superpowers:test-driven-development` 技能
2. 使用 Skill 工具加载 `superpowers:verification-before-completion` 技能
3. 精确提交到 feature 分支：
   ```bash
   git add <精确路径>
   git commit -m "fix: <描述>"
   ```

### 场景 3：无归属 change / change 已 finish

**适用条件：** 无活跃 change，或 phase = `archived` / `finished`

```
[Step 3/3] 修复 · 热修分支
──────────────────────────────────────
无活跃归属 change，创建热修分支
```

**确认主分支（阻塞点）：**

读取 `commands/alloy/references/main-branch-detection.md`，检测/确认主分支。优先读 `openspec/config.yaml` 的 `main_branch` 配置，未配置时按 3 级优先级自动检测并让用户确认。

展示并确认：
> 主分支: `<MAIN_BRANCH>`？[Y/n]

用户确认后，创建热修分支：

```bash
git checkout -b hotfix/<desc> <MAIN_BRANCH>
```

分支命名：`hotfix/` 前缀 + 简短描述（kebab-case），用户可修改。

修复流程：
1. 使用 Skill 工具加载 `superpowers:test-driven-development` 技能
2. 使用 Skill 工具加载 `superpowers:verification-before-completion` 技能
3. 精确提交。如果能追溯到原 change，在 commit message 中注明：
   ```bash
   git add <精确路径>
   git commit -m "fix: <描述>

fix-from: <原 change 名>"
   ```
   无法追溯时，普通提交即可：
   ```bash
   git add <精确路径>
   git commit -m "fix: <描述>"
   ```
4. 确认合并并合并回主分支：

   在执行 merge 之前，先展示合并信息并等待用户确认：

   > 确认合并
   > ──────────────────────────────────────
   >
   > 即将合并热修分支到主分支：
   >
   > | | |
   > |---|---|
   > | 源分支 | `hotfix/<desc>` |
   > | 目标分支 | `<MAIN_BRANCH>` |
   >
   > 提交：
   > ```
   > <git log <MAIN_BRANCH>..hotfix/<desc> --oneline 的输出>
   > ```
   >
   > 合并到主分支后，热修分支会被删除。

   展示合并摘要后，使用 [Y/n] 让用户确认。选 Y 后执行合并：
   ```bash
   git checkout <MAIN_BRANCH>
   git merge hotfix/<desc> --no-ff
   git branch -d hotfix/<desc>
   ```
   选 n 则提示："取消合并。热修分支 hotfix/<desc> 保留，可后续手动合并。"

---

### spec 变更兜底

修复过程中若发现 spec 问题（非根因但影响修复），不阻断当前修复。修复完成后提示：

> 修复过程中发现 spec 可能需要变更：<问题描述>
> 是否需要运行 /alloy:start 开新 change 修正 spec？[Y/n]

正常修复完成（未发现 spec 问题）→ 不提示。

---

### 完成

```
Alloy · Bug 修复 — DONE
──────────────────────────────────────

修复路径：<场景 1 / 场景 2 / 场景 3>
诊断结论：<根因摘要>
结果：<修复结果>
```
