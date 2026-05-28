# Alloy 设计文档

Alloy 是一套融合 OpenSpec 和 Superpowers 的开发工作流工具，提供稳定、高效、简洁的命令体系。

---

## 一、命令参考

| 命令 | 参数 | 说明 |
|------|------|------|
| `/alloy:init` | — | 项目级初始化：检测依赖 → 部署 schema + skill |
| `/alloy:start` | `[topic]` | 智能入口：自动检测状态，接续或新建 |
| `/alloy:plan` | `<name>` | 逐制品生成设计文档，始终分步，每步可审查 |
| | `<name> --redo <id>` | 重新生成指定制品及下游（级联删除 + 重做） |
| `/alloy:apply` | `[name]` | 执行：隔离 + TDD + 验证 + 复盘 |
| `/alloy:finish` | `[name]` | 收尾：merge / PR / keep / discard |
| `/alloy:archive` | `[name]` | 归档（硬校验 phase=finished，否则拒绝） |
| `/alloy:fix` | — | Bug 修复入口：诊断 → 不改 spec 直接 PR / 需改 spec 则创建新 change |
| `/alloy:discard` | `[name]` | 放弃当前 change，清理 worktree + 分支 + 目录 |
| `/alloy:status` | `[name]` | 查看当前阶段、制品状态、下一步 |

带 `[name]` 的命令，省略时自动从当前活跃 change 的上下文推断。

**上下文推断规则：** CLI 扫描 `openspec/changes/*/.alloy.yaml` → 仅 1 个活跃 change 自动选中 → 多个则提示选择 → 无活跃 change 报错，提示先 `alloy start`。

---

## 二、命令行为

### alloy start

```
/alloy:start [topic]

无活跃 change + 有 topic:
  → 全新开始: explore + brainstorming → draft.md
  → phase → started

无活跃 change + 无 topic:
  → "请提供主题: alloy start <topic>"

有 1 个活跃 change:
  → 自动接续，从 phase 断点继续

有多个活跃 change:
  → 列出所有活跃 change，用户选择接续哪个

附加选项:
  --new <topic>  无论是否有活跃 change，强制开始新流程
```

### alloy plan

```
/alloy:plan <name>
/alloy:plan [name]（省略时从当前活跃 change 推断）

前置检查: draft.md 存在
逐制品生成: proposal → design → specs → tasks → plan
每步生成后有审查窗口，可确认或要求修改
始终分步，不提供一键生成选项

/alloy:plan <name> --redo <id>
  读 schema DAG，删除指定制品及所有下游制品
  从指定制品重新生成
```

### alloy apply

```
/alloy:apply [name]（省略时从当前活跃 change 推断）

前置检查: plan.md 存在
执行步骤:
  1. superpowers:using-git-worktrees      → 隔离 workspace
  2. superpowers:subagent-driven-development → 逐任务执行
     传递: superpowers:test-driven-development
     传递: superpowers:requesting-code-review
  3. superpowers:verification-before-completion  → 代码行为验证
     + openspec-verify-change                    → verify.md
  4. retrospective.md（证据驱动复盘）
phase → applied
```

### alloy finish

```
/alloy:finish [name]（省略时从当前活跃 change 推断）

前置检查: verify.md 存在, 人工测试已通过（用户确认）
执行: superpowers:finishing-a-development-branch
  → 选项: merge / PR / keep / discard
  → 若选 PR，提示："如收到审查反馈，重新执行 alloy finish 进入 review 模式"
    → 再次执行时检测有 PR 审查反馈 → superpowers:receiving-code-review
phase → finished
```

### alloy archive

```
/alloy:archive [name]（省略时从当前活跃 change 推断）

前置检查（硬拒绝）: phase = finished
执行: openspec archive -y
  → sync delta spec + 归档到 archive/YYYY-MM-DD-<name>/
phase → archived
```

### alloy fix

```
/alloy:fix

执行: superpowers:systematic-debugging → 根因定位

不改 spec（实现偏离现有 spec）:
  → fix + verification-before-completion
  → 提示直接 PR

需改 spec（spec 需新增或修正）:
  → 明确提示:
    "修复需要变更 spec。
     触发新 change，建议: alloy start <建议名称>"
  → 不自动创建（让用户感知后手动发起）
```

### alloy discard

```
/alloy:discard [name]（省略时从当前活跃 change 推断）

确认提示: "将删除以下内容，不可恢复:
  - Change: <name>
  - Worktree: <path>
  - Branch: <name>
  - 目录: <change dir>
  输入 'discard <name>' 确认"

确认后清理:
  1. git worktree remove <path> --force（如存在）
  2. git branch -D <name>（如存在且未合并）
  3. rm -rf openspec/changes/<name>/
```

### alloy status

```
/alloy:status [name]（省略时显示当前活跃 change）

输出指定/当前 change 信息:
  阶段:    planned
  Change:  login-feature
  路径:    openspec/changes/login-feature/
  制品状态: draft ✓  proposal ✓  design ✗  specs ✗  tasks ✗  plan ✗
  下一步:  继续 alloy plan，等待 design 生成
```

---

## 三、状态文件

每个 change 目录内包含 `.alloy.yaml`，CLI 和内 AI 读写，用户不需要直接操作：

```yaml
# openspec/changes/<name>/.alloy.yaml
phase: started | planned | applied | finished | archived
worktree: .worktrees/<name>   # apply 阶段写入
```

`alloy start` 通过扫描 `openspec/changes/*/.alloy.yaml` 发现活跃 change。

---

## 四、制品依赖 DAG

```
Pre-OpenSpec:
  draft.md ← explore + brainstorming 产出

Schema DAG:
  proposal  ← 读 draft.md
    ├──→ specs     ← 依赖 proposal（不读 draft，防止行为 spec 被技术细节污染）
    │      └──→ tasks   ← 依赖 specs + design
    │            └──→ plan   ← 依赖 tasks（隐含 superpowers:writing-plans）
    │
    └──→ design   ← 依赖 proposal（读 draft.md，受 proposal 范围约束）

Apply:
  apply  ← 依赖 plan
    ├── git-worktrees  ← 隐含 superpowers:using-git-worktrees
    ├── subagent-dev   ← 隐含 superpowers:subagent-driven-development
    │                       传递: TDD + code-review
    ├── verify         ← 隐含 verification-before-completion
    │                        + openspec-verify-change → verify.md
    └── retrospective  →  retrospective.md
```

---

## 五、架构

```
用户输入 /alloy:*
       │
       ▼
  SKILL.md（薄入口）
       │
       ▼
  TypeScript CLI（控制层）
  ├── 命令路由
  ├── 前置检查（硬拒绝不满足条件）
  ├── 状态读写（.alloy.yaml）
  ├── DAG 解析（查找下游、级联重做）
  └── 调用 OpenSpec CLI + Superpowers skill
       │
       ▼
  大模型（内容层）
  ├── 写文档（proposal / design / specs / tasks / plan / retrospective）
  ├── 写代码（subagent 逐任务执行）
  └── 交互（explore Q&A / brainstorming 设计审批）
```

| 层 | 内容 | 可靠性 |
|----|------|--------|
| CLI 控制层 | 前置检查、状态管理、DAG 解析、文件操作 | 确定性强（TypeScript 逻辑） |
| Schema 制品层 | DAG 依赖、instruction 指令 | 硬约束（schema requires + instruction） |
| 大模型内容层 | 文档生成、代码生成、交互式决策 | 柔性（AI 发挥，人类审查） |

---

## 六、已讨论问题的处理方案

| # | 问题 | 方案 |
|----|------|------|
| 1 | 断点恢复 | `alloy start` 自动检测 `.alloy.yaml` 状态，智能接续 |
| 2 | apply 中途失败 | 增加 `applying` 过渡状态 + worktree 路径记录，恢复时跳过已完成的子步骤 |
| 3 | rollback / discard | `alloy discard` 一键清理 change 目录 + worktree + 分支 |
| 4 | 修改已审定制品 | `alloy plan --redo <id>`，CLI 解析 DAG 取下游制品 + 级联重做 |
| 5 | 多 change 并行 | `.alloy.yaml` per-change，`alloy start` 检测到多个时让用户选择 |
| 6 | PR 反馈修改归属 | retrospective 反映 apply 刚完成的状态，PR 反馈记在 git history |
| 7 | `--ff` 取消 | `alloy plan` 始终分步，不提供一键生成 |
| 8 | state 文件可见性 | `.alloy.yaml` 为内部实现细节，用户通过 `alloy status` 查看 |
| 9 | 版本兼容性 | `compat.yaml` 声明兼容范围 + `alloy doctor` 诊断 |
| 10 | 首次安装 | `alloy init` 项目级部署：检测依赖 → 初始化 → 部署 schema + skill |
| 11 | 用户跳过阶段 | 接受限制，不做硬阻止；`alloy start` 自动检测不一致状态并警告 |

---

## 七、安装与初始化

```bash
npm install -g @alloy/cli              # 安装 Alloy CLI（全局）

cd your-project
alloy init                             # 项目级初始化
```

### alloy init 行为

```
alloy init
  ├── 1. 环境检查
  │      Node.js ✓ / git ✓
  │
  ├── 2. 依赖检测（不自动安装，仅检查和提示）
  │      openspec --version
  │        ✓ v1.3.1（兼容）
  │        ✗ 未安装 → "请先: npm install -g @fission-ai/openspec"
  │        ⚠ 版本不兼容 → "请升级版本 >= 1.3.0"
  │      superpowers 插件
  │        ✓ 已安装（兼容）
  │        ✗ 未安装 → "请通过 Claude Code 插件系统安装"
  │
  ├── 3. OpenSpec 项目初始化
  │      openspec init（如未初始化）
  │
  ├── 4. 部署 Alloy（仅项目级）
  │      复制 schema.yaml + templates → openspec/schemas/alloy/
  │      复制 skill 文件 → .claude/skills/alloy/
  │
  └── 5. 提示路由规则（默认不注入 CLAUDE.md）
         "建议将以下行加入 CLAUDE.md:
          本项目的开发工作流由 Alloy 管理。
          新功能: /alloy:start <topic>，Bug: /alloy:fix"
```

---

## 八、关键设计决策

| # | 决策 | 理由 |
|----|------|------|
| 1 | `/alloy:start` 作为唯一入口，默认接续 | 用户只需记住一个命令，降低心智负担 |
| 2 | plan 始终分步，不提供一键生成 | 每步审查的价值大于省下的几秒 |
| 3 | `.alloy.yaml` per-change，非全局 | 天然支持多 change 并行，discard 只需删目录 |
| 4 | 前置检查在 CLI 层实现，不在 prompt 层 | 硬拒绝 > 软约定，可靠性优先 |
| 5 | `alloy init` 只做项目级初始化 | Alloy 本质是项目级工作流定义，全局安装不讲道理 |
| 6 | 不自动安装 OpenSpec/Superpowers | Alloy 的边界是工作流编排，上游依赖由用户管理 |
| 7 | 不自动注入 CLAUDE.md | 用户的项目文档不应被工具修改 |
| 8 | CLI 控制层 + Schema 制品层 + AI 内容三层架构 | 骨架和血肉分离，各层可靠性独立保障 |
