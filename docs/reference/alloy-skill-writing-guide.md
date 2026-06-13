# Alloy 技能编写规范

> 本项目特定的 skill 编写约定。继承 [skill-writing-guide.md](skill-writing-guide.md) 通用规则，仅在此记录 alloy 特有的扩展和差异。

---

## 一、目的与读者

**读者：** 编写或维护 `commands/alloy/*.md` 的开发者和 Claude Code agent。

**与通用指南的关系：**

- 通用指南覆盖跨项目共性：技能类型、说服策略、抗合理化三层防御、四类语义节点术语、通用禁令模式、基线测试方法
- 本规范只承载 alloy 项目特有的约定：frontmatter 扩展字段、节点视觉化对应、平台工具对应、五阶段共享禁令补充、alloy 增量检查清单

**读取顺序：** 先通读 skill-writing-guide.md，再读本文。本文不重复通用规则，遇到引用直接跳转。

---

## 二、Frontmatter 扩展：behaviors 字段

alloy 的 5 个阶段 skill 在 frontmatter 中使用 `behaviors` 字段统计该 skill 的关键节点数量与外部依赖，用于代码扫描和文档对账。

### 2.1 字段定义

```yaml
behaviors:
  preconditions: <number>      # PRECONDITION_FAIL 节点数
  hard_stops:    <number>      # HARD_STOP 节点数
  user_gates:    <number>      # USER_GATE 节点数
  warns:         <number>      # WARN 节点数
  artifacts:     [<list>]      # 该 skill 产出的制品
  transitions_to: <phase>      # 完成后推进到的 phase
  external_calls: [<list>]     # 调用的外部 skill 或命令
```

### 2.2 节点计数规则

按通用指南 §3.4 四类术语分别计数。**禁止合并**——不要把 `preconditions + hard_stops` 加在一起填 `hard_stops`。

**计数边界：**

- 一个语义节点计 1 次，不论其在正文里出现几次（顶部 Iron Law 提到、步骤里再次强调，仍然是同一个节点）
- 同一行同时具备两类语义不允许（见通用指南 §3.4 写法约定），所以不会有歧义
- 嵌套场景：HARD_STOP 之后立即跟 USER_GATE 是合法串联，分别计 1 次

### 2.3 历史字段迁移

旧 frontmatter 使用 `stops` 字段统计"用户决策点"，与 HARD_STOP 形成二义。本规范定稿后：

- `stops` 字段废弃，改名为 `user_gates`
- `hard_stops` 含义不变，但需要按新术语重新审计计数
- 新增 `preconditions` 和 `warns` 两个字段
- 5 个阶段 skill 的 frontmatter 在重写时统一迁移

### 2.4 对账方法

参照通用指南 §5.2.2 手段 1（节点审计）。任何 skill 修改后，frontmatter 标称数字必须与正文实际节点数一致；偏离需要 CI 校验或人工 review 拦截。

---

## 三、节点视觉化对应

通用指南 §3.4 用纯文本术语 `[PRECONDITION_FAIL]` / `[HARD_STOP]` / `[USER_GATE]` / `[WARN]` 标记节点起点，跨平台兼容。alloy 项目内部映射到带 emoji 的视觉规范，与 [02-visual-spec.md](../specification/02-visual-spec.md) 保持一致。

### 3.1 映射表

| 通用术语 | alloy skill 正文标记 | 终端输出格式 |
|---------|--------------------|------------|
| `PRECONDITION_FAIL` | `⛔ PRECONDITION FAIL` | `[HARD STOP] <reason>`（02-visual-spec §五） |
| `HARD_STOP` | `⛔ HARD STOP` | `[HARD STOP] <reason>` 或顶部 Iron Law 代码块 |
| `USER_GATE` | `🔴 STOP` | 块引用选择交互格式（02-visual-spec §二） |
| `WARN` | `⚠️ WARN` | `⚠️` 符号 + 块引用 |

### 3.2 Iron Law 与 HARD_STOP 的关系

每个 skill 顶部一条 Iron Law（通用指南 §4.1），代码块格式 2-3 行。Iron Law 是该 skill 最核心的 HARD_STOP 提升到顶部位置，**不重复计入 `behaviors.hard_stops` 之外**——它就是 hard_stops 之一，只是位置在顶部。

### 3.3 PRECONDITION_FAIL 的输出格式

虽然术语层面 PRECONDITION_FAIL 与 HARD_STOP 不同（一个是用户应修复，一个是 agent 应停手），但终端输出复用同一个 `[HARD STOP]` 前缀（02-visual-spec §五）——这是历史决策。两类节点的区分通过措辞体现：

- PRECONDITION_FAIL：`[HARD STOP] phase 不合法：当前为 archived，需要 applied`（提示用户运行什么命令修复）
- HARD_STOP：`[HARD STOP] 冲突时禁止运行 git merge --abort`（明确禁令对象是 agent）

未来如果终端格式拆分两个前缀，本节同步更新。

---

## 四、USER_GATE 与 AskUserQuestion 对应

### 4.1 强制工具：AskUserQuestion（Claude Code）

**所有 USER_GATE 节点必须用 AskUserQuestion 工具实现。** 不允许用纯文本输出选项后等待用户自然回复。

**WHY：**

- AskUserQuestion 强制 agent 把所有路径列成结构化选项 → agent 不能用模糊措辞让用户回 yes 蒙混过关
- 结构化选项中的每个选项有 `label` + `description`，强制 agent 提前想清楚每条路径的后果
- 用户回复是从枚举中选一个，不会出现"嗯"/"好"这类沉默漂移

**反例（不算 USER_GATE）：**

- ❌ 输出一段说明 + "是否继续？"，等用户回"是" — agent 用自由文本规避了选项化
- ❌ "请确认 merge 结果" — 没列出"确认 / 重新检查 / 调整"的具体动作
- ❌ "我打算这样做：[计划]，OK 吗？" — 用户隐式同意 ≠ USER_GATE 通过

### 4.2 上下文打包要求

调用 AskUserQuestion 时，agent 必须在 `question` 字段或紧前的输出中提供决策所需上下文。**不能只问"是否继续"而不展示当前状态。**

**必须打包的上下文：**

| 决策类型 | 必须展示的上下文 |
|---------|---------------|
| 制品审查（plan/apply 阶段） | 制品完整内容 |
| Delta Spec 合并审查（archive） | `git diff openspec/specs/` 输出 |
| Worktree 合并审查（archive） | `git log <FEATURE_BRANCH>..HEAD` 提交列表 |
| Memory 写入确认（archive） | 待写入的 memory 条目摘要 |
| 主分支选择（finish 等） | 检测到的候选分支列表 + 推荐理由 |
| 处理方式选择（finish merge/PR/保持） | 当前 phase + 分支状态 |

### 4.3 沉默 ≠ 授权

通用指南 §3.4 USER_GATE 定义里有"沉默 ≠ 授权"。在 alloy 实现层面：

- AskUserQuestion 必须等待用户实际选择，不接受超时默认值
- 用户回"嗯"/"OK"等无方向回复 → agent 必须重新调用 AskUserQuestion 澄清，不允许自行选默认
- 用户拒绝选项（"都不对"/"还有别的吗"） → agent 必须扩展选项重新询问

### 4.4 平台降级

非 CC 平台（Gemini CLI、Codex 等）没有 AskUserQuestion 工具，降级到 02-visual-spec §十的块引用文本选项格式：

```
> → (a) 选项 1 — 描述
> → (b) 选项 2 — 描述
> 请输入 a 或 b：
```

降级实现等同 USER_GATE，仍需满足 4.1-4.3 全部规则。

### 4.5 精确字符串确认（强 USER_GATE）

不可逆操作（discard、finish merge）使用 02-visual-spec §六的精确字符串确认，是 USER_GATE 的强化形式：

- 用户必须输入精确语句（如 `merge login-feature into main`）
- "好"/"y"/"yes"/"可以" 等模糊回复一律不算确认
- 这是 HARD_STOP 与 USER_GATE 的复合：HARD_STOP 禁止 agent 把模糊回复当确认，USER_GATE 强制等用户输入

---

## 五、五阶段 skill 共享禁令

### 5.1 引用通用指南 §3.5

通用指南 §3.5.1 已定义 git 自救命令禁令清单（`merge --abort` / `reset --hard` / `restore .` / `checkout .` / `stash` / `clean -fd` / `push --force` 等）。alloy 五个阶段 skill 在以下位置必须嵌入该禁令：

- `apply.md`：worktree 创建、git commit 失败处理
- `archive.md`：worktree 合并步骤、Delta Spec 合并失败处理
- `finish.md`：squash merge 步骤、git pull 失败处理、PR 推送失败处理
- `start.md`：分支创建/切换出现冲突时
- `plan.md`：制品 commit 失败处理

嵌入方式按通用指南 §3.5.1 的"嵌入位置"指引——就近放在触发命令前一行。

### 5.2 alloy 特定共享禁令

#### 5.2.1 git add 限路径禁令

**禁令：** 禁止使用 `git add -A` / `git add -a` / `git add .`，必须明确指定路径。

**WHY：**

- alloy 工作流在多目录并发产出制品（`openspec/changes/<name>/` + `openspec/specs/` + `.alloy.yaml`）
- `-A` / `-a` / `.` 会把测试残留、临时文件、其他 change 的未跟踪文件一并 stage，污染 commit
- 限路径让 commit 范围明确，便于事后审计

**标准措辞：**

```
git add 限路径（如 openspec/specs/ openspec/changes/<name>/），
不用无路径的 -A / -a / 通配 .。
```

**嵌入位置：** 所有 5 个 skill 的 git commit 步骤前。

#### 5.2.2 Memory 批量写入禁令

**禁令：** retrospective.md §6 Promote Candidates 写入 `~/.claude/memory/` 必须**逐条 USER_GATE**，禁止"全部写入"作为单次确认。

**WHY：**

- memory 影响所有未来会话的 agent 行为，是全局污染源
- retrospective 条目质量参差，逐条审查可拦截"乍看合理但实际过拟合"的条目
- 批量确认违背 4.3"沉默 ≠ 授权"——一次 yes 等于全部沉默通过

**标准措辞：**

```
[HARD_STOP] retrospective Promote Candidates 禁止批量写入 memory。
每条候选条目必须独立 AskUserQuestion 确认（写入 / 跳过 / 修改后写入）。

违反字面 = 违反精神：哪怕看似"全部都对"，也算违反禁令——
单次确认无法承担全局污染风险。
```

**嵌入位置：** `archive.md` 读取 retrospective.md §6 之后、写入 memory 之前。

#### 5.2.3 Phase 推进早于操作的回滚要求

**约束：** `alloy _guard ... --apply` 推进 phase 后，如果后续不可逆操作（merge / 删分支 / 远端 push）失败，必须有降级路径。

**WHY：**

- finish.md 选项 1 的 phase 推进发生在 squash merge 之前，merge 失败时 phase=finished 但代码未合入，重入会被 PRECONDITION_FAIL 拒绝
- archive.md 的 phase 推进同样存在该窗口

**两种合法实现：**

| 路径 | 做法 |
|------|------|
| A | phase 推进延后到不可逆操作成功之后（牺牲幂等性，重入需重做前置工作） |
| B | phase 推进保持在前，但 skill 内显式记录失败时的降级动作（手动改 .alloy.yaml 回退、或提供 fix 命令） |

**WHY 要规范：** 当前 archive.md / finish.md 都用了 B 路径但**没写降级指引**——这是漏洞，重写时必须补全。

**嵌入位置：** archive.md / finish.md 的 phase 推进步骤注释里。

---

## 六、alloy 增量检查清单

通用指南 §八已定义 30 项通用检查清单。本节只列 alloy 项目特有的增量项，分**必检**和**推荐**两档。

### 6.1 必检项（重写后必须通过）

#### Frontmatter

- [ ] 使用新四字段（`preconditions` / `hard_stops` / `user_gates` / `warns`），不使用废弃的 `stops`
- [ ] 四字段数字与正文实际节点数完全一致（手段 1 节点审计通过）
- [ ] `transitions_to` 字段对应正确的下一 phase（按 `01-product-spec` 的 phase 链）
- [ ] `external_calls` 字段列出所有外部 skill 或 CLI 调用

#### 节点视觉化

- [ ] 正文节点标记使用本规范 §3.1 的 emoji 映射（`⛔` / `🔴` / `⚠️`）
- [ ] 终端输出格式遵守 02-visual-spec.md（Phase 框 / Step 标题 / 块引用 / `→` 前缀 / `[HARD STOP]`）
- [ ] 顶部 Iron Law 代码块 2-3 行，是该 skill 最核心 HARD_STOP

#### USER_GATE

- [ ] 所有 USER_GATE 在 CC 平台用 AskUserQuestion 工具实现
- [ ] 每个 AskUserQuestion 调用前后打包了决策所需上下文（按 §4.2 表格）
- [ ] 不可逆操作使用精确字符串确认（02-visual-spec §六）

#### 共享禁令

- [ ] git 操作步骤前嵌入了通用指南 §3.5.1 的 git 自救命令禁令
- [ ] git commit 步骤前嵌入了 §5.2.1 的 git add 限路径禁令
- [ ] archive.md 的 memory 写入位置嵌入了 §5.2.2 的批量写入禁令
- [ ] phase 推进步骤注释了降级路径（§5.2.3）

#### 三层防御

- [ ] 顶部 Iron Law 是第一层"显式无例外"
- [ ] 关键禁令有第二层"违反字面 = 违反精神"措辞（通用指南 §3.3）
- [ ] 底部 Red Flags 表覆盖该 skill 主要合理化借口（第三层）

### 6.2 推荐项（提升质量，非阻断）

- [ ] 关键决策点用 Gate Function 伪代码（通用指南 §6）
- [ ] 复杂分支用 dot 流程图（通用指南 §9）
- [ ] 跨 skill 重现的隐患升级到通用指南 §3.5 通用禁令模式（手段 3）
- [ ] phase_timings 字段的 started_at / completed_at 写入逻辑符合 02-visual-spec §1.1
- [ ] 错误处理分支引用 `commands/alloy/references/phase-routing.md` 等共享文档，不重复内联逻辑
- [ ] 行数控制在 300 以内（阶段命令）/ 200 以内（fix/discard/status，通用指南 §6.1）

---

## 七、参考

| 文档 | 用途 |
|------|------|
| [skill-writing-guide.md](skill-writing-guide.md) | 通用规则基础（必读） |
| [02-visual-spec.md](../specification/02-visual-spec.md) | 终端输出视觉规范 |
| [01-product-spec/](../specification/01-product-spec/) | 各 skill 的产品规范（00 overview + 01-08） |
| `08-cli-spec.md` | `_guard` / `_state` / `_skill` / `_record` CLI 命令规范 |

---

## 附录 A：现有 5 个阶段 skill 的 frontmatter 偏离现状

> 本附录描述截至 2026-06-13 的客观偏离事实，作为按本规范执行情况的证据。
> 重写后 frontmatter 应与正文一致，本附录将更新或删除。

### A.1 节点统计偏离

| skill | 字段 | 标称 | 实际 | 偏离 |
|-------|------|------|------|------|
| start.md | hard_stops | 5 | 8 | -3 |
| plan.md | stops | 6 | ≥8（按 user_gates 计） | -2+ |
| plan.md | hard_stops | 3 | 9 | -6 |
| apply.md | hard_stops | 6 | 11 | -5 |
| archive.md | stops | 3 | 3（按 user_gates 计） | 0 |
| archive.md | hard_stops | 2 | 9+ | -7 |
| finish.md | stops | 3 | 4（按 user_gates 计） | -1 |
| finish.md | hard_stops | 0 | 8+ | -8 |

### A.2 缺字段现状

5 个 skill 全部**缺**以下字段，重写时新增：

- `preconditions`（PRECONDITION_FAIL 数）
- `warns`（WARN 数）
- `user_gates`（替换 `stops`）

### A.3 数据来源

- start / plan / apply：参照 `docs/superpowers/specs/2026-06-13-skills-test-design-wip.md` §3
- archive / finish：参照同文档新增的 archive.md 和 finish.md 章节

详细节点清单（含每个节点的行号、缺失项分析）见 WIP 文档 §3 与 §3.5 五个 skill 偏离汇总表。
