# archive.md P0 紧急补丁（task #8 #9 #20）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `commands/alloy/archive.md` 加最小侵入式 P0 补丁，关闭 3 个最危险隐患——merge 冲突时 agent 自动 abort、memory 批量写入污染全局、入口未检查 git status clean。

**Architecture:** 阶段 1 紧急补丁不改 frontmatter、不补三层防御、不画流程图——仅插入 HARD_STOP 措辞、PRECONDITION_FAIL 检查、修改判断逻辑。三处修改集中在 archive.md 一个文件内，单 commit 提交。

**Tech Stack:** Markdown skill 文件 + bash 片段 + alloy CLI（`_spec-audit` 用于回归校验）

**前置阅读：**
- 通用指南 `docs/reference/skill-writing-guide.md` §3.5.1（git 自救命令禁令清单与标准措辞）
- alloy 项目规范 `docs/reference/alloy-skill-writing-guide.md` §5.2.2（memory 批量写入禁令）
- design 文档 `docs/superpowers/specs/2026-06-13-skills-test-and-rewrite-design.md` §3.2 阶段 1 commit 1

**验证策略：** 文档修改无单元测试可写。验证依靠：(1) 修改后内容人工 review；(2) `npm run build` + `npm test` 确认无回归；(3) `node dist/cli/index.js _spec-audit` 确认补丁未意外改 frontmatter（阶段 1 约束）。

---

## File Structure

**修改：** `commands/alloy/archive.md`（单文件，三处修改集中提交）

**修改位置概览：**

| 修改 | 起止行 | 隐患编号 | 新增内容 |
|------|-------|---------|---------|
| A | line 49 之后（"## 前置检查" 内） | task #20 | 入口 git status clean PRECONDITION_FAIL 检查 |
| B | line 113-121 段落整体替换 | task #9 | memory 写入逐条 USER_GATE，删除"写入所有"批量选项 |
| C | line 153 之前 + line 167-170 替换 | task #8 | merge 操作前嵌入 git 自救禁令 + 冲突时不允许 abort |

---

## Task 1: 入口加 git status clean 前置检查（task #20）

**Files:**
- Modify: `commands/alloy/archive.md`（在 line 49 当前 "## 前置检查" 段落之后、line 50 "0. Skill 预检" 之前插入"-1. Worktree 清洁度检查"小节）

- [ ] **Step 1: 通读上下文**

读 `commands/alloy/archive.md` 第 47-77 行（"## 前置检查" 整段），理解现有的 0/1/2 三步前置检查结构。

- [ ] **Step 2: 在前置检查段插入"-1. Worktree 清洁度"小节**

定位到 line 56（关闭 Phase 框 markdown 的 `└──` 那行）和 line 58（"**0. Skill 预检：**"）之间的空行。在该空行之后、`**0. Skill 预检：**` 之前插入：

```markdown
**-1. Worktree 清洁度检查（PRECONDITION_FAIL）：**

archive 阶段会 commit 归档变更并合并 worktree——任何未 commit 的非 spec/changes 路径变更会污染合并结果。入口必须保证 worktree 干净。

```bash
DIRTY=$(git status --porcelain -uno)
if [ -n "$DIRTY" ]; then
  echo "[HARD STOP] worktree 有未提交变更，archive 拒绝执行："
  git status --short
  echo ""
  echo "请先 commit 或 stash 这些变更（注意：禁止使用 git stash drop / git checkout . / git restore . 清空），再运行 /alloy:archive。"
  exit 1
fi
```

跳过 untracked 文件（`-uno`）——untracked 不会被 commit/merge 影响 archive 流程。

```

确切的插入用 Edit 工具，old_string 是 line 56-58 区间的精确文本（含 Phase 框收尾和 `**0. Skill 预检：**` 行起点）。新内容夹在中间，不破坏原有结构。

- [ ] **Step 3: 读修改后的内容验证插入正确**

读 `commands/alloy/archive.md` 第 47-90 行，确认：
- "-1. Worktree 清洁度检查" 小节出现在 "0. Skill 预检" 之前
- bash 代码块语法完整（开闭三反引号匹配）
- 没有破坏后续 0/1/2 步骤的编号和缩进

---

## Task 2: memory 写入改逐条 USER_GATE（task #9）

**Files:**
- Modify: `commands/alloy/archive.md` line 113-121（"memory 写入确认（阻塞点）" 整段）

- [ ] **Step 1: 通读 memory 写入段上下文**

读 `commands/alloy/archive.md` 第 110-125 行，理解现有逻辑：line 111 "读取 retrospective.md §6 Promote Candidates" + line 113-121 STOP 选项段。

- [ ] **Step 2: 替换 memory 写入 STOP 段为逐条 USER_GATE**

用 Edit 工具替换以下区间：

**old_string**（line 113-121）：

```markdown
**memory 写入确认（阻塞点）：**

> 以下 retrospective 条目标记为 Promote to memory：
> [列出待写入条目及内容摘要]
> 🔴 STOP: 确认 memory 写入（确认写入 / 调整——选择要排除的条目 / 跳过 memory 写入）

- 选 (a)：写入所有条目
- 选 (b)：用户指定排除条目后写入剩余
- 选 (c)：跳过 memory 写入
```

**new_string**：

```markdown
**memory 写入逐条确认（USER_GATE）：**

retrospective.md §6 Promote Candidates 中的每一条标记为 `→ Promote to: memory` 的条目，必须**逐条**通过 AskUserQuestion 确认，禁止一次性"全部写入"批量授权。

```
[HARD STOP] retrospective Promote Candidates 禁止批量写入 memory。
每条候选条目必须独立调用 AskUserQuestion 确认（写入 / 跳过 / 修改后写入）。

违反字面 = 违反精神：哪怕看似"全部都对"，也算违反禁令——
单次确认无法承担全局污染风险（参见 alloy-skill-writing-guide.md §5.2.2）。
```

逐条流程：

1. 解析 retrospective.md §6，提取每条 `→ Promote to: memory` 候选条目
2. 对每条候选**单独**调用 AskUserQuestion，问题模板：

   > 候选 [N/M]：写入 ~/.claude/memory/?
   > 内容：[Why + How to apply 摘要]
   > 选项：(a) 写入  (b) 跳过  (c) 修改后写入

3. 用户选 (a) → 立即写入对应 memory 文件
4. 用户选 (b) → 跳过该条，记录到 retrospective.md 末尾的 "Skipped from memory promotion" 章节
5. 用户选 (c) → 让用户提供调整后的 Why/How 文本，写入修改版
6. 全部条目处理完后输出汇总：N 条写入、M 条跳过、K 条修改后写入

无 Promote Candidates 时跳过本步骤。
```

- [ ] **Step 3: 读修改后的内容验证替换正确**

读 `commands/alloy/archive.md` 第 110-145 行（替换后行号会变），确认：
- 旧的 "选 (a) 写入所有条目" 段已被删除
- 新内容包含 "[HARD STOP]" + "违反字面 = 违反精神" 双层防御措辞
- "逐条流程" 6 步清晰可执行
- 后续 "Worktree 清理" 段落（原 line 123）未被破坏

---

## Task 3: merge 操作前嵌入 git 自救禁令（task #8）

**Files:**
- Modify: `commands/alloy/archive.md` line 150-153（merge 命令前）+ line 167-170（merge 失败分支）

- [ ] **Step 1: 通读 worktree 合并块上下文**

读 `commands/alloy/archive.md` 第 123-175 行，理解 worktree 清理整段——entry 检查 / state 读取 / merge / 成功分支（line 155-166）/ 失败分支（line 167-170）。

- [ ] **Step 2: 在 merge 命令前插入 git 自救禁令**

用 Edit 工具修改 line 150-153：

**old_string**：

```markdown
  # 从 worktree 分支合并代码到 feature 分支
  MAIN_ROOT=$(cd "$WORKTREE_PATH" && git rev-parse --show-toplevel 2>/dev/null)
  cd "$MAIN_ROOT"
  git merge "$WORKTREE_BRANCH" --no-edit
```

**new_string**：

```markdown
  # 从 worktree 分支合并代码到 feature 分支
  # [HARD_STOP] 冲突或失败时禁止运行 git merge --abort、git rebase --abort、
  # git reset --hard、git checkout .、git restore .、git stash、git clean -fd、
  # git push --force 任何一个。违反字面 = 违反精神：哪怕看似"清理一下让流程继续"，
  # 也算违反禁令——退出 skill 让用户处理是唯一合法路径。
  # 详见 docs/reference/skill-writing-guide.md §3.5.1
  MAIN_ROOT=$(cd "$WORKTREE_PATH" && git rev-parse --show-toplevel 2>/dev/null)
  cd "$MAIN_ROOT"
  git merge "$WORKTREE_BRANCH" --no-edit
```

- [ ] **Step 3: 替换 merge 失败分支，从 silent exit 升级为强制 USER_GATE**

用 Edit 工具修改 line 167-170：

**old_string**：

```markdown
  else
    echo "  ⚠ merge 冲突，请手动解决后再继续"
    exit 1
  fi
```

**new_string**：

```markdown
  else
    # [HARD_STOP] merge 冲突时禁止运行 git merge --abort 或任何 git 自救命令。
    # 必须报告冲突现场后调用 USER_GATE 让用户决定。
    echo "  ⛔ merge 冲突——worktree 工作未合入 feature 分支"
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
```

- [ ] **Step 4: 读修改后的内容验证两处替换正确**

读 `commands/alloy/archive.md` 第 145-185 行（替换后行号会变），确认：
- merge 命令前 5 行注释完整且语义清晰
- merge 失败分支输出包含"冲突现场"+"合法路径"+"禁止"三段
- 退出码仍是 `exit 1`
- 后续 `fi` 闭合正确，未破坏更外层 `if [ "$WORKTREE_PATH" != "null" ]` 块

---

## Task 4: 整体结构验证

**Files:**
- Read: `commands/alloy/archive.md`（全文）

- [ ] **Step 1: 通读全文验证结构完整**

读 `commands/alloy/archive.md` 全文（应该约 250 行，原 215 行 + 三处补丁约 35 行）。检查清单：

- [ ] frontmatter `behaviors.stops/hard_stops` 数字**未改动**（阶段 1 约束）
- [ ] markdown 标题层级一致（`##` / `###` / `####` 未错配）
- [ ] 所有 bash 代码块开闭三反引号匹配
- [ ] Task 1 / Task 2 / Task 3 三处修改之间无重复或冲突段落
- [ ] 文末"代码合入由 /alloy:finish 处理"提示语保留

- [ ] **Step 2: 用 grep 校验关键 token 注入**

```bash
grep -n "HARD_STOP\|HARD STOP" /Users/wenqiu/AIAgent/alloy/commands/alloy/archive.md
```

预期输出（行号会因之前修改而偏移，但 token 必须出现）：
- "Worktree 清洁度检查（PRECONDITION_FAIL）" 段（Task 1）
- "memory Promote Candidates 禁止批量写入" HARD_STOP 块（Task 2）
- worktree merge 命令前 HARD_STOP 注释（Task 3 step 2）
- merge 失败分支 HARD_STOP 注释（Task 3 step 3）

至少 4 处出现。

```bash
grep -n "git merge --abort\|git reset --hard\|git restore\|git stash" /Users/wenqiu/AIAgent/alloy/commands/alloy/archive.md
```

预期：至少在 worktree merge 段（Task 3）出现一次完整禁令清单。

```bash
grep -n "违反字面 = 违反精神\|违反字面=违反精神" /Users/wenqiu/AIAgent/alloy/commands/alloy/archive.md
```

预期：至少 2 处（Task 2 memory 段 + Task 3 merge 段）。

---

## Task 5: 回归校验

**Files:**
- Run: `npm run build` `npm test` `node dist/cli/index.js _spec-audit`

- [ ] **Step 1: 编译与单测**

```bash
cd /Users/wenqiu/AIAgent/alloy
npm run build
```

预期：tsc 编译成功，无错误（archive.md 是 markdown，不影响编译，但 build 顺带验证 TS 源码状态）。

```bash
npm test
```

预期：vitest 全量通过。skill markdown 不在测试覆盖内，但确认现有 CLI/core 测试无回归。

- [ ] **Step 2: spec-audit 对账确认 frontmatter 未变**

```bash
node /Users/wenqiu/AIAgent/alloy/dist/cli/index.js _spec-audit
```

预期：archive 的对账状态与补丁前一致——本次补丁不改 frontmatter，所以差异（若有）应该和 commit 前完全相同。

如果输出报告 archive 出现**新的** frontmatter 差异 → 表明补丁意外改了 frontmatter，回退当前修改重做。

- [ ] **Step 3: 手动验证 PRECONDITION_FAIL 触发（最小路径）**

仅在有现成 archived-ready change 可用时执行。如果没有可跳过（标注为 manual smoke test，不阻断 plan 完成）。

```bash
# 假设有一个 phase=applied 的 change 在 worktree 里
# 故意 dirty worktree
echo "// dirty marker" >> some-file.ts
# 跑 archive 应该立刻 [HARD STOP] 退出
/alloy:archive <change-name>
# 预期：输出 [HARD STOP] worktree 有未提交变更 + git status --short
# 不预期：进入 0. Skill 预检
# 清理 dirty marker
git checkout some-file.ts
```

---

## Task 6: 提交

**Files:**
- Modify: `commands/alloy/archive.md`

- [ ] **Step 1: git status 检查**

```bash
cd /Users/wenqiu/AIAgent/alloy
git status
```

预期：
```
On branch fix/beta-0.2.0-optimization
Changes not staged for commit:
  modified:   commands/alloy/archive.md
```

仅一个文件修改。如果有其他文件改动 → 检查是否本任务范围外，必要时回退或先单独提交。

- [ ] **Step 2: git diff 概览**

```bash
git diff --stat commands/alloy/archive.md
```

预期：约 +35/-10 行（具体数字取决于精确措辞，但应在此量级）。

- [ ] **Step 3: commit**

```bash
git add commands/alloy/archive.md
git commit -m "$(cat <<'EOF'
fix(archive): 阶段 1 P0 三连补丁（git status 前置 / memory 逐条 / merge 禁 abort）

- task #20: 入口加 PRECONDITION_FAIL，git status -uno 必须 clean
- task #9: memory 写入改逐条 USER_GATE，删除"写入所有"批量选项
  嵌入 alloy-skill-writing-guide.md §5.2.2 memory 批量禁令措辞
- task #8: worktree merge 前嵌入通用 §3.5.1 git 自救禁令清单
  merge 冲突分支强制报告现场 + 列合法路径，禁 agent 自动 abort

阶段 1 最小侵入式补丁：不改 frontmatter / 不补三层防御 / 不画流程图。
对应 design §3.2 commit 1。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: 提交后校验**

```bash
git log --oneline -3
git show --stat HEAD
```

预期：HEAD 是新 commit，仅 archive.md 一文件。

---

## Self-Review

**1. Spec coverage:** 本 plan 覆盖 design §3.2 commit 1 的三个 task：#8 (Task 3) / #9 (Task 2) / #20 (Task 1)。所有 P0 task 已分配到具体 Task。

**2. Placeholder scan:** 扫一遍——
- Task 2 step 2 的 new_string 内嵌"[Why + How to apply 摘要]"是模板提示文字（用户填写位置），不是 placeholder
- Task 5 step 3 标注为可选 manual smoke test，不阻断 plan 完成
- 其他 step 全部含具体命令、具体行号、具体代码块

**3. Type consistency:** 本 plan 不涉及 TypeScript 类型，N/A。

**4. 阶段 1 约束遵守：**
- ❌ 不改 frontmatter ✅
- ❌ 不补三层防御（不写顶部 Iron Law、不写 Red Flags 表扩展） ✅
- ❌ 不画流程图 ✅
- 仅插入 HARD_STOP 措辞、PRECONDITION_FAIL 检查、修改判断逻辑 ✅

---

## 后续 plan 预告

本 commit 完成后：
- **plan 2：apply.md P0 单条**（task #10）
- **plan 3：finish.md P0 三连**（task #23 #24 #25）
- 之后进入阶段 2 重写第一轮：archive.md 完整重写（含 frontmatter 迁移、流程图、剩余 P1/P2）
