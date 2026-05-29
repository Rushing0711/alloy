# verify 制品指令

> **语言要求：所有输出必须使用中文。** verify.md 的章节标题、描述、分析、结论全部使用中文。代码标识符和技术术语保持英文。

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
