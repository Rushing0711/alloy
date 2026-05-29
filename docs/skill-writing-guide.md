# Alloy 开发必读：Skill 编写经验

本文档总结来自 skill-creator、superpowers:writing-skills、Comet、Superpowers、OpenSpec 的技能编写最佳实践和教训，供 Alloy 项目开发和迭代技能时参考。

---

## 一、Skill 的核心结构

### 1. Description 只写"何时用"，不写"做什么"

这是测试验证出的最关键原则。当 description 里写了流程概要时，Claude 会直接按概要执行，**跳过 SKILL.md 正文**。

```yaml
# ❌ BAD — 写了流程，Claude 不读正文
description: 智能入口，先检测状态，再执行 explore，然后 brainstorming 交互式需求设计

# ✅ GOOD — 只写触发条件
description: Alloy 智能入口 - 自动检测状态，接续或新建 change
```

### 2. 解释 WHY，少用 MUST 大写

Superpowers 和 skill-creator 的共同经验：大写禁令只在少数关键闸门处用，大量使用时 Agent 会产生"指令疲劳"。

```markdown
# ❌ BAD
MUST 至少 3 轮追问。DO NOT 在 1-2 轮后进入方案阶段。
MUST 覆盖使用场景、功能边界、技术约束、验收标准。

# ✅ GOOD
每次只问一个问题，基于回答逐步深入。你的目标不是"问够 3 个问题"交差——
而是真正理解用户要什么、不要什么、怎么算成功。
用户回答得越简略，越说明他可能还没想清楚——这正是你追问的机会。
```

### 3. 用反例定义"什么算不够"

光说"做得好"没用——Agent 不知道边界在哪。给出具体反例，Agent 就知道怎么避免了。

```markdown
什么算"不够"（反例）：
- 只问了一个选择题（"A. Web 应用 B. CLI"）就觉得自己完成了
- 用户说"Web 应用"后没有追问"单页还是多页？需要后端吗？"
```

---

## 二、调用外部技能的正确方式

### 核心原则：用 Skill 工具，不要内联重写

Comet 的做法说明了一切：**直接使用 Skill 工具加载目标技能**，而不是把它的行为写进自己的 SKILL.md。

```markdown
# ✅ GOOD — Comet 的做法
使用 Skill 工具加载 superpowers:brainstorming 技能，ARGUMENTS 包含：
  Change: <name>
  Context: openspec/changes/<name>/.comet/handoff/design-context.md

禁止跳过此步骤。如技能不可用，停止流程并提示安装，不要用普通对话替代。
```

### 为什么不应该内联

内联其他技能的行为有两个问题：
1. **丢失审批闸门** — brainstorming 的 "用户审批后才产出文档" 是它的内置行为，内联后会丢失
2. **丢失交互质量** — 技能的 Q&A 深度是经过测试和迭代的，几行指令无法复现

### 接受非致命的工具警告

Skill 作为子 skill 调用时，可能出现 `Invalid tool parameters`（TaskCreate 等工具参数兼容性问题）。这些是非致命的——核心功能不受影响。**不要因为非致命警告而放弃 Skill 调用。**

### 传入上下文

调用 Skill 时通过 ARGUMENTS 传入当前上下文，让子 skill 知道它在哪里、有什么可用的信息：

```markdown
使用 Skill 工具加载 superpowers:brainstorming，ARGUMENTS：
  Change: <change-name>
  探查结果：<explore 阶段的发现摘要>
  项目上下文：<项目类型、技术栈等>
```

---

## 三、审批闸门（Blocking Points）

### 模式：Skill 执行 → 用户确认 → 产出文件

这是 Superpowers 和 Comet 的共同模式。每一步有产出的地方，都要有一个明确的**阻塞点**：

```markdown
### Step X：用户确认（阻塞点）

brainstorming 产出方案后，必须暂停并等待用户明确确认。
不得在用户确认前创建最终文档。

暂停时展示必要摘要：
- 采用的方案
- 关键取舍与风险
- 下一步行动

用户明确确认后，才继续。若用户要求调整，回到上一步迭代。
```

### Shell 脚本做硬校验

Comet 的经验：脚本输出是确定性的，Agent 行为不是。关键闸门用 shell 脚本做 HARD STOP：

```bash
bash "$COMET_GUARD" <change-name> design --apply
# 全部 PASS → 自动流转
# 任何 FAIL → 硬停止，输出原因
```

---

## 四、可靠性策略

### 三层防线

| 层 | 方式 | 可靠性 |
|----|------|:--:|
| SKILL.md 指令 | 原因驱动的行为引导 | 中（Agent 可能跳过） |
| 脚本硬校验 | HARD STOP 阻断非法状态转换 | 高（确定性） |
| 人类审查窗口 | 阻塞点等待用户确认 | 最高（人类决策） |

不要只用第一层——三条防线都要有。

### 状态文件 + 脚本管理

参考 Comet 的 `.comet.yaml` + `comet-state.sh`：

- SKILL.md 告诉 Agent **什么情况下**需要更新状态
- 但 Agent **不直接写 YAML**——通过脚本操作（避免手动编辑错误）
- guard 脚本在阶段转换时校验前置条件和退出条件

### 上下文交接包

参考 Comet 的 `comet-handoff.sh`：跨阶段时，用脚本生成包含 SHA256 的确定性上下文包，而不是让 Agent 临时写 summary。这确保了下游 skill 拿到的是可追溯的、完整的信息。

---

## 五、Skill 创建流程（TDD for Skills）

superpowers:writing-skills 采用 RED-GREEN-REFACTOR 开发 skill：

| TDD | Skill 创建 |
|-----|-----------|
| 写测试 | 创建压力场景（不用 skill，观察 Agent 的失败行为） |
| 测试失败（RED） | 记录 Agent 违反规则的具体方式和原话 |
| 写代码（GREEN） | 针对那些具体违反行为写 skill |
| 测试通过 | 验证 Agent 现在遵守规则 |
| 重构（REFACTOR） | 发现新的规避方式 → 堵漏洞 → 重新验证 |

**铁律：没有失败的测试，不要写 skill。** 这意味着：
1. 先跑 baseline——不用 skill，看 Agent 怎么做
2. 记录 Agent 的具体违规行为和原话
3. 针对性地写 skill
4. 再跑一次，验证修复

---

## 六、常见错误清单

| 错误 | 后果 | 正确做法 |
|------|------|----------|
| 内联其他 skill 的行为 | 丢失审批闸门和交互深度 | 用 Skill 工具调用 |
| 只有 MUST 没有 WHY | Agent 疲劳，选择性执行 | 解释原因，用反例定义边界 |
| 没有反例 | Agent 不知道"够了"是什么 | 给出具体的失败示例 |
| description 写流程概要 | Claude 看概要而不读正文 | 只写触发条件 |
| Skill 未测试就部署 | 不可靠的行为 | RED-GREEN-REFACTOR |
| 只靠指令，不靠脚本 | Agent 可能跳过 | 关键闸门用 shell 脚本 |
| SKILL.md 夹杂技术栈偏向 | 误导 Agent 的技术选型 | 保持通用，从项目 CLAUDE.md 读取偏好 |
| 让 Agent 手动写状态文件 | 格式错误、拼写错误 | 用脚本来做确定性的状态操作 |

---

## 七、SKILL.md 编写检查清单

**结构性检查：**
- [ ] description 只写触发条件，不写流程
- [ ] 核心原则在开头就讲清楚
- [ ] 每一步解释了 WHY（为什么这步不可跳过）
- [ ] 关键步骤有反例（什么算做得不够）
- [ ] 有产出的步骤前面有阻塞点（用户确认）

**内容检查：**
- [ ] 没有技术栈偏向（Node.js、Python 等具体技术名）
- [ ] 没有多余的 MUST/DO NOT 堆砌
- [ ] 外部 skill 调用使用 Skill 工具，不内联重写
- [ ] 阶段标题统一格式（`## Alloy · <阶段> · <描述>` + `### Step N/M：<描述>`）

**可靠性检查：**
- [ ] 关键闸门有脚本校验作为兜底
- [ ] 状态变更通过脚本操作，不手写 YAML
- [ ] 有阻塞点让用户确认后才能继续

---

## 八、Claude Code 官方技能规范

来源：https://code.claude.com/docs/en/skills.md

### Skill 目录结构

```
~/.claude/skills/<skill-name>/SKILL.md    # 个人，所有项目可用
.claude/skills/<skill-name>/SKILL.md      # 项目级，本项目可用
```

### 关键规则

1. **命令名 = 目录名。** `.claude/skills/alloy-start/SKILL.md` → `/alloy-start`
2. **自定义命令已并入 Skill。** `.claude/commands/deploy.md` 和 `.claude/skills/deploy/SKILL.md` 效果相同
3. **优先级：** Enterprise > Personal > Project；Skill 优先于同名 command
4. **实时检测：** 修改 skill 文件无需重启 session
5. **父目录发现：** 从当前目录到仓库根的 `.claude/skills/` 都会被加载
6. **`disable-model-invocation: true`** → 阻止 Claude 自动加载，仅手动调用
7. **`user-invocable: false`** → 从 `/` 菜单隐藏，用于纯背景知识

### Frontmatter 参考

| 字段 | 说明 |
|------|------|
| `name` | 展示名（默认=目录名） |
| `description` | 何时使用、做什么（Claude 据此决定是否自动加载） |
| `when_to_use` | 额外的触发条件说明 |
| `argument-hint` | 参数提示，如 `[topic]` |
| `disable-model-invocation` | `true` = 仅手动调用 |
| `user-invocable` | `false` = 隐藏 |
| `allowed-tools` / `disallowed-tools` | 工具权限控制 |
| `model` / `effort` | 临时覆盖模型/努力级别 |
| `context: fork` | 在子 agent 中运行 |

### 动态上下文注入

\`\`\` ! `command` \`\`\` 语法在 skill 加载前执行命令并内联输出，让 skill 携带实时上下文。

---

## 九、参考来源

| 来源 | 链接 | 学什么 |
|------|------|--------|
| **Claude Code 官方 Skill 文档** | https://code.claude.com/docs/en/skills.md | Skill 结构、frontmatter、发现机制 |
| **Claude Code 功能概览** | https://code.claude.com/docs/en/features-overview.md | 何时用 skill vs CLAUDE.md vs hook |
| **Claude Code .claude 目录** | https://code.claude.com/docs/en/claude-directory.md | skills/ 目录规范 |
| **Claude Code 命令参考** | https://code.claude.com/docs/en/commands.md | 内置命令和 bundled skills |
| **Agent Skills 开放标准** | https://agentskills.io | 跨工具兼容的 skill 规范 |
| **skill-creator**（bundled skill） | 内置 | Skill 结构、description 优化、测试迭代 |
| **superpowers:writing-skills**（obra） | 内置 | TDD for skills、压力测试、堵漏洞 |
| **Comet**（rpamis） | https://github.com/rpamis/comet | Shell 脚本闸门、上下文交接包、多阶段编排 |
| **Superpowers**（obra） | https://github.com/obra/superpowers | 原因驱动的指令风格、审批闸门模式 |
| **superpowers-bridge** | https://github.com/JiangWay/openspec-schemas | OpenSpec + Superpowers schema 整合 |
| **OpenSpec**（Fission-AI） | https://github.com/Fission-AI/OpenSpec | 制品 DAG、Delta Spec、归档审计 |
| **Claude Code 快速开始** | https://code.claude.com/docs/en/quickstart | 基础使用 |
| **Claude Code 最佳实践** | https://code.claude.com/docs/en/best-practices | CLAUDE.md 编写、上下文管理 |
