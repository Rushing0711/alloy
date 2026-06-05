# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 修改前置检查（修改任何项目文件前必须执行）

按文件类型执行对应的前置检查，**读完即执行，不可跳过**：

| 要修改的文件 | 先读 | 再问分支 |
|-------------|------|---------|
| `commands/alloy/*.md`（Skill 文件） | `docs/skill-writing-guide.md` | 是 |
| `openspec/schemas/`（Schema） | — | 是 |
| `src/`（TypeScript 源码） | — | 是 |
| `docs/superpowers/specs/`（设计文档） | — | 是 |
| `docs/superpowers/plans/`（实现计划） | — | 是 |

**分支规范：** 先问"是否建分支"，用户确认后执行。分支命名：`feature/`、`fix/`、`docs/`、`refactor/`、`test/`、`chore/`

**不触发分支的场景：** 用户明确说直接改、纯读取探索、测试验证阶段、修改全局配置（`~/.claude/`）

## 仓库用途

**Alloy** 是一套融合 OpenSpec（Fission-AI）和 Superpowers（obra）的开发工作流 CLI 工具。用 OpenSpec 管理"构建什么"（需求追踪、Delta Spec、审计归档），用 Superpowers 管理"如何构建"（流程闸门、TDD、系统化调试、验证）。

## 构建与测试

- Node.js ≥ 18，TypeScript 源码在 `src/`，编译产物输出到 `dist/`
- 修改代码后运行 `npm test`（vitest 全量）
- **每次修复/功能更新完成后**：确保测试通过，运行 `npm run build`。本地开发用 `aldev` 测试（`node /Users/wenqiu/AIAgent/alloy/dist/cli/index.js`），不依赖 npm link

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
3. **修改 schema 后必须运行 `openspec schemas` 验证**
4. **代码改动必须有测试覆盖**

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

**合并方式：** 推荐 squash and merge
