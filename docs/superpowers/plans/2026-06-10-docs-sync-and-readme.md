# 文档对齐 + README 重写 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 3 个文档文件与最新代码/Skill 状态对齐，README 核心特性重写为 6 条面向用户的精炼卖点。

**Architecture:** 纯文档更新，3 个独立文件互不依赖，可并行修改。每个文件 1 个 task。

**Tech Stack:** Markdown

---

### Task 1: `01-product-spec.md` — 补充新特性

**Files:**
- Modify: `docs/specification/01-product-spec.md`

- [ ] **Step 1: 内部命令表补充 `_skill` 和 `_state` 子命令**

找到内部命令表（约第 32-37 行）：
```markdown
| `alloy _state` | 读写 `.alloy.yaml` 状态文件（`read\|write\|init\|check`） |
```

替换为：
```markdown
| `alloy _state` | 读写 `.alloy.yaml` 状态文件（`read\|write\|init\|merge\|check\|timestamp`） |
| `alloy _skill` | 技能使用记录管理（`log\|skip`），持久化到 `skill_usage[]` |
```

- [ ] **Step 2: `.alloy.yaml` 示例补充 `skill_usage` 字段**

找到 `.alloy.yaml` 示例（约第 413-440 行），在 `records` 数组之后、结束的 ` ``` ` 之前插入：
```yaml
skill_usage:
  - skill: superpowers:brainstorming
    stage: start
    used: true
    recorded_at: "2026-05-28 09:05:00"
  - skill: opsx:continue
    stage: plan
    used: true
    count: 5
    recorded_at: "2026-05-28 09:15:00"
```

- [ ] **Step 3: 字段表补充 `skill_usage` 行**

找到字段表（约第 442-454 行），在 `records` 行之后插入：
```markdown
| `skill_usage` | 各阶段写入 | 技能使用记录数组，格式 `SkillUsageEntry[]`，含 skill/stage/used/count/via/reason/recorded_at。retrospective §4 全周期技能审计的数据源 |
```

- [ ] **Step 4: §8 关键设计决策补充 #31 和 #32**

找到关键设计决策表末尾（约第 774 行 `| 30 |` 之后），追加：
```markdown
| 31 | 技能使用审计持久化 | `alloy _skill log` 在每个技能加载后立即记录到 `skill_usage[]`，retrospective §4 自动读取生成全周期技能审计表。解决之前 retrospective 靠 Agent 自报（不准、会漏）的问题 |
| 32 | 交互降级策略 | 技能文件中 `AskUserQuestion` JSON 块必须附带降级文本格式。Agent 执行时检测平台能力——支持则用原生交互组件，不支持则自动降级为结构化文本选项。确保同一流程在 8 个平台体验一致 |
```

- [ ] **Step 5: Commit**

```bash
git add docs/specification/01-product-spec.md
git commit -m "docs(spec): 补充 _skill 命令、skill_usage 字段、交互降级等新特性"
```

---

### Task 2: `02-visual-spec.md` — 修复 fix 示例

**Files:**
- Modify: `docs/specification/02-visual-spec.md`

- [ ] **Step 1: 更新 fix 命令示例中的诊断确认**

找到第 523 行：
```
> 确认以上诊断结果？[Y/n]
```

替换为 `AskUserQuestion` + 降级文本格式：
```
**Claude Code：**
```
AskUserQuestion: {
  questions: [{
    question: "确认以上诊断结论？",
    header: "诊断确认",
    options: [
      { label: "(a) 确认，进入修复", description: "根因确认无误，进入修复路径" },
      { label: "(b) 重新诊断", description: "回到 Step 2 重新分析" }
    ],
    multiSelect: false
  }]
}
```

**其他平台（降级为文本选项）：**
```
> → (a) 确认，进入修复 — 根因确认无误，进入修复路径
> → (b) 重新诊断 — 回到 Step 2 重新分析
> 请输入 a 或 b：
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/specification/02-visual-spec.md
git commit -m "docs(visual-spec): fix 示例更新为 AskUserQuestion + 降级格式"
```

---

### Task 3: `README.md` — 重写核心特性

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 替换"核心特点"小节**

找到第 113 行 `## 核心特点` 到第 137 行 `> 完整设计细节见...` 之间的内容，替换为：

```markdown
## 核心特性

**流程闸门，不是建议。** TDD 跳过？脚本阻断。code review 跳过？制品 hash 对不上。5 个阶段每步都有硬校验——不是"建议你这么做"，而是"不这么做就走不下去"。

**OpenSpec + Superpowers，一条命令搞定。** OpenSpec 管规格（做了没有），Superpowers 管纪律（做对了没有）。两个工具各自强大，但技能繁多、组合复杂。Alloy 把它们编成一条 5 阶段流水线——你只管 `/alloy:start`，剩下的编排、调度、校验全自动。不用学两个工具的 20+ 个技能，一条命令走到交付。

**随便打哪个命令，都能接上。** 退出时在 plan 阶段，回来不小心打了 `/alloy:apply`？系统自动检测进度，跳到正确位置继续。不需要记住"上次做到哪了"。

**改需求不乱。** 做到一半用户说要改需求？系统检查编码是否已经开始——还没写就回溯修正，已经写了就开新 change。规格和代码不会分叉。

**每次做完，下次更聪明。** 每次 change 结束自动生成复盘——踩了什么坑、什么假设被推翻、哪些改进没完成。这些教训自动写进 memory，下次开新 change 时自动提醒。

**每一步都可追溯。** 需求、设计、规格、任务、验证、复盘——每个产出独立 hash 锁定 + 独立 commit。谁在什么时候确认了什么，一条链完整可查。
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): 核心特性重写为 6 条面向用户的精炼卖点"
```
