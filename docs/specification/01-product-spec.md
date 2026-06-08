# Alloy 设计文档

> **目标读者：** 人类开发者 + AI Agent
> **职责：** Alloy 完整产品规格——这是 Alloy 的"真相源"。Alloy 是什么、怎么用、为什么这样设计，都以本文档为准。
> **不放入：** 构建/测试命令 → 见 [alloy-dev-guide.md](../handbook.md)；Skill 编写经验 → 见 [skill-writing-guide.md](../reference/skill-writing-guide.md)；设计推导过程 → 见 [workflow-design.md](../background/03-workflow-evolution.md)；开发背景 → 见 [project-background.md](../background/01-origin.md)。

Alloy 是一套融合 OpenSpec 和 Superpowers 的开发工作流工具。入口在 AI Agent 内部（Claude Code、Cursor 等），CLI 辅助初始化和诊断。

---

## 一、命令参考

### CLI 命令（终端执行）

| 命令 | 参数 | 说明 |
|------|------|------|
| `alloy init` | `[path]` | 项目初始化：检测环境 → 安装依赖 → 部署 schema + skill |
| | `--scope <global\|project>` | 安装范围，默认 project |
| | `--inject-claude-md` | 注入 CLAUDE.md（默认关闭） |
| | `--agents <id,id,...>` | 非交互式模式，指定 AI 工具（逗号分隔），默认交互式多选 |
| `alloy status` | `[path\|name] [--json]` | 查看活跃 change 总览，指定 name 查看详情 |
| | `--json` | JSON 格式输出 |
| `alloy doctor` | `[path]` | 诊断：版本兼容性、文件一致性 |
| | `--json` | JSON 格式输出 |
| `alloy update` | `[path]` | 自动检测 scope，重新部署 skill + schema。用户模式（npm 发布版）检查 npm registry 新版本；开发模式（本地 .git 存在）直接部署本地 dist |
| `alloy completion` | `[bash\|zsh\|pwsh\|powershell] [--install]` | 生成 shell 补全脚本，--install 自动注册 |
| `alloy --version`, `-v` | | 版本号 |
| `alloy --help`, `-h` | | 帮助 |

**内部命令（Agent 调用，用户不直接使用）：**

| 命令 | 说明 |
|------|------|
| `alloy _state` | 读写 `.alloy.yaml` 状态文件（`read\|write\|init\|check`） |
| `alloy _guard` | 阶段转换校验 + phase 推进（校验 hash 一致性后 `--apply` 推进） |
| `alloy _record` | 制品 hash 记录管理（`compute\|write\|check\|approver`） |
| `alloy _config` | 读写 `openspec/config.yaml` 项目级配置（`read\|write`） |

### Slash Command（Agent 内部执行）

| 命令 | 参数 | 说明 |
|------|------|------|
| `/alloy:start` | `[topic]` | 智能入口：自动检测状态，接续或新建 |
| `/alloy:plan` | `[name]` | 制品生成设计文档，始终分步，每步可审查 |
| `/alloy:apply` | `[name]` | 执行：隔离 worktree → SDD → 代码验证 → 制品验证 → 复盘 |
| `/alloy:archive` | `[name]` | 归档：sync delta spec → 合并主 spec → 移入 archive/ |
| `/alloy:finish` | `[name]` | 收尾：代码合入 + 现场清理（merge / PR / keep） |
| `/alloy:fix` | — | Bug 修复入口：环境感知 → 根因诊断（含 spec 拦截） → 三分支修复 |
| `/alloy:discard` | `[name]` | 放弃当前 change，清理 worktree + 分支 + 目录 |
| `/alloy:status` | `[name]` | 查看指定 change 的阶段、制品状态、下一步 |

带 `[name]` 的命令省略时从当前活跃 change 的上下文推断。

**上下文推断：** 扫描 `openspec/changes/*/.alloy.yaml` → 仅 1 个活跃 change 自动选中 → 多个则提示选择 → 无活跃 change 报错，提示先 `alloy start`。

---

## 二、命令行为

### alloy start

```
/alloy:start [topic]

状态检测:
  → 检查 openspec/config.yaml 是否存在（项目就绪标记）
  → 不存在则引导运行 alloy init
  → 扫描 openspec/changes/*/.alloy.yaml（活跃 change）

无活跃 change + 有 topic:
  → 全新开始: explore + brainstorming → draft.md（唯一产出，包含 Why/What/关键决策/范围边界）
  → brainstorming 的详细设计论述写入 draft.md"关键决策"章节，不单独产出 superpowers spec 文件
  → brainstorming 确认后，由 Agent 建议 kebab-case change name，用户确认后调用 `/opsx:new` 创建 change 目录 + `alloy _state init` 写入初始状态
  → git 仓库就绪：已有项目跳过；空项目先 git init → 基础设施 commit（锚点，确保可创建分支）
  → 分支选择（3 级自动检测主分支）:
    ① `git symbolic-ref refs/remotes/origin/HEAD` → 远程 HEAD
    ② `git config --get init.defaultBranch` → 本地配置
    ③ `git branch --list main master` → 名称匹配
    → 用户 Y/n 确认主分支 → 写入 openspec/config.yaml（`alloy.main_branch`）
    → 检测当前分支位置：
      - 在主分支上 → HARD STOP（不允许在主分支开发），只展示"新建分支"
      - 在 feature 分支且名称含 change 名 → 提示可沿用
      - 在非主分支的已有分支上 → 展示选项
    → 选项：切换到已有非主分支 / 新建 feature 分支（默认 feature/<change-name>）
  → 分支确认后写入 `.alloy.yaml`（`phase=started`，`feature_branch`，`worktree=null`）
  → hash+commit（draft.md + .alloy.yaml），已有项目同步提交 alloy init 基础设施文件
    （`.claude/` `.gitignore` `openspec/`，含 `CLAUDE.md` 如已注入），
    确保全部内容落在正确分支上。`.superpowers/` 已由 `.gitignore` 忽略
  → draft.md 存放在 change 目录内（openspec/changes/<name>/draft.md），非项目根目录

无活跃 change + 无 topic:
  → Agent 扫描项目上下文（README、requirement.md、已有代码等）
    ├── 有上下文 → 基于项目信息引导，提出建议方向或追问
    └── 空项目无可读上下文 → "请提供主题: alloy start <topic>"

有 1 个活跃 change:
  → 自动接续，从 phase 断点继续

有多个活跃 change:
  → 列出所有活跃 change，用户选择接续哪个

--new <topic>:
  → 无论是否有活跃 change，直接开始新 change 流程
  → 多个 change 可并行 planning，但不能同时 apply（一个 session 只能有一个工作中的 worktree）
```

### alloy plan

```
/alloy:plan [name]（省略时从当前活跃 change 推断）

前置检查: change 目录存在且 .alloy.yaml phase=started（/alloy:start 已完成）

若 phase 不匹配:
  → planned → 自动路由到 /alloy:apply
  → applied → 自动路由到 /alloy:apply
  → archived → 自动路由到 /alloy:finish
  → 唯一 HARD STOP：change 目录不存在、draft.md 缺失（前序阶段完全没做）

若指定 name 但 change 不存在:
  → ⚠️ "未找到 change '<name>'，请先运行 /alloy:start <topic> 创建"

若有活跃 change 但 draft.md 缺失:
  → ⚠️ 提示异常，引导重新运行 /alloy:start

流程:
  1. 确认 change 已存在 → 读取 .alloy.yaml 确认 phase=started
     （无需创建 change —— /alloy:start 已完成这一步）
  2. 制品进度扫描 → 扫描已有制品（文件存在 + hash 有效），跳过已完成，
     从第一个缺失制品开始生成
  3. 调用 /opsx:continue → 利用 schema DAG 按依赖顺序制品生成
  4. 制品进度扫描在生成前执行，从第一个缺失制品开始，跳过已审批制品
制品生成: proposal → design → specs → tasks（/opsx:continue 停在 tasks）
  5. 调用 superpowers:writing-plans → 按原始流程生成 plans.md（含末尾执行交接），
     writing-plans 自行决定策略并写入 frontmatter。路径强制设为 openspec/changes/<name>/plans.md（非默认的 docs/superpowers/plans/）。alloy 不在 plan 阶段询问策略——apply 阶段读取 frontmatter 并给用户确认
每步生成后有审查窗口，可确认或要求修改
始终分步，不提供一键生成

审查期间可沟通调整。用户选 (b) 说明修改点后，AI 内部评估修改性质，然后呈现确认选项：
(a) 确认变更，回溯到 brainstorming / (b) 取消变更，继续当前审查。用户始终掌握最终决定权。
plan 阶段处理"构建什么"，任何需求/设计层面的调整统一回到 brainstorming 重新审视
（在当前 change 内，不创建新 change），不做就地修补。plan 完成后不允许手动修改制品文件。

**plans.md 定位：** 执行脚本，非规格文档。tasks.md 是"做什么"的清单（给人确认），
plans.md 是"怎么做"的剧本（给 Agent 执行，2-5 分钟微步骤粒度，可含代码片段）。
规格（specs/）是行为契约，plans.md 是执行路线图，两者不可混淆。

**制品生成时禁止打印 instructions。** 审查窗口只展示制品内容本身，不展示 OpenSpec schema 的
instructions 模板——instructions 是给 Agent 的内部指引，不是给用户审查的输出。

**一个制品，一次提交：** 每个制品审查通过后，立即 hash-lock 并单独 git commit（而非等所有制品完成后一次性提交）。records 记录每个制品的 commit hash，确保 apply 阶段 worktree 创建时所有制品可被带入。全部提交完成后，通过 guard 校验推进 phase。
phase → planned
```

### alloy apply

```
/alloy:apply [name]（省略时从当前活跃 change 推断）

前置检查（3 项 + phase 路由）:
  1. plans.md 存在
  2. alloy _guard 确认 phase：
     ├── started → 自动路由到 /alloy:plan
     ├── planned → 通过，继续执行
     ├── applied → 通过（重入），步骤幂等处理断点
     └── archived → 自动路由到 /alloy:finish
  3. git 仓库检测 — 不是仓库时，展示选项让用户选择立即初始化还是稍后自行处理

技能预检（6 个 Superpowers 技能可用性，缺一 STOP）

需求变更闸门：apply 阶段用户提出需求/设计变更时，检查 tasks.md checkbox：
全部 unchecked（未开始编码）→ 允许回溯到 brainstorming（当前 change 内）；
有 [x]（已开始编码）→ 拒绝，应开新 change。
详见 apply.md"需求变更处理"段落。

执行步骤（共 5 步，每步自带幂等检查，验证失败回到 Step 2 修复）:
  1. 隔离环境设置：
     - 使用 superpowers:using-git-worktrees 技能（用户选择"是/否"）
     - 用户选"是" → 创建 .claude/worktrees/<name> worktree，分支名 worktree-<name>
     - 用户选"否" → worktree 字段设为 "skipped"，在当前分支直接工作
     - 幂等检查：worktree 路径存在或值为 "skipped" → 跳过
  2. 任务实现：
     - Agent 从 plans.md header 读取执行策略（SDD vs 串行），以场景对比形式展示给用户确认
     - SDD 适用场景：任务 ≥ 3 个、相互独立、不同文件/模块可并行
     - executing-plans 适用场景：任务 1-2 个、紧密耦合、共享状态或同一文件
     - 幂等检查：tasks.md checkbox 全部勾选 → 跳过
  3. superpowers:verification-before-completion → 代码层验证（测试通过、行为正确）。天然幂等。
  4. /opsx:verify → 制品层验证（7 项结构化检查 → verify.md）。
     幂等检查：verify.md 存在且 hash 有效 → 跳过。
     CLI 输出语言不由 Agent 控制，Agent 必须将 verify.md 重写为与指令/模板一致的语言。
     verify 过程中更新 tasks.md checkbox 后，必须重录 tasks hash（`alloy _record write`）。
  5. 纯 AI 生成 → retrospective.md（全周期复盘，§0-§6）。
     幂等检查：retrospective.md 存在且 hash 有效 → 跳过。
     §0 量化全景：三来源自动收集——.alloy.yaml records（制品审批链）+ git log（全分支按 type/阶段分组）+ 文件系统（任务完成比、变更规模、测试覆盖信号）。
     §4 全周期技能审计：Agent 自报 start/plan/apply 三阶段 11 项技能/命令使用情况。

**executing-plans 路径（串行）：** 分为 4 步，补偿 executing-plans 缺少的闸门：
  ① 先加载 TDD 技能设定预期（RED→GREEN→REFACTOR 为硬约束）
  ② 加载 executing-plans 技能按 plans.md 微步骤执行
  ③ executing-plans 完成后进行 Spec 合规审查（Agent 自行检查）：
     - tasks.md 每个 checkbox → 代码中是否有对应实现？
     - 代码中是否有 tasks.md 未要求的实现？（over-building）
     - plan.md 明确排除的范围 → 代码是否碰了？
  ④ 加载 requesting-code-review 技能进行代码审查

**SDD 提交规则：** 子 agent 完成每个 task 提交前，Agent 判断是否有未追踪文件：
  - 构建产物（dist/、.next/、node_modules/ 等）→ 提醒用户更新 .gitignore
  - 项目源码 → git add 后提交

**完成阶段（验证 + 复盘通过后）：**
  verify.md 和 retrospective.md 已在各自审查窗口中 hash-lock + 单独 git commit（具体命令已内联在上方各审查窗口中）。
  retrospective commit 可包含 phase_timings 等元数据。
  通过 `alloy _guard ... --apply` 校验并推进 phase，guard 后补 commit：
  ```bash
  alloy _guard openspec/changes/<name> applied --apply
  git add openspec/changes/<name>/.alloy.yaml
  git commit -m "chore(<name>): phase → applied"
  ```
  worktree 清理已移至 `/alloy:archive` 阶段。
```

### alloy archive

```
/alloy:archive [name]（省略时从当前活跃 change 推断）

前置检查（phase 路由）:
  → phase = applied + verify.md 存在且非 FAIL → 通过，继续
  → phase = planned → 自动路由到 /alloy:apply
  → phase = started → 自动路由到 /alloy:plan
  → phase = archived → 自动路由到 /alloy:finish
  → 唯一 HARD STOP：change 目录不存在（前序阶段完全没做）

执行:
  1. /opsx:archive → sync delta spec + 归档到 archive/YYYY-MM-DD-<name>/
  2. 归档变更提交（必须在 worktree 清理之前——如果在 worktree 中，变更必须先 commit 到 worktree 分支，否则 merge 会丢失归档操作）：
     git add -A openspec/specs/ openspec/changes/
     git diff --cached --quiet || git commit -m "chore(<name>): 归档目录移动"
  3. 跨周期反馈：读取 retrospective.md §6 Promote Candidates，将 Promote to: memory 的条目写入 ~/.claude/memory/
  4. Worktree 清理（如果 apply 期间使用了 worktree）：
     读取 worktree_path / feature_branch / worktree_branch → 向下兼容检测（遗留 change 无 feature_branch/worktree_branch 时自动推断）
     → cd 主仓库 → git merge worktree_branch → git worktree remove → git branch -d
     → 写入 worktree_merged_at
     未使用 worktree（null 或 skipped）则跳过
  5. 记录完成时间 + 提交（所有 .alloy.yaml 变更在 commit 之前完成）：
     git add -A openspec/specs/ openspec/changes/
     git commit -m "chore(<name>): 归档阶段完成"
  6. phase → archived（通过 `alloy _guard ... --apply` + guard 后补 commit）

git add 规则：`-A` 限定路径可用（如 `git add -A openspec/specs/ openspec/changes/`），无路径限定的 `git add -A` 禁止——防止意外文件混入。

archive 只做 spec 归档和归档提交，不涉及代码合并。代码合入由 /alloy:finish 完成。
```

### alloy finish

```
/alloy:finish [name]（省略时从当前活跃 change 推断）

独立命令，两种使用场景：
  1. /alloy:archive 完成后 → 代码合入与现场清理
  2. 手动调用 → archive 时选了 keep，后续想 merge / PR

前置检查:
  → phase 路由: archived → 通过；否则自动路由到对应阶段
  → HARD STOP：分支不存在（可能已 merge 或删除）
  → Skill 预检：superpowers:finishing-a-development-branch 可用

执行: superpowers:finishing-a-development-branch
  → 读取 openspec/config.yaml 的 main_branch 作为默认合并目标
  → 3 选项:
      1. 本地 merge → 记录完成时间 + guard + phase → finished → commit → squash merge 到 main_branch
      2. 创建 PR    → 记录完成时间 + guard + phase → finished → commit → 创建 PR
      3. 保持分支   → phase 保持 archived，"分支已保留"
  → phase_timings.finish.started_at / completed_at 记录阶段耗时
  → guard + phase → finished 必须在 merge 之前完成（squash merge 后主分支仅 1 个 commit）

finish 纯做代码收尾，不涉及 spec 变更。若 PR 审查引出 spec 级修改，应走新 change。
注意：finish 阶段不涉及 worktree——worktree 已在 archive 阶段合并清理。

选 PR 后，审查反馈通过自然对话处理，Agent 内部遵循
superpowers:receiving-code-review 行为规范（验证优先、不盲从、技术推理）。
```

### alloy fix

```
/alloy:fix

核心原则：诊断先行——先判断是代码 bug 还是 spec 变更；分支后置——确认是代码 bug 后才选择分支策略。

前置检查:
  1. Skill 预检：systematic-debugging + TDD + verification-before-completion 三个技能可用
  2. Phase 校验与场景标记：
     ├── phase = applied + worktree 存在 → 场景 1
     ├── phase = applied + worktree 已清理 → 场景 2
     ├── phase = planned → 场景 2
     ├── phase = archived/finished → 场景 3（热修候选）
     └── 无活跃 change → 场景 3（热修候选）

1. 环境感知：
   检测 worktree 状态、当前分支、活跃 change、主分支配置
   输出环境摘要 + 场景标记

2. 根因诊断 (superpowers:systematic-debugging):
   ├── 诊断结论：需改 spec → 引导 /alloy:start <建议名称>，结束 fix
   └── 诊断结论：代码 bug → 用户确认后进入 Step 3

3. 分支选择 + 修复（确认是代码 bug 后）:

   场景 1：有归属 change + worktree 存在
     → worktree 内 TDD 修复 → verify → 精确提交到 worktree 分支

   场景 2：有归属 change + worktree 已清理
     → feature 分支 TDD 修复 → verify → 精确提交到 feature 分支

   场景 3：无归属 change / change 已 finish
     → 确认主分支（读 config，未配置则自动检测 + 用户确认）
     → 创建 hotfix/<desc> 分支（从主分支）
     → TDD 修复 → verify → 精确提交
     → 合并回主分支（--no-ff）
     → commit message 注明 fix-from: <原 change 名>（如有）

   spec 变更兜底：修复中发现 spec 问题 → 完成后提示开新 change；正常修复 → 不提示
```

### alloy discard

```
/alloy:discard [name]（省略时从当前活跃 change 推断）

phase 行为：
  ├── started / planned         → 切回主分支 + 删 feature 分支 + 删 change 目录
  ├── applied / archived        → 删 worktree + 切回主分支 + 删 feature 分支 + 删 change 目录
  └── finished                  → [HARD STOP] 不可 discard

安全兜底：feature_branch == main_branch 不删分支；main_branch 未记录则提示手动切换

确认提示: "将删除以下内容，不可恢复:
  - Change: <name>
  - Feature 分支: <feature_branch>（如有）
  - Worktree: <path>（如有）
  - 目录: <change dir>
  - 切回分支: <main_branch>（如有）
  输入 'discard <name>' 确认"

确认后清理（必须按序）:
  1. git worktree remove <path> --force（如存在且 phase ≥ applied）
  2. git checkout <main_branch>（切离要删的分支）
  3. git branch -D <feature_branch>
  4. rm -rf openspec/changes/<name>/
```

### alloy status

```
/alloy:status [name]（省略时显示所有活跃 change 总览）

输出指定 change 详情:
  阶段:    planned
  Change:  login-feature
  路径:    openspec/changes/login-feature/
  创建时间: 2026-05-28 09:00:00
  更新时间: 2026-05-28 15:30:00
  Worktree: .worktrees/login-feature/
  制品状态:
    draft     ✓
    proposal  ✓
    design    ✗
    specs     ✗
    tasks     ✗
    plans     ✗
  下一步:   等待 /alloy:apply

每次 status 运行时自动附带一致性检查:
  1. worktree 字段有值但磁盘路径不存在 → "worktree 残留"
  2. worktree 字段为 null 但 .worktrees/<name>/ 目录存在 → "worktree 孤儿"
  3. git worktree list 中孤立 worktree → 提示清理
```

### alloy doctor

```
alloy doctor [path] [--json]

诊断内容:
  1. 版本兼容性（7 项健康检查）:
     Node.js / OpenSpec / Superpowers / Alloy / Schema / Commands / Environment
     每项返回 pass / warn / fail，依据 compat.yaml 中的版本约束判断

  2. 文件一致性（双向检查）:
     ├── worktree 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留"
     ├── worktree 字段为 null 但 .worktrees/<name>/ 目录存在 → ⚠️ "worktree 孤儿"（状态写入缺失）
     └── git worktree list 中有孤立 worktree → ⚠️ 提示清理

--json: 以 JSON 格式输出 healthResults + consistencyWarnings
```

---

## 三、终端输出视觉规范

详见 [alloy-visual-spec.md](02-visual-spec.md)——从本文档提取的独立视觉规范，以实际落地格式为准。写 Skill 时参考该文档。

---

## 四、状态文件

每个 change 目录内包含 `.alloy.yaml`，CLI 和 Agent 读写，用户通过 `/alloy:status` 查看：

```yaml
# openspec/changes/<name>/.alloy.yaml
phase: started | planned | applied | archived | finished
worktree: null | ".claude/worktrees/<name>" | "skipped"
worktree_branch: null | "worktree-<name>"   # worktree 分支名
worktree_created_at: null | "2026-05-28 09:10:00"
worktree_merged_at: null | "2026-05-28 12:00:00"  # archive 阶段合并后写入
feature_branch: "feat/login"    # 本次 change 使用的 feature 分支
schema_version: 1
created_at: "2026-05-28 09:00:00"
updated_at: "2026-05-28 15:30:00"
phase_timings:
  start:
    started_at: "2026-05-28 09:00:00"
    completed_at: "2026-05-28 09:07:35"
  plan:
    started_at: "2026-05-28 09:07:47"
    completed_at: "2026-05-28 09:15:30"
records:
  - artifact: proposal
    hash: "abc123"
    committed_at: "2026-05-28 09:15:00"
    approver: "human"
  - artifact: design
    hash: "def456"
    committed_at: "2026-05-28 09:30:00"
    approver: "human"
```

| 字段 | 读写 | 含义 |
|------|------|------|
| `phase` | CLI + Agent | 当前阶段，决定 `/alloy:start` 的恢复路径 |
| `worktree` | apply 阶段写入 | null=尚未决定；skipped=用户选择不创建；路径=已创建，恢复时跳过 |
| `worktree_branch` | apply 阶段写入 | worktree 分支名（如 `worktree-<name>`），archive 清理时用于 merge |
| `worktree_created_at` | apply 阶段写入 | worktree 创建时间 |
| `worktree_merged_at` | archive 阶段写入 | worktree 合并回 feature 分支的时间，null 表示未使用 worktree 或未合并 |
| `feature_branch` | start 阶段写入 | 本次 change 使用的 feature 分支名，discard 时用于安全清理分支 |
| `schema_version` | alloy init 写入 | 格式演进时用于兼容解析 |
| `created_at` | alloy start 写入 | change 创建时间 |
| `updated_at` | phase 变更时写入 | 最后状态变更时间，调试和排序用 |
| `phase_timings` | 各阶段写入 | 每个阶段的 `started_at` / `completed_at`，接续时不丢失耗时数据 |
| `records` | plan/apply 阶段写入 | 每个制品提交后的 hash 记录，格式 `ArtifactRecord[]`，含 artifact/hash/committed_at/approver |

断点恢复：`/alloy:start` 检测到活跃 change → 读 phase + worktree + 文件系统 → 自动加载对应阶段命令。不设子步骤状态——Agent 通过文件存在性自判断。

### 项目级配置

`openspec/config.yaml` 是项目级配置，所有 change 共享：

```yaml
# openspec/config.yaml
schema: alloy
alloy:
  main_branch: main    # 用户确认的主分支名
```

| 字段 | 读写 | 含义 |
|------|------|------|
| `alloy.main_branch` | start 阶段写入，finish/discard 读取 | 项目主分支名，分支管理和合并目标的基准 |

`alloy _config` CLI 命令用于读写项目级配置：
```bash
alloy _config read . main_branch     # 读取主分支名
alloy _config write . main_branch main  # 写入主分支名
```

### 阶段闸门检查规则

`alloy _guard` 在每个阶段转换时进行硬校验，包括 phase 转换合法性和制品完整性检查。只验证 phase 转换合法性不管制品完整性，会导致制品缺失在下阶段才暴露（如 started→planned 缺 specs 却成功推进，apply 阶段才发现——错误发生在 plan 阶段）。

**每个转换的必检清单（以 schema DAG 为准）：**

| 转换 | 必检制品 | 说明 |
|------|---------|------|
| started → planned | proposal, design, specs/, tasks, plans | plan 阶段 5 个产出全部存在 |
| planned → applied | plans | 执行依赖 plans.md |
| applied → archived | verify | 归档依赖 verify.md |
| archived → finished | retrospective | 完成依赖 retrospective.md |

**设计原则：** "不设子步骤状态"指不追踪每个制品的生成进度（用文件存在性自判断），但阶段闸门必须用 DAG 产出清单做完整性验证。两者不矛盾——前者是状态粒度，后者是防火墙。

---

## 五、制品依赖 DAG

```
Pre-OpenSpec:
  draft.md ← explore + brainstorming 产出

Schema DAG（8 个制品）:
  proposal  ← 读 draft.md
    ├──→ specs     ← 依赖 proposal（不读 draft，防止行为 spec 被技术细节污染）
    │      └──→ tasks   ← 依赖 specs + design
    │            └──→ plans   ← 依赖 tasks（由 superpowers:writing-plans 生成，独立步骤）
    │                  └──→ verify     ← 依赖 plans（apply 阶段产出）
    │                        └──→ retrospective ← 依赖 verify（apply 阶段产出）
    │
    └──→ design   ← 依赖 proposal（读 draft.md，受 proposal 范围约束）

Apply:
  apply  ← 依赖 plans
    ├── precheck      ← git 仓库检测（有感选择）+ 6 个 Superpowers 技能可用性检查
    ├── 隔离环境设置   ← 隐含 superpowers:using-git-worktrees（用户可选，非强制）
    ├── 任务实现       ← 用户选择执行策略:
    │                      superpowers:subagent-driven-development（并行，任务独立时，内部含 TDD + code-review）
    │                      or superpowers:executing-plans（串行，任务耦合时）
    │                      （串行路径需显式补偿 TDD + code-review——executing-plans 不含这两个闸门，
    │                        apply 会在执行前加载 TDD、执行后加载 requesting-code-review）
    ├── 代码层验证     ← superpowers:verification-before-completion
    ├── 制品层验证     ← /opsx:verify → verify.md（7 项结构化检查）
    ├── 复盘          → retrospective.md（全周期审计，§0 量化全景 + §4 三阶段技能审计 + §1-§6 定性）
    ├── git commit    ← verify.md hash-locked + 单独提交
    └── 复盘提交       ← retrospective.md hash-locked + 单独提交，再通过 guard 校验更新 phase

所有制品存放于 openspec/changes/<name>/ 目录内，不需外部指针。
```

### Schema

Alloy schema 从零构建，参考 `superpowers-bridge`（社区 schema）和 Comet，修正其已知问题：

| 项目 | superpowers-bridge | Alloy |
|------|-------------------|-------|
| schema 名 | `superpowers-bridge` | `alloy` |
| 制品数 | 8 个 | 8 个（draft/proposal/design/specs/tasks/plans/verify/retrospective） |
| 首个制品 | `brainstorm.md`（在 change 目录内） | `draft.md`（start 阶段创建 change 后移入 change 目录） |
| DAG 时序 | verify/retro 在 DAG 中但 apply 后才产出（已承认的设计问题） | verify/retro 在 DAG 中，依赖 plans/verify，apply 阶段产出 |
| apply 范围 | 含 archive + PR | 仅到 retrospective（archive + finish 为收尾阶段） |
| 指令存放 | 内联在 schema.yaml | 独立 `instructions/*.md` 文件 |
| 构建方式 | — | 从零构建，保留完全掌控力 |

`alloy init` 部署时从零创建 schema → 写入 `openspec/config.yaml`（`schema: alloy`）。

#### Schema 校验

OpenSpec 在加载 schema.yaml 时进行严格格式校验，字段不合法会阻断 `/opsx:new` 和 `openspec status`。

**校验规则（来自实际踩坑）：**

| 字段 | 要求 | 错误示例 |
|------|------|---------|
| `version` | number，非 string | `"1"` → 应为 `1` |
| `artifacts[].description` | 必填 string | 缺少此字段 |
| `apply.requires` | 必填 array，至少 1 项 | 缺少此字段 |

**修改 schema 后的验证命令：**

```bash
# 方式 1：列出 schema，加载失败即 schema 不合法
openspec schemas

# 方式 2：通过现有 change 加载 schema 验证
openspec status --change <change-name>
```

两种方式都会加载并校验 schema.yaml，任一失败则 schema 不合法。推荐修改 schema 后立即运行 `openspec schemas` 验证。

### 平台兼容

v1 支持 8 个 AI 编码平台：Claude Code、CodeBuddy、Qoder（冒号版命令）、Cursor、OpenCode、Codex、Trae、Pi（横线版命令）。`alloy init` 交互式选择安装目标，冒号版和横线版自动生成到各平台目录。平台定义见 `src/core/agents.ts`。

### 扩展点

v1 在关键节点给出提示，不调用外部技能（可靠性优先）。后续版本升级为可配置的 HARD GATE 闸门。

**start 阶段完成后：**
```
draft.md 已完成。
💡 建议：可以用 grill-me 对需求进行深入拷问，确认后再进入 plan。
```

**apply 完成后、archive 之前：**
```
retrospective.md 已生成，所有变更已提交。
💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 archive。
```

---

## 六、架构

```
用户输入 /alloy-*
       │
       ▼
  SKILL.md（Agent 内执行）
  ├── 阶段检测（读 .alloy.yaml + 文件系统）
  ├── 流程编排（按 phase 分发到对应子步骤）
  ├── 审查窗口（制品确认）
  └── 调用 OpenSpec CLI + Superpowers skill
       │
       ▼
  大模型（内容层）
  ├── 写文档（proposal / design / specs / tasks / plans / retrospective）
  ├── 写代码（subagent 优先，无 subagent 时降级为直接执行）
  └── 交互（explore Q&A / brainstorming 设计审批）
```

```
CLI（终端）
  alloy init / status / doctor / update
  ├── 确定性强（TypeScript 逻辑）
  ├── 安装依赖（OpenSpec CLI + Superpowers skill）
  ├── 部署文件（schema + skill）
  ├── 诊断（版本兼容性 + 文件一致性）
  └── 内部命令（_state / _guard / _record / _config）供 Agent 调用
```

| 层 | 在哪运行 | 内容 | 可靠性 |
|----|---------|------|--------|
| CLI | 终端 | 安装、诊断、状态总览、内部命令（_state/_guard/_record/_config） | 确定性强（TypeScript） |
| Skill | Agent 内部 | 流程编排、阶段检测、审查窗口 | 硬约束（SKILL.md 指令 + CLI 内部命令） |
| AI 内容 | Agent 内部 | 文档生成、代码生成、交互决策 | 柔性（AI 发挥，人类审查） |

核心工作流（start / plan / apply / finish / archive / fix / discard）全部在 Agent 内以 slash command 运行。CLI 只做辅助——安装、诊断、查看状态总览。

---

## 七、安装与初始化

### compat.yaml

随 Alloy npm 包发布，不暴露到用户项目。定义兼容范围（doctor 诊断用）和安装版本（init 安装用）：

```yaml
# Alloy 包内置
compatible:
  node: ">=18.0.0"
  openspec: ">=1.3.0 <2.0.0"
  superpowers: ">=5.0.0 <6.0.0"
  alloy: ">=0.1.0"
  schema: 1

install:
  openspec: "@fission-ai/openspec@1"
  superpowers: "obra/superpowers@5"
```

- `compatible` — `alloy doctor` 诊断用，超出范围警告但不阻断
- `install` — `alloy init` 钉住大版本，确保安装的组合经过测试

### alloy init --scope

`--scope` 控制 Alloy 和 Superpowers skill 文件的安装位置。OpenSpec CLI 始终全局安装（npm 包），`openspec/` 目录始终在项目内创建——全局共享的 skill 文件与项目级的需求追踪目录是分开的。

Claude Code 的 skill 加载合并全局和项目两个来源，同名 skill **项目级优先于全局**。

```
alloy init --scope project（默认）:
  Alloy commands   → .claude/commands/alloy/（冒号版）+ alloy-*.md（横线版）
  Superpowers      → .claude/skills/（项目级）
  OpenSpec CLI     → npm install -g（始终全局）
  openspec init    → <项目路径>
  openspec/ 目录   → <项目路径>/openspec/（始终项目级）

alloy init --scope global:
  Alloy commands   → ~/.claude/commands/alloy/（冒号版）+ alloy-*.md（横线版）
  Superpowers      → ~/.claude/plugins/（全局级，带 -g flag）
  OpenSpec CLI     → npm install -g（始终全局）
  openspec init    → ~/（全局 OpenSpec 命令）
  openspec/ 目录   → <项目路径>/openspec/（始终项目级，由 deploySchema 创建）
```

### alloy init 流程

```
$ npm install -g @flyin-ai/alloy
$ cd your-project
$ alloy init

  **检测环境...**
     ✓ Node.js v22.0.0
     ✓ git 已安装
     ⚠ Claude Code 已安装

  **安装 OpenSpec CLI...**
     ✓ @fission-ai/openspec@1 已安装

  **初始化 OpenSpec 项目结构...**
   （调用 openspec init，带 custom profile 确保全部 11 个 workflow 启用）

  **安装 Superpowers...**
     ✓ Superpowers 已安装

  **部署 Alloy commands...**
     ✓ /path/.claude/commands/alloy/start.md（project）
     ✓ /path/.cursor/commands/alloy-start.md 等（自动生成横线版）
     ✓ 项目 schema → openspec/schemas/alloy/

  **兼容性检查...**
     ✓ Node.js v22.0.0（要求 >=18.0.0）
     ✓ OpenSpec v1.5.0（要求 >=1.3.0 <2.0.0）
     ✓ Superpowers v5.1.0（要求 >=5.0.0 <6.0.0）

  **注册 shell 补全...**
     ✓ shell 补全已注册 → ~/.zshrc

  ✅ Alloy 就绪！
   在 Claude Code 中输入 /alloy:start <topic> 开始工作
```

关键步骤：

1. **选择 scope** — 交互式选择 project（当前目录）或 global（home 目录），也可 `--scope` 参数指定
2. **选择目标 Agent** — 交互式多选安装目标（Claude Code / Cursor / OpenCode 等 8 个平台），也可 `--agents` 非交互式指定
3. **环境检测** — `detectEnv()` 检测 Node.js 版本、git、Claude Code。git 缺失则 HARD STOP
4. **安装 OpenSpec CLI** — `npm install -g @fission-ai/openspec@1`
5. **初始化 OpenSpec 项目结构** — `openspec init <path> --tools claude --profile custom`。传入临时 custom profile 确保全部 11 个 workflow 启用
6. **安装 Superpowers** — `npx skills add obra/superpowers -y --agent claude-code`（project scope 不加 `-g`）
7. **部署 Alloy command + schema** — 从包复制 `commands/alloy/`，自动生成冒号版和横线版到各平台目录，写入 `openspec/schemas/alloy/`，追加 `schema: alloy` 到 `openspec/config.yaml`
8. **更新 .gitignore** — 追加 5 条规则（`docs/superpowers/` `.worktrees/` `worktrees/` `*.local.*` `.superpowers/`）
9. **注入 CLAUDE.md** — 可选（`--inject-claude-md`），默认关闭
10. **兼容性检查** — 根据 `compat.yaml` 校验版本
11. **注册 shell 补全** — 自动检测 shell 类型，注册 `alloy completion` 到 rc 文件。失败不阻断 init

### alloy update

```
alloy update [path]
  → 自动检测 scope（project/global）
  → 开发模式（包根目录有 .git）→ 直接重新部署本地 commands + schema
  → 用户模式（npm 发布版）→ 查 npm registry 检查版本，有新版询问确认后升级 CLI
  → 重新部署 commands + schema
  → 更新 CLAUDE.md 中的 Alloy 标记区域（若存在）
```

---

## 八、关键设计决策

| # | 决策 | 理由 |
|----|------|------|
| 1 | `/alloy:start` 作为唯一入口，默认接续 | 用户只需记住一个命令，降低心智负担 |
| 2 | plan 始终分步，不提供一键生成 | 每步审查的价值大于省下的几秒 |
| 3 | `.alloy.yaml` per-change，非全局 | 天然支持多 change 并行，discard 只需删目录 |
| 4 | Agent 内流程 + CLI 辅助 | 核心工作流依赖 AI 编排能力，CLI 只做确定性操作 |
| 5 | alloy init 自动安装 OpenSpec + Superpowers | 用户从零到可用只需两条命令（install + init） |
| 6 | compat.yaml 钉版本 | init 装已验证的组合，doctor 警告超出范围的非兼容风险 |
| 7 | CLAUDE.md 注入默认关闭 | 非功能必需，减少对项目文件的侵入。需要时显式 `--inject-claude-md` |
| 8 | verify 在 apply 内部闭环，两层验证 | 代码层（verification-before-completion）+ 制品层（/opsx:verify → verify.md），任意 FAIL 回退到 SDD |
| 9 | archive 与 finish 分离，先文档后代码 | archive 提交 spec 归档，finish 处理代码合入。避免"代码合入了 spec 还没跟上"的窗口期 |
| 10 | fix 以 apply 为 spec 变更分水岭 | 无代码（phase< applied）并入当前 change；有代码新开 change |
| 11 | receiving-code-review 嵌入 agent 指令 | 行为规范非管道步骤，减少命令数，降低使用门槛 |
| 12 | SDD / 串行执行由用户选择 | Agent 从 plans.md header 读取执行策略作为推荐，用户决定使用 SDD 还是串行执行。策略在规划阶段写入，apply 阶段读取 |
| 13 | retrospective 模板参考 superpowers-bridge | 全周期审计，§0 量化全景（三来源自动收集）+ §4 三阶段技能审计（Agent 自报）+ §6 Promote Candidates 跨周期 carry-forward |
| 14 | 不设子步骤状态，通过路由 + 幂等实现接续 | precheck 不满足时自动路由到正确命令，阶段步骤自身幂等。退出回来随便打任何命令都能自动接续 |
| 15 | CLI 守门，Skill 信任 | 环境依赖由 `alloy init` 确保，Skill 不做手动 fallback。依赖缺失时引导 `alloy init` |
| 16 | scope 只控制 skill 安装位置 | Alloy + Superpowers skill 受 scope 控制；OpenSpec `openspec/` 目录始终在项目内；默认 project 级别 |
| 17 | 项目就绪标记 = `openspec/config.yaml` | `alloy-start` 检查此文件判断项目是否已初始化，与 OpenSpec 自身的检测方式一致 |
| 18 | openspec init 启用 custom profile | 参考 Comet，使用临时 custom profile 确保全部 11 个 workflow 可用，避免 core profile 缺少 new/continue 等命令 |
| 19 | /alloy:finish 保留为独立命令 | archive 时选 keep 后，后续可手动调 finish 合入；无需重跑 archive |
| 20 | 制品上下文一致性决定输出语言 | 不硬编码语言要求也不绑定特定平台机制。指令/模板写什么语言，Agent 自然产出什么语言 |
| 21 | apply 关键决策点用户有感 | git 初始化、worktree 创建、执行策略（SDD vs 串行）三个决策点均展示选项让用户选择 |
| 22 | 一个制品，一次提交 | 每个制品审查通过后立即 hash-lock + 单独 git commit，records 记录 hash。避免大爆炸提交，每个制品可独立回溯、独立 revert、独立 cherry-pick |
| 23 | precheck 路由替代 HARD STOP | 命令 precheck 不满足时，自动转发到正确阶段命令而非报错退出。用户随便打任何命令都不会错——系统自己弄清楚该做什么 |
| 24 | 阶段时间持久化到 phase_timings | 每个阶段的 started_at / completed_at 写入 .alloy.yaml，接续时读历史值不丢失耗时数据。替代 shell 变量存储（退出即失） |
| 25 | git add 规则：`-A` 限定路径可用 | `git add -A <路径>` 可用（只扫描指定目录的新增/修改/删除），无路径限定的 `git add -A`/`-a`/`.` 禁止。防止意外文件混入提交。`.gitignore` 补齐 `*.local.*` |
| 26 | worktree 在 archive 阶段清理 | worktree 在 apply Step 1 按需创建，apply 结束时不清理（只推进 phase）。archive 阶段归档变更提交后，执行 worktree merge + remove + branch -d，写入 worktree_merged_at。finish 阶段感知不到 worktree 的存在 |
| 27 | executing-plans 路径补偿 TDD + spec 合规审查 | executing-plans 不含 TDD 和 code review 闸门，apply 在加载前先加载 TDD 设定硬约束、执行后执行 spec 合规审查（tasks.md checkbox 对代码实现）、再加 code review。串行路径共 4 步：TDD → executing-plans → spec 合规审查 → code review |
| 28 | 策略选择场景化对比 | 不只在 plans.md 写 strategy frontmatter——apply Step 2 以场景对比表格展示 SDD（多任务并行）和 executing-plans（少任务串行）的适用场景，用户根据实际任务特征选择 |
| 29 | `_guard --apply` 后补 commit | guard 校验 hash 一致性后自动推进 phase，但 phase 变更必须 commit（否则 worktree 清理或 squash merge 时未提交的变更会丢失）。每个阶段末尾 guard + commit 是固定模式 |
| 30 | 归档 commit 在 worktree 清理之前 | `/opsx:archive` 执行 `mv` 移动目录但不 git commit。如果在 worktree 中，变更必须先 commit 到 worktree 分支，否则 worktree merge 时会丢失归档操作。顺序：归档 commit → worktree 清理 → 完成时间 commit → guard commit |

---

## 九、开发可行性评估

### 实现范围

| 组件 | 内容 | 工作量（估） |
|------|------|:--:|
| CLI（TypeScript） | init / status / doctor / update 四条命令 | 2-3 周 |
| Slash Commands | 8 条 SKILL.md + 子步骤 prompt 模板 | 2-3 周 |
| Schema + Templates | 从零构建，参考 superpowers-bridge + Comet | 2 周 |
| 内部命令（TypeScript） | _guard / _state / _record / _config | 1 周 |
| 测试 | CLI 单元测试（vitest） | 1 周 |

### 依赖稳定性

| 依赖 | 状态 | 风险 |
|------|------|:--:|
| OpenSpec CLI | npm 包，版本化管理 | 低 |
| Superpowers skill | npx skills add 安装，版本化管理 | 低 |
| AI 平台（Claude Code 等） | slash command 机制稳定 | 低 |
| Node.js + git | 基础环境 | 低 |

### 关键风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|:--:|------|
| Superpowers skill 行为变更导致编排失效 | 中 | compat.yaml 钉版本 + alloy update 同步更新 |
| OpenSpec schema 格式演进 | 低 | alloy schema 独立构建，不依赖上游 schema |
| Agent 不遵循 SKILL.md 闸门指令 | 中 | 内部命令（TypeScript）做 HARD STOP 校验，不可跳过 |
| plan 阶段上下文溢出 | 低 | 制品分步 + SDD subagent 上下文隔离 |
| 并行 change 冲突 | 低 | OpenSpec 目录隔离 + worktree 独立 |

### 推荐开发路径

1. **原型验证**（第 1-2 周）——写 `/alloy:start` + `/alloy:plan` 的 SKILL.md，在 Claude Code 中跑通 Pre-OpenSpec → 规划阶段，验证 OpenSpec + Superpowers 组合是否如设计运作
2. **CLI + Schema**（第 3-5 周）——alloy init / status / doctor / update + alloy schema 从零构建，参考 Comet 架构
3. **完整流程**（第 6-8 周）——补全 apply / finish / archive / fix / discard 的 SKILL.md + 内部命令
4. **测试 + 文档 + 推广**（第 9-10 周）——单元测试、团队推广、反馈收集

> 实际开发时参照 `docs/handbook.md`（构建、测试、调试），
> 包含构建命令、代码约定、测试写法、踩坑记录和跨层复盘清单。
