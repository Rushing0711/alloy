# apply Red Flags 完整表（第三层防御——任一借口出现即 STOP）

主文件保留 5 条核心，完整 12 条在此。

| 借口 | 现实 |
|------|------|
| "用户说了跳过 worktree" | 隔离是软闸门——`/alloy:apply` 允许 worktree=skipped；但模糊回复（"嗯"/"好"）不算同意，必须 USER_GATE 明确选择。 |
| "先写代码再补测试" | TDD 次序不可颠倒。提速靠并行子任务，不靠砍测试（Iron Law 第一层）。 |
| "用户要改需求，直接改" | 需求变更必须走 tasks.md checkbox 闸门。已编码→开新 change，未编码→回溯，禁直接改 plans.md。 |
| "技能缺失没关系" | 技能是闸门不是加速器。缺失 = ⛔ PRECONDITION_FAIL。引导 `alloy init`，不存在降级。 |
| "用户很急，跳过 review" | 跳过 review = 跳过质量闸门。急不是绕过流程的理由（Iron Law 第二层）。 |
| "先建 worktree 再问用户" | consent 必须在创建前。加载 using-git-worktrees Step 0 后停手，等用户明确回复。 |
| "verify.md 措辞不太顺，直接编辑改一下" | 制品禁直接编辑——任何变更必须重新生成 + 重新 hash-lock。违反字面 = 违反精神。 |
| "verify FAIL 是小问题，retro 写'已知 FAIL'继续" | FAIL 必须修复回到 Step 2。带 FAIL 进 archive 阶段 = spec 与代码偏差永久封存。 |
| "single-commit 修复不需要 retrospective，自动跳过" | retrospective 跳过判定必须 USER_GATE，agent 不得自动选"跳过"（task #17）。 |
| "worktree 内分支看起来对，应该没问题吧" | worktree-<name> 是硬约束。子 agent 在错误分支编辑 = 用户主分支被污染（task #18）。 |
| "git stash list 有内容，但这是之前的不影响 commit" | stash 残留 = 未完成工作。commit 前必须 ⚠️ WARN 让用户确认（task #19）。 |
| "另一个 change 也在 apply，并行做完更快" | apply 单 change 串行（subagent 内部并行 OK）。多 change 同时 apply = git 操作竞争。 |
