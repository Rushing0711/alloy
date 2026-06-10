# Alloy

**Alloy 是 AI 编码 Agent 的驾驶舱。** 它不写代码，而是告诉 Agent **何时写、怎么写、写完谁来把关**。

---

## 为什么不直接用 AI Agent 裸写？

1. **需求漂移** — Agent 理解的"要做的东西"和你想要的不一样，聊着聊着范围就跑了
2. **质量靠自觉** — TDD、代码审查、分支隔离全看 Agent 当天心情，前脚记得后脚忘
3. **改完不留痕** — 代码改了，但"为什么这么改"、"变了哪些 spec"没记录，换人就断片

| | Alloy | 裸用 AI Agent |
|------|------|------|
| 需求管理 | brainstorming → draft → proposal → specs，完整审计链 | "帮我加个功能"——需求在聊天里 |
| 流程闸门 | 5 阶段 hard gate，每阶段脚本校验 | 无闸门，Agent 自由发挥 |
| 制品追踪 | 8 制品 DAG + hash 锁定 + 每制品独立 commit，精准回溯 | 改了什么都记不住 |
| 隔离环境 | 可选 worktree，自动管理 | 直接在主分支上改 |
| 质量保证 | TDD + code review + 双层验证 | 靠 Agent 自觉 |
| 掉线恢复 | 任意阶段退出，回来随便打哪个命令，自动接续 | 掉线从头开始 |
| 事后复盘 | evidence-driven retrospective，教训跨周期传递 | 无 |
| 自我优化 | 复盘数据自动反哺下一个 change | 每次都从零开始 |

---

## Alloy 是什么？

Alloy 把两个工具缝合到一起：

| 工具 | 管什么 | 各自缺的 |
|------|--------|---------|
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | "做成什么样" — 需求追踪、Delta Spec、归档审计 | 有文档没纪律：不强 TDD、不强审查、不强隔离 |
| [Superpowers](https://github.com/obra/superpowers) | "怎么做" — 流程闸门、TDD、系统化调试、验证 | 有纪律没档案：改了代码但没记录"变了什么 spec" |
| **Alloy** | **编排两者** — 规格管理 + 流程纪律 = 完整且不可跳步的工作流 | — |

不是什么新框架（不引入新 DSL），也不以"快"为卖点——审查窗口和闸门让流程比一把梭更慢。慢是故意的：省下的时间是拿质量换的。

适合：用 Claude Code 等 AI Agent 做日常开发、对代码质量有要求、需要需求追踪和审计归档的团队。

---

## 安装

```bash
npm install -g @flyin-ai/alloy
cd your-project
alloy init
```

`alloy init` 交互式完成：

1. 检测环境（Node.js ≥ 18 + git）
2. 选择安装范围（project / global）
3. 选择目标 AI Agent（Claude Code、Cursor、OpenCode 等 8 个平台可多选）
4. 安装 OpenSpec CLI + Superpowers（检测已有安装并提示用户决策）
5. 部署命令和 schema 到各平台目录（检测已有部署并提示用户决策）
6. 注册 shell 补全（bash/zsh/PowerShell）
7. 兼容性检查

---

## 工作流

```
/alloy:start    [1/5]  智能入口 — 状态检测 → 上下文探查 → 需求设计 → draft.md
/alloy:plan     [2/5]  制品生成 — proposal → design → specs → tasks → plan（每步审查）
/alloy:apply    [3/5]  隔离执行 — worktree(可选) + SDD/串行(可选) + 双层验证 + 复盘
/alloy:archive  [4/5]  归档 — Delta Spec 合并主 spec → 移入 archive/ → 提交
/alloy:finish   [5/5]  收尾 — merge / PR / keep（人工闸门）
```

| 制品 | 阶段 | 说明 |
|------|------|------|
| `draft.md` | start | 需求探索 + 设计决策 |
| `proposal.md` | plan | 变更提案，创建 specs 的合约 |
| `design.md` | plan | 技术决策、架构、数据流 |
| `specs/*.md` | plan | 行为契约（Delta Spec） |
| `tasks.md` | plan | 实现任务清单 |
| `plan.md` | plan | 执行剧本（含代码片段） |
| `verify.md` | apply | 7 项结构化检查结果 |
| `retrospective.md` | apply | 证据驱动复盘（§0-§6） |

---

## 命令速查

### Slash Command（AI Agent 内使用）

| 命令 | 用途 |
|------|------|
| `/alloy:start [topic]` | 智能入口：状态检测 → 需求设计 |
| `/alloy:plan [name]` | 规划：proposal → design → specs → tasks → plan |
| `/alloy:apply [name]` | 执行：worktree + 实现 + 验证 + 复盘 |
| `/alloy:archive [name]` | 归档：Delta Spec 合并 + 提交 |
| `/alloy:finish [name]` | 收尾：merge / PR / keep |
| `/alloy:fix` | Bug 修复：诊断 → 分流 |
| `/alloy:discard [name]` | 放弃 change，清理现场 |
| `/alloy:status [name]` | 查看阶段、制品、下一步 |

> **命名约定：** 命令以冒号为主格式（`alloy:start`）——冒号在 Claude Code 等平台提供命名空间分组，输入 `/alloy:` 即可看到全部子命令。冒号改横线是单向派生（→ `alloy-start`），因此选冒号做主格式。不支持冒号的 Agent（Cursor、OpenCode、Codex 等）自动获得横线版。

### CLI 命令（终端使用）

| 命令 | 用途 |
|------|------|
| `alloy init [path]` | 项目初始化 |
| `alloy status [path]` | 活跃 change 总览（支持 `--json`） |
| `alloy doctor [path]` | 诊断：版本兼容、文件一致性（支持 `--json`） |
| `alloy update [path]` | 更新命令和 schema 到最新版 |

---

## 核心特性

**流程闸门，不是建议。** TDD 跳过？脚本阻断。code review 跳过？制品 hash 对不上。5 个阶段每步都有硬校验——不是"建议你这么做"，而是"不这么做就走不下去"。

**OpenSpec + Superpowers，一条命令搞定。** OpenSpec 管规格（做了没有），Superpowers 管纪律（做对了没有）。两个工具各自强大，但技能繁多、组合复杂。Alloy 把它们编成一条 5 阶段流水线——你只管 `/alloy:start`，剩下的编排、调度、校验全自动。不用学两个工具的 20+ 个技能，一条命令走到交付。

**随便打哪个命令，都能接上。** 退出时在 plan 阶段，回来不小心打了 `/alloy:apply`？系统自动检测进度，跳到正确位置继续。不需要记住"上次做到哪了"。

**改需求不乱。** 做到一半用户说要改需求？系统检查编码是否已经开始——还没写就回溯修正，已经写了就开新 change。规格和代码不会分叉。

**每次做完，下次更聪明。** 每次 change 结束自动生成复盘——踩了什么坑、什么假设被推翻、哪些改进没完成。这些教训自动写进 memory，下次开新 change 时自动提醒。

**每一步都可追溯。** 需求、设计、规格、任务、验证、复盘——每个产出独立 hash 锁定 + 独立 commit。谁在什么时候确认了什么，一条链完整可查。

> 完整设计细节见 [产品规格](docs/specification/01-product-spec.md)。

---

## 文档导航

| 我想… | 读这个 |
|-------|------|
| **快速上手使用 Alloy** | [handbook.md](docs/handbook.md) |
| 看完整产品规格 | [specification/01-product-spec.md](docs/specification/01-product-spec.md) |
| 看终端输出视觉规范 | [specification/02-visual-spec.md](docs/specification/02-visual-spec.md) |
| 写或改 Alloy Skill | [reference/skill-writing-guide.md](docs/reference/skill-writing-guide.md) |
| 理解设计背景与推导 | [background/](docs/background/) — 项目起源 / 工具对比 / 流程推导 |
| 构建、测试、调试 Alloy | [handbook.md](docs/handbook.md#五构建与测试) |

---

## 依赖

| 依赖 | 版本 | 说明 |
|------|------|------|
| [OpenSpec CLI](https://github.com/Fission-AI/OpenSpec) | `>=1.3.0 <2.0.0` | 需求管理和 Delta Spec 追踪 |
| [Superpowers](https://github.com/obra/superpowers) | `>=5.0.0 <6.0.0` | 流程闸门技能 |
| Node.js | ≥ 18 | 运行时 |
| git | — | 版本控制 |

---

## 许可

MIT
