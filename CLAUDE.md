# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 仓库用途

**Alloy** 是一套融合 OpenSpec（Fission-AI）和 Superpowers（obra）的开发工作流 CLI 工具。用 OpenSpec 管理"构建什么"（需求追踪、Delta Spec、审计归档），用 Superpowers 管理"如何构建"（流程闸门、TDD、系统化调试、验证）。

## 构建与测试

构建/测试命令、代码约定、踩坑记录统一见 `docs/alloy-dev-guide.md`。下面只列 Agent 执行时必须知道的：

- Node.js ≥ 22，TypeScript 源码在 `src/`，编译产物输出到 `dist/`
- 修改代码后运行 `npm test`（vitest 全量）+ `bats test/shell/*.bats`（shell 测试全量）
- **本地开发验证：** 修改 Skill 或 CLI 后，`npm run build && npm link` 使全局 `alloy` 命令指向本地构建产物。在其他项目中运行 `alloy update` 即可拉取最新 skill 文件进行端到端验证。

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

skills/
  alloy/SKILL.md        # 路由层 — 按 phase 分发到子命令
  alloy/scripts/
    alloy-state.sh      # 状态文件操作（Agent 不直接写 YAML）
    alloy-guard.sh      # 阶段闸门 HARD STOP 校验
    alloy-archive.sh    # 归档操作
  alloy-start/SKILL.md  # 智能入口：状态检测 → explore + brainstorming → draft.md
  alloy-plan/SKILL.md   # 规划：制品生成 proposal/design/specs/tasks/plan
  alloy-apply/SKILL.md  # 执行：worktree 隔离 + SDD(TDD) + verify + retrospective
  alloy-finish/SKILL.md # 收尾：merge / PR / keep 人工闸门
  alloy-archive/SKILL.md# 归档：硬校验 phase=archived → openspec archive
  alloy-fix/SKILL.md    # Bug 修复：diagnose → 分流（不改 spec / 需改 spec）
  alloy-discard/SKILL.md# 放弃：按 phase 分级清理
  alloy-status/SKILL.md # 状态：查看阶段、制品、下一步

openspec/schemas/alloy/
  schema.yaml           # 制品 DAG 依赖定义
  instructions/         # 制品指令文件（每制品一个 .md，定义生成规则）
  templates/            # 制品模板（proposal/design/specs/tasks/plan/retrospective）

vendor/superpowers/     # Superpowers skill 内置兜底（离线安装用）

以上为源文件（git 追踪）。alloy init 部署时将 skills/ → .claude/skills/，openspec/schemas/ → 项目 openspec/ 目录。
```

**三层架构：** CLI 控制层（TypeScript，确定性）→ Schema 制品层（DAG + instruction，硬约束）→ 大模型内容层（文档/代码生成，柔性+人类审查）。

## 关键设计要点

以下要点不再复述完整设计——细节见 `docs/alloy-design.md`。这里只列 Agent 执行时必须遵守的硬约束：

- Agent 不直接写 YAML——通过 `alloy-state.sh` 脚本操作 `.alloy.yaml`
- 阶段转换必须通过 `alloy-guard.sh` 校验——不仅是 phase 合法性，还包含制品完整性检查
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
- **修改任何 `skills/alloy*/SKILL.md` 或 `.claude/skills/alloy*/SKILL.md` 之前，必须先 Read `docs/skill-writing-guide.md` 全文**——这不是建议，是前置条件
- **修改 `openspec/schemas/alloy/schema.yaml` 之后，必须用 `openspec schemas` 验证 schema 合法性**——OpenSpec 严格校验字段类型（version 是 number 非 string、artifact 必填 description、apply 必填 requires）
- **任何 bug 修复或功能改动，必须做跨层复盘**——从设计文档 → schema/guard → Skill 文档 → CLI 代码 → 测试五个层面逐一检查影响，更新所有受影响的文件。不做"只改出 bug 那一行"的点状修复——这个规则本身就是一次点状修复的教训总结
- **代码改动必须有测试覆盖**——改 shell 脚本补 bats 用例、改 TypeScript 补 vitest 用例。改 bug 先补一个能复现的失败测试、改功能先确定测试用例清单。测试覆盖范围：shell 脚本（阶段闸门、状态管理、归档）→ TypeScript core 模块（纯函数优先）→ CLI 命令（集成测试）。不允许"改完就跑"——规则源自 apply worktree 状态写入缺失的教训，若有测试就不会让 bug 存活到端到端测试才发现

## 参考文档

Agent 需要查阅以下文件时，直接 Read：
- `docs/alloy-design.md` — 完整产品规格
- `docs/alloy-dev-guide.md` — 构建命令、测试写法、踩坑记录
- `docs/skill-writing-guide.md` — Skill 编写规范（改 SKILL.md 前必须读）
