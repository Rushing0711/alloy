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

**硬规则：技能文件中用 `🔴 STOP` 标记确认点，不写 JSON 块。** Agent 遇到 🔴 STOP 时自动用 AskUserQuestion（支持的平台）或降级为结构化文本选项（不支持的平台）。两个格式给出相同选项、相同数量。

**反例：** 审查窗口只用文本 "(a) 确认 (b) 调整" 而不给明确的输入提示——用户不知道是要打字、复制粘贴还是直接说"确认"。

## 🔴 STOP 标记规则

技能文件中的 `🔴 STOP` 表示硬交互确认点——**必须使用 AskUserQuestion（或平台等价工具），不可跳过、不可用文本替代、不可自行决定。**

遇到 `🔴 STOP: <确认事项>` 时：
1. 用 AskUserQuestion 展示选项，**等用户选择后才继续**
2. 选项从确认事项的上下文推导（通常是"确认/调整"或"选项A/选项B"）
3. 跳过任何 🔴 STOP = 违反技能 Iron Law

**Why:** 纯文本确认（"Y/n"、"(a)/(b)"）是软交互——agent 可自行判断"用户大概同意"后跳过。AskUserQuestion 是硬交互——agent 必须等用户物理选择才能继续。

## 沉默 ≠ 授权（USER_GATE 通用禁令，跨 skill 适用）

**[HARD_STOP]** 所有 🔴 USER_GATE / 🔴 STOP **必须**单独调用 AskUserQuestion 等用户物理选择，下列行为全部禁止：

| 反模式 | 现实 |
|--------|------|
| **批量打包**：N 条候选 → 1 个"全部确认"问题 | 单次确认承担不了 N 项独立的污染风险（典型：archive memory 候选必须逐条问，§5.2.2） |
| **基于内容跳过**：diff 短 / 无 conflict / "看起来明显合理" → 自动跳过 USER_GATE | 内容质量不是授权来源，用户的 (a) 选择才是。哪怕 1 行 diff 也必须问 |
| **沉默推断**：用户长时间不回复 → 选默认项继续 | USER_GATE 没有默认项；超时不算授权，必须等到物理选择 |
| **改写选项**：把"(a) 确认 / (b) 调整"改成"(a) 确认（推荐）"后默认选 (a) | 推荐文案不等于已选，必须用户主动确认 |
| **降级为文本**：在支持 AskUserQuestion 的平台用纯文本提示自循环判断 | 平台支持时强制 AskUserQuestion，降级仅限不支持的平台（见上方对照表） |

**违反字面 = 违反精神：** 哪怕"用户上次同意过"、"内容看起来无争议"、"流程已经很顺了"，也算违反 Iron Law。**USER_GATE 的物理实现是 AskUserQuestion 工具调用本身——没调用就是没问。**

### 精确字符串确认特例

部分破坏性操作要求用户输入精确字符串（discard、热修 merge），见上方"不能使用 AskUserQuestion 的场景"章节。此时禁令仍适用：

- **agent 不得回填精确字符串**：用户必须自己输入 `discard <name>` / `merge <branch> into <branch>`，禁 agent 在工具调用中预填、模拟、或基于"用户回复了'好'"自行判定
- **模糊回复不算确认**："好"、"可以"、"y"、"go ahead" 全部不算精确确认，必须等到字面匹配的字符串
- **跨 skill 适用**：fix 场景 3 热修合并、discard 命令均按此规则

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
