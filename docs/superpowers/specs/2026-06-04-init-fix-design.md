# init 命令修复设计 — Node 18 fallback + 覆盖提醒

## 问题

1. **Node 18 箭头选择不工作**：`@inquirer/prompts` v7 依赖 `setRawMode(true)` 捕获箭头键，当 stdin 被 shadow 时失效，用户只能手动输入编号。
2. **部署缺少覆盖提醒**：`deployCommands()` 在检测到已有命令时询问覆盖，但未检测到或部署完成后缺少信息性提醒。

## 方案

### 1. 恢复 `prompt.ts` 的 Node 18 stdin fallback

- 恢复 `supportsInquirer` 运行时检测（`process.versions.node` 主版本号 >= 20）
- `promptSelect`：Node 18 时使用编号选择（`readline`）
- `promptMultiSelect`：Node 18 时使用 `while(true)` 循环 + 验证错误反馈
- `promptConfirm`：Node 18 时使用 Y/n 确认

### 2. `deployCommands` 新增覆盖提醒

- 部署前：输出将要部署的 agent 列表和文件计数
- 部署后：输出总体部署摘要

## 影响文件

| 文件 | 改动 |
|------|------|
| `src/utils/prompt.ts` | 恢复 ~70 行 stdin fallback |
| `src/core/skills.ts` | 新增 ~15 行覆盖提醒 |

## 风险

- 低：prompt.ts 改动隔离，skills.ts 改动仅影响输出，不改变部署逻辑
- 测试无需改动：init.test.ts 已 mock prompt 模块
