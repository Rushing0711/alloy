# 混合工作流设计

> **本文档定位：Alloy 设计决策的来源——不是过时文档，是推导文档。**
>
> 这份文档写于 Alloy 自身技能体系诞生之前。它分析的是 OpenSpec 和 Superpowers **原始技能**的编排融合方式，因此文中使用的是 `/opsx:` 和 `superpowers:` 命名（如 `/opsx:explore`、`superpowers:brainstorming`），而非 Alloy 封装后的 `/alloy-` 命令。这正是本文档的价值——它记录了"为什么要这么编排"的分析过程，是 alloy-design.md 中每一条设计决策的推导来源。
>
> 如果你在找"怎么用 Alloy 命令"，请看 [alloy-design.md](../specification/01-product-spec.md)。如果你想理解"Alloy 为什么这样设计"，本文档就是起点。

本文档融合 OpenSpec 和 Superpowers，设计一套完整的开发工作流，覆盖 4 个阶段：Pre-OpenSpec → OpenSpec 规划 → OpenSpec 执行 → 收尾。

> **约定：** 文中标注的"内部遵循 xxx""内部使用 xxx""SDD 内部…"等描述，记录的是该技能**内部自动完成**的行为，用于让读者了解完整流程。这些不是需要主动调用的独立步骤——编排层只需调用入口技能，内部机制由技能自身管理。

---

## 一、阶段全貌

### Pre-OpenSpec 阶段（无需 change-name）

| 步骤 | 命令/技能 | 产出物 |
|------|----------|--------|
| 需求输入 |（离线/人工） | `requirement.md` |
| 统一探索入口 | `/opsx:explore <topic>` | 无文件（上下文内消化） |
| 设计草案 | `superpowers:brainstorming`（隐含） | **`draft.md`**（change 目录内，`openspec/changes/<name>/draft.md`） |

explore 自动分流：新项目 → 探索需求空间；存量项目 → 探索代码库 + 需求空间。

change-name 在 draft.md 完成后自然浮现。`/opsx:new <name>` 执行时会将 draft.md 移入 `openspec/changes/<name>/`。

### OpenSpec 规划阶段

| 步骤 | 命令/技能 | 产出物 |
|------|----------|--------|
| 创建 change | `/opsx:new <name>` | change 目录（将 draft.md 放入） |
| 范围 | `/opsx:continue` → proposal | **`proposal.md`** |
| 技术方案 | `/opsx:continue` → design | **`design.md`** |
| 行为 spec | `/opsx:continue` → specs | **`specs/**/*.md`** |
| 任务清单 | `/opsx:continue` → tasks | **`tasks.md`** |
| 执行计划 | `superpowers:writing-plans`（独立步骤，不经过 `/opsx:continue`） | **`plans.md`** |

### OpenSpec 执行阶段

| 步骤 | 命令/技能 | 产出物 |
|------|----------|--------|
| 执行 | `/opsx:apply` | |
| ├ 预检 | precheck：6 个 Superpowers 技能可用性 | |
| ├ 隔离 | 隐含 `superpowers:using-git-worktrees` | 隔离 workspace |
| ├ 任务实现 | 隐含 `superpowers:subagent-driven-development`（首选） | 代码变更 |
| │ │（SDD 内部：按任务分派子 agent） | |
| │ │（SDD 内部遵循：`superpowers:test-driven-development`） | 测试代码 |
| │ │（SDD 内部含：spec compliance review + code quality review） | 审查结果 |
| │ │（无 subagent 支持时降级：`superpowers:executing-plans`） | |
| ├ 代码层验证 | `superpowers:verification-before-completion` | 测试通过 |
| ├ 制品层验证 | `/opsx:verify` | **`verify.md`**（7 项结构化检查） |
| └ 复盘 | 纯 AI 生成（全周期审计） | **`retrospective.md`**（§0 量化全景 + §4 三阶段技能审计 + §1-§6 定性分析） |

### 收尾阶段

| 步骤 | 命令/技能 | 产出物 |
|------|----------|--------|
| 人工测试 |（人工） | 测试结论 |
| 归档 | `/opsx:archive -y` | delta spec 合并 + 移入 archive/ |
| 代码收尾 | `superpowers:finishing-a-development-branch` | merge / PR / keep |

> PR 审查反馈通过自然对话处理，Agent 内部遵循 `superpowers:receiving-code-review` 行为规范（验证优先、不盲从、技术推理）。

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
        └── plans     ← 隐含 superpowers:writing-plans，拆 TDD 微步骤（产出: plans.md）

OpenSpec 执行:
    /opsx:apply
        ├── precheck：6 个 Superpowers 技能可用性检查
        ├── superpowers:using-git-worktrees
        ├── superpowers:subagent-driven-development（首选）
        │     SDD 内部：按任务分派子 agent
        │     SDD 内部遵循：superpowers:test-driven-development
        │     SDD 内部含：spec compliance review + code quality review
        │     或 superpowers:executing-plans（无 subagent 支持时降级）
        ├── superpowers:verification-before-completion（代码层验证）
        ├── /opsx:verify → verify.md（制品层验证，7 项结构化检查）
        └── retrospective.md（全周期审计复盘）

收尾:
    人工测试
    /opsx:archive -y（sync delta spec + 移入 archive/）
    superpowers:finishing-a-development-branch
        选项1: 本地 merge / 选项2: 创建 PR / 选项3: 保持
    （选 PR 后，审查反馈通过自然对话处理，
      Agent 内部遵循 superpowers:receiving-code-review 行为规范）
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

    ├── 不改 spec（实现偏离现有 spec，不需修改 spec）
    │       直接修 → superpowers:verification-before-completion → 直接 PR
    │       不进 OpenSpec
    │
    └── 需改 spec（spec 需新增或修正）
           ├── 有活跃 change 且尚未 apply（无代码落地）
           │     → 并入当前 change，回到 /opsx:continue 更新制品
           │       （减少碎片化 change）
           │
           └── 无活跃 change，或已有代码落地（phase ≥ applied）
                 → 触发新 change 流程
                   （/opsx:explore → draft.md → /opsx:new → /opsx:continue）
                 → 代码已存在时，spec 变更作为独立增量更清晰
```

---

## 三、制品依赖 DAG

```
Pre-OpenSpec 阶段:
    draft.md  ← /opsx:explore 隐含 superpowers:brainstorming 产出（无 DAG 依赖）

OpenSpec 规划阶段（schema DAG，8 个制品）:
    proposal  ← 无 schema 依赖（instruction 读 draft.md）
        │
        ├──→ specs     ← 依赖 proposal
        │      │             （只读 Capabilities，不读 draft 以防污染）
        │      │
        │      └──→ tasks   ← 依赖 specs + design
        │            │            （需"做什么"+"怎么做"）
        │            │
        │            └──→ plans  ← 依赖 tasks
        │                  │   隐含: superpowers:writing-plans
        │                  │
        │                  └──→ verify  ← 依赖 plans（apply 阶段产出）
        │                        │
        │                        └──→ retrospective ← 依赖 verify（apply 阶段产出）
        │
        └──→ design   ← 依赖 proposal
                       （instruction 读 draft.md，受 proposal 范围约束）

OpenSpec 执行阶段（8 个制品，后 2 个在 apply 中产出）:
    apply  ← 依赖 plans
        ├── precheck      ← 6 个 Superpowers 技能可用性检查
        ├── git-worktrees ← 隐含: superpowers:using-git-worktrees
        ├── 任务实现       ← 隐含: superpowers:subagent-driven-development（首选）
        │                      or superpowers:executing-plans（降级）
        │                      （内部含 TDD）
        ├── 代码层验证     ← superpowers:verification-before-completion
        ├── 制品层验证     ← /opsx:verify → verify.md（7 项结构化检查）
        └── 复盘          → retrospective.md（纯 AI 生成）
```

### 各依赖理由

| 边 | 理由 |
|----|------|
| proposal 读 draft | 从 draft 决策链中提取范围。无正式 DAG 依赖（draft 在 schema 之外，由 instruction 读取） |
| specs → proposal | 按 Capabilities 列表按条目写 Delta Spec，只关心行为边界 |
| specs ∅→ draft | **故意不读。** 防止行为 spec 被技术实现细节污染（如"用 Redis"而非"支持会话持久化"） |
| design → proposal | 约束技术方案不超出 proposal 的 Capabilities 范围 |
| design 读 draft | 重组 draft 中的 Q1-Qn 技术决策 |
| tasks → specs + design | 需 specs 告诉"做什么" + design 告诉"怎么做" |
| plans → tasks | 将粗粒度 checkbox 拆为 TDD 微步骤 |

---

## 四、OpenSpec 命令使用情况

| 命令 | 用否 | 角色 |
|------|------|------|
| `/opsx:explore` | 用 | Pre-OpenSpec：统一入口，自适应（新项目探索需求、存量项目探索代码），隐含 brainstorming |
| `/opsx:new` | 用 | OpenSpec 规划：创建空 change 目录 |
| `/opsx:continue` | 用 | OpenSpec 规划：制品生成 + 审查 |
| `/opsx:apply` | 用 | OpenSpec 执行：实现（不含 finishing 和 archive） |
| `/opsx:archive` | 用 | 收尾：finishing 完成后手动归档 |
| `/opsx:ff` | 备选 | 需求极其明确时替代 continue |
| `/opsx:propose` | 不用 | 自定义 schema 下与 ff/continue 等价 |
| `/opsx:verify` | 用 | 嵌入 apply 内部（制品层验证 → verify.md） |
| `/opsx:sync` | 不用 | 嵌入 archive |
| `/opsx:bulk-archive` | 不用 | 边缘场景 |
| `/opsx:onboard` | 不用 | 一次性引导 |

**日常命令 5 个：explore、new、continue、apply、archive，外加 systematic-debugging。**

---

## 五、Superpowers 技能使用情况

### 在流程中使用的（11 个）

| 技能 | 阶段 | 触发方式 | 作用 |
|------|------|---------|------|
| `brainstorming` | Pre-OpenSpec | explore 隐含 | 交互式 Q&A + 方案对比 + 设计审批 |
| `writing-plans` | OpenSpec 规划 | schema 隐含 | 将 tasks 拆为 TDD 微步骤 |
| `using-git-worktrees` | OpenSpec 执行 | apply 隐含 | 创建隔离 workspace |
| `subagent-driven-development` | OpenSpec 执行 | apply 隐含（首选） | 按任务分派子 agent 执行 |
| `executing-plans` | OpenSpec 执行 | apply 隐含（降级） | 无 subagent 支持时的兜底方案，当前 session 直接执行 |
| `test-driven-development` | OpenSpec 执行 | SDD 内部遵循 | 子 agent 每个微任务走 RED-GREEN-REFACTOR |
| `requesting-code-review` | OpenSpec 执行 | SDD 内部使用 | 为 code reviewer 子 agent 提供审查 prompt 模板 |
| `verification-before-completion` | 执行 + Bug 修复 | apply 隐含 / 主动 | 代码行为验证 |
| `finishing-a-development-branch` | 收尾 | 主动调用 | 提供 merge/PR/keep/discard |
| `systematic-debugging` | Bug 修复 | 主动调用 | 结构化诊断 |
| `receiving-code-review` | 收尾 | Agent 行为规范 | 处理 PR 反馈时的行为协议（验证优先、不盲从、技术推理） |

### 未使用的（3 个）

| 技能 | 原因 |
|------|------|
| `dispatching-parallel-agents` | 特定场景工具（并行排查多个独立 bug），不属于核心工作流 |
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
         precheck→worktree→SDD→代码验证→制品验证→复盘
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
                    /opsx:archive
                 sync delta spec
                         │
                  superpowers:
              finishing-a-development-branch
                   merge/PR/keep
                         │
                   （选 PR 后，反馈
                     自然对话处理，
                     遵循 receiving-code-review
                     行为规范）
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
        不改 spec         需改 spec
           │              │
           │       ┌──────┴──────┐
           │       ▼              ▼
           │    无代码落地      已有代码落地
           │    (phase <       (phase ≥
           │     applied)      applied)
           │       │              │
           │       ▼              ▼
           │   并入当前       触发新 change
           │    change        流程
           │       │              │
           ▼       ▼              ▼
    verification-before-  /opsx:continue   正常 change 流程
       completion         更新制品        （explore → new →
           │                            continue → apply）
           ▼
        直接 PR
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
| specs 不读 draft | 故意隔离 | 防止行为 spec 被实现细节污染 |
| verification-before-completion + /opsx:verify 双层验证 | 代码层验证（测试、行为）→ 制品层验证（7 项结构化检查） | 先确保代码正确，再确保制品完整；任意 FAIL 回到 SDD 修复 |
| apply 不含 archive/finish | archive + finish 独立为收尾阶段 | 不给未验证代码建 PR，不假设 AI 实现正确 |
| archive 先于 finish | 归档（sync delta spec）→ 自动 finish（merge/PR/keep） | 先锁定文档证据链，再合入代码；避免"代码合入了但 spec 没跟上" |
| `/alloy:finish` 可独立调用 | archive 时选 keep 后，后续可手动调 finish | 分支还在，spec 已归档，随时可以合入 |
| verify/retrospective 是 schema 制品 | artifacts 从 6 个扩展到 8 个，DAG 完整 | 有模板、有指令、有依赖——具备制品的所有特征 |
| bug 修复二向分流 | 不改 spec → 直接修；需改 spec → 以代码是否已落地为分水岭 | 无代码（phase < applied）：并入当前 change；有代码（phase ≥ applied）：开新 change |
| 人工测试失败处理 | apply 内部验证失败 → 循环修复直到通过；人工测试失败 → 看是 spec 还是代码问题 | 不和 spec 变更混入同一 change，代码修复在 apply 内部闭环 |

---

## 八、各阶段技能/Slash 盘点与 Gap 分析

> **更新：** 2026-05-30，与所有 command 文件（`commands/alloy/*.md`）对齐，全部 8 个 Gap 已修复闭合。
> 下表列出每个阶段实际使用的技能（Skill）和斜杠命令，标注 precheck 覆盖情况。

### 8.1 阶段盘点

| 阶段 | Precheck | 使用的 Skill / Slash | Gap & 闭合方式 |
|------|:---:|------|------|
| **start** | `config.yaml` + brainstorming 预检 | `[Slash] opsx:explore` `[Skill] superpowers:brainstorming` `[Slash] /opsx:new` | **A** (P2): brainstorming 无可用性预检 → 在 Step 2 前加入预检，不可用时引导 `alloy init` |
| **plan** | phase=started + draft.md + writing-plans 预检 + draft 来源验证 | `[Slash] /opsx:continue` `[Skill] superpowers:writing-plans` | **B** (P0): writing-plans 无预检 → 前置检查加入可用性预检。**C** (P2): draft 可手工绕过 → Step 1 验证 draft commit message 格式 |
| **apply** | phase=planned + git + 6 技能预检 | `[Skill] using-git-worktrees` `[Skill] SDD` / `executing-plans`（串行：TDD→executing-plans→spec 合规审查→code-review 四步） `[Skill] verification-before-completion` `[Slash] /opsx:verify` | **D** (P0): writing-plans→apply 策略传递断裂 → 旧 change 缺 strategy 时分析并回写 plans.md。**E** (P1): 串行路径 TDD 无闸门 → 串行改为四步：先加载 TDD 设定预期 → executing-plans → spec 合规审查（tasks.md checkbox 对代码实现、检查 over-building）→ code review |
| **archive** | phase=applied + verify 非 FAIL | `[Slash] /opsx:archive` | 自建 CLI `alloy _archive` 重复建造 → 改为 `/opsx:archive`，与 OpenSpec 对齐 |
| **finish** | phase=archived + 分支存在 + Skill 预检 | `[Skill] finishing-a-development-branch` | **F** (P2): finishing-a-development-branch 无预检 → 前置检查加入 Skill 可用性预检 |
| **fix** | 3 技能预检 + phase 校验 | `[Skill] systematic-debugging` `[Skill] TDD` `[Skill] verification-before-completion` | **G** (P1): 无前置检查 → 加入 3 技能预检。**H** (P1): 不校验 phase → 前置检查加入 phase 校验，archived/finished 时警告 |
| **discard** | 无 | 无 | — |
| **status** | 无 | 无 | — |

### 8.2 全流程 Skill / Slash 汇总

| 名称 | 类型 | start | plan | apply | archive | finish | fix | 关联 Gap |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|------|
| `opsx:explore` | Slash | ✓ | | | | | | — |
| `/opsx:new` | Slash | ✓ | | | | | ✓(路径 B) | — |
| `/opsx:continue` | Slash | | ✓ | | | | ✓(路径 B1) | — |
| `/opsx:verify` | Slash | | | ✓ | | | | — |
| `/opsx:archive` | Slash | | | | ✓ | | | — |
| `superpowers:brainstorming` | Skill | ✓ | | | | | | A |
| `superpowers:writing-plans` | Skill | | ✓ | | | | | B、D |
| `superpowers:using-git-worktrees` | Skill | | | ✓ | | | | — |
| `superpowers:subagent-driven-development` | Skill | | | ✓ | | | | — |
| `superpowers:executing-plans` | Skill | | | ✓ | | | | E |
| `superpowers:test-driven-development` | Skill | | | ✓(trans.) | | | ✓ | E |
| `superpowers:requesting-code-review` | Skill | | | ✓(trans.) | | | ✓ | E |
| `superpowers:verification-before-completion` | Skill | | | ✓ | | | ✓ | — |
| `superpowers:finishing-a-development-branch` | Skill | | | | | ✓ | | F |
| `superpowers:systematic-debugging` | Skill | | | | | | ✓ | G、H |

> Gap 图例：A=start 缺预检 / B=plan 缺预检 / C=draft 可绕过 / D=策略传递断裂 / E=串行无闸门 / F=finish 缺预检 / G=fix 缺预检 / H=fix 不校验 phase；全部已闭合，闭合方式见 §8.1

---
