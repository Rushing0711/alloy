---
behaviors:
  preconditions: 12
  hard_stops:    14
  user_gates:    7
  warns:         3
  artifacts: [verify, retrospective]
  transitions_to: applied
  external_calls: [opsx:verify, superpowers:using-git-worktrees, superpowers:subagent-driven-development, superpowers:executing-plans, superpowers:test-driven-development, superpowers:verification-before-completion, superpowers:requesting-code-review]
---

# alloy apply 行为规格

详见 skill 文件：`commands/alloy/apply.md`

## 命令格式

```
/alloy:apply [name]（省略时从当前活跃 change 推断）
```

## 前置检查（3 项 + phase 路由）

1. plans.md 存在
2. alloy _guard 确认 phase：
   ├── started → 自动路由到 /alloy:plan
   ├── planned → 通过，继续执行
   ├── applied → 通过（重入），步骤幂等处理断点
   └── archived → 自动路由到 /alloy:finish
3. git 仓库检测 — 不是仓库时，展示选项让用户选择立即初始化还是稍后自行处理

技能预检（6 个 Superpowers 技能可用性，缺一 STOP）

## 需求变更闸门

apply 阶段不允许任何需求变更——plan 已锁定，统一走 discard 重开。

用户提出需求/设计变更时：
1. AskUserQuestion 展示选项：
   - (a) 放弃当前 change，开新 change 处理变更（执行 `/alloy:discard` + `/alloy:start`）
   - (b) 取消变更，继续当前 apply
2. 选 (a) 引导用户运行 discard 命令；选 (b) 继续 apply。

详见 apply.md "需求变更闸门"段落。

**Why：** plan 完成 = 制品 hash-lock + records 完整链。apply 阶段开始 = worktree 可能已创建。
在此阶段就地修改 plans/specs = hash 锁定形同虚设；回溯到 brainstorming = 编码工作可能丢失或冲突。
统一走 discard 重开是唯一合法路径。

## 执行步骤（共 5 步，每步自带幂等检查，验证失败回到 Step 2 修复）

### Step 1: 隔离环境设置

- 使用 superpowers:using-git-worktrees 技能（用户选择"是/否"）
- 用户选"是" → 创建 .claude/worktrees/<name> worktree，分支名 worktree-<name>
- 用户选"否" → worktree 字段设为 "skipped"，在当前分支直接工作
- 幂等检查：worktree 路径存在或值为 "skipped" → 跳过

### Step 2: 任务实现

- Agent 从 plans.md header 读取执行策略（SDD vs 串行），以场景对比形式展示给用户确认
- SDD 适用场景：任务 ≥ 3 个、相互独立、不同文件/模块可并行
- executing-plans 适用场景：任务 1-2 个、紧密耦合、共享状态或同一文件
- 幂等检查：tasks.md checkbox 全部勾选 → 跳过

### Step 3: 代码层验证

superpowers:verification-before-completion → 代码层验证（测试通过、行为正确）。天然幂等。

### Step 4: 制品层验证

/opsx:verify → 制品层验证（7 项结构化检查 → verify.md）。
幂等检查：verify.md 存在且 hash 有效 → 跳过。
CLI 输出语言不由 Agent 控制，Agent 必须将 verify.md 重写为与指令/模板一致的语言。
verify 过程中更新 tasks.md checkbox 后，必须重录 tasks hash（`alloy _record write`）。

### Step 5: 复盘

纯 AI 生成 → retrospective.md（全周期复盘，§0-§6）。
幂等检查：retrospective.md 存在且 hash 有效 → 跳过。
§0 量化全景：三来源自动收集——.alloy.yaml records（制品审批链）+ git log（全分支按 type/阶段分组）+ 文件系统（任务完成比、变更规模、测试覆盖信号）。
§4 全周期技能审计：Agent 自报 start/plan/apply 三阶段 11 项技能/命令使用情况。

## executing-plans 路径（串行）

分为 4 步，补偿 executing-plans 缺少的闸门：
① 先加载 TDD 技能设定预期（RED→GREEN→REFACTOR 为硬约束）
② 加载 executing-plans 技能按 plans.md 微步骤执行
③ executing-plans 完成后进行 Spec 合规审查（Agent 自行检查）：
   - tasks.md 每个 checkbox → 代码中是否有对应实现？
   - 代码中是否有 tasks.md 未要求的实现？（over-building）
   - plan.md 明确排除的范围 → 代码是否碰了？
④ 加载 requesting-code-review 技能进行代码审查

## SDD 提交规则

子 agent 完成每个 task 提交前，Agent 判断是否有未追踪文件：
- 构建产物（dist/、.next/、node_modules/ 等）→ 提醒用户更新 .gitignore
- 项目源码 → git add 后提交

## 完成阶段

verify.md 和 retrospective.md 已在各自审查窗口中 hash-lock + 单独 git commit。
retrospective commit 可包含 phase_timings 等元数据。
通过 `alloy _guard ... --apply` 校验并推进 phase，guard 后补 commit：
```bash
alloy _guard openspec/changes/<name> applied --apply
git add openspec/changes/<name>/.alloy.yaml
git commit -m "chore(<name>): phase → applied"
```
worktree 清理已移至 `/alloy:archive` 阶段。
