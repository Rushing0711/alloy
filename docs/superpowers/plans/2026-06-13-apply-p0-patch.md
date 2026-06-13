# apply.md P0 紧急补丁（task #10）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `commands/alloy/apply.md` 加最小侵入式 P0 补丁，关闭 1 个隐患——`git worktree add` 创建前未检查目标路径是否已被占用，导致命令失败时 agent 可能在压力下用 `git worktree remove --force` / `rm -rf` 强行清掉用户先前未归档的工作。

**Architecture:** 阶段 1 紧急补丁不改 frontmatter、不补三层防御、不画流程图——仅在用户选择"创建 worktree"分支后、`git worktree add` 命令前插入 PRECONDITION_FAIL 路径占用检查；若路径已存在 → 不自动覆盖，进入 USER_GATE 让用户在三个选项中决策。修改集中在 `apply.md` 一个文件内，单 commit 提交。

**Tech Stack:** Markdown skill 文件 + bash 片段 + alloy CLI（`_spec-audit` 用于回归校验）

**前置阅读：**
- 通用指南 `docs/reference/skill-writing-guide.md` §3.5.1（git 自救命令禁令清单与标准措辞——本补丁里需嵌入"禁止 worktree remove --force / rm -rf"语义）
- 通用指南 `docs/reference/skill-writing-guide.md` §4（PRECONDITION_FAIL / USER_GATE / HARD_STOP 四类术语）
- design 文档 `docs/superpowers/specs/2026-06-13-skills-test-and-rewrite-design.md` §3.2 阶段 1 commit 2

**验证策略：** 文档修改无单元测试可写。验证依靠：(1) 修改后内容人工 review；(2) `npm run build` + `npm test` 确认无回归；(3) `node dist/cli/index.js _spec-audit` 确认补丁未意外改 frontmatter（阶段 1 约束）。

---

## File Structure

**修改：** `commands/alloy/apply.md`（单文件，单处修改）

**修改位置概览：**

| 修改 | 起止行 | 隐患编号 | 新增内容 |
|------|-------|---------|---------|
| A | line 143-147 段落整体替换 | task #10 | "用户选择创建" 分支增加 PRECONDITION_FAIL 路径占用检查 + USER_GATE 三选项 |

修改前的"用户选择创建"分支（line 143-147）：

```markdown
**用户选择创建：** 手动创建确保正确 base ref：
```bash
git worktree add .claude/worktrees/<name> -b worktree-<name> <feature_branch>
```
再用 `EnterWorktree(path=".claude/worktrees/<name>")` 进入。路径偏好 `.claude/worktrees/<name>`（`.claude/` 是 alloy 固定目录），分支命名 `worktree-<name>`（与 EnterWorktree 内置一致，archive 清理时无需猜测）。
```

修改后插入 PRECONDITION_FAIL 检查 + USER_GATE 三选项分支（复用 / 重命名 / abort），原 `git worktree add` 命令仅在路径**未占用且不复用**情况下执行。

---

## Task 1: 通读 apply.md worktree 创建段上下文

**Files:**
- Read: `commands/alloy/apply.md` 第 105-160 行

- [ ] **Step 1: 读 apply.md 105-160 行确认实际行号**

读 `commands/alloy/apply.md` 第 105-160 行，理解：
- line 108 `alloy _guard worktree-status` 状态分支（pending / created / skipped）
- line 132-135 加载 `superpowers:using-git-worktrees` consent（USER_GATE）
- line 141 用户选择不创建分支（写 worktree=skipped）
- line 143-147 用户选择创建分支（手动 git worktree add + EnterWorktree）
- line 149-150 创建后状态记录

确认 line 143 起始为 `**用户选择创建：** 手动创建确保正确 base ref：`，如果行号已偏移（之前若有任何编辑）以实际位置为准。

记录精确起始行号供 Task 2 使用。

---

## Task 2: 替换"用户选择创建"分支，加入 PRECONDITION_FAIL + USER_GATE

**Files:**
- Modify: `commands/alloy/apply.md` line 143-147（"用户选择创建" 段整体替换）

- [ ] **Step 1: 用 Edit 工具整段替换**

**old_string**（精确匹配 line 143-147 整段，5 行）：

````
**用户选择创建：** 手动创建确保正确 base ref：
```bash
git worktree add .claude/worktrees/<name> -b worktree-<name> <feature_branch>
```
再用 `EnterWorktree(path=".claude/worktrees/<name>")` 进入。路径偏好 `.claude/worktrees/<name>`（`.claude/` 是 alloy 固定目录），分支命名 `worktree-<name>`（与 EnterWorktree 内置一致，archive 清理时无需猜测）。
````

**new_string**（替换后 ~38 行，包含 PRECONDITION_FAIL 检查段 + USER_GATE 三选项 + 原 git worktree add 命令分支化）：

````
**用户选择创建：** 手动创建确保正确 base ref。

**路径占用检查（PRECONDITION_FAIL）：** `git worktree add` 在目标路径已存在时会失败；agent 不得用 `git worktree remove --force` 或 `rm -rf` 自动清理——目标路径可能是用户之前未归档的工作（被 alloy 早期版本遗留 / 用户手动创建 / 同名 change 重启）。

```bash
TARGET_PATH=".claude/worktrees/<name>"
TARGET_BRANCH="worktree-<name>"

if [ -e "$TARGET_PATH" ] || git worktree list --porcelain | grep -qF "worktree $TARGET_PATH"; then
  echo "[PRECONDITION_FAIL] worktree 目标路径已被占用："
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

路径已占用 → **USER_GATE（必须 AskUserQuestion）：**

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
````

**Step 2 注意事项：**

1. `old_string` 必须包含 5 行精确文本（含 markdown 代码块开闭三反引号）
2. `new_string` 内嵌套两个 markdown 代码块（一个 `bash`、一个 `bash`），外层 markdown 不动
3. 引号转义：`new_string` 内 `\"覆盖一下让 apply 继续\"` 是 markdown 文本中的字面双引号，写入文件时必须保留双引号字符（不要让 Edit 工具丢转义）

---

## Task 3: 读修改后内容验证替换正确

**Files:**
- Read: `commands/alloy/apply.md` 第 140-200 行（替换后行号会变）

- [ ] **Step 1: 读修改后的对应段**

读 `commands/alloy/apply.md` 第 140-200 行（替换后约 +33 行），确认：

- [ ] "**用户选择创建：**" 段标题保留（line ~143）
- [ ] PRECONDITION_FAIL 检查段存在，包含 `[PRECONDITION_FAIL]` 字样、bash 块开闭三反引号匹配
- [ ] bash 块内三个 echo 显示路径/目录/git 注册三个状态
- [ ] echo 中包含禁令清单（`git worktree remove --force` / `rm -rf $TARGET_PATH` / `git worktree prune`）
- [ ] 字面措辞 "违反字面 = 违反精神" 出现一次
- [ ] USER_GATE 三选项段（(a) 复用 / (b) 重命名 / (c) 中止）齐全
- [ ] "路径未占用 → 执行创建：" 段存在，原 `git worktree add` 命令仍在 bash 块内
- [ ] 后续 `EnterWorktree(path=...)` 段保留
- [ ] 紧接其后的"创建后状态记录"段（原 line 149-150）未被破坏
- [ ] 紧接其后的"**Step 1/5 完成：**" 框未被破坏

- [ ] **Step 2: 用 grep 校验关键 token 注入**

```bash
grep -n "PRECONDITION_FAIL\|USER_GATE\|违反字面\|git worktree remove --force\|git worktree prune" commands/alloy/apply.md
```

预期至少出现：
- `[PRECONDITION_FAIL]` 字样 1 次（替换段内）
- `USER_GATE`（注释或措辞）1 次
- `违反字面 = 违反精神` 1 次
- `git worktree remove --force` 1 次
- `git worktree prune` 1 次

```bash
grep -nE "选 \(a\)|选 \(b\)|选 \(c\)" commands/alloy/apply.md | grep -A0 worktree
```

预期：替换段内有完整 (a)/(b)/(c) 三选项。

---

## Task 4: 整体结构验证

**Files:**
- Read: `commands/alloy/apply.md`（全文）

- [ ] **Step 1: 通读全文验证结构完整**

读 `commands/alloy/apply.md` 全文（应该约 360 行，原 326 行 + 补丁约 33 行）。检查清单：

- [ ] frontmatter（前 ~17 行）的 `behaviors` 数字**未改动**（阶段 1 约束）
- [ ] markdown 标题层级一致（`##` / `###` / `####` 未错配）
- [ ] 所有 bash / markdown 代码块开闭三反引号匹配
- [ ] Task 2 替换段未与上下文（"用户选择不创建" 分支 / "Step 1/5 完成" 框）冲突
- [ ] 文末"通过 `alloy _guard` 校验并更新 phase"段保留

- [ ] **Step 2: 行数对照**

```bash
wc -l commands/alloy/apply.md
```

预期：约 358-365 行（原 326 + 净增 ~33）。如果差异超过 ±5 行 → 检查是否多删/多增。

---

## Task 5: 回归校验

**Files:**
- Run: `npm run build` `npm test` `node dist/cli/index.js _spec-audit`

- [ ] **Step 1: 编译与单测**

```bash
cd /Users/wenqiu/AIAgent/alloy
npm run build
```

预期：tsc 编译成功，无错误。

```bash
npm test
```

预期：vitest 全量通过（355+ tests）。

- [ ] **Step 2: spec-audit 对账确认 frontmatter 未变**

```bash
node /Users/wenqiu/AIAgent/alloy/dist/cli/index.js _spec-audit
```

预期：apply 的对账状态显示 `✓ apply: spec 与 skill 一致`——本次补丁不改 frontmatter，所以 spec-audit 应保持 PASS。

如果输出报告 apply 出现**新的** frontmatter 差异 → 表明补丁意外改了 frontmatter，回退当前修改重做。

- [ ] **Step 3: 手动验证 PRECONDITION_FAIL 触发（可选 smoke test）**

仅在有现成 phase=approved change 可用时执行。如果没有可跳过（标注为 manual smoke test，不阻断 plan 完成）。

```bash
# 假设有一个 phase=approved 的 change "demo"
# 故意预先创建占用路径
mkdir -p .claude/worktrees/demo
echo "stale" > .claude/worktrees/demo/.marker

# 跑 apply 应在用户选择"创建 worktree"后立刻触发 PRECONDITION_FAIL
/alloy:apply demo
# 预期输出：[PRECONDITION_FAIL] worktree 目标路径已被占用 + 三选项 USER_GATE
# 不预期：自动 rm 或 worktree add 失败后吞错继续

# 清理
rm -rf .claude/worktrees/demo
```

---

## Task 6: 提交

**Files:**
- Modify: `commands/alloy/apply.md`

- [ ] **Step 1: git status 检查**

```bash
cd /Users/wenqiu/AIAgent/alloy
git status
```

预期：
```
On branch fix/beta-0.2.0-optimization
Changes not staged for commit:
  modified:   commands/alloy/apply.md
```

仅一个文件修改。如果有其他文件改动 → 检查是否本任务范围外，必要时回退或先单独提交。

- [ ] **Step 2: git diff 概览**

```bash
git diff --stat commands/alloy/apply.md
```

预期：约 +33-40 / -5 行。

- [ ] **Step 3: commit**

```bash
git add commands/alloy/apply.md
git commit -m "$(cat <<'EOF'
fix(apply): 阶段 1 P0 单条补丁（worktree 路径占用前置检查 + USER_GATE）

- task #10: git worktree add 前增加 PRECONDITION_FAIL 路径占用检查
  路径已存在 → USER_GATE 三选项（复用 / 重命名 / 中止），禁 agent 自动 rm
  嵌入通用 §3.5.1 git 自救禁令措辞 + "违反字面 = 违反精神" 二层防御

阶段 1 最小侵入式补丁：不改 frontmatter / 不补三层防御 / 不画流程图。
对应 design §3.2 commit 2。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 提交后校验**

```bash
git log --oneline -3
git show --stat HEAD
```

预期：HEAD 是新 commit，仅 apply.md 一文件。

---

## Self-Review

**1. Spec coverage:** 本 plan 覆盖 design §3.2 commit 2 的单 task #10。无遗漏。

**2. Placeholder scan:** 扫一遍——
- Task 5 step 3 标注为可选 manual smoke test，不阻断 plan 完成
- 其他 step 全部含具体命令、具体行号、具体代码块
- 无 "TBD" / "implement later" / "similar to Task N" 等占位符

**3. Type consistency:** 本 plan 不涉及 TypeScript 类型，N/A。变量名 `TARGET_PATH` / `TARGET_BRANCH` 在 PRECONDITION_FAIL 检查段定义，后续 echo 引用一致。

**4. 阶段 1 约束遵守：**
- ❌ 不改 frontmatter ✅（Task 4 step 1 校验项）
- ❌ 不补三层防御（不写顶部 Iron Law、不写 Red Flags 表扩展） ✅
- ❌ 不画流程图 ✅
- 仅插入 PRECONDITION_FAIL 检查 + USER_GATE 三选项 ✅

---

## 后续 plan 预告

本 commit 完成后：
- **plan 3：finish.md P0 三连**（task #23 #24 #25）
- 之后进入阶段 2 重写第一轮：archive.md 完整重写（含 frontmatter 迁移、流程图、剩余 P1/P2）
