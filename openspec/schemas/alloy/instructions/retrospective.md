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

#### §1 做对了什么
- 每个 point 格式：`- [evidence: <commit/file/test>] <描述>`
- 聚焦可复现的成功模式

#### §2 做错了什么
三级严重度，每条带 evidence：
- `- 🔴 [blocking | evidence: ...] <描述>` — 阻塞性问题
- `- 🟡 [painful  | evidence: ...] <描述>` — 痛苦但不阻塞
- `- 📌 [nit      | evidence: ...] <描述>` — 小问题

#### §3 计划偏离
表格：Plan task / What changed / Why
哪些 task 的范围在执行中发生了变化，原因是什么

#### §4 技能遵循度
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

#### §5 意外发现
`- <被推翻的假设>` — 哪些假设被证明是错误的

#### §6 值得推广
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
