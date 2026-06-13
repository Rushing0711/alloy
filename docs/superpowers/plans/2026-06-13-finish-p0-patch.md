# finish.md P0 紧急补丁（task #23 #24 #25）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `commands/alloy/finish.md` 加最小侵入式 P0 补丁，关闭 3 个隐患——选项 1 中 `git pull` 失败仅 silent echo 可能让 squash merge 基于过期 main，phase=finished 在 squash merge 前推进但缺降级路径，`git branch -D <feature_branch>` 前未校验变量可能误删 main 分支。

**Architecture:** 阶段 1 紧急补丁不改 frontmatter、不补三层防御、不画流程图——仅在选项 1（本地 merge）+ 选项 2（创建 PR）共享的 phase 推进步骤注释里补降级指引（§5.2.3 路径 B），把 `git pull || echo` 升级为 PRECONDITION_FAIL/USER_GATE，`git branch -D` 前增加变量校验。修改集中在 `finish.md` 一个文件内，单 commit 提交。

**Tech Stack:** Markdown skill 文件 + bash 片段 + alloy CLI（`_spec-audit` 用于回归校验）

**前置阅读：**
- 通用指南 `docs/reference/skill-writing-guide.md` §3.5.1（git 自救命令禁令清单——本补丁里 git pull 失败时 agent 不得自动 reset/checkout）
- 通用指南 `docs/reference/skill-writing-guide.md` §4（PRECONDITION_FAIL / USER_GATE / HARD_STOP 四类术语）
- alloy 项目规范 `docs/reference/alloy-skill-writing-guide.md` §5.2.3（phase 推进早于操作的回滚要求，路径 B：保持在前 + 显式记录降级动作）
- design 文档 `docs/superpowers/specs/2026-06-13-skills-test-and-rewrite-design.md` §3.2 阶段 1 commit 3

**验证策略：** 文档修改无单元测试可写。验证依靠：(1) 修改后内容人工 review；(2) `npm run build` + `npm test` 确认无回归；(3) `node dist/cli/index.js _spec-audit` 确认补丁未意外改 frontmatter（阶段 1 约束）。

---

## File Structure

**修改：** `commands/alloy/finish.md`（单文件，三处修改集中提交）

**修改位置概览：**

| 修改 | 起止行 | 隐患编号 | 新增内容 |
|------|-------|---------|---------|
| A | line 119-124 + line 143-151（选项 1 + 选项 2 共享 phase 推进段） | task #24 | phase 推进前注释 §5.2.3 路径 B 降级指引 |
| B | line 127（`git pull || echo`） | task #23 | git pull 失败 USER_GATE 三选项（重试 / 跳过 pull / 中止） |
| C | line 136（`git branch -D <feature_branch>`） | task #25 | branch -D 前 PRECONDITION_FAIL 变量校验 |

注：选项 1 与选项 2 都有"记录完成时间 + 推进 phase"代码段，task #24 必须**两处都改**。

---

## Task 1: 通读 finish.md 选项 1 / 选项 2 上下文

**Files:**
- Read: `commands/alloy/finish.md` 第 100-160 行

- [ ] **Step 1: 读 finish.md 100-160 行确认实际行号**

读 `commands/alloy/finish.md` 第 100-160 行，理解：
- line 102-139 选项 1 本地 squash merge 全流程（合并确认 → phase 推进 → checkout main → pull → squash → commit → branch -D）
- line 141-152 选项 2 创建 PR（仅 phase 推进 + commit，无 merge/branch -D）
- line 161-163 选项 3 保持分支（不改 phase）

记录三处修改的实际行号供 Task 2-4 使用。注意：当前 finish.md 没有被前两个 commit 改过（archive.md / apply.md），行号应该和原文一致。

---

## Task 2: phase 推进段补降级指引（task #24，选项 1 + 选项 2 两处）

**Files:**
- Modify: `commands/alloy/finish.md` 选项 1 phase 推进段（line 119-124）+ 选项 2 phase 推进段（line 144-151）

### Step 1: 修改选项 1 phase 推进段（line 119-124）

用 Edit 工具替换：

**old_string**：

````
# 记录完成时间 + 推进 phase（在 squash merge 之前）
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
alloy _state merge "$CHANGE_DIR" phase_timings "{\"finish\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
alloy _guard "$CHANGE_DIR" finished --apply
git add -A "$CHANGE_DIR" openspec/config.yaml
git commit -m "chore(<name>): 记录 finish 阶段完成时间"
````

**new_string**：

````
# 记录完成时间 + 推进 phase（在 squash merge 之前——§5.2.3 路径 B）
# [HARD_STOP] phase 推进早于不可逆操作（squash merge / branch -D），失败时必须有降级路径：
#   - 若 squash merge 后续步骤失败 → 用户须手动回滚 phase：
#       alloy _state set "$CHANGE_DIR" phase archived
#       git checkout HEAD~1 -- "$CHANGE_DIR/.alloy.yaml"  # 撤销 phase commit 中的状态变更
#       git reset HEAD~1                                  # 退回 phase commit
#   - 禁止 agent 自动运行 git reset --hard / git checkout . 清场（详见 §3.5.1）。
# 详见 docs/reference/alloy-skill-writing-guide.md §5.2.3 路径 B
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
alloy _state merge "$CHANGE_DIR" phase_timings "{\"finish\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
alloy _guard "$CHANGE_DIR" finished --apply
git add -A "$CHANGE_DIR" openspec/config.yaml
git commit -m "chore(<name>): 记录 finish 阶段完成时间"
````

### Step 2: 修改选项 2 phase 推进段（line 144-151）

用 Edit 工具替换：

**old_string**：

````
ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | sort -r | head -1)
CHANGE_DIR="${ARCHIVE_DIR:-openspec/changes/<name>}"
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
alloy _state merge "$CHANGE_DIR" phase_timings "{\"finish\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
alloy _guard "$CHANGE_DIR" finished --apply
git add -A "$CHANGE_DIR" openspec/config.yaml
git commit -m "chore(<name>): 记录 finish 阶段完成时间"
````

**new_string**：

````
ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | sort -r | head -1)
CHANGE_DIR="${ARCHIVE_DIR:-openspec/changes/<name>}"
COMPLETED_AT=$(date "+%Y-%m-%d %H:%M:%S")
# 选项 2：phase 推进发生在 PR 创建之前。PR 后续被 close / 不合入时，
# 用户须手动 alloy _state set "$CHANGE_DIR" phase archived 回退（§5.2.3 路径 B）。
alloy _state merge "$CHANGE_DIR" phase_timings "{\"finish\":{\"completed_at\":\"${COMPLETED_AT:-$(date '+%Y-%m-%d %H:%M:%S')}\"}}"
alloy _guard "$CHANGE_DIR" finished --apply
git add -A "$CHANGE_DIR" openspec/config.yaml
git commit -m "chore(<name>): 记录 finish 阶段完成时间"
````

### Step 3: 读修改后的两处验证

- 选项 1 phase 推进段：含 `[HARD_STOP]` + 降级路径示例（`alloy _state set` + `git reset HEAD~1`）+ §5.2.3 引用
- 选项 2 phase 推进段：含 `§5.2.3 路径 B` 引用 + PR close 时手动回退提示
- 两处 bash 命令本身（`alloy _state merge` / `alloy _guard ... --apply` / `git add` / `git commit`）未被修改

---

## Task 3: git pull 失败升级为 USER_GATE（task #23）

**Files:**
- Modify: `commands/alloy/finish.md` line 127 + line 139（紧跟选项 1 squash 段尾的说明句）

注意：Task 2 在选项 1 phase 推进段插入了 8 行注释，所以 line 127 已偏移到约 line 135。Task 3 实施前需要重新定位精确行号。

### Step 1: 重新定位 git pull 行

读修改后的 finish.md 第 130-150 行，找到：

```
git checkout <main_branch>
git pull || echo "⚠️ git pull 失败，请手动处理"
git merge --squash <feature_branch>
```

记录精确行号。

### Step 2: 替换 git pull 行 + 选项 1 段尾说明句

用 Edit 工具替换：

**old_string**（精确匹配 3 行）：

````
git checkout <main_branch>
git pull || echo "⚠️ git pull 失败，请手动处理"
git merge --squash <feature_branch>
````

**new_string**：

````
git checkout <main_branch>

# [HARD_STOP] git pull 失败时禁止自动忽略——基于过期 main 做 squash 会污染主分支历史。
# 禁止 agent 在 pull 失败时运行 git reset --hard / git checkout . / git stash 任何一个。
# 详见 docs/reference/skill-writing-guide.md §3.5.1
if ! git pull --ff-only; then
  echo "[PRECONDITION_FAIL] git pull 失败——squash merge 不能基于过期 main"
  echo ""
  echo "  失败原因可能：远端无法访问 / 本地 main 偏离 / 凭证过期"
  echo ""
  echo "  USER_GATE: 选择处理方式"
  echo "    (a) 重试——用户手动修复后再次运行 /alloy:finish"
  echo "    (b) 跳过 pull 直接 squash（仅当用户确认 main 已是最新——风险自负）"
  echo "    (c) 中止 finish——保持当前分支，回退 phase："
  echo "        alloy _state set \"$CHANGE_DIR\" phase archived"
  echo ""
  echo "  禁止：agent 自动运行 git reset --hard origin/<main_branch> 强制对齐。"
  exit 1
fi

git merge --squash <feature_branch>
````

### Step 3: 同步替换段尾"`git pull` 失败时暂停让用户决定"句

定位到现在 finish.md 中的：

```
`git pull` 失败时暂停让用户决定。`git merge --squash` 冲突时列出冲突文件让用户手动解决。
```

用 Edit 工具替换为：

```
`git pull` 失败按上述 USER_GATE 三选项（重试 / 跳过 pull / 中止）处理；agent 不得自动绕过。`git merge --squash` 冲突时列出冲突文件让用户手动解决，禁止 `git merge --abort`（详见 §3.5.1）。
```

### Step 4: 验证

读修改后段，确认：
- `git pull --ff-only` 替换原 `git pull`（防止默认 merge pull 的隐式合并）
- `[PRECONDITION_FAIL]` + USER_GATE 三选项 + 禁令 echo 完整
- `if ! git pull --ff-only; then ... exit 1; fi` 闭合正确，bash 块开闭三反引号未破坏
- 段尾说明句已同步更新

---

## Task 4: branch -D 前变量校验（task #25）

**Files:**
- Modify: `commands/alloy/finish.md` 选项 1 段尾 `git branch -D <feature_branch>` 行（Task 2/3 后偏移）

### Step 1: 重新定位 branch -D 行

读修改后的 finish.md 第 150-180 行，找到：

```
git commit -m "$(cat <<EOF
chore(<name>): 合入 main（squash merge）

${COMMIT_LOG}
EOF
)"
git branch -D <feature_branch>
```

记录 `git branch -D <feature_branch>` 行的精确行号。

### Step 2: 在 branch -D 前插入变量校验

用 Edit 工具替换：

**old_string**：

````
${COMMIT_LOG}
EOF
)"
git branch -D <feature_branch>
````

**new_string**：

````
${COMMIT_LOG}
EOF
)"

# [PRECONDITION_FAIL] git branch -D 前必须校验变量——
# <feature_branch> 是模板占位符，agent 在执行前必须替换为实际分支名。
# 如果替换缺失或意外指向 main_branch，强删会丢失主分支引用。
if [ -z "<feature_branch>" ] || [ "<feature_branch>" = "<main_branch>" ] || [ "<feature_branch>" = "main" ] || [ "<feature_branch>" = "master" ]; then
  echo "[PRECONDITION_FAIL] feature_branch 变量未替换或与主分支同名，拒绝执行 git branch -D"
  echo "  feature_branch=<feature_branch>"
  echo "  main_branch=<main_branch>"
  echo "  禁止：agent 自动猜测分支名继续执行。退出 skill 让用户检查 .alloy.yaml。"
  exit 1
fi
git branch -D <feature_branch>
````

注意：这里的 `<feature_branch>` / `<main_branch>` 是 alloy skill 文档约定的占位符，agent 在实际执行时会替换为具体分支名。校验逻辑在替换后才有意义——如果替换失败，分支名仍是字面 `<feature_branch>` 字符串，会被 `[ "<feature_branch>" = "<main_branch>" ]` 比较（字面相等触发 PRECONDITION_FAIL，因为字面相同 → 视为未替换）。这是文档级保护，运行时主要靠 agent 自检。

### Step 3: 验证

读修改后段，确认：
- branch -D 前 11 行 PRECONDITION_FAIL 注释 + bash 校验块完整
- 校验条件覆盖三种危险情况：变量空 / 等于 main_branch / 等于 main/master 字面值
- 原 `git branch -D <feature_branch>` 行保留在 if 块之后
- bash 块开闭三反引号未破坏

---

## Task 5: 整体结构验证

**Files:**
- Read: `commands/alloy/finish.md`（全文）

- [ ] **Step 1: 通读全文验证结构完整**

读 `commands/alloy/finish.md` 全文（应该约 215 行，原 181 行 + 三处补丁约 34 行）。检查清单：

- [ ] frontmatter（前 13 行）的 `behaviors` 数字**未改动**（阶段 1 约束）
- [ ] markdown 标题层级一致（`##` / `###` / `####` 未错配）
- [ ] 选项 1 段内 bash 代码块开闭三反引号匹配（含 squash + commit 块）
- [ ] 选项 2 段内 bash 代码块开闭三反引号匹配
- [ ] Task 2-4 三处修改之间无重复或冲突段落
- [ ] 文末"finish 不产生额外 commit"段保留

- [ ] **Step 2: 用 grep 校验关键 token 注入**

```bash
grep -n "PRECONDITION_FAIL\|HARD_STOP\|HARD STOP" commands/alloy/finish.md
```

预期至少出现：
- 选项 1 phase 推进段 `[HARD_STOP]` 注释（Task 2 step 1）
- git pull 段 `[PRECONDITION_FAIL]` echo（Task 3 step 2）
- git pull 段 `[HARD_STOP]` 注释（Task 3 step 2）
- branch -D 段 `[PRECONDITION_FAIL]` echo（Task 4 step 2）
- 段尾说明句更新（Task 3 step 3）

至少 4 处。

```bash
grep -n "§5.2.3\|§3.5.1\|路径 B" commands/alloy/finish.md
```

预期：选项 1 phase 推进段引用 §5.2.3 路径 B + §3.5.1，选项 2 phase 推进段引用 §5.2.3 路径 B，git pull 段引用 §3.5.1。至少 3 处。

```bash
grep -n "git pull --ff-only\|git reset --hard\|git merge --abort" commands/alloy/finish.md
```

预期：`git pull --ff-only` 1 次、`git reset --hard` 1 次（禁令文案）、`git merge --abort` 1 次（段尾说明）。

```bash
wc -l commands/alloy/finish.md
```

预期：约 213-218 行（原 181 + 净增 ~34）。

---

## Task 6: 回归校验

**Files:**
- Run: `npm run build` `npm test` `node dist/cli/index.js _spec-audit`

- [ ] **Step 1: 编译与单测**

```bash
cd /Users/wenqiu/AIAgent/alloy
npm run build
```

预期：tsc 编译成功。

```bash
npm test
```

预期：vitest 全量通过（355 tests）。

- [ ] **Step 2: spec-audit 对账确认 frontmatter 未变**

```bash
node /Users/wenqiu/AIAgent/alloy/dist/cli/index.js _spec-audit
```

预期：finish 显示 `✓ finish: spec 与 skill 一致`。

如果输出报告 finish 出现**新的** frontmatter 差异 → 回退当前修改重做。

---

## Task 7: 提交

**Files:**
- Modify: `commands/alloy/finish.md`

- [ ] **Step 1: git status 检查**

```bash
cd /Users/wenqiu/AIAgent/alloy
git status
```

预期：仅 `commands/alloy/finish.md` 修改。

- [ ] **Step 2: commit**

```bash
git add commands/alloy/finish.md
git commit -m "$(cat <<'EOF'
fix(finish): 阶段 1 P0 三连补丁（pull USER_GATE / phase 降级 / branch -D 校验）

- task #23: git pull 失败从 silent echo 升级为 PRECONDITION_FAIL + USER_GATE 三选项
  改用 git pull --ff-only 防止隐式 merge pull 污染本地 main
- task #24: 选项 1 + 选项 2 phase 推进段补 §5.2.3 路径 B 降级指引
  失败时给出 alloy _state set + git reset HEAD~1 手动回退命令
- task #25: git branch -D 前 PRECONDITION_FAIL 变量校验
  拦截空值 / 等于主分支字面值的三种危险情况

阶段 1 最小侵入式补丁：不改 frontmatter / 不补三层防御 / 不画流程图。
对应 design §3.2 commit 3。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: 提交后校验**

```bash
git log --oneline -5
git show --stat HEAD
```

预期：HEAD 是新 commit，仅 finish.md 一文件。

---

## Self-Review

**1. Spec coverage:** 本 plan 覆盖 design §3.2 commit 3 的三个 task：#23 (Task 3) / #24 (Task 2 两处) / #25 (Task 4)。

**2. Placeholder scan:** 扫一遍——
- Task 1 仅"读上下文"，但记录精确行号供后续使用，不算 placeholder
- Task 3 step 1 / Task 4 step 1 让 implementer 重新定位行号，因为前面 Task 会让行号偏移——这是合法的 dynamic locating，非 TBD
- 其他 step 全部含具体命令、具体代码块

**3. Type consistency:** 本 plan 不涉及 TypeScript 类型，N/A。

**4. 阶段 1 约束遵守：**
- ❌ 不改 frontmatter ✅
- ❌ 不补三层防御（不写 Iron Law / 不写 Red Flags 表扩展） ✅
- ❌ 不画流程图 ✅
- 仅插入 PRECONDITION_FAIL / HARD_STOP 措辞 + USER_GATE + 修改判断逻辑 ✅

**5. 三 task 顺序合理性：** Task 2 → 3 → 4 严格按行号正序进行（line 119 / 127 / 136），每完成一处后续行号偏移可控。Task 3/4 step 1 显式让 implementer 重新定位，避免行号失效。

---

## 后续工作

本 commit 完成后，**阶段 1 P0 紧急补丁全部完成**（archive / apply / finish 三个 commit）。

下一步进入 **阶段 2：按规范统一重写**——按 design §3.4 的顺序：
1. archive 完整重写（含 frontmatter 迁移到新四字段、流程图、剩余 P1/P2）
2. finish 完整重写
3. apply 完整重写
4. plan 完整重写
5. start 完整重写

阶段 2 会推翻阶段 1 部分注释（在更系统的三层防御里重新组织），但阶段 1 的 PRECONDITION_FAIL / USER_GATE 检查逻辑会保留。
