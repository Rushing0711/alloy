# Alloy 用户手册设计方案

**日期：** 2026-06-02

**状态：** 草案

## 背景

当前 docs/ 目录下的文档主要面向开发者和维护者，缺少面向终端用户的使用文档。终端用户需要能够快速上手使用 Alloy CLI 命令和 AI Agent 集成。

## 目标

创建一个完整的用户手册，涵盖：
- CLI 命令使用
- AI Agent 工作流
- 配置参考
- 故障排除

## 设计方案

### 文件位置

`docs/user-guide.md`

### 内容结构

```markdown
# Alloy 用户手册

## 1. 快速开始
- 安装（npm install -g alloy）
- 初始化项目（alloy init）
- 在 Claude Code 中开始第一个 change（/alloy:start）

## 2. CLI 命令参考
- alloy init — 初始化项目，安装依赖，部署 schema 和 commands
- alloy status — 查看活跃 change 状态
- alloy doctor — 版本兼容性 + 文件一致性诊断
- alloy update — 更新 command 文件到最新版
- alloy version — 查看版本号

## 3. AI Agent 工作流
- 在 Claude Code 中使用 /alloy:start 开始新 change
- 阶段流程：start → plan → apply → archive
- 每个阶段的产出物和 commit 内容：
  - start: 创建 change 目录，commit draft.md
  - plan: 生成 design/specs/tasks，commit 对应文件
  - apply: 实现功能，commit 代码变更
  - archive: 归档 change，commit 归档记录

## 4. 配置参考
- .alloy.yaml 状态文件字段说明
- openspec/ 目录结构（changes/、schemas/）
- commands/ 目录结构（alloy/*.md 命令文件）

## 5. 故障排除
- 常见错误及解决方案
- alloy doctor 诊断使用
- 如何查看 change 历史
```

## 与现有文档的关系

- **alloy-design.md** — 产品规格，包含更详细的阶段闸门、制品依赖等设计细节
- **alloy-dev-guide.md** — 开发指南，面向贡献者
- **workflow-design.md** — 设计推导，包含 WHY 背景
- **project-background.md** — 项目背景和竞品对比

用户手册专注于"如何使用"，不重复设计文档中的技术细节。

## 验收标准

1. 新用户能在 5 分钟内理解 Alloy 的核心价值
2. 新用户能成功运行 `alloy init` 和 `/alloy:start`
3. 每个 CLI 命令都有清晰的用法说明和示例
4. AI Agent 工作流有完整的阶段说明和产出物清单
5. 常见问题有解决方案
