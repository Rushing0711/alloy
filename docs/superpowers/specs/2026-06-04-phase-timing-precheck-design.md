# 阶段时间记录与预检机制修复

## Why

三个问题驱动本次修复：

1. **Start 阶段时间丢失**：`SESSION_START` 是 shell 变量，只有到 step 7 才写入 `.alloy.yaml`。start 阶段包含 explore + brainstorming，可能持续很久，中途断线导致 `started_at` 丢失，只能 fallback 到 `created_at`。

2. **术语不统一**：各阶段 header 显示"启动时间"，但代码注释写"记录阶段开始时间"，变量名 `COMPLETED_AT` 有误导性（实际是当前时间）。

3. **预检机制不一致 + Agent 误判**：
   - start 内联检查、plan 前置检查、apply 专用 Step 0、archive 无显式预检、finish 前置检查
   - 预检只有文字指令（"确认 XXX 可用"），没有确定性检测方法，Agent 可能误判

## What

修改 `commands/alloy/` 下 6 个阶段文件（start/plan/apply/archive/finish/fix），统一时间记录和预检机制。

## 关键决策

### 1. 时间记录：started_at 捕获时机

**原则：** `started_at` = 命令调用后最靠前的时机捕获的当前时间。

| 阶段 | started_at 捕获时机 | started_at 写入时机 | completed_at 写入时机 |
|------|-------------------|-------------------|---------------------|
| start | 全新开始路径开头 `SESSION_START` | step 4（`.alloy.yaml` 刚创建后） | step 7（不再重复写 started_at） |
| plan | 命令最开头（前置检查之前）`PHASE_START` | 前置检查通过后、Step 1 开始时 | plans 审批通过后 |
| apply | 命令最开头 `PHASE_START` | 前置检查通过后 | retrospective 审批通过后 |
| archive | 命令最开头 `PHASE_START` | 前置检查通过后 | archive 完成后 |
| finish | 命令最开头 `PHASE_START` | 前置检查通过后 | Step 3/3 |

**Start 阶段特殊处理：** change 目录在 step 2 才创建，`.alloy.yaml` 在 step 4 才写入。所以 `SESSION_START` 在开头捕获，但写入推迟到 step 4。step 7 只写 `completed_at`。

### 2. 预检：统一前置检查 + 确定性检测脚本

**统一格式：** 所有阶段在执行步骤之前，设立统一格式的"前置检查"章节，包含确定性 shell 检测脚本。

**检测优先级：**
```
项目级 command (.claude/commands/) →
项目级 skill (.claude/skills/) →
用户级 command (~/.claude/commands/) →
用户级 skill (~/.claude/skills/) →
用户级 plugin (~/.claude/plugins/cache/...)
```

**各阶段预检清单：**

| 阶段 | 预检技能 |
|------|---------|
| start | `opsx:explore` + `superpowers:brainstorming` |
| plan | `opsx:continue` + `superpowers:writing-plans` |
| apply | 6 个 superpowers 技能 |
| archive | `opsx:archive` |
| finish | `superpowers:finishing-a-development-branch` |
| fix | 3 个 superpowers 技能 |

### 3. 术语统一

所有阶段 header 和代码注释统一使用"启动时间"。

## 范围与边界

**本次修改：** `commands/alloy/` 下 6 个文件（start.md、plan.md、apply.md、archive.md、finish.md、fix.md）

**不在范围内：**
- `alloy init` CLI 层改动（项目级→用户级检测、版本比较、覆盖提示）— 后续单独规划
- `src/core/` TypeScript 代码改动
- 测试用例补充
