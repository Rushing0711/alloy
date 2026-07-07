# Alloy

**Alloy 是 AI 编码 Agent 的驾驶舱。** 把需求管理（OpenSpec）和流程纪律（Superpowers）编成一条 5 阶段流水线——你只管 `/alloy:start`，剩下的编排、校验、归档全自动。

| 有 Alloy | 裸用 AI Agent |
|----------|-------------|
| 需求 → draft → specs，完整审计链 | "帮我加个功能"——需求在聊天里 |
| 5 阶段 hard gate，脚本校验 | 无闸门，Agent 自由发挥 |
| TDD + code review + 双层验证 | 靠 Agent 自觉 |
| 任意阶段退出，回来随便打哪个命令都能接上（precheck 路由自动转发）| 掉线从头开始 |
| 做到一半改需求？编码未开始就回溯修正，已开始开新 change | 规格和代码分叉 |
| 需求变更越界？检查点回退到 brainstorming 锚点，已锁定制品不丢 | 改了忘回去 |
| 每次 change 结束自动复盘，教训反哺下次 | 每次都从零开始 |
| 每个制品 hash 锁定 + 独立 commit，完整可追溯 | 改了什么都记不住 |
| 阶段完成自动衔接，选"继续"直接进下一阶段 | 每阶段手动输命令 |
| 多步操作下沉原子 CLI（`_worktree-cleanup` / `_archive` / `_artifact commit`），确定性执行 | Agent 手写多步 bash 易出错 |
| skill 与 spec 对账（`_spec-audit`），frontmatter 漂移检测 | 文档与代码漂移 |
| init 配置权限白名单（allow alloy/git/openspec，deny force/reset/rm）+ `.gitattributes` 强制 LF | Windows CRLF 警告 / 反复确认命令 |

---

## 工作流

```
/alloy:start    [1/5]  智能入口 → 需求探索 → draft.md
/alloy:plan     [2/5]  proposal → design → specs → tasks → plan（每步审查）
/alloy:apply    [3/5]  worktree 隔离 → TDD 实现 → 双层验证 → 复盘（start/plan + apply 早期可创建检查点）
/alloy:archive  [4/5]  Delta Spec 合并 → 移入 archive/
/alloy:finish   [5/5]  merge / PR / keep（人工闸门）
```

任意阶段退出，回来随便打哪个命令都能自动接上。

---

## 检查点回溯

apply 之前（start/plan 全程 + apply 早期），创建检查点锚定当前状态。需求变更越界或 apply 出问题时，原子回退到检查点，已锁定的制品不丢。

```bash
alloy _checkpoint create --reason "draft 锁定,准备 apply"   # 创建检查点(git tag)
alloy _checkpoint list                                       # 查看所有检查点
alloy _checkpoint switch <tag>                               # 原子回退（git checkout -B + state 自动恢复）
alloy _checkpoint clean                                      # 清理检查点
```

- **phase 限制**：start/plan 全程 + apply 早期（worktree 未创建 + SDD/EP 未启动）可创建；apply 中后期 + archive/finish 禁止
- **三种 kind**：`brainstorming-N`（draft 锁定锚点）/ `progress-<ts>`（放弃变更快照）/ 不传（用户主动）
- **switch 原子回退**：`git checkout -B` 回到 tag，`.alloy.yaml`/records/phase_timings/skill_usage 自动恢复
- **典型场景**：越界变更回 brainstorming 重新沟通 / 放弃变更回 progress 快照 / apply 早期回退

---

## 安装

```bash
npm install -g @flyin-ai/alloy
cd your-project
alloy init
```

`alloy init` 交互式完成环境检测、选择 AI Agent、部署命令和 schema。支持 Claude Code、Cursor、OpenCode 等 8 个平台。

---

## 命令速查

### Slash Command（Agent 内使用）

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

### CLI 命令（终端使用）

| 命令 | 用途 |
|------|------|
| `alloy init [path]` | 项目初始化 |
| `alloy status [path]` | 活跃 change 总览（支持 `--json`） |
| `alloy doctor [path]` | 诊断：版本兼容、文件一致性（支持 `--json`） |
| `alloy update [path]` | 更新命令和 schema 到最新版 |

### 内部命令（Agent 自动调用，原子操作）

| 命令 | 用途 |
|------|------|
| `alloy _checkpoint` | 检查点管理（create/list/switch/clean），回溯到锚点 |
| `alloy _verify` | 阶段转换校验（phase-enter/phase-exit），CLI 确定性校验制品+state+目录 |
| `alloy _retro` | 自动生成复盘 retrospective.md（§0 量化全景 + §4 技能审计）|
| `alloy _spec-audit` | skill frontmatter 与 spec behaviors 对账（支持 --fix）|
| `alloy _worktree-cleanup` | worktree 清理原子操作（merge+remove+branch-d+时间戳）|
| `alloy _artifact` | 制品 hash 锁定 + 独立 commit |

---

## 文档导航

| 我想… | 读这个 |
|-------|------|
| 快速上手使用 | [handbook.md](docs/handbook.md) |
| 看完整产品规格 | [specification/01-product-spec.md](docs/specification/01-product-spec.md) |
| 写或改 Alloy Skill | [reference/skill-writing-guide.md](docs/reference/skill-writing-guide.md) |
| 理解设计背景 | [background/](docs/background/) — 起源 / 工具对比 / 流程推导 |

---

## 依赖

[OpenSpec](https://github.com/Fission-AI/OpenSpec) · [Superpowers](https://github.com/obra/superpowers) · Node.js ≥ 18 · git

---

## 许可

MIT
