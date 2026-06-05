# OpenSpec & Superpowers 对比

> **目标读者：** 想理解 Alloy 设计基础的人（人类）
> **职责：** 记录 OpenSpec 和 Superpowers 各自的命令/技能、优缺点、互补关系——这是 Alloy 融合设计的基础调研。
> **不放入：** 融合编排方案 → 见 [workflow-design.md](../background/03-workflow-evolution.md)；Alloy 产品规格 → 见 [alloy-design.md](../specification/01-product-spec.md)。

## 官方文档

| 工具 | 仓库 | 文档 |
|------|------|------|
| **OpenSpec** | https://github.com/Fission-AI/OpenSpec | https://github.com/Fission-AI/OpenSpec/tree/main/docs |
| **Superpowers** | https://github.com/obra/superpowers | https://github.com/obra/superpowers |

## 技能/命令一览

### OpenSpec（11 条 Slash Command + CLI）

**Slash Command**

| 命令 | 用途 |
|------|------|
| `/opsx:propose [name]` | 创建 change 并生成全部规划工件 |
| `/opsx:explore [topic]` | 探索代码库、对比方案，纯只读 |
| `/opsx:apply [name]` | 按 tasks.md 按条目实现 |
| `/opsx:verify [name]` | 三维度验证（完整性/正确性/一致性） |
| `/opsx:sync [name]` | 合并 Delta Spec 到主 spec |
| `/opsx:archive [name]` | 归档 change，保留审计历史 |
| `/opsx:new [name]` | 创建空 change 目录（Custom） |
| `/opsx:ff [name]` | 一键生成全部工件（Custom） |
| `/opsx:continue [name]` | 按依赖图逐个创建工件（Custom） |
| `/opsx:bulk-archive` | 批量归档（Custom） |
| `/opsx:onboard` | 新手引导（Custom） |

**CLI（核心）**

| 命令 | 用途 |
|------|------|
| `openspec init [path] [--tools]` | 初始化项目 |
| `openspec update [path]` | 刷新 AI 指令文件 |
| `openspec list [--specs\|--changes]` | 列出 change 或 spec |
| `openspec show [name]` | 查看详情 |
| `openspec validate [name\|--all]` | 校验结构 |
| `openspec archive [name]` | 终端归档 |
| `openspec status [--change <name>]` | 查看工件状态 |
| `openspec config <subcommand>` | 全局配置 |

---

### Superpowers（14 个 Skill）

| Skill | 用途 |
|------|------|
| `brainstorming` | 需求探索 → 设计文档 → 用户审批 |
| `writing-plans` | 将设计文档转化为分步实现计划 |
| `executing-plans` | 按计划执行实现（SDD 不可用时的降级方案） |
| `subagent-driven-development` | 按计划分派子 agent 执行（首选，内部含 TDD + review） |
| `test-driven-development` | RED-GREEN-REFACTOR 循环 |
| `verification-before-completion` | 声明完成前强制验证 |
| `requesting-code-review` | 合并前代码审查 |
| `receiving-code-review` | 接收审查反馈，修改代码 |
| `finishing-a-development-branch` | 合并/PR/清理的完成流程 |
| `using-git-worktrees` | 功能分支隔离 |
| `systematic-debugging` | 结构化调试：观察→假设→验证 |
| `dispatching-parallel-agents` | 并行调度多个子 agent |
| `writing-skills` | 创建/编辑/验证 skill |
| `using-superpowers` | 入口 skill，自动匹配 |

---

## 优缺点

### OpenSpec

**优点：**
- **Spec 即真相源** — proposal/specs/design/tasks 结构化文档，人和 AI 共享同一份"合同"
- **Delta Spec 机制** — 只写变化量，不改全文，brownfield 项目渐进引入
- **归档审计** — `archive/YYYY-MM-DD/` 完整保留每次变更历史，可追溯"这个功能当时怎么设计的"
- **极简入口** — Core 模式 5 条命令覆盖 90% 场景，学习成本低
- **多工具兼容** — 同一套配置支持 25+ AI 工具

**缺点：**
- **无流程纪律** — 不强制 TDD、不强制代码审查、不强制分支隔离。全靠开发者自觉
- **无测试支持** — 没有测试相关的 skill 或命令，单元测试需自行处理
- **无调试工具** — bug 修复靠 `/opsx:explore` 充当"诊断室"，缺乏系统化调试流程
- **依赖 AI 执行质量** — slash command 的行为完全取决于 skill 文件怎么写，session 中可能出现 archive 忘 sync 等问题

---

### Superpowers

**优点：**
- **硬性流程闸门** — brainstorming HARD GATE 禁止在审批前写代码；TDD skill 要求"NO CODE WITHOUT A FAILING TEST"
- **系统化调试** — systematic-debugging 提供结构化诊断流程（观察→分析→假设→修复）
- **内置质量保障** — verification + code-review + finishing 三重检查，覆盖合并前到完成的全流程
- **分支隔离** — using-git-worktrees 鼓励功能分支开发
- **设计先行** — brainstorming 阶段产出设计文档，设计审批后才进入实现

**缺点：**
- **无 spec 追踪** — 设计文档只有最终版，没有"这次改了什么"的 delta 记录
- **无归档审计** — `docs/superpowers/specs/` 和 `plans/` 没有版本化的变更历史
- **技能负担重** — 14 个 skills，实际使用中容易被跳过（如 TDD、verification 在真实 session 中均未触发）
- **流程较重** — brainstorming → writing-plans → executing → verification → code-review → finishing 完整链路过长，适合正式项目，不适合快速原型
- **无多工具支持** — 仅适配 Claude Code 和 Copilot CLI

---

## 互补关系

```
Superpowers 擅长                    OpenSpec 擅长
─────────────────                   ─────────────────
流程纪律（闸门、TDD、审查）    ←→    文档追踪（Delta Spec、审计）
调试（systematic-debugging）   ←→    需求管理（propose、explore）
质量保障（verify、review）     ←→    变更历史（archive、spec 演进）
分支管理（git-worktrees）      ←→    多 change 并行（bulk-archive）
```

两者不是替代关系——Superpowers 管**怎么做**（流程），OpenSpec 管**做成什么样**（规格）。融合思路：用 OpenSpec 管理需求和变更追踪，用 Superpowers 的流程闸门增强执行纪律。

---

## 参考链接

- [OpenSpec 官方文档](https://github.com/Fission-AI/OpenSpec/tree/main/docs) — 入门指南、工作流、命令参考、CLI、核心概念、多语言、定制化等
- [Superpowers 仓库](https://github.com/obra/superpowers) — 技能列表和使用说明
