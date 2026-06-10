# Alloy Skill 编写指南

> **定位：** Alloy 项目的 Skill 编写权威参考。与 `superpowers:writing-skills` 互补——本指南定义"什么是好的 skill"（静态规则），writing-skills 定义"如何创建和修改 skill"（动态流程）。
>
> **目标读者：** 写/改 `commands/alloy/*.md` 的人（人类开发者 + AI Agent）

---

## 一、Skill 结构规范

### Frontmatter

两个必填字段：`name` 和 `description`。

```yaml
---
name: "Alloy: Apply"
description: Alloy 执行阶段 - plan 完成后进入
category: Workflow
tags: [alloy, workflow]
---
```

**name 规则：** 字母、数字、冒号、连字符。Alloy 技能用 `Alloy: <阶段>` 命名。

**description 规则：** 只写触发条件（"何时用"），不写流程概要（"做什么"）。这是测试验证出的最关键原则——description 里写了流程时，Claude 会直接按概要执行，跳过正文。

```yaml
# ❌ 写了流程——Claude 不读正文
description: 智能入口，先检测状态，再执行 explore，然后 brainstorming 交互式需求设计

# ✅ 只写触发条件
description: Alloy 智能入口 - 自动检测状态，接续或新建 change
```

### 目录结构

```
commands/alloy/          # Alloy 技能文件
  start.md
  plan.md
  apply.md
  ...
  references/            # 共享引用（主分支检测、技能预检等）
  instructions/          # 制品生成指令模板
  templates/             # 制品输出模板
```

Alloy 技能是单文件（`.md`），不拆分子文件。共享逻辑提取到 `references/` 目录。

---

## 二、编写原则

### 1. 解释 WHY，少用大写禁令

大写禁令（MUST/DO NOT）只在少数关键闸门处用，大量使用时 Agent 产生"指令疲劳"——选择性跳过看似严厉实则无区别的规则。

```markdown
# ❌ 大写堆砌
MUST 至少 3 轮追问。DO NOT 在 1-2 轮后进入方案阶段。

# ✅ 解释原因
每次只问一个问题，基于回答逐步深入。你的目标不是"问够 3 个问题"交差——
而是真正理解用户要什么、不要什么、怎么算成功。
```

### 2. 用反例定义边界

光说"做得好"没用——Agent 不知道边界在哪。给出具体反例，Agent 就知道怎么避免了。

```markdown
什么算"不够"（反例）：
- 只问了一个选择题（"A. Web 应用 B. CLI"）就觉得自己完成了
- 用户说"Web 应用"后没有追问"单页还是多页？需要后端吗？"
```

### 3. Red Flags 表拦截绕过

纪律型技能（闸门、TDD、验证）必须包含 Red Flags 表——列举 Agent 常见的绕过借口和对应现实。这是 Superpowers 验证过的核心说理机制。

```markdown
| 借口 | 现实 |
|------|------|
| "反正是个小改动，不用那么正式" | 小改动和大改动的闸门完全一样。不存在"大小分级的保护等级"。 |
| "用户很急，跳过 review 吧" | 跳过 review = 跳过代码质量闸门。急不是绕过流程的理由。 |
```

### 4. 拦截器而非辅助器

好的技能是**拦截器**——在你即将犯错的时刻强制介入，不是告诉你"怎么做更好"。设计时问自己：这个规则要阻止什么错误行为？如果答案不明确，这条规则可能不需要。

---

## 三、闸门与可靠性

### 三层防线

| 层 | 方式 | 可靠性 |
|----|------|:--:|
| SKILL.md 指令 | 原因驱动的行为引导 | 中（Agent 可能跳过） |
| 脚本硬校验 | `alloy _guard` 阻断非法状态转换 | 高（确定性） |
| 人类审查窗口 | 阻塞点等待用户确认 | 最高（人类决策） |

不要只用第一层——三条防线都要有。

### 审查窗口

制品生成后的标准审查流程：

```
> 制品 [N/M] <name> ✓ 完成
>
> [展示制品完整内容]
>
> → 下一个：<下一制品名>
> → (a) 确认，锁定并继续
> → (b) 需要调整 — 说明修改点
```

- `[N/M]` 是**阶段内局部编号**，不反映全局进度
- 用户选 (a) 后才 hash 锁定 + commit
- 选 (b) 调整后重新展示，不存在"跳过审查"

### 脚本硬校验

关键闸门用 `alloy _guard` 做 HARD STOP，不依赖 Agent 自觉遵守：

```bash
alloy _guard openspec/changes/<name> applied --apply
# 全部 PASS → 自动流转
# 任何 FAIL → 硬停止，输出原因
```

### 状态管理

- Agent **不直接写 YAML**——通过 `alloy _state` 命令操作 `.alloy.yaml`
- 阶段转换必须通过 `alloy _guard` 校验
- hash 锁定确保制品不可篡改

---

## 四、Alloy 技能规范

### 阶段标题格式

```
┌──────────────────────────────────────┐
│ Alloy [N/5] · Phase: <阶段名>        │
│ 启动时间: <timestamp>                 │
└──────────────────────────────────────┘
```

步骤标题：`### [Step N/M] <描述>`

### 制品编号

`[N/M]` 是阶段内局部编号（plan 阶段 M=5，apply 阶段 M=2）。**不输出全局制品进度**（如"0/8 artifacts 完成"）——全局进度由 `alloy status` 命令管理。

### 调用外部技能

**用 Skill 工具加载，不要内联重写。** 内联有两个问题：
1. 丢失审批闸门——被内联技能的内置审查流程被跳过
2. 丢失交互质量——技能的 Q&A 深度是经过测试和迭代的，几行指令无法复现

```markdown
# ✅ 正确——用 Skill 工具
使用 Skill 工具加载 superpowers:brainstorming 技能，ARGUMENTS 包含：
  Change: <name>
  探查结果：<摘要>

禁止跳过此步骤。如技能不可用，停止流程并提示安装。
```

调用时通过 ARGUMENTS 传入当前上下文（change name、探查结果、项目上下文等），让子技能知道它在哪里。

### 分支规则

每个 change 必须在独立的 feature 分支上工作。分支相关操作必须包含验证闸门：
- **主分支确认** — 读取 `references/main-branch-detection.md`，config 已有时跳过
- **当前分支位置检查** — 在主分支上 = HARD STOP
- **base ref 锁定** — 创建 worktree 时基于 feature_branch，不是 HEAD

### 幂等检查

每个步骤开头检查该步骤是否已完成，已完成的跳过。这是断点恢复的关键——agent 重入时从第一个未完成的步骤继续。

---

## 五、编写检查清单

### 结构

- [ ] description 只写触发条件，不写流程
- [ ] 核心原则在开头就讲清楚
- [ ] 每步解释 WHY（为什么这步不可跳过）
- [ ] 关键步骤有反例（什么算做得不够）
- [ ] 有产出的步骤前面有审查窗口（用户确认）

### 内容

- [ ] 外部技能调用使用 Skill 工具，不内联重写
- [ ] 纪律型技能有 Red Flags 表
- [ ] 没有 MUST/DO NOT 堆砌（关键闸门处可用，其他地方解释 WHY）
- [ ] 阶段标题格式统一（`Alloy [N/5] · Phase: <名>` + `Step N/M`）
- [ ] 制品编号用阶段内局部编号，不输出全局进度

### 可靠性

- [ ] 关键闸门有脚本校验兜底（`alloy _guard`）
- [ ] 状态变更通过 `alloy _state` 命令操作，不手写 YAML
- [ ] 每个步骤有幂等检查，支持断点恢复
- [ ] git add 只用精确路径，不用 `-A`/`-a`/`.`

---

## 六、参考

| 文档 | 看什么 |
|------|--------|
| [Claude Code Skills](https://code.claude.com/docs/en/skills.md) | frontmatter 规范、发现机制 |
| [Claude Code .claude 目录](https://code.claude.com/docs/en/claude-directory.md) | skills/ 目录规范 |
| [Agent Skills 开放标准](https://agentskills.io) | 跨工具兼容的 skill 规范 |
| `superpowers:writing-skills` | Skill 创建/修改流程（TDD for Skills） |
| `superpowers:test-driven-development` | 纪律型技能的范例结构 |
| Alloy 视觉规范 `docs/specification/02-visual-spec.md` | 审查窗口、编号、状态符号 |
