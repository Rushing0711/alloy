# Alloy Schema 升级 实现计划

> **For agentic workers:** 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按 task 逐步实现。步骤使用 checkbox (`- [ ]`) 语法追踪。

**Goal:** 将 Alloy schema 从 6 个制品扩展到 8 个（+verify +retrospective），新增 apply 阶段定义，同步更新 SKILL.md 和设计文档。

**Architecture:** 三层改动——schema 层（schema.yaml + instructions + templates）是基础，SKILL.md 层是编排逻辑适配，文档层已完成（alloy-design.md + hybrid-workflow.md 已在设计阶段同步更新）。

**Tech Stack:** YAML (schema), Markdown (instructions/templates), Shell (PRECHECK commands)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `openspec/schemas/alloy/schema.yaml` | 修改 | 制品 DAG + apply 阶段定义 |
| `openspec/schemas/alloy/instructions/verify.md` | 新建 | verify 制品生成指令 |
| `openspec/schemas/alloy/instructions/retrospective.md` | 新建 | retrospective 制品生成指令 |
| `openspec/schemas/alloy/templates/verify.md` | 新建 | verify.md 输出模板 |
| `openspec/schemas/alloy/templates/retrospective.md` | 修改 | 补充 §0/§2/§4/§6 细节 |
| `.claude/skills/alloy-apply/SKILL.md` | 修改 | 对齐新 apply steps |
| `.claude/skills/alloy-archive/SKILL.md` | 修改 | archive 内部串联 finish |
| `.claude/skills/alloy-finish/SKILL.md` | 修改 | 独立 finish 命令 |

> `docs/alloy-design.md` 和 `docs/hybrid-workflow.md` 已在设计阶段同步更新，不在本计划范围内。

---

### Task 1: 更新 schema.yaml

**Files:**
- Modify: `openspec/schemas/alloy/schema.yaml`

- [ ] **Step 1: 读取当前 schema.yaml**

```bash
cat openspec/schemas/alloy/schema.yaml
```

- [ ] **Step 2: 替换为完整新版 schema.yaml**

用以下完整内容替换当前文件：

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

- [ ] **Step 3: 验证 YAML 语法**

```bash
python3 -c "import yaml; yaml.safe_load(open('openspec/schemas/alloy/schema.yaml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 4: Commit**

```bash
git add openspec/schemas/alloy/schema.yaml
git commit -m "feat(schema): artifacts 扩展到 8 个，新增 apply 阶段定义

- 新增 verify 制品（依赖 plan，apply step 4 产出）
- 新增 retrospective 制品（依赖 verify，apply step 5 产出）
- 新增 apply 段：precheck + tracks + 5 steps
- 两层验证：代码层（verification-before-completion）+ 制品层（/opsx:verify）

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 新建 instructions/verify.md

**Files:**
- Create: `openspec/schemas/alloy/instructions/verify.md`

- [ ] **Step 1: 创建指令文件**

```bash
cat > openspec/schemas/alloy/instructions/verify.md << 'INSTRUCTION_EOF'
# verify 制品指令

**定位：** apply 阶段 step 4 产出。实现完成后的结构化验证——不依赖 LLM 自觉，通过具体命令逐项确认。
与其他制品不同，verify.md 在 apply 阶段实现完成后产出，不在规划期生成。

产出: `verify.md`
依赖: plan.md 完成 + 代码已提交 + tasks.md checkbox 全部勾选

## PRECHECK（shell 命令，非 LLM 判断）

两条命令都返回 >0 才进入验证。若任一为 0，STOP 并告知用户 apply 阶段尚未产出可审查的变更：

1. 提交证据：
   ```
   git log --oneline $(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD origin/master 2>/dev/null)..HEAD | wc -l
   ```

2. 任务进度：
   ```
   grep -c '^- \[x\]' openspec/changes/<change-name>/tasks.md
   ```

## 技能调用

使用 Skill 工具调用 **superpowers:verification-before-completion**（代码层验证在 step 3 完成），然后执行下方七项检查，将结果写入 verify.md。

本步骤调用 `/opsx:verify`（即 openspec-verify-change），若不可用，降级为手动执行七项检查并记录结果。

## 七项检查

### 1. 结构校验
执行 `openspec validate --all --json`（或等效检查）。确认每一项返回 `"valid": true`。
若有任何失败项：记录问题 → 修复对应制品 → 重新验证。
阻塞项。

### 2. 任务完成
确认 tasks.md 中所有 `- [ ]` 已变为 `- [x]`。统计完成率。
若存在剩余 `- [ ]`：记录原因（manual / out-of-scope / blocked），并说明是否阻塞归档。
阻塞项（有未完成的 task 且阻塞归档时）。

### 3. Delta Spec 同步
对 `openspec/changes/<name>/specs/` 下的每个目录，与 `openspec/specs/<capability>/spec.md` 对比，记录状态：
- ✓ 已同步
- ✗ 需要同步（列出 capability 名称）
- N/A（无 delta spec 产出）
阻塞项（有未同步的 delta spec 时）。

### 4. Design / Specs 一致性抽查
抽取 design.md 中的 2-3 个关键决策点，在 specs 中确认有对应的行为需求。
记录任何偏离作为 WARNING（非阻塞）。

### 5. 实现信号
确认所有代码变更已提交（worktree 中无未暂存文件）。
记录提交范围：`<base>..HEAD`。
阻塞项（无提交记录时）。

### 6. 路由泄漏检测（WARNING，非阻塞）
执行：
```
ls docs/superpowers/specs/*.md 2>/dev/null
```
若存在文件，记录 WARNING：
"Front-door routing leak — design output found at docs/superpowers/specs/...
这些内容应属于 openspec/changes/<name>/ 下的 draft.md 或 design.md。
确认内容已捕获到 change 目录后，移动或删除泄漏文件。"
非阻塞——用户可能在安装 schema 之前就有该目录的合法使用。

### 7. 延期任务 vs 自动化测试等价对照
若 plan.md 中存在 `[~]` 延期任务（手动冒烟 / dogfood / 线上环境检查等），逐个列出并找出覆盖相同断言的等价自动化测试。
若某延期任务无等价自动化测试覆盖，该行代表真实覆盖缺口：
- 记录到 retrospective §2 Misses，附带后续计划
- 不静默延后
非阻塞——Overall Decision 即使有缺口也保持 PASS（前提是缺口已记录为后续计划）。
仅当 §7 为空但 plan.md 中确有 `[~]` 行时才算阻塞（说明 gap analysis 被跳过）。

## 结果判定

- **PASS** — 全部 7 项通过（允许 WARNING）
- **PASS WITH WARNINGS** — 有非阻塞 WARNING（如 §4 偏离、§6 路由泄漏、§7 覆盖缺口），已全部记录
- **FAIL** — 有阻塞问题（§1 结构校验失败、§2 有未完成且阻塞归档的 task、§5 无实现信号、§7 gap analysis 被跳过）

FAIL 时列出具体修复项，循环修复直到 PASS 或 PASS WITH WARNINGS。

## 重新运行策略

verify 可多次重新运行——每次运行用当前状态覆盖 verify.md。

## 降级策略

若 `/opsx:verify` 不可用，降级为手动执行上方七项检查并记录结果到 verify.md。
INSTRUCTION_EOF

echo "Created: openspec/schemas/alloy/instructions/verify.md"
```

- [ ] **Step 2: 验证文件存在**

```bash
test -f openspec/schemas/alloy/instructions/verify.md && echo "PASS" || echo "FAIL"
```

Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add openspec/schemas/alloy/instructions/verify.md
git commit -m "feat(instructions): 新增 verify 制品指令

PRECHECK + 7 项结构化检查 + PASS/WARN/FAIL 判定 + 降级策略

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 新建 instructions/retrospective.md

**Files:**
- Create: `openspec/schemas/alloy/instructions/retrospective.md`

- [ ] **Step 1: 创建指令文件**

```bash
cat > openspec/schemas/alloy/instructions/retrospective.md << 'INSTRUCTION_EOF'
# retrospective 制品指令

**定位：** apply 阶段 step 5 产出。在代码还热的时候做证据驱动的复盘——先量化再定性，先证据再判断。
retrospective 的价值在于捕获"当时知道什么、怎么推理的"，不是事后美化。

产出: `retrospective.md`
依赖: verify.md 存在且 Overall Decision 不是 FAIL

## PRECHECK（shell 命令，非 LLM 判断）

两条命令都通过后才生成 retrospective：

1. 确认 verify.md 存在：
   ```
   test -f openspec/changes/<change-name>/verify.md
   ```

2. 确认 Overall Decision 不是 FAIL：
   ```
   ! grep -q '^- \[x\] ❌ FAIL' openspec/changes/<change-name>/verify.md
   ```

FAIL 时 STOP，告知用户先修复 verify 中的阻塞问题。

## 生成流程

### Step 1: 收集证据（§0）

从 git 和文件系统自动收集，不依赖 LLM 判断：

| 字段 | 来源 |
|------|------|
| 提交数 | `git log --oneline <base>..HEAD \| wc -l` |
| 变更规模 | `git diff --stat <base>..HEAD \| tail -1` |
| 任务完成比 | grep `[x]` / 总 checkbox（tasks.md） |
| 工作时间跨度 | plan.md 开始时间 → 最后 commit 时间 |
| Subagent 调度次数 | 从 apply 日志或 git log 推断 |
| 新增外部依赖 | `git diff <base>..HEAD -- package.json` |
| 验证状态 | 从 verify.md 提取 Overall Decision |
| 提交链 | `git log --oneline <base>..HEAD` 完整列表 |
| 测试覆盖信号 | 测试文件变更 vs 源代码文件变更的比例 |

### Step 2: 写入定性分析（§1-§6）

每条结论必须引用 §0 的证据或具体 commit hash/文件路径/测试名称。
分析 bullet 引用 §0 而非内联证据（如 "见 §0 提交链 #3"）。

#### §1 Wins — 做对了什么
- 每个 point 格式：`- [evidence: <commit/file/test>] <描述>`
- 聚焦可复现的成功模式

#### §2 Misses — 做错了什么
三级严重度，每条带 evidence：
- `- 🔴 [blocking | evidence: ...] <描述>` — 阻塞性问题
- `- 🟡 [painful  | evidence: ...] <描述>` — 痛苦但不阻塞
- `- 📌 [nit      | evidence: ...] <描述>` — 小问题

#### §3 Plan Deviations — 计划偏离
表格：Plan task / What changed / Why
哪些 task 的范围在执行中发生了变化，原因是什么

#### §4 Skill / Workflow Compliance — 技能遵循度
列出 apply 阶段的每个技能，标记是否实际使用 ✓ / ✗：

| 技能 | 使用 |
|------|:----:|
| superpowers:using-git-worktrees | |
| superpowers:subagent-driven-development | |
| superpowers:test-driven-development（transitive） | |
| superpowers:requesting-code-review（transitive） | |
| superpowers:verification-before-completion | |

默认期望所有行都是 ✓。

**Deliberately Skipped Skills：** 对于每个标记 ✗ 的技能，必须回答三个问题：
1. **What was skipped** — 具体跳过了哪个技能或子步骤
2. **Why this cycle** — 具体触发原因（必须有具体的 commit hash、日志行或观察到的行为，不能用模糊理由）
3. **How to prevent recurrence** — 防止复发的措施，从以下选项中选择：
   - schema graph fix（schema 图修正）
   - skill description tightening（技能描述收紧）
   - CLAUDE.md trigger（CLAUDE.md 触发规则）
   - scope-judgment rule（范围判断规则）
   - one-off — schema boundary case（一次性，需说明为什么是边界情况）

如果多个 cycle 因相似原因跳过同一技能，该模式应成为 §6 的 Promote candidate。

#### §5 Surprises — 意外发现
`- <被推翻的假设>` — 哪些假设被证明是错误的

#### §6 Promote Candidates → 长期学习
使用 `- [ ]` checklist（非表格），未勾选的 = 跨周期 carry-forward：
- 标题：严重度 emoji + 一句话教训
- `→ **Promote to** <destination>`（memory / CLAUDE.md / schema / skill / one-off）
- `> **Why**: <原因>`
- `> **How to apply**: <触发条件>`

格式对齐 feedback memory schema，使 Why/How to apply 可直接转移到 `~/.claude/memory/`。

### Step 3: 跳过策略

| 情况 | 处理 |
|------|------|
| 单 commit 小修（linter fix、typo 等） | 可跳过，写一行 "Skipped: single-commit fix, no insights" |
| 其他一切 | 必须产出 §0 + 全部 6 个分析节。某节确实没有内容时写 "(none observed)" |

### Forward-Pointer 策略

如果后续 cycle 发现 retrospective 中的某个结论、证据或判断是错误/不完整的：
- **不要重写** retrospective（会丢失审计线索）
- 追加 forward-pointer：`> **Update YYYY-MM-DD**: section X superseded by <链接到后续 retro / commit / issue>`
- 后续制品承载修正后的分析

理由："retrospective 是证据驱动的——它的价值在于捕获特定时间点已知的事实和推理过程。"
INSTRUCTION_EOF

echo "Created: openspec/schemas/alloy/instructions/retrospective.md"
```

- [ ] **Step 2: 验证文件存在**

```bash
test -f openspec/schemas/alloy/instructions/retrospective.md && echo "PASS" || echo "FAIL"
```

Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add openspec/schemas/alloy/instructions/retrospective.md
git commit -m "feat(instructions): 新增 retrospective 制品指令

PRECHECK + §0-§6 证据驱动复盘 + 跳过策略 + Forward-Pointer 策略

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 新建 templates/verify.md

**Files:**
- Create: `openspec/schemas/alloy/templates/verify.md`

- [ ] **Step 1: 创建模板文件**

```bash
cat > openspec/schemas/alloy/templates/verify.md << 'TEMPLATE_EOF'
# Verify: <change-name>

> 生成时间: <timestamp>
> 提交范围: <base>..HEAD

## Overall Decision

- [ ] ✅ PASS
- [ ] ⚠️ PASS WITH WARNINGS
- [ ] ❌ FAIL

## 1. 结构校验

- 状态: <!-- ✓ / ✗ -->
- 命令: `openspec validate --all --json`
- 输出: <!-- 命令输出摘要 -->

## 2. 任务完成

- 已完成: <!-- N --> / <!-- 总数 -->
- 完成率: <!-- 百分比 -->
- 未完成项: <!-- 列出或 "无" -->
- 是否阻塞归档: <!-- 是 / 否 -->

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

- 命令: `ls docs/superpowers/specs/*.md 2>/dev/null`
- 状态: <!-- ✓ / ⚠️ -->
- 泄漏文件: <!-- 列出或 "无" -->

## 7. 延期任务对照

| 延期任务 | 等价自动化覆盖 | 状态 |
|---------|--------------|------|
| <!-- 任务 --> | <!-- 覆盖方式 --> | <!-- ✓ / ⚠️ --> |

> 状态说明：✓ 有等价自动化覆盖 | ⚠️ 无等价覆盖（记录到 retrospective §2 Misses）
TEMPLATE_EOF

echo "Created: openspec/schemas/alloy/templates/verify.md"
```

- [ ] **Step 2: 验证文件存在**

```bash
test -f openspec/schemas/alloy/templates/verify.md && echo "PASS" || echo "FAIL"
```

Expected: `PASS`

- [ ] **Step 3: Commit**

```bash
git add openspec/schemas/alloy/templates/verify.md
git commit -m "feat(templates): 新增 verify.md 模板

7 项检查 + Overall Decision checkbox 格式

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 更新 templates/retrospective.md

**Files:**
- Modify: `openspec/schemas/alloy/templates/retrospective.md`

- [ ] **Step 1: 读取当前模板**

```bash
cat openspec/schemas/alloy/templates/retrospective.md
```

- [ ] **Step 2: 更新 §0 字段 — 补充 Subagent 调度次数、新增外部依赖、提交链、测试覆盖信号**

将 §0 中的占位字段细化为：

```markdown
## §0 Evidence（量化证据）

- 提交数：
- 变更规模（文件数/行数）：
- 任务完成比：
- 工作时间跨度：
- Subagent 调度次数：
- 新增外部依赖：
- 验证状态：
- 测试覆盖信号：
- 提交链：`<base>..HEAD`
```

使用 Edit 工具精确替换当前 §0 段。

- [ ] **Step 3: 更新 §2 — 明确严重度格式**

将 §2 的注释替换为具体格式说明：

```markdown
## §2 Misses（做错了什么）

<!-- 按严重程度标注，每条带 evidence：
- 🔴 [blocking | evidence: <commit/file/test>] <描述>
- 🟡 [painful  | evidence: <commit/file/test>] <描述>
- 📌 [nit      | evidence: <commit/file/test>] <描述>
-->
```

- [ ] **Step 4: 更新 §4 — 列出具体技能清单**

将 §4 的泛泛描述替换为具体技能表：

```markdown
## §4 Skill Compliance（技能遵循度）

| 技能 | 使用 |
|------|:----:|
| superpowers:using-git-worktrees | |
| superpowers:subagent-driven-development | |
| superpowers:test-driven-development（transitive） | |
| superpowers:requesting-code-review（transitive） | |
| superpowers:verification-before-completion | |

默认期望所有行都是 ✓。

### Deliberately Skipped Skills

<!-- 对于每个标记 ✗ 的技能，填写以下三项：
1. **What was skipped** — 具体跳过了哪个技能或子步骤
2. **Why this cycle** — 具体触发原因（必须有具体的 commit hash、日志行或观察到的行为）
3. **How to prevent recurrence** — schema graph fix / skill description tightening / CLAUDE.md trigger / scope-judgment rule / one-off
-->
```

- [ ] **Step 5: 更新 §6 — 明确 checklist + Promote 格式**

将 §6 的注释替换为具体格式说明：

```markdown
## §6 Promote Candidates（值得推广）

<!-- 使用 - [ ] checklist，未勾选的 = 跨周期 carry-forward
格式：
- [ ] 🔴 教训简述
  → **Promote to** memory（或 CLAUDE.md / schema / skill / one-off）
  > **Why**: <原因>
  > **How to apply**: <触发条件>
-->
```

- [ ] **Step 6: 追加 Forward-Pointer 策略**

在模板末尾追加：

```markdown
---

## Forward-Pointer 策略

后续 cycle 发现本 retrospective 中结论有误时：
- **不要重写**本文件（会丢失审计线索）
- 追加：`> **Update YYYY-MM-DD**: section X superseded by <链接>`
```

- [ ] **Step 7: Commit**

```bash
git add openspec/schemas/alloy/templates/retrospective.md
git commit -m "feat(templates): 细化 retrospective 模板

- §0: 补充 Subagent 调度次数、新增依赖、提交链、测试覆盖信号
- §2: 明确严重度格式 (🔴 blocking / 🟡 painful / 📌 nit)
- §4: 列出具体技能清单 + Deliberately Skipped Skills 三问
- §6: 明确 checklist + Promote to + Why/How to apply 格式
- 追加 Forward-Pointer 策略

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 更新 alloy-apply SKILL.md

**Files:**
- Modify: `.claude/skills/alloy-apply/SKILL.md`

- [ ] **Step 1: 更新 description 前置元数据**

将 `description` 改为包含双层验证：

```yaml
description: Alloy 执行阶段 - precheck + worktree 隔离 + SDD(TDD) + 代码验证 + 制品验证 + retrospective
```

- [ ] **Step 2: 在"前置检查"之后、"执行步骤"之前，插入 precheck 步骤**

将：
```
---
## Alloy · 执行阶段 · 隔离 + 任务实现 + 验证 + 复盘

前置检查通过：plan.md ✓  phase=planned ✓
共 5 个步骤：标记开始 → 隔离 → 实现 → 验证 → 复盘
---
```

替换为：
```
---
## Alloy · 执行阶段 · precheck + 隔离 + 实现 + 双层验证 + 复盘

前置检查通过：plan.md ✓  phase=planned ✓

### Step 0/5：技能可用性预检（precheck）

检查以下 5 个 Superpowers 技能是否可用（缺一 STOP，不静默降级）：
- [ ] superpowers:using-git-worktrees
- [ ] superpowers:subagent-driven-development
- [ ] superpowers:test-driven-development
- [ ] superpowers:requesting-code-review
- [ ] superpowers:verification-before-completion

任一缺失 → 输出缺失列表 → 引导 `alloy init` 重新安装 → STOP

全部通过后：
---
precheck 通过：5/5 技能可用 ✓
共 5 个步骤：隔离 → SDD → 代码验证 → 制品验证 → 复盘
---
```

- [ ] **Step 3: 更新步骤编号（原 Step 1-5 → Step 1-5，去掉标记步骤）**

去掉原 "Step 1/5：标记 apply 开始" 整段（含 alloy-state.sh write worktree 命令），precheck 之后直接从 worktree 开始。

将 "Step 2/5" 改为 "Step 1/5"：
```
### Step 1/5：创建隔离环境
```

- [ ] **Step 4: 更新 Step 编号（原 3→2, 4→3+4, 5→5）**

将 "Step 3/5" 改为 "Step 2/5"。

将 "Step 4/5：验证" 整段替换为双层验证：

```
### Step 3/5：代码层验证

```
---
### Step 3/5：代码层验证 · superpowers:verification-before-completion
---

正在验证代码行为——测试通过、功能正确...
```

使用 Skill 工具加载 `superpowers:verification-before-completion` 技能 —— 代码行为验证。

验证失败 → 修复代码 → 回到 Step 2/5（SDD），确保修复也有 TDD + code review 安全网。

### Step 4/5：制品层验证

```
---
### Step 4/5：制品层验证 · /opsx:verify
---

正在验证制品结构——7 项结构化检查 → verify.md...
```

调用 `/opsx:verify`（openspec-verify-change）产出 `verify.md`。

7 项检查：结构校验 → 任务完成 → Delta Spec 同步 → Design/Specs 一致性 → 实现信号 → 路由泄漏检测 → 延期任务对照。

验证失败 → 修复 → 回到 Step 2/5（SDD）。verify 不通过不结束 apply。
```

将 "Step 5/5：复盘" 改为：

```
### Step 5/5：复盘

```
---
### Step 5/5：复盘 · retrospective
---

正在生成证据驱动复盘报告（§0-§6）...
```

读取 `instructions/retrospective.md`，按模板 `templates/retrospective.md` 生成 `openspec/changes/<name>/retrospective.md`：

**PRECHECK：** verify.md 存在且 Overall Decision 不是 FAIL，否则 STOP。

**§0 Evidence：** 收集量化证据（git log、diff stat、任务完成比、提交链等）。
**§1 Wins：** `[evidence: ...]` 格式，聚焦可复现的成功模式。
**§2 Misses：** 🔴 blocking / 🟡 painful / 📌 nit 三级严重度。
**§3 Plan Deviations：** 计划 vs 实际变更表格。
**§4 Skill Compliance：** 技能清单 ✓/✗，跳过的技能填三问。
**§5 Surprises：** 被推翻的假设。
**§6 Promote Candidates：** `- [ ]` checklist + Why/How to apply，跨周期 carry-forward。

复盘是证据驱动的——每条结论都引用具体 commit 或文件。
跳过策略：单 commit 小修可跳过，写 "Skipped: single-commit fix, no insights"。
```

- [ ] **Step 5: 更新完成提示**

将：
```
💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 finish。

准备好后，运行 `/alloy-finish` 进入收尾阶段。
```

替换为：
```
💡 建议：可以执行 QA 测试或浏览器测试等质量检查，确认后再进入 archive。

准备好后，运行 `/alloy-archive` 进入归档与收尾阶段。
```

- [ ] **Step 6: 更新闸门规则**

替换闸门规则为：
```
## 闸门规则

- **precheck 不过不执行** —— 5 个技能任一缺失即 STOP，不静默降级
- **verify 不通过不结束 apply** —— 两层验证（代码层 + 制品层），任意 FAIL 回到 SDD
- **retrospective PRECHECK** —— verify.md 不存在或 Overall Decision 是 FAIL 时 STOP
- **apply 完成后不要自动进入 archive** —— archive 是人工闸门，留给用户空间做 QA
```

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/alloy-apply/SKILL.md
git commit -m "feat(skill): alloy-apply 对齐新 schema apply steps

- 新增 precheck（5 个技能可用性检查）
- 验证拆为两层：代码层（verification-before-completion）+ 制品层（/opsx:verify）
- 验证失败回到 SDD 修复
- retrospective 对齐 §0-§6 证据驱动结构
- 完成提示改为引导 /alloy-archive

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 更新 alloy-archive SKILL.md

**Files:**
- Modify: `.claude/skills/alloy-archive/SKILL.md`

- [ ] **Step 1: 更新 description**

```yaml
description: Alloy 归档与收尾 - openspec archive + finish (merge/PR/keep)，先归档文档再合入代码
```

- [ ] **Step 2: 替换"前置检查"段**

将：
```
## 前置检查（HARD STOP）

---
## Alloy · 归档阶段 · Delta Spec 合并归档
---

**phase 必须是 `finished`。** 如果 phase != finished，硬拒绝：

```
[HARD STOP] Change '<name>' 的 phase 为 '<phase>'，归档要求 phase=finished。
请先运行 /alloy-finish 完成收尾。
```

先通过 alloy-guard.sh 做硬校验：
```bash
bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> archived
```

如果 guard 报错，说明转换不合法——输出错误信息并停止。可能的原因：
- phase 不是 finished（需要先 `/alloy-finish`）
- retrospective.md 不存在（需要回到 apply 阶段生成）
```

替换为：
```
## 前置检查（HARD STOP）

```
---
## Alloy · 归档与收尾 · Delta Spec 合并归档 + 代码收尾
---

### Step 1/3：前置检查
---
```

**1. phase 必须是 `applied`。** 如果 phase != applied，硬拒绝：

```
[HARD STOP] Change '<name>' 的 phase 为 '<phase>'，归档要求 phase=applied。
当前 phase 不支持归档。请先运行 /alloy-apply 完成执行阶段。
```

先通过 alloy-guard.sh 做硬校验：
```bash
bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> finished
```

**2. verify.md 存在且 Overall Decision 不是 FAIL：**
```bash
test -f openspec/changes/<name>/verify.md && ! grep -q '^- \[x\] ❌ FAIL' openspec/changes/<name>/verify.md
```
不满足 → "verify.md 不存在或 Overall Decision 为 FAIL。请先修复阻塞问题。"
```

- [ ] **Step 3: 替换"执行"段**

将原执行段替换为：
```
---
### Step 2/3：归档 · openspec archive
---

归档中...
执行 openspec archive -y → delta spec 合并到主 spec → 移入 archive/
```

```bash
bash .claude/skills/alloy/scripts/alloy-archive.sh <project-dir> <change-name>
```

`alloy-archive.sh` 自动完成：
1. 验证 phase = applied
2. 执行 `openspec archive -y --change <name>`（自有幂等检查，已归档则跳过）
3. Delta Spec 合并到主 spec

如果 `openspec` CLI 不可用，警告但不阻断——spec 同步依赖 OpenSpec CLI。

```
✓ Delta Spec 已合并到主 spec
✓ Change 已归档到 archive/YYYY-MM-DD-<name>/
```

---
### Step 3/3：收尾 · superpowers:finishing-a-development-branch
---

归档完成，自动进入收尾...

```
请选择处理方式：
  1. 本地 merge  — 合入 main
  2. 创建 PR    — 提交代码审查
  3. 保持分支   — 暂不处理（后续可手动 /alloy-finish）
```

使用 Skill 工具加载 `superpowers:finishing-a-development-branch` 技能，传入上下文：
```
Change: <name>
归档状态：已归档（archive/YYYY-MM-DD-<name>/）
当前分支：<change-name>
```

技能加载后，按其指引提供 3 个选项。
```

- [ ] **Step 4: 更新"各选项的后续行为"**

替换为：
```
### 各选项的后续行为

**选项 1：本地 merge**
- 代码合入 main 后，通过 alloy-guard.sh 更新 phase：
  ```bash
  bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> finished --apply
  ```
- 提示："代码已合入 main。Alloy 工作流完成。"

**选项 2：创建 PR**
- PR 创建后，通过 alloy-guard.sh 更新 phase：
  ```bash
  bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> finished --apply
  ```
- 提示："PR 已创建，等待审查。"
- 当用户收到 PR 审查反馈，遵循 superpowers:receiving-code-review 行为规范

**选项 3：保持分支**
- 通过 alloy-guard.sh 更新 phase：
  ```bash
  bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> finished --apply
  ```
- 提示："分支已保留，spec 已归档。后续可手动 `/alloy-finish` 合入。"
```

- [ ] **Step 5: 更新"完成"段**

将：
```
✓ Delta Spec 已合并到主 spec
✓ Change 已归档到 archive/YYYY-MM-DD-<name>/
  phase → archived

归档后的 change 不可再修改或 discard。这是 Alloy 工作流的终点。
```

替换为：
```
---
### Alloy Archive 完成
---

✓ Delta Spec 已合并到主 spec
✓ Change 已归档到 archive/YYYY-MM-DD-<name>/
✓ 收尾处理：<选择的方式>
  phase → finished
```

- [ ] **Step 6: 更新闸门规则**

```
## 闸门规则

- **phase 必须为 applied** —— 只有 apply 完成的 change 才能归档
- **verify.md 必须存在且非 FAIL** —— 阻塞问题必须先修复
- **先归档后合入** —— spec 文档先锁定，代码后合入，避免"代码合入了 spec 还没跟上"
```

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/alloy-archive/SKILL.md
git commit -m "feat(skill): alloy-archive 内部串联 finish

- 前置检查改为 phase=applied + verify.md 存在且非 FAIL
- 执行：openspec archive -y → 自动调 /alloy-finish
- 选项缩减为 3 个（merge/PR/keep）
- phase → finished

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 更新 alloy-finish SKILL.md

**Files:**
- Modify: `.claude/skills/alloy-finish/SKILL.md`

- [ ] **Step 1: 更新 description**

```yaml
description: Alloy 独立收尾 - merge / PR / keep（archive 内部自动调用或 keep 后手动恢复）
```

- [ ] **Step 2: 替换介绍段**

将：
```
你是 Alloy 的收尾阶段编排器。在 apply 完成后，由人类决定如何处理当前 change。finish 阶段是 Alloy 工作流中最重要的**人工闸门**——代码已通过自动验证，但最终去留由人类决定。
```

替换为：
```
你是 Alloy 的独立收尾命令。两种使用场景：
1. **archive 内部自动调用** —— /alloy-archive 归档完成后自动调起
2. **手动调用** —— archive 时选了"保持分支"，后续想合入时手动调

finish 是 Alloy 工作流的最后一步——代码已归档，spec 已同步，最终去留由人类决定。
```

- [ ] **Step 3: 替换前置检查段**

将原前置检查整段替换为：
```
## 前置检查

```
---
## Alloy · 独立收尾 · 人工闸门
---

### Step 1/2：前置检查
---

phase 是否为 finished？ <检查结果>
```

**phase 必须是 `finished`。** 如果 phase != finished：
```
[HARD STOP] Change '<name>' 的 phase 为 '<phase>'，独立 finish 要求 phase=finished。
请先运行 /alloy-archive 完成归档。
```

通过 alloy-guard.sh 校验（finish 命令不需要 guard 转换 phase，仅检查状态）：
```bash
bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> finished --check
```

确认当前有对应的 git 分支存在：
```bash
git branch --list <change-name>
```
分支不存在 → "分支 <change-name> 不存在，可能已 merge 或删除。无需再次 finish。"
```

- [ ] **Step 4: 替换"执行"段 — 选项从 4 个改为 3 个**

将选项列表的 `4. 丢弃` 去掉：

```
请选择处理方式：
  1. 本地 merge  — 合入 main
  2. 创建 PR    — 提交代码审查
  3. 保持分支   — 暂不处理
```

- [ ] **Step 5: 去掉"选项 4：丢弃"整段**

删除：
```
**选项 4：丢弃**
- 不写 phase，直接进入 discard 流程
- 提示用户使用 `/alloy-discard <name>` 清理
```

- [ ] **Step 6: 去掉各选项中的 phase 写入**

已归档的 change phase 已经是 finished，finish 独立调用不修改 phase。
删除三个选项中的 `alloy-guard.sh ... finished --apply` 命令。

- [ ] **Step 7: 更新完成段和闸门规则**

将完成段替换为：
```
---
### Alloy Finish 完成
---

处理方式：<选择的方式>
```

将闸门规则替换为：
```
## 闸门规则

- **phase 必须为 finished** —— 已归档的 change 才能独立 finish
- **分支必须存在** —— 分支已 merge 或删除时无需再次 finish
- **不修改 phase** —— finish 不改变状态（phase 由 archive 写入 finished）
```

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/alloy-finish/SKILL.md
git commit -m "feat(skill): alloy-finish 调整为独立收尾命令

- archive 内部自动调用 / 手动调用（keep 后恢复）
- 前置检查改为 phase=finished
- 选项缩减为 3 个（去掉 discard）
- 不修改 phase（已由 archive 写入 finished）

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## 执行顺序

```
Task 1 (schema.yaml) ─────────────────────────┐
                                               │
Task 2 (instructions/verify.md) ─┐             │
Task 3 (instructions/retrospective.md) ─┤      │
Task 4 (templates/verify.md) ─┤ 可并行        │
Task 5 (templates/retrospective.md) ─┘         │
                                               │
                         ┌─────────────────────┘
                         ▼
              Task 6 (alloy-apply SKILL.md) ─┐
              Task 7 (alloy-archive SKILL.md) ─┤ 可并行
              Task 8 (alloy-finish SKILL.md) ─┘
```

- Task 2-5 无依赖，可与 Task 1 并行
- Task 6-8 依赖 Task 1（需要最终 schema.yaml 作为参考），三者之间可并行
