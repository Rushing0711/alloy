# OpenSpec & Superpowers 对比

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

## OpenSpec 官方文档精要

以下 8 个文档均来自 https://github.com/Fission-AI/OpenSpec/tree/main/docs 。

### 1. Getting Started（入门指南）

**核心流程**：`/opsx:propose → /opsx:apply → /opsx:sync → /opsx:archive`

**目录结构**：
```
openspec/
├── specs/          ← 主 spec 库（系统的"真相源"）
├── changes/        ← 变更区（每个功能一个文件夹）
└── config.yaml     ← 项目配置
```

**四个工件**：
| 工件 | 职责 |
|------|------|
| `proposal.md` | 为什么做、做什么、范围与方案 |
| `specs/` | Delta Spec（ADDED / MODIFIED / REMOVED Requirements） |
| `design.md` | 技术方案与架构决策 |
| `tasks.md` | 层级编号的 checkbox 实现清单 |

**依赖关系**：`proposal → specs`，`proposal → design → tasks`。依赖是使能而非门禁。

**归档合并规则**：ADDED 追加到主 spec → MODIFIED 替换对应条目 → REMOVED 从主 spec 删除。Change 移入 `archive/YYYY-MM-DD-<name>/` 保留审计历史。

**Dark Mode 演练**：完整演示了 propose（生成工件）→ apply（按条目实现 30+ tasks）→ archive（合并 spec + 归档）的全流程。

---

### 2. Workflows（工作流）

**核心理念**：命令是"你可以做的事"，不是"你被困住的阶段"。依赖展示可能性，不规定下一步必须做什么。

**两种模式**：

| 模式 | 命令数 | 命令列表 |
|------|--------|----------|
| Core（默认） | 5 | propose, explore, apply, sync, archive |
| Custom（完整） | 11 | 上述 5 + new, ff, continue, verify, bulk-archive, onboard |

**三种工作流模式**：
1. **Quick Feature**（需求明确）：`new → ff → apply → verify → archive`
2. **Exploratory**（需求模糊）：`explore → new → continue → apply`
3. **Parallel Changes**（多 change 并行）：多个 change 同时开发，最后 `bulk-archive` 批量归档

**ff vs continue 选择**：

| 场景 | 用 |
|------|-----|
| 需求明确，可以一次性描述完整范围 | `/opsx:ff` |
| 边做边摸索，想逐步审查 | `/opsx:continue` |
| 时间紧迫，快速推进 | `/opsx:ff` |
| 复杂变更，需要掌控力 | `/opsx:continue` |

**何时更新 change vs 开新 change**：意图没变只是执行优化 → 更新；意图根本改变 → 新 change。

---

### 3. Commands（Slash Command 参考）

**Core 命令**：

| 命令 | 用途 |
|------|------|
| `/opsx:propose [name]` | 创建 change + 生成全部规划工件 |
| `/opsx:explore [topic]` | 探索性对话，纯只读 |
| `/opsx:apply [name]` | 按 tasks.md 按条目实现 |
| `/opsx:sync [name]` | 合并 Delta Spec 到主 spec |
| `/opsx:archive [name]` | 归档 change |

**Custom 命令**：

| 命令 | 用途 |
|------|------|
| `/opsx:new [name] [--schema]` | 创建空 change 目录 |
| `/opsx:ff [name]` | 一键创建全部剩余工件 |
| `/opsx:continue [name]` | 按依赖图逐个创建工件 |
| `/opsx:verify [name]` | 三维度验证：完整性/正确性/一致性 |
| `/opsx:bulk-archive` | 批量归档 |
| `/opsx:onboard` | 11 阶段新手引导 |

**AI 工具语法差异**：Claude Code 用 `/opsx:propose`（冒号），Cursor/Windsurf/Copilot IDE 用 `/opsx-propose`（连字符），Kimi/Trae 用 skill 调用 `/skill:openspec-propose`。

**Legacy 命令**（仍可用但不推荐）：`/openspec:proposal`、`/openspec:apply`、`/openspec:archive`。

---

### 4. CLI（命令行参考）

**命令分类**：

| 类别 | 命令 | 用途 |
|------|------|------|
| 设置 | `init`, `update` | 初始化/刷新项目 |
| 工作区 | `workspace setup/list/link/doctor` | 跨仓库协调（beta） |
| 浏览 | `list`, `show`, `view` | 查看 change/spec |
| 验证 | `validate` | 校验结构问题 |
| 生命周期 | `archive` | 终端归档 |
| 工作流 | `status`, `instructions`, `templates`, `schemas` | 工件状态与指引 |
| Schema | `schema init/fork/validate/which` | 自定义工作流 |
| 配置 | `config` | 全局配置管理 |
| 其他 | `feedback`, `completion` | 反馈、shell 补全 |

**Human vs Agent 命令**：多数命令支持 `--json` 输出供 agent 消费。`init`、`view`、`config edit`、`feedback` 仅人类使用。

**环境变量**：`OPENSPEC_TELEMETRY=0` 关闭遥测，`OPENSPEC_CONCURRENCY` 控制批量验证并发数。

**支持的 AI 工具**：29 种，用 `--tools <id>` 指定（如 `claude`, `cursor`, `gemini`, `github-copilot`, `windsurf` 等）。

---

### 5. Concepts（核心概念）

**Spec（规格）**：
- **Requirement**：系统必须具备的具体行为（"做什么"）
- **Scenario**：Requirement 的具体示例（"怎么做"），用 Given/When/Then 格式
- **RFC 2119 关键词**：MUST/SHALL（绝对）、SHOULD（推荐）、MAY（可选）
- **边界**：Spec 是行为契约，不写类名、库选型、逐步流程——那些属于 design.md 或 tasks.md
- **渐进式严格度**：大多数用 Lite Spec，高风险场景用 Full Spec

**Change（变更）**：自包含文件夹，包含 proposal + Delta Spec + design + tasks，并行开发互不干扰。

**Delta Spec（增量规格）**：只描述变化量。三个区段：ADDED（追加）、MODIFIED（替换）、REMOVED（删除）。四大价值：清晰、无冲突、高效审查、Brownfield 友好。

**Schema（模式）**：定义工作流的工件类型和依赖图。默认 `spec-driven`。可 fork 或自建。

**Archive（归档）**：合并 Delta Spec 到主 spec → 移入 `archive/YYYY-MM-DD-<name>/`。非破坏性，完整审计。

**Coordination Workspaces（协调工作区，beta）**：跨多个仓库/文件夹的规划层。workspace → link → change 三层模型。

---

### 6. Supported Tools（工具支持）

**完整兼容 29 种 AI 工具**：Claude Code、Cursor、Windsurf、Gemini CLI、GitHub Copilot、Codex、Cline、Kimi CLI、Trae、RooCode、Qwen Code 等。

**生成文件类型**：
- **Skills**：`<tool-path>/skills/openspec-*/SKILL.md`（AI 能力定义）
- **Commands**：`<tool-path>/commands/opsx-<id>.md`（slash command 入口）

**特殊说明**：
- Codex 的 commands 装在全全局目录 `$CODEX_HOME/prompts/`
- GitHub Copilot 的 prompt 文件仅 IDE 扩展可用，CLI 不支持
- ForgeCode、Kimi CLI、Trae 仅生成 skill，不生成 command

**非交互式初始化**：`openspec init --tools claude,cursor` 或 `--tools all`

---

### 7. Multi-Language（多语言）

**配置方式**：在 `openspec/config.yaml` 中添加语言指令：
```yaml
context: |
  Language: 简体中文
  All artifacts must be written in Simplified Chinese.
```

**支持的语言**：葡萄牙语、西班牙语、中文、日语、法语、德语（通过 context 指令实现，不限于这 6 种）。

**技巧**：
- 技术术语（API、REST、GraphQL）可保留英文
- 代码示例和路径不受影响
- 用 `openspec instructions proposal --change <name>` 验证语言配置生效

---

### 8. Customization（定制）

**三层定制**：

| 层级 | 用途 | 受众 |
|------|------|------|
| 项目配置 | 默认 schema、注入 context/rules | 大多数团队 |
| 自定义 Schema | 定义自有工件和依赖 | 特殊流程的团队 |
| 全局覆盖 | 跨项目共享 schema | 高级用户 |

**项目配置**（`openspec/config.yaml`）：设置默认 schema、注入项目 context（技术栈、数据库等）、按工件类型添加 rules。

**自定义 Schema**：
- Fork 现有：`openspec schema fork spec-driven my-workflow`
- 从零创建：`openspec schema init <name>`
- Schema 结构：artifacts 数组（id、template、instruction、requires）+ apply 配置
- 验证：`openspec schema validate <name>`
- 调试：`openspec schema which <name>`

**Schema 优先级**：CLI `--schema` > change 元数据 > 项目 config > 默认 spec-driven

**社区 Schema**：文档提到的 `superpowers-bridge`（@JiangWay）直接将 OpenSpec 的工件治理与 Superpowers 的执行技能整合，增加了 Superpowers 原生缺失的 retrospective 工件。
