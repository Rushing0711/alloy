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

## 分支与 PR 规范

**核心原则：Agent 建议，用户决策。** 是否创建分支、是否创建 PR，由用户最终决定。Agent 的职责是给出合理建议。

### 决策流程

```
用户确认修改方案
  → Agent 建议：是否需要创建分支？
     ├── 不需要（全局配置、单文件小改动等）→ 直接修改
     └── 需要 → 用户确认 → 创建分支
                          → Agent 建议：是否需要创建 PR？
                             ├── 不需要（分支上直接提交即可）
                             └── 需要 → 用户确认 → 推送 + 创建 PR
```

**逻辑关系：** PR 一定需要分支，但分支不一定需要 PR。

### 分支建议参考

| 场景 | Agent 建议 |
|------|-----------|
| 修改项目源码（TypeScript、Skill 文件、Schema） | 建议创建分支 |
| 修改全局配置（~/.claude/ 等） | 不需要分支 |
| 修改文档（docs/、CLAUDE.md） | 可选（小改动直接 main，大改动建议分支） |
| Bug 修复 | 建议创建分支 |
| 功能开发 | 建议创建分支 |

### PR 建议参考

| 场景 | Agent 建议 |
|------|-----------|
| 多个 commit 的功能开发 | 建议 PR（squash 后一个 commit 更清晰） |
| 需要代码审查的改动 | 建议 PR |
| 单 commit 小修复 | 可选 |
| 文档/配置改动 | 通常不需要 PR |

### PR 规范（当用户选择创建 PR 时）

**PR 标题：** Conventional Commits 格式（如 `fix: 修复工作流审查发现的问题`、`feat: 添加新功能`）

**PR 描述必须包含：**
- **Summary**：变更摘要（做了什么、为什么做）
- **Test Plan**：测试计划（测试了什么、测试结果）

**PR 前的人工审查：** Superpowers 的 TDD 和 code review 是自动化检查，不能替代人工测试。Agent 应在推送前提示用户进行人工审查（运行实际命令、检查输出、验证行为），用户确认通过后再创建 PR。

**合并方式：** 推荐 squash and merge — 一个功能一个 commit，便于追溯和回滚。

### 分支创建时机（建议）

**⚠️ 不要过早创建分支——等到明确要修改项目文件时再建议。**

**建议创建分支的时机**：
- 用户明确说"实现这个功能"、"修改这个文件"、"写设计文档"
- 头脑风暴结束，确定方案后要写设计文档到项目仓库（注意：创建分支后仍需完成 writing-plans 流程才能写代码）
- 设计文档和执行计划都已就绪，开始编写实现代码时

**不建议创建分支的时机**：
- 一开始对话（还不知道要修改什么）
- 头脑风暴阶段（只是讨论，不涉及文件修改）
- 测试验证阶段（临时测试不需要分支）
- 不确定修改范围时（可能根本不需要修改）

**分支创建流程**：
1. **先确认修改范围**——明确要修改哪些文件
2. **建议并询问用户**——给出是否创建分支的建议，用户决定
3. **创建分支**——`git checkout -b <type>/<change-name>`
4. **继续完整工作流**——创建分支不等于可以开始写代码。如果是 brainstorming 流程，必须先完成设计文档 → writing-plans → 用户审查计划，然后才能开始实现。分支只是代码修改的隔离环境，不是跳过设计流程的信号

**示例对话**：
```
用户：我想优化 statusLine 显示 git 分支信息
Agent：好的，这个功能需要修改 ~/.claude/statusline-command.sh（全局配置文件，不在项目仓库内），直接修改即可，不需要创建分支。

用户：我想给 alloy 添加一个新命令
Agent：好的，这个需要修改项目文件。建议创建分支 feature/add-new-command，你同意吗？
```

### 分支命名规范

| 类型 | 前缀 | 示例 |
|------|------|------|
| 功能 | `feature/` | `feature/user-guide` |
| 修复 | `fix/` | `fix/status-output` |
| 文档 | `docs/` | `docs/user-guide` |
| 重构 | `refactor/` | `refactor/state-module` |
| 测试 | `test/` | `test/guard-logic` |
| 杂项 | `chore/` | `chore/update-deps` |

### PR 描述模板

```markdown
## Summary
- 变更点 1
- 变更点 2

## Test Plan
- [x] 测试项 1
- [x] 测试项 2

🤖 Generated with [Claude Code](https://claude.ai/code)
```

### 为什么必须使用 PR 规范

1. **代码审查**——PR 提供了代码审查的机会，确保代码质量
2. **历史清晰**——每个 PR 都有明确的变更目的和描述，便于追溯
3. **回滚安全**——如果发现问题，可以轻松回滚整个 PR
4. **CI/CD 集成**——PR 可以触发自动化测试和部署
5. **协作规范**——统一的流程减少沟通成本，提高效率

## 参考文档

Agent 需要查阅以下文件时，直接 Read：

| 文档 | 角色 | 何时读 |
|------|------|--------|
| `docs/user-guide.md` | **USER** — 用户使用手册 | 终端用户使用 Alloy 时参考 |
| `docs/alloy-design.md` | **WHAT** — 完整产品规格 | 理解命令行为、阶段闸门、状态管理 |
| `docs/alloy-visual-spec.md` | **UI** — 终端输出视觉规范 | 写 Skill 输出格式时参考 |
| `docs/alloy-dev-guide.md` | **DO** — 构建/测试/踩坑 | 修改代码后需要知道构建和测试流程 |
| `docs/skill-writing-guide.md` | **SKILL** — Skill 编写规范 | 修改任何 `commands/alloy/*.md` 之前必读 |
| `docs/workflow-design.md` | **WHY** — 设计推导过程 | 理解设计决策的上下文和来源 |
| `docs/project-background.md` | **STORY** — 项目起源与背景 | 了解项目历史和竞品对比 |
| `docs/openspec-vs-superpowers.md` | **RESEARCH** — 基础工具对比 | 理解 OpenSpec 和 Superpowers 各自职能 |
