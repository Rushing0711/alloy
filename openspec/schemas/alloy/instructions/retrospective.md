# retrospective 制品指令

**定位：** apply 阶段 step 5 产出。复盘覆盖 start → plan → apply 全周期，先量化再定性，先证据再判断。
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

### Step 1: 生成机械数据骨架（CLI）

调用 `alloy _retro scaffold openspec/changes/<change-name>` 生成 §0 量化全景 + §4 技能审计，直接写入 retrospective.md。

CLI 从以下数据源权威生成（不依赖 LLM 记忆，跨 session 中断也完整）：
- `.alloy.yaml`：started_at/completed_at、records（制品审批链）、skill_usage（技能审计，全部不漏）、phase_timings（阶段耗时 + 阶段间隔）、worktree
- `git log <merge-base>..HEAD`：commit 按 type 分组、完整提交链、变更规模
- `git tag -l "alloy-checkpoint-<name>-*"`：检查点使用 + 回退检测
- `tasks.md`：任务完成比
- `verify.md`：验证状态

**agent 不再手动跑 `alloy _state read` / `git log` / `git diff --stat` 等命令——这些已由 scaffold 承担。** §0/§4 生成后 agent 只读不改。

### Step 2: 写入定性分析（§1-§6）

每条结论必须引用 §0 的证据或具体 commit hash/文件路径/测试名称。

#### §1 做对了什么
- 每个 point 格式：`- [evidence: <commit/file/test>] <描述>`
- 聚焦可复现的成功模式

#### §2 做错了什么
三级严重度，每条带 evidence：
- `- 🔴 [blocking | evidence: ...] <描述>` — 阻塞性问题
- `- 🟡 [painful  | evidence: ...] <描述>` — 痛苦但不阻塞
- `- 📌 [nit      | evidence: ...] <描述>` — 小问题

> ⛔ [HARD_STOP] §2 禁止建议破坏设计——如果某现象是设计内建的承载机制（如 plans.md strategy 与实际执行不符由 §3 承载,不是 bug；apply 不回写 plans.md 是设计）,不要在 §2 当 miss 提"改进建议回写/留空"。§2 Misses 只记录真正的缺陷（阻塞/痛苦/小问题）,不记录设计内建的承载机制。
> 违反字面 = 违反精神：把设计机制当 bug 提改进 = 误导后续 cycle 破坏设计。例如"plans.md strategy 不符"是 §3 计划偏离的预期内容,不是 §2 的改进点。

#### §3 计划偏离
表格：Plan task / What changed / Why
哪些 task 的范围在执行中发生了变化，原因是什么。
如果 plans.md 的 strategy 和实际执行方式不同，在此记录。

#### §4 全周期技能审计

§4 审计表由 `alloy _retro scaffold` 生成（读 `.alloy.yaml` skill_usage，used=true 填 ✓ 带 count，used=false 填 ✗ 带 reason，按阶段分组）。agent 只读不改表格。

**Deliberately Skipped Skills（agent 职责）：** 对每个标 ✗ 的技能，展开三问：
1. **What was skipped** — 具体跳过了哪个技能或子步骤
2. **Why this cycle** — 具体触发原因（优先用 reason 字段）
3. **How to prevent recurrence** — schema graph fix / skill description tightening / CLAUDE.md trigger / scope-judgment rule / one-off

多个 cycle 因相似原因跳过同一技能 → 应成为 §6 Promote candidate。

#### §5 意外发现
`- <被推翻的假设>` — 哪些假设被证明是错误的

#### §6 值得推广
使用 `- [ ]` checklist（非表格），未勾选的 = 跨周期 carry-forward：
- 标题：严重度 emoji + 一句话教训
- `→ **Promote to** <destination>`（memory / CLAUDE.md / schema / skill / one-off）
- `> **Why**: <原因>`
- `> **How to apply**: <触发条件>`

格式对齐 feedback memory schema，使 Why/How to apply 可直接转移到 `~/.claude/memory/`。

> ⛔ [HARD_STOP] §6 只提取本 cycle 新发现的、尚未成文的设计模式或经验教训。禁提取 apply.md / plan.md / archive.md / finish.md 等已有硬规则的执行——这些是规则，不是新模式。
> 违反字面 = 违反精神：哪怕"这条规则本 cycle 执行得很好值得强化",也算违反——规则执行得好是应有之义,不是"值得推广的新模式"。把硬规则当新模式提取 = retrospective 失去"发现未知"的价值,还会让用户误以为 alloy 流程不专业（连自己的规则都不认识）。
> 常见违规模式：把"单 commit 含代码+测试+tasks checkbox"（apply.md L298-305 硬规则）当新模式提取；把"TDD 先写测试再写代码"（TDD 技能固有规则）当新模式提取。这些都不是"新模式",是已有规则的执行。

#### §7 偏差分类（Compliance Deviations）
agent 回顾本次 session,勾选观察到的合规偏差类型。若无偏差,填"无"。

偏差类型清单(勾选 + 详细描述):
- AskUserQuestion 漏触发 / 纯文本列选项 / 跳过 USER_GATE
- git 自救(reset --hard / checkout . / stash drop / merge --abort)
- 路径错误(子 agent 主仓路径 / verify.md 位置 / git add -A 通配)
- worktree 相关(ExitWorktree action / worktree 字段漏写)
- 时间戳错误(START_TIME 重复捕获 / 接续路径重捕获)
- memory 相关(批量写入 / 未区分项目用户 / 非选项回复主观推断)
- 其他

> 本段由 agent 定性填写(非 scaffold 生成)。下次 start 阶段读取最近 3 个 retrospective 的本段,针对性提示高频偏差。
> 若本 cycle 无偏差,填"无"——不强制填写。

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
