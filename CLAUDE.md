# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 仓库用途

**Alloy** 是一套融合 OpenSpec（Fission-AI）和 Superpowers（obra）的开发工作流 CLI 工具。用 OpenSpec 管理"构建什么"（需求追踪、Delta Spec、审计归档），用 Superpowers 管理"如何构建"（流程闸门、TDD、系统化调试、验证）。

## 构建与测试

```bash
npm run build       # tsc 编译 TypeScript
npm run dev         # tsc --watch 开发模式
npm test            # vitest run（一次性运行全部测试）
npm run test:watch  # vitest（交互式 watch 模式）
```

运行单个测试文件：
```bash
npx vitest run test/cli/state.test.ts
```

Node.js ≥ 22，TypeScript 源码在 `src/`，编译产物输出到 `dist/`。

## 代码架构

```
src/cli/
  index.ts              # CLI 入口（alloy init/status/doctor/update）
  commands/
    init.ts             # alloy init — 环境检测 → 依赖安装 → 部署 schema + skill
    status.ts           # alloy status — 活跃 change 总览
    doctor.ts           # alloy doctor — 版本兼容性 + 文件一致性诊断
    update.ts           # alloy update — 更新 skill 文件到最新版
  utils/
    state.ts            # .alloy.yaml 状态文件读写
src/core/
    types.ts            # 共享类型定义
    detect.ts           # 环境检测（Node.js / git / Claude Code）
    openspec.ts         # OpenSpec CLI 安装 + 项目初始化
    superpowers.ts      # Superpowers 安装（含 vendor 兜底）
    skills.ts           # Alloy skill + schema 部署
    claude-md.ts        # CLAUDE.md 注入
    compat.ts           # compat.yaml 兼容性检查
src/utils/
    fs.ts               # 文件系统工具（包根目录定位）

.claude/skills/
  alloy/SKILL.md        # 路由层 — 按 phase 分发到子命令
  alloy/scripts/
    alloy-state.sh      # 状态文件操作（Agent 不直接写 YAML）
    alloy-guard.sh      # 阶段闸门 HARD STOP 校验
    alloy-archive.sh    # 归档操作
  alloy-start/SKILL.md  # 智能入口：状态检测 → explore + brainstorming → draft.md
  alloy-plan/SKILL.md   # 规划：制品生成 proposal/design/specs/tasks/plan
  alloy-apply/SKILL.md  # 执行：worktree 隔离 + SDD(TDD) + verify + retrospective
  alloy-finish/SKILL.md # 收尾：merge / PR / keep / discard 人工闸门
  alloy-archive/SKILL.md# 归档：硬校验 phase=finished → openspec archive
  alloy-fix/SKILL.md    # Bug 修复：diagnose → 分流（不改 spec / 需改 spec）
  alloy-discard/SKILL.md# 放弃：按 phase 分级清理
  alloy-status/SKILL.md # 状态：查看阶段、制品、下一步

openspec/schemas/alloy/
  schema.yaml           # 制品 DAG 依赖定义
  instructions/         # 制品指令文件（每制品一个 .md，定义生成规则）
  templates/            # 制品模板（proposal/design/specs/tasks/plan/retrospective）

vendor/superpowers/     # Superpowers skill 内置兜底（离线安装用）
```

**三层架构：** CLI 控制层（TypeScript，确定性）→ Schema 制品层（DAG + instruction，硬约束）→ 大模型内容层（文档/代码生成，柔性+人类审查）。

## 核心文档及关系

| 文件 | 角色 | 内容 |
|------|------|------|
| `docs/alloy-design.md` | **主设计文档**（权威源） | Alloy 命令体系、状态管理、制品 DAG、架构、问题方案、安装初始化 |
| `docs/openspec-vs-superpowers.md` | 原始对比分析 | OpenSpec vs Superpowers 命令/技能一览、优缺点、互补关系 |
| `docs/workflow-design.md` | 工作流设计推导 | 4 阶段融合流程、3 种场景（新项目/存量项目/Bug 修复）、技能使用分析 |
| `docs/alloy-design.md` | **主设计文档**（权威源） | Alloy 命令体系、状态管理、制品 DAG、架构、问题方案、安装初始化 |
| `docs/skill-writing-guide.md` | **Skill 编写指南** | 来自 skill-creator、writing-skills、Comet、Claude Code 官方文档的编写规范和最佳实践 |

**阅读顺序：** 先看 `docs/openspec-vs-superpowers.md` 了解上游对比 → `docs/workflow-design.md` 了解设计推导 → `docs/alloy-design.md` 了解功能全貌；写代码前必读 `docs/skill-writing-guide.md`。

## Alloy 核心设计（摘要自 docs/alloy-design.md）

### 命令体系（8 条 Slash Command + 4 条 CLI）

| Slash Command | 用途 |
|------|------|
| `/alloy-start [topic]` | 智能入口：自动检测状态，接续或新建 |
| `/alloy-plan [name]` | 制品生成设计文档，始终分步，每步可审查 |
| `/alloy-apply [name]` | 执行：隔离 + TDD + 验证 + 复盘 |
| `/alloy-finish [name]` | 收尾：merge / PR / keep（硬校验 phase=archived） |
| `/alloy-archive [name]` | 归档：Delta Spec 合并（硬校验 phase=applied） |
| `/alloy-fix` | Bug 修复入口：诊断 → 三向分流 |
| `/alloy-discard [name]` | 放弃当前 change，清理 worktree + 分支 + 目录 |
| `/alloy-status [name]` | 查看当前阶段、制品状态、下一步 |

CLI 命令：`alloy init` / `alloy status` / `alloy doctor` / `alloy update`

带 `[name]` 的命令省略时，从 `openspec/changes/*/.alloy.yaml` 自动推断当前活跃 change。

### 制品依赖 DAG

```
draft.md（Pre-OpenSpec，brainstorming 产出）
  → proposal → specs → tasks → plan（隐含 writing-plans）
  → proposal → design → tasks
apply 依赖 plan → worktree + subagent(TDD+review) + verify + retrospective
```

关键约束：specs 故意不读 draft.md（防止行为契约被技术实现细节污染）；design 读 draft 但受 proposal 范围约束。

### 每个 change 的状态文件

`openspec/changes/<name>/.alloy.yaml`：
```yaml
phase: started | planned | applied | archived | finished
worktree: null | ".worktrees/<name>"
schema_version: 1
created_at: "2026-05-28"
updated_at: "2026-05-28"
```

Agent 不直接写 YAML——通过 `alloy-state.sh` 脚本操作，避免格式错误。

### 阶段闸门

关键状态转换有 shell 脚本 HARD STOP 校验（`alloy-guard.sh`）。三层防线：SKILL.md 指令（行为引导）→ 脚本硬校验（确定性阻断）→ 人类审查窗口（最终决策）。

## 设计约束与风格

- 所有文档和沟通使用中文；代码标识符和第三方库名保持英文
- 提交信息使用中文，格式为 `conventional-commits` 风格（如 `Alloy 设计文档：命令体系...`）
- `.gitignore` 规则：`*.local.*` 忽略本地配置覆盖文件；`docs/superpowers/`、`.worktrees/`、`worktrees/` 忽略 Superpowers 运行时产物
- Skill 编写遵循 `docs/skill-writing-guide.md` 中的规范：description 只写触发条件不写流程、用 Skill 工具调用外部技能不内联重写、关键闸门用 shell 脚本兜底
- Skill 的终端输出格式遵循 `docs/alloy-design.md` 第三章「终端输出视觉规范」：Phase 框 → Step 下划线 → Artifact 块引用三级体系
- **修改任何 `skills/alloy*/SKILL.md` 或 `.claude/skills/alloy*/SKILL.md` 之前，必须先 Read `docs/skill-writing-guide.md` 全文**——这不是建议，是前置条件
- **修改 `openspec/schemas/alloy/schema.yaml` 之后，必须用 `openspec schemas` 验证 schema 合法性**——OpenSpec 严格校验字段类型（version 是 number 非 string、artifact 必填 description、apply 必填 requires）
- **任何 bug 修复或功能改动，必须做跨层复盘**——从设计文档 → schema/guard → Skill 文档 → CLI 代码 → 测试五个层面逐一检查影响，更新所有受影响的文件。不做"只改出 bug 那一行"的点状修复——这个规则本身就是一次点状修复的教训总结

## 外部参考

### 上游依赖
- OpenSpec 仓库：https://github.com/Fission-AI/OpenSpec
- OpenSpec 文档：https://github.com/Fission-AI/OpenSpec/tree/main/docs
- Superpowers 仓库：https://github.com/obra/superpowers

### Skill 开发参考
- **开发前必读：** `docs/skill-writing-guide.md`（Skill 编写规范和最佳实践）
- Claude Code Skill 官方文档：https://code.claude.com/docs/en/skills.md
- Agent Skills 开放标准：https://agentskills.io
- Comet 仓库：https://github.com/rpamis/comet
- superpowers-bridge：https://github.com/JiangWay/openspec-schemas
