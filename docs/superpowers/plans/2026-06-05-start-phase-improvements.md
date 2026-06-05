# Start 阶段工作流改进实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 start 阶段分支创建时机、/opsx 命令预检不一致、制品缺少生成时间戳三个问题

**Architecture:** 全部改动限于命令文件（`commands/alloy/`）和模板文件（`openspec/schemas/alloy/templates/`），不涉 TypeScript 源码、schema 图或测试逻辑。四个独立任务可并行执行。

**Tech Stack:** Shell（命令文件） + Markdown（模板文件）

---

### Task 1: 分支前置 — 调整 start.md 步骤顺序

**Files:**
- Modify: `commands/alloy/start.md`（步骤 4-7 顺序调整和重新编号）

**当前流程（第 126 行起）：**
1. 建议 change name → 用户确认
2. 调用 `/opsx:new <name>` 创建 change 目录
3. 按模板生成 `draft.md`
4. 写入 state（`_state init`）+ 记录阶段启动时间
5. 确保 git 仓库就绪
6. **分支选择**
7. 提交（基础设施 + draft）

**目标流程：**
1. 建议 change name → 用户确认
2. 调用 `/opsx:new <name>` 创建 change 目录
3. 写入 state（`_state init`）+ 记录阶段启动时间
4. 确保 git 仓库就绪
5. **分支选择**
6. 按模板生成 `draft.md`
7. 提交（基础设施 + hash 锁定 draft + commit）

- [ ] **Step 1: 重排 start.md 第 126 行起的步骤顺序**

  将步骤 4（_state init + phase_timings）移到前面的 `/opsx:new` 之后：
  - 第 131 行的 `_state init` → 移到步骤 2（`/opsx:new`）之后立即执行
  - 第 136-148 行的阶段启动时间记录 → 跟随 `_state init` 一起提前
  - 步骤 3（生成 draft.md）→ 移到分支选择之后

  具体操作：找到第 126-268 行的用户确认后执行块，将其中：
  - 第 131 行 `alloy _state init` 块 → 放在 `opsx:new` 之后
  - 第 136-148 行 phase_timings 写入 → 跟随 init 之后
  - 第 150-162 行 git 仓库就绪检查 → 保持在此
  - 第 164-237 行分支选择 → 保持在此（成为步骤 4）
  - 第 99-113 行 draft.md 生成模板 → 移到分支选择之后（成为步骤 5）
  - 第 240-268 行提交 → 保持在此（成为步骤 6）

- [ ] **Step 2: 更新步骤编号注释**

  找到文件中所有步骤编号引用并更新：
  - 步骤 4 → 步骤 3（state init）
  - 步骤 5 → 步骤 4（git 仓库）
  - 步骤 6 → 步骤 5（分支选择）
  - 步骤 7 → 步骤 6（提交）
  - 各注释行的 `[Step X/Y]` 标记对应更新

- [ ] **Step 3: 验证步骤流程逻辑**

  通读修改后的 start.md 第 126-268 行，确认以下不变：
  - SESSION_START 在步骤 1 前捕获 → 步骤 3（phase_timings 写入）使用该值
  - 分支选择先确定主分支 → 用户确认 → 创建/切换分支
  - draft.md 在正确分支上生成 → hash 锁定 + git add + git commit
  - `git add` 只用精确路径，不用 `-A`

- [ ] **Step 4: Commit**

  ```bash
  git add commands/alloy/start.md
  git commit -m "refactor: 分支前置至 draft.md 生成之前"
  ```

---

### Task 2: /opsx 预检补充 — start.md + apply.md

**Files:**
- Modify: `commands/alloy/start.md` — 预检新增 `/opsx:new`
- Modify: `commands/alloy/apply.md` — 预检新增 `/opsx:verify`

- [ ] **Step 1: start.md 预检新增 `/opsx:new`**

  找到 start.md 第 47-58 行的预检脚本，在 `for cmd in "opsx/explore"` 行中追加 `/opsx:new`：

  ```bash
  for cmd in "opsx/explore" "opsx/new"; do
  ```

  预期：检测输出变为 `✓ opsx:explore` + `✓ opsx:new` 两行

- [ ] **Step 2: apply.md 预检新增 `/opsx:verify`**

  找到 apply.md 第 61-68 行的预检脚本（for skill 循环之前），新增 `/opsx:verify` 命令检测块。
  参考 plan.md 第 30-35 行的 `opsx:continue` 检测方式，在 apply.md 的 skill 循环之前追加：

  ```bash
  for cmd in "opsx/verify"; do
    if test -f ".claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（项目级 command）"
    elif test -f "$HOME/.claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（用户级 command）"
    else echo "  ✗ ${cmd//\//:} — 未找到"; MISSING=$((MISSING+1)); fi
  done
  ```

  插入位置：apply.md 第 57 行 `**Skill 预检：**` 段落后，第 61 行 `for skill in` 循环之前。

  预期：`MISSING` 变量在技能和命令检测间共享，任一缺失导致 STOP。

- [ ] **Step 3: Commit**

  ```bash
  git add commands/alloy/start.md commands/alloy/apply.md
  git commit -m "fix: 补充 start 和 apply 阶段的 /opsx 命令预检"
  ```

---

### Task 3: 制品头部加生成时间戳

**Files:**
- Modify: `openspec/schemas/alloy/templates/draft.md`
- Modify: `openspec/schemas/alloy/templates/proposal.md`
- Modify: `openspec/schemas/alloy/templates/design.md`
- Modify: `openspec/schemas/alloy/templates/specs.md`
- Modify: `openspec/schemas/alloy/templates/tasks.md`
- Modify: `openspec/schemas/alloy/templates/plans.md`
- Modify: `openspec/schemas/alloy/templates/retrospective.md`

- [ ] **Step 1: draft.md 头部加时间戳**

  文件当前内容（模板 `# [功能名称]` 无时间头），在文件开头插入：

  ```markdown
  > 生成时间: <timestamp>

  # [功能名称]
  ```

- [ ] **Step 2: proposal.md 头部加时间戳**

  文件开头插入：

  ```markdown
  > 生成时间: <timestamp>

  ## Why
  ```

- [ ] **Step 3: design.md 头部加时间戳**

  文件开头插入：

  ```markdown
  > 生成时间: <timestamp>

  ## 架构决策
  ```

- [ ] **Step 4: specs.md 头部加时间戳**

  文件开头插入：

  ```markdown
  > 生成时间: <timestamp>

  <!--
  ```

- [ ] **Step 5: tasks.md 头部加时间戳**

  文件开头插入：

  ```markdown
  > 生成时间: <timestamp>

  ## 实现任务
  ```

- [ ] **Step 6: plans.md 头部加时间戳**

  文件当前以 YAML frontmatter `---` 开头。在 frontmatter 之后、内容之前插入。先读出当前内容精确结构：

  当前：
  ```
  ---
  strategy: sdd
  reason: ...
  ---
  
  # [功能名称] 实现计划
  ```

  改为：
  ```
  ---
  strategy: sdd
  reason: ...
  ---
  
  > 生成时间: <timestamp>
  
  # [功能名称] 实现计划
  ```

- [ ] **Step 7: retrospective.md 头部加时间戳 + §0 表补充**

  文件开头插入：

  ```markdown
  > 生成时间: <timestamp>
  
  # Retrospective
  ```

  同时在第 22 行的全周期时间线表中，retrospective 行的审批时间从空改为 `<timestamp>`（由生成时的实际时间替换）。

- [ ] **Step 8: Commit**

  ```bash
  git add openspec/schemas/alloy/templates/
  git commit -m "docs: 所有制品模板头部加生成时间戳"
  ```

---

### Task 4: retrospective §4 审计清单补充 /opsx:new

**Files:**
- Modify: `openspec/schemas/alloy/templates/retrospective.md` — §4 start 阶段新增 `/opsx:new`
- Modify: `openspec/schemas/alloy/instructions/retrospective.md` — §4 start 阶段新增 `/opsx:new`

- [ ] **Step 1: templates/retrospective.md §4 加 `/opsx:new`**

  找到第 110-114 行的 start 阶段表格，在 `opsx:explore` 和 `superpowers:brainstorming` 之间插入一行：

  ```markdown
  	| `/opsx:new` | |
  	| `opsx:explore` | |
  	| `superpowers:brainstorming` | |
  ```

  修改后：
  ```markdown
  	| 技能/命令 | 使用 |
  	|----------|:---:|
  	| `/opsx:new` | |
  	| `opsx:explore` | |
  	| `superpowers:brainstorming` | |
  ```

- [ ] **Step 2: instructions/retrospective.md §4 同步更新**

  找到第 95-98 行的 start 阶段表格，同样在 `opsx:explore` 前新增一行：

  ```markdown
  	| `/opsx:new` | |
  	| `opsx:explore` | |
  	| `superpowers:brainstorming` | |
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add openspec/schemas/alloy/templates/retrospective.md openspec/schemas/alloy/instructions/retrospective.md
  git commit -m "docs: retrospective §4 审计补充 /opsx:new"
  ```

---

## 自审清单

- [ ] **Spec 覆盖：** 设计文档的三个改动点（分支前置、/opsx 预检、时间戳）均有对应任务
- [ ] **占位符检查：** 无 TBD、TODO、空代码块
- [ ] **路径一致性：** 所有文件路径与实际仓库结构一致
