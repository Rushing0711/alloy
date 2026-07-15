# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 修改前置检查（修改任何项目文件前必须执行）

**准备编辑文件时，停下来执行以下自检：**

1. 我要改的文件属于哪类？（对照下表）
2. 需要先读参考文档吗？
3. 需要问分支吗？（对照"分支规则"）
4. 确认后开始编辑

按文件类型执行对应的前置检查，**读完即执行，不可跳过**：

| 要修改的文件 | 先读 | 分支规则 | 对账 |
|-------------|------|---------|------|
| `skills/alloy-*/SKILL.md`（Skill 文件） | `docs/reference/skill-writing-guide.md` | 默认问分支。用户说"直接改"、纯读取、测试验证时不触发 | 提醒同步 spec |
| `openspec/schemas/`（Schema） | — | 同上 | — |
| `src/`（TypeScript 源码） | — | 同上 | 提醒同步 01-product-spec/08-cli-spec.md + cli-reference.md |
| `docs/specification/`（产品规格） | — | 同上 | — |
| `docs/handbook.md`（开发手册） | — | 同上 | — |

> **注意：** `docs/superpowers/` 是 Superpowers 技能生成的设计和计划产物，仍在正常使用。真相源是 `docs/specification/`，文档对齐时不检查此目录。该目录已在 `.gitignore` 中，**禁止 `git add` 该目录下的任何文件**。

**分支规范：** 先问"是否建分支"，用户确认后执行。分支命名：`feature/`、`fix/`、`docs/`、`refactor/`、`test/`、`chore/`

## 仓库用途

**Alloy** 是一套融合 OpenSpec（Fission-AI）和 Superpowers（obra）的开发工作流 CLI 工具。用 OpenSpec 管理"构建什么"（需求追踪、Delta Spec、审计归档），用 Superpowers 管理"如何构建"（流程闸门、TDD、系统化调试、验证）。

## 构建与测试

- Node.js ≥ 18，TypeScript 源码在 `src/`，编译产物输出到 `dist/`
- 测试文件在 `test/` 目录（与 `src/` 平级），非 `src/` 内
- 修改代码后运行 `npm test`（vitest 全量），watch 模式用 `npm run test:watch`
- TypeScript watch 模式：`npm run dev`
- **每次修复/功能更新完成后**：确保测试通过，运行 `npm run build`。本地开发用 `node dist/cli/index.js` 测试，不依赖 npm link

## 代码架构

**三层架构：** CLI 控制层（TypeScript，确定性）→ Schema 制品层（DAG + instruction，硬约束）→ 大模型内容层（文档/代码生成，柔性+人类审查）

```
src/cli/          # CLI 命令（init/status/doctor/update/completion）
src/core/         # 核心模块（检测/安装/部署/健康检查/agents/artifacts/skills/openspec/superpowers/claude-md）
src/utils/        # 工具函数（文件系统/提示）
skills/alloy-*/   # Skill 文件（start/plan/apply/archive/finish/fix/discard/status）
openspec/schemas/ # 制品 schema 定义
```

## 关键规则

1. **Agent 不直接写 YAML**——通过 `alloy _state` 命令操作 `.alloy.yaml`
2. **阶段转换必须通过 `alloy _guard` 校验**
3. **修改 schema 后必须运行 `openspec schemas` 验证**
4. **代码改动必须有测试覆盖**
5. **提高 agent 执行稳定性是核心目标**——重复出现的多步 bash 序列（状态写入 + commit、hash-lock + commit 等）应下沉为原子 CLI 命令，由 TypeScript 实现并配测试；skill md 只负责编排和调用，不手写这类逻辑。实现指导是"原子性操作"，具体手段是 CLI——**不能为了 CLI 而 CLI**：只有当下沉真能提升稳定性、原子性、可测试性时才做，单次一次性 bash 或纯编排逻辑不必下沉。
6. **调整 CLI 命令后必须更新 `skills/alloy-shared/references/cli-reference.md`**--避免 skill md 里的命令用法与实际 CLI 偏差。修改 `src/cli/` 或 `src/cli/commands/internal/` 的新增/删除/改签名，都要同步更新 cli-reference.md。

7. **多 agent 适配参考 `docs/reference/agent-instruction-files.md`**--修改 agent 相关代码（`src/core/agents.ts`/`agent-config.ts`/`detect-installations.ts`/`superpowers.ts`/`health.ts` 等）前，先读此文档，了解各 agent 的 skills 路径/Hook/Permissions/指令文件/交互工具等特性。文档含 12 个特性 × 3 个 agent（Claude Code/OpenCode/Pi）对比 + 证据来源（官方文档 URL + GitHub 文件路径）。调研新特性时附证据。

8. **多 agent 全局视角，避免局限于某一 agent**--alloy 支持 3 个 agent（Claude Code/OpenCode/Pi），所有 skill md / spec / 文档示例 / 代码实现都要保持全局视角，不能 Claude Code 中心化。具体要求：
   - **skill md / spec / 文档**：涉及交互工具、hook、worktree、skills 路径等 agent 特性时，不能只写 Claude Code 的做法。要么同时列出 3 个 agent 的等价物，要么用"平台原生交互工具"等中性表述 + 顶部统一说明三平台差异。示例代码要给多平台调用样例（至少 Claude Code + OpenCode + Pi），不能只给 Claude Code。
   - **代码实现**：不能硬编码某一 agent 的特性，要通过 `agent-config.ts` 等抽象层分派。新增 agent 特性时，3 个 agent 都要考虑（支持的实现，不支持的注明降级或跳过）。
   - **修改时同步检查**：修改某 agent 相关内容时，同步检查其他 3 个 agent 是否也需更新。典型反例：只给 Claude Code 写了 `AskUserQuestion` 调用示例，OpenCode agent 看到"AskUserQuestion"字眼却无 `question` 工具示例，误降级为文本输出。
   - **中性表述优先**：用"平台原生交互工具"代替"AskUserQuestion"（除非上下文明确指 Claude Code）；用"3 个 agent"代替"其他平台"（避免暗示 Claude Code 是默认）。

## PR 规范

当用户选择创建 PR 时：

**PR 标题：** Conventional Commits 格式（如 `fix: 修复工作流审查发现的问题`）

**PR 描述模板：**
```markdown
## Summary
- 变更点 1
- 变更点 2

## Test Plan
- [x] 测试项 1
- [x] 测试项 2

🤖 Generated with [Claude Code](https://claude.ai/code)
```

**合并方式：** 推荐 squash and merge（包括本地 merge）。所有分支合并默认 `git merge --squash`，产生的单个 commit 使用 Conventional Commits 格式。这保持历史干净，每个功能/修复一个入口点。
