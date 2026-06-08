# alloy:fix 流程改进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重写 alloy:fix 流程，增加分支策略——诊断先行判断是否改 spec，确认是代码 bug 后根据 change 状态选择修复分支（worktree / feature / hotfix）。

**Architecture:** 只修改两个 markdown 文件（Skill 文件 + 产品规格），不涉及 TypeScript 代码。fix.md 从当前的"诊断→分流→修复"改为"环境感知→根因诊断（含 spec 拦截）→三分支修复"。

**Tech Stack:** Markdown（Skill 文件），无代码依赖

---

### Task 1: 重写 commands/alloy/fix.md

**Files:**
- Modify: `commands/alloy/fix.md`

**前置条件：** 已读 `docs/reference/skill-writing-guide.md`（CLAUDE.md 要求修改 skill 文件前必须读）

**设计参考：** `docs/superpowers/specs/2026-06-08-fix-workflow-design.md`

- [ ] **Step 1: 读取当前 fix.md，确认现有结构**

读取 `commands/alloy/fix.md`，记录当前结构：
- frontmatter（name, description, category, tags）
- 前置检查（Skill 预检 + Phase 校验）
- Step 1/3：环境感知
- Step 2/3：根因诊断
- Step 3/3：分流修复（路径 A 不改 spec / 路径 B 需改 spec）
- 完成

- [ ] **Step 2: 重写 fix.md — 前置检查部分**

保留现有前置检查的 Skill 预检（systematic-debugging + TDD + verification-before-completion），但调整 Phase 校验逻辑：

当前逻辑：活跃 change phase 为 archived/finished 时知情提示（不阻断）
新逻辑：活跃 change phase 为 archived/finished 时，标记为"场景 3 热修候选"，供 Step 3 使用

具体修改：
```markdown
**2. Phase 校验：** 若检测到活跃 change 的 `.alloy.yaml`，读取 phase 和 worktree：
- phase = `archived` 且 worktree 已清理 → 标记为"场景 3 热修候选"
- phase = `finished` → 标记为"场景 3 热修候选"
- phase = `applied` 且 worktree 存在 → 标记为"场景 1"
- phase = `applied` 且 worktree 已清理 → 标记为"场景 2"
- phase = `planned` → 标记为"场景 2"
- 无活跃 change → 标记为"场景 3"
- 不阻断——fix 命令的用户可能不在任何 change 上下文中，仅做知情提示。
```

- [ ] **Step 3: 重写 fix.md — Step 1 环境感知**

将当前的简单环境感知改为更详细的检测，收集 Step 3 需要的信息：

```markdown
## Step 1/3：环境感知

检测当前工作环境，供 Step 3 分支策略使用：

```bash
# 检测是否在 worktree 中
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
IN_WORKTREE=$([ "$GIT_DIR" != "$GIT_COMMON" ] && echo "true" || "false")

# 检测活跃 change（通过扫描 .alloy.yaml）
# 读取主分支配置
MAIN_BRANCH=$(alloy _config read . main_branch 2>/dev/null)
```

输出告知用户当前位置：
```
[Step 1/3] 环境感知
──────────────────────────────────────
当前分支: <branch>
Worktree: <是/否>
活跃 change: <name>（phase: <phase>）或 无
主分支: <main_branch>（或 未配置）
```
```

- [ ] **Step 4: 重写 fix.md — Step 2 根因诊断（含 spec 拦截）**

将当前的"诊断→分流"改为"诊断→spec 拦截→用户确认"：

```markdown
## Step 2/3：根因诊断

使用 Skill 工具加载 `superpowers:systematic-debugging` 技能。禁止跳过此步骤。

诊断必须产出一个明确的结论：**根因是什么、涉及哪些文件、是否偏离了现有 spec。**

**诊断结论分流（阻塞点）：**

展示诊断结论，根据结论类型自动分流：

> 诊断结论：
> - 根因：<根因描述>
> - 涉及文件：<文件列表>
> - 是否偏离 spec：<是 / 否>

**结论：需改 spec → 直接引导 /alloy:start，结束 fix：**

> 诊断发现需要变更 spec：
> - <具体原因>
>
> 建议名称：<kebab-case 名称>
> 运行 /alloy:start <建议名称> 进入需求设计流程。
>
> fix 流程结束——spec 变更不在 fix 范围内处理。

什么算"需改 spec"：
- spec 没有描述这个边界情况，代码行为合理但 spec 需补充
- spec 描述的行为本身就是错的
- 修复需要新增 spec 中没有的 capability

**结论：代码 bug → 用户确认后进入 Step 3：**

> 确认以上诊断结果，进入修复？[Y/n]

选 Y 或直接回车 → 进入 Step 3 分支选择。选 n → 回到 Step 2 重新诊断。

什么算"代码 bug"：
- 函数返回值与 spec 描述的行为不一致
- spec 说"空数组返回 []"但代码对空数组抛了异常
- 性能不达标，但 spec 没有性能要求
```

- [ ] **Step 5: 重写 fix.md — Step 3 分支选择 + 修复**

将当前的"路径 A / 路径 B"改为三分支修复：

```markdown
## Step 3/3：分支选择 + 修复

确认是代码 bug 后，根据 Step 1 检测到的 change 状态选择修复路径。

### 场景 1：有归属 change + worktree 存在

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
3. 提交到 worktree 分支：
   ```bash
   git add <精确路径>
   git commit -m "fix: <描述>"
   ```

### 场景 2：有归属 change + worktree 已清理

```
[Step 3/3] 修复 · feature 分支修复
──────────────────────────────────────
归属 change: <name>（phase: archived/planned）
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
MAIN_BRANCH=$(alloy _config read . main_branch 2>/dev/null)
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

如果能追溯到原 change（通过 Step 1 环境感知），在 commit message 中注明：

```
fix: <描述>

fix-from: <原 change 名>
```

**修复流程：**

1. TDD 修复
2. 验证
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

### spec 变更兜底提示

所有场景的修复完成后，若修复过程中发现 spec 问题（Agent 自行判断），提示：

> 修复过程中发现 spec 需要变更：[具体说明]
> 运行 /alloy:start 开新 change 处理 spec 变更。

正常修复完成 → 不提示。
```

- [ ] **Step 6: 重写 fix.md — 完成部分**

```markdown
### 完成

```
Alloy · Bug 修复 — DONE
──────────────────────────────────────

修复路径：<场景 1 / 场景 2 / 场景 3>
诊断结论：<根因摘要>
结果：<修复结果>

若修复过程中发现 spec 需要变更 → 提示运行 /alloy:start 开新 change。
正常修复完成 → 不提示。
```
```

- [ ] **Step 7: 重写 fix.md — 闸门规则**

更新闸门规则以匹配新流程：

```markdown
## 闸门规则

- **诊断先行** — 先判断是代码 bug 还是 spec 变更，spec 变更直接引导 `/alloy:start`
- **分支后置** — 确认是代码 bug 后才选择分支策略
- **主分支确认** — hotfix 分支创建前必须确认主分支，不假设 main/master
- **TDD 必须** — 所有场景都走 TDD 修复，不跳过
- **精确 git add** — 只用精确路径，不用 `-A`/`-a`/`.`
- **spec 变更不阻断修复** — 修复过程中发现 spec 问题，完成当前修复后再提示；正常修复不提示
```

- [ ] **Step 8: 提交 fix.md**

```bash
git add commands/alloy/fix.md
git commit -m "fix: alloy:fix 流程增加三分支策略 + spec 变更拦截"
```

---

### Task 2: 更新产品规格中的 alloy fix 描述

**Files:**
- Modify: `docs/specification/01-product-spec.md`（alloy fix 段落，约 274-310 行）

- [ ] **Step 1: 读取当前产品规格中的 alloy fix 段落**

读取 `docs/specification/01-product-spec.md` 的 `### alloy fix` 部分（274-310 行），确认当前内容。

- [ ] **Step 2: 替换 alloy fix 段落**

将当前的 alloy fix 段落替换为匹配新设计的内容：

```markdown
### alloy fix

```
/alloy:fix

核心原则：先诊断根因，再分类处理，禁止跳过诊断直接修。
诊断先行——先判断是代码 bug 还是 spec 变更；分支后置——确认是代码 bug 后根据 change 状态选择修复分支。

前置检查:
  1. Skill 预检：systematic-debugging + TDD + verification-before-completion 三个技能可用
  2. Phase 校验：读取活跃 change 的 phase 和 worktree 状态，标记场景（不阻断）

1. 环境感知：
   检测当前分支、worktree 状态、活跃 change、主分支配置
   （告知用户操作位置，不自动跳转）

2. superpowers:systematic-debugging → 根因定位
   诊断结论分流：
   ├── 需改 spec → 引导 /alloy:start <建议名称>，结束 fix
   └── 代码 bug → 用户确认后进入 Step 3

3. 分支选择 + 修复（用户确认诊断结论后）:

   场景 1：有归属 change + worktree 存在
     → 在 worktree 内 TDD 修复 → verification → 提交

   场景 2：有归属 change + worktree 已清理
     → 在 feature 分支 TDD 修复 → verification → 提交

   场景 3：无归属 change / change 已 finish
     → 确认主分支（不假设 main/master）
     → 创建 hotfix/<desc> 分支（从主分支）
     → TDD 修复 → verification → 提交
     → 合并回主分支（--no-ff）
     → 关联原 change（如有）在 commit message 中注明 fix-from

   spec 变更兜底：
     → 修复过程中发现 spec 问题 → 完成后提示开新 change
     → 正常修复 → 不提示
```
```

- [ ] **Step 3: 提交产品规格更新**

```bash
git add docs/specification/01-product-spec.md
git commit -m "docs: 产品规格更新 alloy fix 流程描述"
```

---

### Task 3: 构建验证

**Files:**
- 无文件修改

- [ ] **Step 1: 运行测试**

```bash
npm test
```

预期：全部通过（修改的是 markdown 文件，不影响 TypeScript 测试）

- [ ] **Step 2: 运行构建**

```bash
npm run build
```

预期：构建成功

- [ ] **Step 3: 验证 fix.md 格式**

检查 fix.md 的 frontmatter 格式正确：
```bash
head -6 commands/alloy/fix.md
```

预期输出包含正确的 YAML frontmatter（name, description, category, tags）
