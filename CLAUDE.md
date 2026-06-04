# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 仓库用途

**Alloy** 是一套融合 OpenSpec（Fission-AI）和 Superpowers（obra）的开发工作流 CLI 工具。用 OpenSpec 管理"构建什么"（需求追踪、Delta Spec、审计归档），用 Superpowers 管理"如何构建"（流程闸门、TDD、系统化调试、验证）。

## 构建与测试

- Node.js ≥ 18，TypeScript 源码在 `src/`，编译产物输出到 `dist/`
- 修改代码后运行 `npm test`（vitest 全量）
- **每次修复/功能更新完成后**：确保测试通过，运行 `npm run build && npm link` 保证 dist 最新，方便人工测试

## 代码架构

**三层架构：** CLI 控制层（TypeScript，确定性）→ Schema 制品层（DAG + instruction，硬约束）→ 大模型内容层（文档/代码生成，柔性+人类审查）

```
src/cli/          # CLI 命令（init/status/doctor/update/completion）
src/core/         # 核心模块（检测/安装/部署/健康检查）
src/utils/        # 工具函数（文件系统/提示）
commands/alloy/   # Skill 文件（start/plan/apply/archive/finish/fix/discard/status）
openspec/schemas/ # 制品 schema 定义
```

## 关键规则

1. **Agent 不直接写 YAML**——通过 `alloy _state` 命令操作 `.alloy.yaml`
2. **阶段转换必须通过 `alloy _guard` 校验**
3. **修改 Skill 文件前必须读 `docs/skill-writing-guide.md`**
4. **修改 schema 后必须运行 `openspec schemas` 验证**
5. **代码改动必须有测试覆盖**

## 分支规范

**核心原则：Agent 建议，用户决策。** 每次修改项目文件前，必须询问用户是否创建分支。

**触发条件**（满足任一即询问）：
- 修改项目源码（TypeScript、Skill 文件、Schema）
- Bug 修复、功能开发

**不触发条件**（可跳过询问）：
- 用户明确说"不需要分支"或"直接修改"
- 修改全局配置（~/.claude/ 等）
- 测试验证阶段

**完成方式决策**：每次修改前，询问用户是采用当前分支直接完成，还是通过 PR 方式完成。

分支命名：`feature/`、`fix/`、`docs/`、`refactor/`、`test/`、`chore/`

## PR 规范

当用户选择创建 PR 时，遵循以下规范：

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

**合并方式：** 推荐 squash and merge

## 参考文档

需要时直接 Read：
- `docs/alloy-design.md` — 完整产品规格
- `docs/alloy-dev-guide.md` — 构建/测试/踩坑
- `docs/skill-writing-guide.md` — Skill 编写规范
