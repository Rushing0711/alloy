# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 仓库用途

**Alloy** 是一套融合 OpenSpec（Fission-AI）和 Superpowers（obra）的开发工作流 CLI 工具。用 OpenSpec 管理"构建什么"（需求追踪、Delta Spec、审计归档），用 Superpowers 管理"如何构建"（流程闸门、TDD、系统化调试、验证）。

## 构建与测试

构建/测试命令、代码约定、踩坑记录统一见 `docs/alloy-dev-guide.md`。下面只列 Agent 执行时必须知道的：

- Node.js ≥ 18，TypeScript 源码在 `src/`，编译产物输出到 `dist/`
- 修改代码后运行 `npm test`（vitest 全量）
- **本地开发验证：** 修改命令或 CLI 后，`npm run build && npm link` 使全局 `alloy` 命令指向本地构建产物。在其他项目中运行 `alloy update` 即可拉取最新 command 文件进行端到端验证。

## 代码架构

```
src/cli/
  index.ts              # CLI 入口（alloy init/status/doctor/update/completion）
  commands/
    init.ts             # alloy init — 环境检测 → 依赖安装 → 部署 schema + commands
    status.ts           # alloy status — 活跃 change 总览
    doctor.ts           # alloy doctor — 版本兼容性 + 文件一致性诊断
    update.ts           # alloy update — 更新 command 文件到最新版
    completion.ts       # alloy completion — shell 补全脚本生成
    internal/
      guard.ts          # alloy _guard — 阶段闸门校验
      record.ts         # alloy _record — 制品 hash 记录
      state.ts          # alloy _state — 状态文件读写
  utils/
    state.ts            # .alloy.yaml 状态文件读写（CLI 层）
src/core/
    types.ts            # 共享类型定义
    detect.ts           # 环境检测（Node.js / git）
    openspec.ts         # OpenSpec CLI 安装 + 项目初始化
    superpowers.ts      # Superpowers 在线安装
    skills.ts           # Alloy command + schema 部署
    claude-md.ts        # CLAUDE.md 注入
    compat.ts           # compat.yaml 兼容性检查
    agents.ts           # 多 Agent 平台支持（8 个平台定义 + 部署检测）
    health.ts           # 7 项健康检查（doctor 诊断 + init 兼容性检查）
src/utils/
    fs.ts               # 文件系统工具（包根目录定位）
    prompt.ts           # 交互式提示（select/confirm/multiSelect，Node 20+ 用 inquirer）

commands/
  alloy/
    start.md               # /alloy:start 完整指令（冒号版，Claude Code/Qoder/CodeBuddy）
    plan.md                # /alloy:plan
    apply.md               # /alloy:apply
    archive.md             # /alloy:archive
    finish.md              # /alloy:finish
    fix.md                 # /alloy:fix
    discard.md             # /alloy:discard
    status.md              # /alloy:status

以上为源文件（git 追踪）。alloy init 部署时将 commands/alloy/ → .claude/commands/alloy/（冒号版），
并自动生成 .claude/commands/alloy-*.md（横线版，供 Cursor/OpenCode/Codex/Trae/Pi 使用）。

openspec/schemas/alloy/
  schema.yaml           # 制品 DAG 依赖定义
  instructions/         # 制品指令文件（每制品一个 .md，定义生成规则）
  templates/            # 制品模板（proposal/design/specs/tasks/plan/retrospective）

部署时 openspec/schemas/ → 项目 openspec/ 目录。
```

**三层架构：** CLI 控制层（TypeScript，确定性）→ Schema 制品层（DAG + instruction，硬约束）→ 大模型内容层（文档/代码生成，柔性+人类审查）。

## 关键设计要点

以下要点不再复述完整设计——细节见 `docs/alloy-design.md`。这里只列 Agent 执行时必须遵守的硬约束：

- Agent 不直接写 YAML——通过 `alloy _state` 命令操作 `.alloy.yaml`
- 阶段转换必须通过 `alloy _guard` 命令校验——不仅是 phase 合法性，还包含制品完整性检查
- specs 不读 draft.md（防止行为契约被技术实现细节污染），design 读 draft 但受 proposal 范围约束
- 命令中 `[name]` 省略时，从 `openspec/changes/*/.alloy.yaml` 自动推断活跃 change
- 每个 change 状态文件字段：`phase` / `worktree` / `schema_version` / `created_at` / `updated_at`

## 设计约束与风格

- 所有文档和沟通使用中文；代码标识符和第三方库名保持英文
- 提交信息使用中文，格式为 `conventional-commits` 风格（如 `Alloy 设计文档：命令体系...`）
- `.gitignore` 规则：`*.local.*` 忽略本地配置覆盖文件；`docs/superpowers/`、`.worktrees/`、`worktrees/` 忽略 Superpowers 运行时产物
- Skill 编写遵循 `docs/skill-writing-guide.md` 中的规范：description 只写触发条件不写流程、用 Skill 工具调用外部技能不内联重写、关键闸门用 shell 脚本兜底
- **编排层不重复建造选择闸门**——当被委托的技能已内置决策流程时（如 SDD 的 when-to-use 判断树），alloy 只需加载技能并按其指引执行，不要在外面包一层菜单。原则是：能委托的就不重建——委托的是能力，不是实现细节
- Skill 的终端输出格式遵循 `docs/alloy-design.md` 第三章「终端输出视觉规范」：Phase 框 → Step 下划线 → Artifact 块引用三级体系
- **修改任何 `commands/alloy/*.md` 或 `commands/alloy-*.md` 之前，必须先 Read `docs/skill-writing-guide.md` 全文**——这不是建议，是前置条件
- **修改 `openspec/schemas/alloy/schema.yaml` 之后，必须用 `openspec schemas` 验证 schema 合法性**——OpenSpec 严格校验字段类型（version 是 number 非 string、artifact 必填 description、apply 必填 requires）
- **任何 bug 修复或功能改动，必须做跨层复盘**——从设计文档 → schema/guard → Skill 文档 → CLI 代码 → 测试五个层面逐一检查影响，更新所有受影响的文件。不做"只改出 bug 那一行"的点状修复——这个规则本身就是一次点状修复的教训总结
- **代码改动必须有测试覆盖**——改 shell 脚本补 bats 用例、改 TypeScript 补 vitest 用例。改 bug 先补一个能复现的失败测试、改功能先确定测试用例清单。测试覆盖范围：shell 脚本（阶段闸门、状态管理、归档）→ TypeScript core 模块（纯函数优先）→ CLI 命令（集成测试）。不允许"改完就跑"——规则源自 apply worktree 状态写入缺失的教训，若有测试就不会让 bug 存活到端到端测试才发现

## 参考文档

Agent 需要查阅以下文件时，直接 Read：

| 文档 | 角色 | 何时读 |
|------|------|--------|
| `docs/alloy-design.md` | **WHAT** — 完整产品规格 | 理解命令行为、阶段闸门、状态管理 |
| `docs/alloy-visual-spec.md` | **UI** — 终端输出视觉规范 | 写 Skill 输出格式时参考 |
| `docs/alloy-dev-guide.md` | **DO** — 构建/测试/踩坑 | 修改代码后需要知道构建和测试流程 |
| `docs/skill-writing-guide.md` | **SKILL** — Skill 编写规范 | 修改任何 `commands/alloy/*.md` 之前必读 |
| `docs/workflow-design.md` | **WHY** — 设计推导过程 | 理解设计决策的上下文和来源 |
| `docs/project-background.md` | **STORY** — 项目起源与背景 | 了解项目历史和竞品对比 |
| `docs/openspec-vs-superpowers.md` | **RESEARCH** — 基础工具对比 | 理解 OpenSpec 和 Superpowers 各自职能
