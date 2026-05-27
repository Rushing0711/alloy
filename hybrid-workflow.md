# 混合工作流设计

本文档融合 OpenSpec 和 Superpowers，设计一套完整的开发工作流，覆盖 4 个阶段：Pre-OpenSpec → OpenSpec 规划 → OpenSpec 执行 → 收尾。

---

## 一、阶段全貌

### Pre-OpenSpec 阶段（无需 change-name）

| 步骤 | 命令/技能 | 产出物 |
|------|----------|--------|
| 需求输入 |（离线/人工） | `requirement.md` |
| 统一探索入口 | `/opsx:explore <topic>` | 无文件（上下文内消化） |
| 设计草案 | `superpowers:brainstorming`（隐含） | **`draft.md`**（项目根目录，临时存放） |

explore 自动分流：新项目 → 探索需求空间；存量项目 → 探索代码库 + 需求空间。

change-name 在 draft.md 完成后自然浮现。`/opsx:new <name>` 执行时会将 draft.md 移入 `openspec/changes/<name>/`。

### OpenSpec 规划阶段

| 步骤 | 命令/技能 | 产出物 |
|------|----------|--------|
| 创建 change | `/opsx:new <name>` | change 目录（将 draft.md 放入） |
| 范围 | `/opsx:continue` → proposal | **`proposal.md`** |
| 技术方案 | `/opsx:continue` → design | **`design.md`** |
| 行为契约 | `/opsx:continue` → specs | **`specs/**/*.md`** |
| 任务清单 | `/opsx:continue` → tasks | **`tasks.md`** |
| 执行计划 | `/opsx:continue` → plan（隐含 `superpowers:writing-plans`） | **`plan.md`** |

### OpenSpec 执行阶段

| 步骤 | 命令/技能 | 产出物 |
|------|----------|--------|
| 执行 | `/opsx:apply` | |
| ├ 隔离 | 隐含 `superpowers:using-git-worktrees` | 隔离 workspace |
| ├ 编码 | 隐含 `superpowers:subagent-driven-development` | 代码变更 |
| │ ├ 传递 | `superpowers:test-driven-development` | 测试代码 |
| │ └ 传递 | `superpowers:requesting-code-review` | 审查结果 |
| ├ 验证 | 隐含 `superpowers:verification-before-completion` | |
| │ + | `openspec-verify-change` | **`verify.md`** |
| └ 复盘 | 纯 AI 生成 | **`retrospective.md`** |

### 收尾阶段

| 步骤 | 命令/技能 | 产出物 |
|------|----------|--------|
| 人工测试 |（人工） | 测试结论 |
| 收尾 | `superpowers:finishing-a-development-branch` | merge / PR / keep / discard |
| PR 审查 | `superpowers:receiving-code-review`（PR 反馈时） | 代码修改 |
| 归档 | `/opsx:archive` | delta spec 合并 + 目录归档 |

---

## 二、3 种场景

### 场景 1：从 0 到 1 开发新项目

```
requirement.md

Pre-OpenSpec:
    /opsx:explore <topic>
        → explore 检测无现有代码，聚焦需求空间探索
        → 隐含 superpowers:brainstorming
            作用：交互式 Q&A + 方案对比 + 设计审批
            产出：draft.md（设计草案，自由格式）

OpenSpec 规划:
    /opsx:new <name>
        将 draft.md 放入 change 目录
    /opsx:continue
        ├── proposal  ← 读 draft.md，提取 Why/What/Capabilities（产出: proposal.md）
        ├── design    ← 读 draft.md + proposal，重组为结构化方案（产出: design.md）
        ├── specs     ← 按 proposal 的 Capabilities 写 Delta Spec（产出: specs/**/*.md）
        ├── tasks     ← 基于 specs + design 拆 checkbox（产出: tasks.md）
        └── plan      ← 隐含 superpowers:writing-plans，拆 TDD 微步骤（产出: plan.md）

OpenSpec 执行:
    /opsx:apply
        ├── superpowers:using-git-worktrees
        ├── superpowers:subagent-driven-development
        │      传递: superpowers:test-driven-development
        │      传递: superpowers:requesting-code-review
        ├── superpowers:verification-before-completion
        │      + openspec-verify-change → verify.md
        └── retrospective.md

收尾:
    人工测试
    superpowers:finishing-a-development-branch
        选项1: 本地 merge / 选项2: 创建 PR / 选项3: 保持 / 选项4: 丢弃
    PR 审查（如选选项2）
        → superpowers:receiving-code-review（如有反馈）
    /opsx:archive
        前提：finishing 已完成
        作用：sync delta spec + 归档
```

### 场景 2：存量项目开发新功能

```
requirement.md

Pre-OpenSpec:
    /opsx:explore <领域>
        → explore 检测到现有代码，先探查代码库（架构、集成点、约束、模式）
        → 隐含 superpowers:brainstorming
            作用：带代码库情报的交互式 Q&A + 方案对比 + 设计审批
            产出：draft.md（设计草案）

OpenSpec 规划 → 执行 → 收尾（同场景 1）
```

**与场景 1 的差异仅在于 explore 自动感知到代码库存在后，先做了代码探查。入口相同，行为自适应。**

### 场景 3：修复 Bug

```
superpowers:systematic-debugging
    作用：结构化诊断（观察→分析→假设→验证）
    产出：根因定位

    ├── 不改契约（不改变 API 行为 / 不新增 requirement）
    │       直接修 → superpowers:verification-before-completion → 直接 PR
    │       不进 OpenSpec
    │
    └── 需改契约
           ├── 无已有 change？
           │     → 走 Pre-OpenSpec 完整流程
           │       （/opsx:explore → draft.md → /opsx:new → /opsx:continue）
           │
           ├── plan.md 已存在？（change 已审定）
           │     → 开新 /opsx:new <new-name>，独立追踪
           │
           └── plan.md 不存在？（change 在规划阶段，尚未执行）
                 → 回当前 change，/opsx:continue 更新制品
```

---

## 三、制品依赖 DAG

```
Pre-OpenSpec 阶段:
    draft.md  ← /opsx:explore 隐含 superpowers:brainstorming 产出（无 DAG 依赖）

OpenSpec 规划阶段（schema DAG）:
    proposal  ← 无 schema 依赖（instruction 读 draft.md）
        │
        ├──→ specs     ← 依赖 proposal
        │      │             （只读 Capabilities，不读 draft 以防污染）
        │      │
        │      └──→ tasks   ← 依赖 specs + design
        │            │            （需"做什么"+"怎么做"）
        │            │
        │            └──→ plan   ← 依赖 tasks
        │                      隐含: superpowers:writing-plans
        │
        └──→ design   ← 依赖 proposal
                       （instruction 读 draft.md，受 proposal 范围约束）

OpenSpec 执行阶段:
    apply  ← 依赖 plan
        ├── git-worktrees  ← 隐含: superpowers:using-git-worktrees
        ├── subagent-dev   ← 隐含: superpowers:subagent-driven-development
        │                       传递: TDD + code-review
        ├── verify         ← 隐含: verification-before-completion
        │                        + openspec-verify-change → verify.md
        └── retrospective  →  retrospective.md
```

### 逐依赖理由

| 边 | 理由 |
|----|------|
| proposal 读 draft | 从 draft 决策链中提取范围。无正式 DAG 依赖（draft 在 schema 之外，由 instruction 读取） |
| specs → proposal | 按 Capabilities 列表逐项写 Delta Spec，只关心行为边界 |
| specs ∅→ draft | **故意不读。** 防止行为契约被技术实现细节污染（如"用 Redis"而非"支持会话持久化"） |
| design → proposal | 约束技术方案不超出 proposal 的 Capabilities 范围 |
| design 读 draft | 重组 draft 中的 Q1-Qn 技术决策 |
| tasks → specs + design | 需 specs 告诉"做什么" + design 告诉"怎么做" |
| plan → tasks | 将粗粒度 checkbox 拆为 TDD 微步骤 |

---

## 四、OpenSpec 命令使用情况

| 命令 | 用否 | 角色 |
|------|------|------|
| `/opsx:explore` | 用 | Pre-OpenSpec：统一入口，自适应（新项目探索需求、存量项目探索代码），隐含 brainstorming |
| `/opsx:new` | 用 | OpenSpec 规划：创建空 change 目录 |
| `/opsx:continue` | 用 | OpenSpec 规划：逐制品生成 + 审查 |
| `/opsx:apply` | 用 | OpenSpec 执行：实现（不含 finishing 和 archive） |
| `/opsx:archive` | 用 | 收尾：finishing 完成后手动归档 |
| `/opsx:ff` | 备选 | 需求极其明确时替代 continue |
| `/opsx:propose` | 不用 | 自定义 schema 下与 ff/continue 等价 |
| `/opsx:verify` | 不用 | 嵌入 apply 内部 |
| `/opsx:sync` | 不用 | 嵌入 archive |
| `/opsx:bulk-archive` | 不用 | 边缘场景 |
| `/opsx:onboard` | 不用 | 一次性引导 |

**日常命令 5 个：explore、new、continue、apply、archive，外加 systematic-debugging。**

---

## 五、Superpowers 技能使用情况

### 在流程中使用的（10 个）

| 技能 | 阶段 | 触发方式 | 作用 |
|------|------|---------|------|
| `brainstorming` | Pre-OpenSpec | explore 隐含 | 交互式 Q&A + 方案对比 + 设计审批 |
| `writing-plans` | OpenSpec 规划 | schema 隐含 | 将 tasks 拆为 TDD 微步骤 |
| `using-git-worktrees` | OpenSpec 执行 | apply 隐含 | 创建隔离 workspace |
| `subagent-driven-development` | OpenSpec 执行 | apply 隐含 | 逐任务子 agent 执行 |
| `test-driven-development` | OpenSpec 执行 | 传递激活 | 每个微任务 RED-GREEN-REFACTOR |
| `requesting-code-review` | OpenSpec 执行 | 传递激活 | 每个任务后派 code-reviewer |
| `verification-before-completion` | 执行 + Bug 修复 | apply 隐含 / 主动 | 代码行为验证 |
| `finishing-a-development-branch` | 收尾 | 主动调用 | 提供 merge/PR/keep/discard |
| `systematic-debugging` | Bug 修复 | 主动调用 | 结构化诊断 |
| `receiving-code-review` | 收尾 | 主动调用 | PR 审查反馈处理 |

### 未使用的（4 个）

| 技能 | 原因 |
|------|------|
| `executing-plans` | 不如 subagent-driven-development，不传递激活 TDD + code review |
| `dispatching-parallel-agents` | 特定场景工具，不属于核心工作流 |
| `writing-skills` | 与日常开发无关 |
| `using-superpowers` | 系统入口，不参与开发流程 |

---

## 六、流程全貌

### 功能开发流程

```
                    requirement.md
                         │
                  /opsx:explore
                   （自适应分流）
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
         新项目                    存量项目
         探索需求空间               探索代码+需求
            │                         │
            └────────────┬────────────┘
                         ▼
              隐含 superpowers:brainstorming
                   产出: draft.md
               change-name 自然浮现
                         │
                         ▼
              /opsx:new <name>
              /opsx:continue
         proposal→design→specs→tasks→plan
              (隐含: writing-plans)
                         │
                         ▼
                    /opsx:apply
         git-worktrees→subagent→verify→retro
         (隐含: worktrees, subagent,
          TDD, review, verification)
                         │
                         ▼
                     人工测试
                   ┌───┴───┐
                   ▼       ▼
                  通过    失败
                   │       │
                   │   ┌───┴───┐
                   │   ▼       ▼
                   │ 小修    大修
                   │ (直接   (回 continue
                   │  改码)   更新制品)
                   │   │       │
                   │   └───┬───┘
                   │       ▼
                   │    重新人工
                   │       │
                   └───────┘
                         │
                    finishing
                 merge/PR/keep/discard
                         │
                    PR 审查(如有)
               receiving-code-review
                         │
                    /opsx:archive
```

### Bug 修复流程（独立入口）

```
              Bug / 报错
                  │
     superpowers:systematic-debugging
              根因定位
                  │
           ┌──────┴──────┐
           ▼              ▼
        不改契约         需改契约
           │              │
           │       ┌──────┼──────┐
           │       ▼      ▼      ▼
           │    无change plan    plan
           │       │    已存在   不存在
           │       ▼      │      │
           │    Pre-      ▼      ▼
           │    OpenSpec 新    回当前
           │    完整流程 change  change
           │       │           更新制品
           │       │            │
           ▼       ▼            │
    verification-before-        │
       completion               │
           │                    │
           ▼                    │
        直接 PR ←───────────────┘
```

---

## 七、关键设计决策

| 决策 | 内容 | 理由 |
|------|------|------|
| explore 作为统一入口 | 新项目和存量项目都用 `/opsx:explore`，自动感知分流 | 减少心智负担，explore skill 自动判断有无代码并自适应 |
| brainstorming 由 explore 隐含 | 不单独调用，嵌入 explore 流程 | 用户只记一个入口，底层 skill 链自动串联 |
| Pre-OpenSpec 阶段前置 | draft 在 new 之前完成 | 范围确定后命名有依据 |
| 默认用 continue 而非 ff | continue 作为主入口 | 每制品可审查 |
| brainstorming 不在 schema DAG 内 | Pre-OpenSpec 独立步骤 | 此时尚未创建 change，无需 schema 追踪 |
| design 依赖 proposal | 新增约束 | 技术方案不超出范围 |
| specs 不读 draft | 故意隔离 | 防止行为契约被实现细节污染 |
| verification-before-completion 嵌入 apply | 补充 openspec-verify-change | 前者查代码行为，后者查制品结构 |
| apply 不含 finishing/archive | 两者独立为收尾阶段 | 不给未验证代码建 PR，不假设 AI 实现正确 |
| archive 前提是 finishing 完成 | 硬约束 | 只有人类确认的 change 才能归档 |
| bug 修复三向分流 | 无 change / plan 已存在 / plan 不存在 三条路径 | 覆盖"无已有 change"的漏缺场景 |
| 人工测试失败分级 | 小修直接改码 → 重新测试；大修回 continue 更新制品 | 避免小改动走重流程，避免大改动绕过制品审查 |
