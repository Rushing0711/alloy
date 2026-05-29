# Alloy Schema 升级设计

> 参考 superpowers-bridge，补全 Alloy schema 的制品定义和执行阶段编排。

## 背景

Alloy 初始 schema 定义了 6 个制品（draft → proposal → design/specs → tasks → plan），缺少：

1. **verify 制品** — 实现后的结构化验证（代码层 + 制品层）
2. **retrospective 制品** — 证据驱动的复盘分析
3. **apply 阶段定义** — 执行步骤、技能预检、进度追踪，全部散落在 SKILL.md 中

参考 superpowers-bridge（社区 OpenSpec schema）的完整设计，做一次 schema 升级。

## 为什么参考 superpowers-bridge

superpowers-bridge 是 OpenSpec 官方社区中第一个融合 OpenSpec + Superpowers 的 schema，拥有完整的 8 制品 DAG 和完善的 apply 阶段定义。Alloy 与之目标相同但设计理念有差异（见 alloy-design.md §四 Schema 对比表）。

本次升级学习 superpowers-bridge 的结构化表达能力（verify/retrospective 制品、apply 阶段 schema 化、PRECHECK 规范化），同时保留 Alloy 已验证的差异化设计：

| 保留 Alloy 特色 | 原因 |
|----------------|------|
| 指令用独立 `instructions/*.md` | 改指令不用动 schema，更易维护 |
| draft.md 在项目根目录 | Pre-OpenSpec 定位："先把事情想清楚"再进 change |
| apply 不含 archive + PR | finish/archive 独立为人工闸门 |
| 中文指令 + 模板 | 团队沟通语言 |

## Schema 变更

### 完整 schema.yaml

```yaml
name: alloy
version: "1"
description: >
  Alloy schema - 融合 OpenSpec 制品治理和 Superpowers 执行技能。
  Pre-OpenSpec 阶段产出 draft.md，规划阶段依次生成 proposal → design → specs → tasks → plan。
  执行阶段（apply）编排：worktree 隔离 → SDD(TDD) → 代码验证 → 制品验证 → 复盘。
  收尾阶段：/alloy-archive（归档 + finish），/alloy-finish 可独立调用。

artifacts:
  - id: draft
    generates: draft.md
    template: templates/draft.md
    instruction: instructions/draft.md
    requires: []

  - id: proposal
    generates: proposal.md
    template: templates/proposal.md
    instruction: instructions/proposal.md
    requires: [draft]

  - id: design
    generates: design.md
    template: templates/design.md
    instruction: instructions/design.md
    requires: [proposal]

  - id: specs
    generates: "specs/"
    template: templates/specs.md
    instruction: instructions/specs.md
    requires: [proposal]

  - id: tasks
    generates: tasks.md
    template: templates/tasks.md
    instruction: instructions/tasks.md
    requires: [specs, design]

  - id: plan
    generates: plan.md
    template: templates/plan.md
    instruction: instructions/plan.md
    requires: [tasks]

  - id: verify
    generates: verify.md
    template: templates/verify.md
    instruction: instructions/verify.md
    requires: [plan]

  - id: retrospective
    generates: retrospective.md
    template: templates/retrospective.md
    instruction: instructions/retrospective.md
    requires: [verify]

apply:
  tracks: tasks.md

  precheck:
    - superpowers:using-git-worktrees
    - superpowers:subagent-driven-development
    - superpowers:test-driven-development
    - superpowers:requesting-code-review
    - superpowers:verification-before-completion

  steps:
    - order: 1
      skill: superpowers:using-git-worktrees
      description: 创建隔离 workspace

    - order: 2
      skill: superpowers:subagent-driven-development
      description: SDD + TDD + code review 执行 tasks
      transitive: [superpowers:test-driven-development, superpowers:requesting-code-review]
      fallback: superpowers:executing-plans

    - order: 3
      skill: superpowers:verification-before-completion
      description: 代码层验证 — 测试通过、行为正确

    - order: 4
      skill: opsx:verify
      description: 制品层验证 — 7 项结构化检查，产出 verify.md
      produces: verify

    - order: 5
      description: 证据驱动复盘 — 纯 AI 生成，产出 retrospective.md
      produces: retrospective
```

### artifacts 变更

| 变更 | 说明 |
|------|------|
| +verify | 新增，依赖 plan。apply 阶段 step 4 产出。7 项结构化检查。 |
| +retrospective | 新增，依赖 verify。apply 阶段 step 5 产出。证据驱动复盘（§0-§6）。 |
| 其余 6 个 | 不变 |

### apply 段（新增）

| 字段 | 说明 |
|------|------|
| `tracks` | 指向 tasks.md，让 `openspec status` 报告 checkbox 完成率 |
| `precheck` | 技能可用性列表。apply 启动时逐个检查，任一缺失 → STOP，不静默降级 |
| `steps` | 5 个执行步骤，按 order 顺序执行 |

### apply 验证循环

```
step 2 (SDD) → step 3 (代码验证) → step 4 (制品验证) → step 5 (复盘)
     ↑              │                      │
     │              FAIL                   FAIL
     └──────────────┴──────────────────────┘
              任意 FAIL 都回到 SDD
```

规则统一：验证不过 → 回到 SDD（确保修复也有 TDD + code review 安全网）。

## 新增制品详细设计

### verify — 7 项结构化检查

**指令文件：** `instructions/verify.md`

**PRECHECK（shell 命令，非 LLM 判断）：**
1. 提交证据：`git log --oneline $(git merge-base HEAD origin/main)...HEAD | wc -l` > 0
2. 任务进度：`grep -c '^- \[x\]' tasks.md` > 0

两项都通过才进入验证。

**两层验证结构：**

| 层 | 技能 | 检查内容 |
|----|------|---------|
| 代码层（step 3） | `superpowers:verification-before-completion` | 测试通过、行为正确 |
| 制品层（step 4） | `/opsx:verify` | 7 项结构化检查 |

**7 项检查：**

| # | 检查项 | 方法 | 阻塞 |
|---|--------|------|:--:|
| 1 | 结构校验 | `openspec validate --all --json` | 是 |
| 2 | 任务完成 | 检查 tasks.md checkbox 全部 `[x]` | 是 |
| 3 | Delta Spec 同步 | 对比 change specs/ 与主 specs/ | 是 |
| 4 | Design / Specs 一致性 | 抽取 design 决策点，确认 specs 中有对应需求 | 否 |
| 5 | 实现信号 | 检查 git staged 文件和提交记录 | 是 |
| 6 | 路由泄漏检测 | `ls docs/superpowers/specs/*.md` | 否 |
| 7 | 延期任务等价对照 | plan.md 中 `[~]` 延期任务 vs 自动化测试覆盖 | 否 |

**结果判定：** PASS / PASS WITH WARNINGS / FAIL

FAIL 时列出具体修复项，循环修复直到 PASS 或 PASS WITH WARNINGS。

**降级策略：** 若 `/opsx:verify` 不可用，降级为手动执行 7 项检查并记录结果。

### retrospective — 证据驱动复盘

**指令文件：** `instructions/retrospective.md`

**PRECHECK（shell 命令）：**
1. `test -f verify.md` — verify.md 存在
2. `! grep -q '^- \[x\] ❌ FAIL' verify.md` — Overall Decision 不是 FAIL

**§0-§6 结构：**

| 章节 | 内容 | 数据来源 |
|------|------|---------|
| §0 Evidence | 量化前置数据（提交数、diff 大小、任务完成比、活跃时间、subagent 次数、测试覆盖信号等） | git log、tasks.md、verify.md |
| §1 Wins | `[evidence: <commit/file/test>] <描述>` | §0 + git |
| §2 Misses | 三级严重度：🔴 blocking / 🟡 painful / 📌 nit，每条带 evidence | §0 + git |
| §3 Plan Deviations | Plan task / What changed / Why 表格 | plan.md vs 实际提交 |
| §4 Skill Compliance | 技能清单 ✓/✗，跳过的技能填三问（跳过什么/为什么/如何防复发） | apply 日志 |
| §5 Surprises | 被推翻的假设 | 人工判断 |
| §6 Promote Candidates | `- [ ]` checklist + Why/How to apply，支持跨周期 carry-forward | §1-§5 |

**跳过策略：**

| 情况 | 处理 |
|------|------|
| 单 commit 小修（linter fix、typo） | 可跳过，写一行 "Skipped: single-commit fix, no insights" |
| 其他一切 | 必须产出 §0 + 全部 6 个分析节 |

**Forward-Pointer 策略：** 后续发现 retrospective 中结论有误时，不重写原文件，追加 `> **Update YYYY-MM-DD**: section X superseded by <链接>`。

## 模板变更

### 新增 templates/verify.md

```markdown
# Verify: <change-name>

> 生成时间: <timestamp>
> 提交范围: <base>..HEAD

## Overall Decision

- [ ] ✅ PASS
- [ ] ⚠️ PASS WITH WARNINGS
- [ ] ❌ FAIL

## 1. 结构校验
- 状态: <!-- ✓ / ✗ -->
- 输出: <!-- 命令输出摘要 -->

## 2. 任务完成
- 已完成: <!-- N --> / <!-- 总数 -->
- 完成率: <!-- 百分比 -->
- 未完成项: <!-- 列出或 "无" -->

## 3. Delta Spec 同步
- 状态: <!-- ✓ / ✗ / N/A -->
- 变更的 Capability: <!-- 列出 -->
- 冲突: <!-- 列出或 "无" -->

## 4. Design / Specs 一致性抽查
| Design 决策 | Specs 对应 | 状态 |
|------------|-----------|------|
| <!-- 决策 --> | <!-- 对应需求 --> | <!-- ✓ / ✗ --> |

## 5. 实现信号
- 提交数: <!-- N -->
- 变更文件: <!-- N -->
- 状态: <!-- ✓ / ✗ -->

## 6. 路由泄漏检测
- 状态: <!-- ✓ / ⚠️ -->
- 泄漏文件: <!-- 列出或 "无" -->

## 7. 延期任务对照
| 延期任务 | 等价覆盖 | 状态 |
|---------|---------|------|
| <!-- 任务 --> | <!-- 覆盖方式 --> | <!-- ✓ / ⚠️ --> |
```

### 修改 templates/retrospective.md

补充以下内容到现有模板：

1. **§0 字段细化：** 加入 Subagent 调度次数、新增外部依赖、提交链、测试覆盖信号
2. **§2 严重度格式：** `🔴 [blocking | evidence: ...]` / `🟡 [painful | evidence: ...]` / `📌 [nit | evidence: ...]`
3. **§4 技能表：** 列出具体技能清单（using-git-worktrees、subagent-driven-development、test-driven-development、requesting-code-review、verification-before-completion）
4. **§6 格式：** `- [ ]` checklist + `→ **Promote to**` + `> **Why**` + `> **How to apply**`
5. **Forward-Pointer 策略说明**

## 命令流程变化

### archive + finish 合并

```
之前: /alloy-apply → /alloy-finish → /alloy-archive
之后: /alloy-apply → /alloy-archive（内部先 archive 再 finish）
```

**`/alloy-archive`：**
1. 前置检查：phase=applied + verify.md 存在且不是 FAIL
2. `openspec archive -y`（自有幂等检查，已归档则跳过）
3. 自动调用 `/alloy-finish`（merge / PR / keep）

**`/alloy-finish`：** 保留为独立命令，用于 archive 时选 keep 后，后续手动合入。

### phase 状态

```
started → planned → applied → finished
```

去掉 `archived` 状态，`finished` 即终态。

### 命令体系（7 条）

| 命令 | 用途 |
|------|------|
| `/alloy-start` | 智能入口 |
| `/alloy-plan` | 制品生成 |
| `/alloy-apply` | 隔离执行 + 验证 + 复盘 |
| `/alloy-archive` | 归档 + finish（内部串联） |
| `/alloy-finish` | 独立 finish（keep 后恢复用） |
| `/alloy-fix` | Bug 修复入口 |
| `/alloy-status` | 查看状态 |

## 文件变更清单

| 文件 | 操作 | 内容 |
|------|------|------|
| `openspec/schemas/alloy/schema.yaml` | **修改** | artifacts +verify +retrospective；新增 apply 段 |
| `openspec/schemas/alloy/instructions/verify.md` | **新建** | PRECHECK + 7 项检查 + 判定 + 降级策略 |
| `openspec/schemas/alloy/instructions/retrospective.md` | **新建** | PRECHECK + §0-§6 + 跳过策略 + Forward-Pointer |
| `openspec/schemas/alloy/templates/verify.md` | **新建** | 7 项检查模板 + Overall Decision |
| `openspec/schemas/alloy/templates/retrospective.md` | **修改** | 补充 §0 字段、§2 格式、§4 技能表、§6 格式、Forward-Pointer |
| `.claude/skills/alloy-apply/SKILL.md` | **修改** | 对齐新的 apply steps（代码层验证 → 制品层验证 → 复盘） |
| `.claude/skills/alloy-archive/SKILL.md` | **修改** | 内部先 archive 再 finish；前置检查改为 phase=applied + verify.md |
| `.claude/skills/alloy-finish/SKILL.md` | **修改** | 调整为可独立调用（archive 时 keep 后恢复用） |
| `docs/alloy-design.md` | **修改** | 同步更新 |
| `docs/hybrid-workflow.md` | **修改** | 同步更新 |

### alloy-design.md 改动点

| 章节 | 改动 |
|------|------|
| §一 命令参考 | `/alloy-archive` 描述改为"归档 + finish"；`/alloy-finish` 改为"可独立调用（keep 后恢复）" |
| §一 alloy archive | 新增前置检查：verify.md 存在且不是 FAIL；新增步骤 3：自动调用 `/alloy-finish` |
| §一 alloy finish | 改为：可独立调用，用于 archive 时选 keep 后后续手动合入 |
| §四 制品依赖 DAG | artifacts 从 6 个变为 8 个，增加 verify（依赖 plan）和 retrospective（依赖 verify）；apply 步骤拆为 5 步 |
| §四 Schema 对比表 | 更新制品数量（6→8），更新 DAG 描述 |
| §七 关键设计决策 | 新增：archive 内部包含 finish（先归档文档再合入代码）；apply 内验证两层（代码层 + 制品层） |
| phase 状态 | 去掉 `archived`，`finished` 为终态 |

### hybrid-workflow.md 改动点

| 章节 | 改动 |
|------|------|
| §一 OpenSpec 执行阶段 | 验证拆为：代码层（verification-before-completion）→ 制品层（openspec-verify-change → verify.md）；apply 步骤变为 5 步 |
| §一 收尾阶段 | 归档改为 `openspec archive -y` → finishing；apply 阶段不含 finishing/archive |
| §三 制品依赖 DAG | artifacts 增加 verify 和 retrospective；apply 步骤拆解 |
| §七 关键设计决策 | 更新 apply 不含 finishing/archive 的说明（改为 archive 先于 finish） |
