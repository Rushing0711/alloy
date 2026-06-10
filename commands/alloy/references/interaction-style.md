# Alloy 交互风格指南

Alloy 各阶段需要用户输入时，**优先使用平台原生的交互式选择工具**。纯文本 "(a)(b)(c)" 只是换了格式的开放式提问——用户还是要打字。原生交互组件让用户用箭头选、空格勾、Enter 提交，一次按键完成决策。

## 平台工具对照

| 平台 | 交互式选择工具 | 能力 |
|------|-------------|------|
| **Claude Code** | `AskUserQuestion` | radio（单选）、checkbox（多选）、preview（代码对比） |
| **Codex** | 无等价工具 | 降级为结构化文本选项 |
| **Copilot CLI** | 无等价工具 | 降级为结构化文本选项 |
| **Gemini CLI** | 查平台工具映射 | 查 GEMINI.md 中的工具映射 |

**降级策略：** 当平台无原生交互工具时，使用清晰的文本选项格式——但必须结构化（每选项一行，带编号和简短说明），不要让用户猜要输入什么。

## 选择类型与工具映射

| 场景 | `AskUserQuestion` 配置 | 示例 |
|------|----------------------|------|
| **审查确认** (a/b 二元) | `multiSelect: false`，2 个 option | (a) 确认，锁定并继续 / (b) 需要调整 |
| **多选一** (3-4 选项) | `multiSelect: false`，3-4 个 option | 分支选择、策略选择、技术方案选型 |
| **范围确认** (独立选项) | `multiSelect: true`，空格勾选 | 功能范围、carry-forward items、边界确认 |
| **方案对比** (含代码差异) | `multiSelect: false` + `preview` 字段 | 架构方案 A vs B，preview 展示代码结构差异 |

## 审查窗口标准模式

制品审查是 Alloy 最常见的交互场景。遵循以下模式：

1. **先展示内容**——用 markdown 文本展示制品完整内容（审查窗口本身，不能被交互工具替代）
2. **再让用户确认**：

**Claude Code（推荐）：**
```
AskUserQuestion: {
  questions: [{
    question: "确认并锁定 <制品名>？",
    header: "<制品名>",
    options: [
      { label: "(a) 确认，锁定并继续", description: "hash 锁定 + commit，进入下一制品" },
      { label: "(b) 需要调整", description: "说明修改点" }
    ],
    multiSelect: false
  }]
}
```

**其他平台（降级）：**
```
> → (a) 确认，锁定 <制品名> 并继续
> → (b) 需要调整 — 说明修改点
> 请输入 a 或 b：
```

**硬规则：凡是技能文件中出现 `AskUserQuestion` JSON 块的，同一位置必须附带降级文本格式。** Agent 执行时先检测当前平台是否支持 `AskUserQuestion` 工具——支持则用原生交互组件，不支持则自动降级为文本选项。两个格式给出相同选项、相同数量，确保不同平台上用户看到的选项一致。

**反例：** 审查窗口只用文本 "(a) 确认 (b) 调整" 而不给明确的输入提示——用户不知道是要打字、复制粘贴还是直接说"确认"。

## 不能使用 AskUserQuestion 的场景

以下场景**保持精确文本确认**，因为它们是安全机制而非便利功能：

- **破坏性操作确认**（discard、merge 确认）：用户必须输入精确字符串 `discard <name>` 或 `merge <branch> into <branch>`
- **已由外部技能处理的交互**：如 `finishing-a-development-branch` 技能的合并策略选择

## 提问密度

- `AskUserQuestion` 一次最多 4 个问题，相关问题**合并到一次调用**
- 不要一个问题调一次——那是文本选项的思维
- 每次选项的 `description` 写清楚选这个意味着什么，让用户无需额外思考

## 各阶段适用场景速查

| 阶段 | 主要 AskUserQuestion 场景 |
|------|--------------------------|
| start | 探查方向选择（radio）、需求范围确认（checkbox）、draft 审查（radio） |
| plan | 5 个制品审查窗口（radio）、回溯确认（radio） |
| apply | 分支异常处理（radio）、执行策略选择（radio）、verify/retrospective 审查（radio） |
| finish | 主分支确认（radio） |
| fix | 诊断确认（radio）、主分支确认（radio）、hotfix 合并确认（精确文本） |
| archive | 无用户交互（全自动） |
| status | 无用户交互（只读） |
| discard | **不使用**——保持精确文本确认 |
