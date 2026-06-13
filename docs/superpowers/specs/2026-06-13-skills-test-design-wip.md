# Alloy Skill 测试与重写 设计 (WIP)

> 状态：brainstorming 进行中（尚未生成正式 design 文档）
> 创建：2026-06-13
> 用途：context 即将爆掉，先把已收集的发现、决策、待办固化到磁盘

---

## 背景

用户提出"alloy 的 start/plan/apply/archive/finish 5 个 skill 都需要测试"，触发本次 brainstorming：
1. 先确认 Claude 对每个 skill 的"硬闸门 / 软闸门 / 高频陷阱"理解是否符合用户预期
2. 再设计测试方案（边界场景、自动化机制等）
3. 测试发现问题后，按 skill-writing-guide 规范重写

进行到一半发现：alloy 当前 5 个 skill 偏离 skill-writing-guide 的几个关键点（详见下方 §1），且存在多个 brainstorming 阶段补发现的安全隐患（§3）。所以本次任务实际包含 3 件事：
- A. 测试 5 个 skill
- B. 按 skill-writing-guide 重写 5 个 skill
- C. 修补开新 change 闸门 + 12 条安全隐患

---

## §1 关于 alloy skill 与 skill-writing-guide 的偏离

skill-writing-guide.md 规范要求：
- 闸门型技能：二元判断 + 绝对语言 + 抗合理化三层防御
- 第一层：显式"无例外"条款
- 第二层：违反字面=违反精神 一句话
- 第三层：Red Flags 自检表
- Gate Function 伪代码用于关键决策
- 流程图（diamond=决策 / box=动作 / octagon 红色=警告）
- user-invocable: false（仅 Claude 自动调用）

alloy 当前现状：
- ✅ 第三层 Red Flags 表：5 个 skill 全有
- ✅ 绝对语言：Iron Law / HARD STOP 措辞
- ❌ 缺第一层、第二层防御
- ❌ HARD STOP 没在文档顶部统一定义
- ❌ HARD STOP 双重含义（前置条件失败 + Agent 绝对禁令），违反"二元清晰"原则
- ❌ 关键决策点（需求变更分类、SDD/EP 选择、worktree base ref）无伪代码
- ❌ 没有流程图

---

## §2 已确认的术语统一定义（用于 5 个 skill 重写）

| 符号 | 类型 | 语义 | 违反后果 |
|------|------|------|---------|
| ⛔ PRECONDITION FAIL | 前置条件拒绝 | 系统/状态校验失败，本次会话直接中止，引导修复后重新调用 | 不可继续 |
| ⛔ HARD STOP | 对 Agent 绝对禁令 | 无论看似多合理，agent 都不许跨越的边界 | 违反 Iron Law |
| 🔴 STOP | 用户硬交互 | 必须用 AskUserQuestion，等用户决策后才继续 | 沉默 ≠ 授权 |
| ⚠️ WARN | 软警告 | 提示但不阻断 | 仅记录 |

---

## §3 已发现的设计问题（按 skill 分类）

### start.md
- frontmatter `hard_stops:5` 未区分 PRECONDITION FAIL（3 个）和 HARD STOP（5 个），实际应为 8
- `main_cached` 跳过检测可能导致 config 与 .git 实际不一致
- "on-main → 仅展示新建" 模式（HARD STOP + 紧跟 🔴 STOP 限制选项）值得固化为通用模式
- 自由探索"自跳禁令"（line 274）需要更醒目

### plan.md
- frontmatter `stops:6, hard_stops:3` 偏低，实际 stops≈4 模板（每制品触发 ×5 = 实际 8+）/ hard_stops 应为 9
- 需求变更分类逻辑薄弱——已加入 task #62 边界测试
  - 用户确认：line 125 的 🔴 STOP 不是矛盾，是"判断逻辑确定路径 + 执行前给反悔机会"，并存合理

### apply.md
- frontmatter `hard_stops:6` 偏低，实际 PRECONDITION 3 + HARD STOP 8 = 11
- worktree base ref 是最隐蔽的不可逆陷阱（using-git-worktrees 仅 Step 0 用法）
- EP 四步显式补偿是 SDD/EP 选择最易踩坑
- **新发现**：apply 子图 2 用户重新理顺逻辑后增加 HARD STOP："worktree 创建前 git status 检查，未 commit 变更不会带进 worktree"
- retrospective 跳过条件易被误判（多 commit 也判成单 commit 小修）

### archive.md（2026-06-13 续）

**frontmatter 偏离：**
- `stops:3` ✅ 准确
- `hard_stops:2` ❌ 严重偏低，实际 PRECONDITION 3 + HARD STOP ≥6 = 9+

**节点清单：**
- ⛔ PRECONDITION FAIL（3 个）：opsx 不可用 / phase ≠ applied / change 目录不存在
- ⛔ HARD STOP（应有 7 个，当前部分缺失或弱化）：
  - H1 verify.md FAIL（已有，措辞需升级）
  - H2 `/opsx:archive` 报错（弱，无后续约束）
  - H3 worktree 清理前必须 commit（暗含未明示）
  - H4 **merge 冲突时禁止 agent 自动 abort**（❌ 缺失，§5 P0-1）
  - H5 归档 commit 失败（已有显式 HARD STOP）
  - H6 git add 限路径禁 -A（混在末尾说明里未上升）
  - H7 **memory 写入不许批量**（❌ 缺失，§5 P0-2，line 119 选 a "写入所有" 违背原则）
- 🔴 STOP（3 个）：Delta Spec 合并审查 / memory 写入确认 / worktree 合并审查
- ⚠️ WARN：line 144-148 worktree 分支检测失败 `exit 1`、line 168 merge 冲突——两处实为硬错不是 WARN

**新发现陷阱（除 §5 已有的 P0-1/P0-2/P1-7 外）：**
- **陷阱 3：archive 入口无 git status clean 前置检查**——worktree 内未 commit 的非 spec/changes 路径变更会污染后续 merge。需在 Step 2/3 入口加 PRECONDITION FAIL。与 §4 决策 1 "封存检查（机械）" 同源。
- **陷阱 4：worktree state 缺失的 silent fallback**（line 134-148）——遗留兼容逻辑掩盖新 change state 写入失败的真实错误。需区分"遗留" vs "state 缺失"，后者 PRECONDITION FAIL。
- **陷阱 6：Delta Spec 🔴 STOP 措辞太柔**（line 96-101）——agent 容易把"diff 看起来没问题"等同"用户已确认"。需强制把 `git diff openspec/specs/` 打印进 AskUserQuestion 上下文，沉默不算授权。

**缺失的三层防御：**
- 第一层：`NO ARCHIVE WITH FAIL` 仅覆盖 verify.md FAIL，未覆盖 merge 冲突、memory 批量
- 第二层（违反字面=违反精神）：整段缺失
- 第三层 Red Flags：✅ 7 行覆盖良好，但需补 merge 冲突 abort、memory 批量两个新借口

**流程图：缺失。** 主链（前置检查 → opsx:archive → Delta Spec STOP → 提交 → worktree 子链 → memory 子链 → phase 推进）+ 两条子链都需要 dot 图。

### finish.md（2026-06-13 续）

**frontmatter 偏离：**
- `stops:3` ❌ 实际 = 4（主分支确认 / 三选一 / 精确字符串 / spec 变更询问）
- `hard_stops:0` ❌ 严重偏低，实际 PRECONDITION 3 + HARD STOP 5+ = 8+

**节点清单：**
- ⛔ PRECONDITION FAIL（3 个）：skill 不可用 / phase ≠ archived / feature 分支不存在
- ⛔ HARD STOP（应有 8 个，当前 frontmatter 写 0）：
  - H1 merge 必须精确字符串确认（已宣告，需升 HARD STOP）
  - H2 "好/可以/y" 不算确认（已宣告）
  - H3 **`git pull` 失败禁止 agent 自动 --rebase/--force**（❌ 缺失，line 127 silent 继续）
  - H4 **`git merge --squash` 冲突禁止 agent 自动 abort/reset/checkout/restore/stash**（❌ 缺失，与 archive H4 同源）
  - H5 `git branch -D` feature 分支前必须校验非空且非主分支（❌ 缺失）
  - H6 PR 审查时禁止改归档 spec（已有 🔴 STOP 路由，缺 HARD STOP 兜底）
  - H7 **squash 后 retrospective.md 引用的 commit hash 失效**（❌ 缺失，§5 P1-6）
  - H8 git add 限路径禁 -A（混在末尾说明）
- 🔴 STOP（4 个）：主分支确认 / 三选一处理方式 / 精确字符串 merge 确认 / PR 审查中是否需要 spec 变更
- ⚠️ WARN：line 127 `git pull` 失败 echo——应升 PRECONDITION FAIL（陷阱 3）

**新发现陷阱（除 §5 已有的 P1-6/P1-7 外）：**
- **陷阱 3：`git pull` 失败 silent 继续**（line 127）——`||` 短路让 pull 失败直接进 squash，基础过期 → merge 出脏 commit。必须升级为 PRECONDITION FAIL 或 🔴 STOP。
- **陷阱 4：phase 推进早于 merge 的重入 hazard**（line 119-124、144-152）——`alloy _guard finished --apply` 先于 squash 执行，merge 失败/取消时 phase=finished 但代码没合入，重新跑 finish 时 PRECONDITION P2 拒绝。当前注释承认"在 squash merge 之前"但无降级指引。
- **陷阱 5：`git branch -D` 变量未校验**（line 136）——`<feature_branch>` 因 state 损坏读为空或主分支名时灾难。需入口加 `feature_branch != main_branch && != ""` 校验。
- **陷阱 6：worktree-branch 与 feature-branch 混淆**（archive 已清理 worktree，finish 删的是 feature）——脚本无注释，旧 change 同名时 agent 误判"已删除"。
- **陷阱 8："保持分支"无状态记录**（line 161-163）——下次重入时不知道"还没决定"还是"曾决定保持"。建议写 `state.finish.deferred_at`。

**缺失的三层防御：**
- 第一层：`MERGE REQUIRES EXACT CONFIRMATION` 仅覆盖精确字符串。`git pull/merge 冲突禁 agent 自救`、`squash 让 retrospective hash 失效`无第一层
- 第二层：整段缺失
- 第三层 Red Flags：仅 4 行严重不足，需补：
  - "merge 冲突跑一下 abort 让流程干净" → 用户 stage 的工作消失
  - "git pull 失败但 main 改动不大，跳过吧" → 基础过期 merge 出脏 commit
  - "用户说 yes 就是确认 merge" → 精确字符串才算

**流程图：缺失。** 三选一分支（merge/PR/保持）+ 选项 1 内部七步链 + 重入路径，需要 dot 图。

---

## §3.5 五个 skill 偏离汇总（2026-06-13）

| skill | frontmatter 实际/标称 | HARD STOP 缺失 | 三层防御缺失 | 流程图 |
|-------|--------------------|---------------|-------------|--------|
| start | hard_stops:5/实际 8 | 部分弱化 | 缺一二层 | ✅ 已设计 |
| plan  | stops:6 hard_stops:3/实际 8+/9 | 部分缺失 | 缺一二层 | ✅ 已设计 |
| apply | hard_stops:6/实际 11 | 部分缺失 | 缺一二层 | ✅ 已设计 |
| archive | stops:3 hard_stops:2/实际 3/9+ | merge 冲突 abort + memory 批量缺失 | 缺一二层 | ❌ 待补 |
| finish  | stops:3 hard_stops:0/实际 4/8+ | 5 个关键 HARD STOP 全缺 | 三层全弱 | ❌ 待补 |

**共性结论：**
1. **frontmatter `hard_stops` 普遍偏低** —— 5 个 skill 全部低估，finish 甚至写 0。需要重新统计标准。
2. **第一层"显式无例外"覆盖不全** —— 顶部宣告通常只覆盖 1 条 Iron Law，其他高危禁令没有第一层。
3. **第二层"违反字面=违反精神"全员缺失** —— 这是抗合理化的核心防御，不能用 Red Flags 替代。
4. **`git ... --abort/--reset/--restore/--checkout` 类自救命令** —— 跨 archive/finish 同款隐患，应抽成共享的"git 操作禁令"模板。
5. **memory 批量写入** —— 唯一发生在 archive，但已升级为 P0。
6. **squash merge 后 hash 失效** —— 唯一发生在 finish，但跨 retrospective/审计链路影响深远，应升级为 P0 重新评估。

---

## §4 关键决策（已确认）

### 决策 1：开新 change 双路径分流（user-driven）
触发位置：start.md `--new` 路径 + 强制新建路径 + apply.md 需求变更 grep≥1 走开新 change

流程：
```
封存检查（机械）:
  worktree git status 必须 clean → 不 clean = HARD STOP
  tasks.md 勾选数 vs commit 数对照（实施时确认是否做）

封存通过后 → 🔴 STOP 用户决策:
  新 change 是否依赖当前未完成 change?

  依赖路径:
    必须先 discard 当前（合并必要代码）或 finish 当前
    新 change 从更新后的 main 分出
    
  独立路径:
    ⚠️ WARN 二次确认（不能 silent pass）
    允许并行（最多 N 个，建议 2 个）
    新 worktree 路径独立
```

新增 CLI：`alloy _guard active-change-sealed [<name>]`

### 决策 2：discard 改软删除（折中方案）
当前：`git branch -D` + 删 worktree + 删 change 目录 → 不可恢复

改为：
- 分支重命名：`feature/xyz` → `discarded/xyz-<ts>`（前缀分组，git tab 补全好过滤）
- worktree 移到：`.claude/worktrees/.discarded/xyz-<ts>/`
- change 目录移到：`openspec/changes/.discarded/xyz-<ts>/`
- 新增命令：`alloy _purge-discarded [--older-than 30d]`
- discard 提示语保留精确匹配 `discard <name>`，但后果改为"30 天内可恢复"

**保留精确匹配仪式感**——心理仪式不能弱化。

### 决策 3：12 条安全隐患全部进 task 列表
按 P0/P1/P2 分级，后续分批修复。

---

## §5 12 条安全隐患（按优先级）

### P0 必修（4 条）
1. **archive merge 主分支冲突**：merge 失败/冲突时禁止 agent 自动 abort，必须 🔴 STOP 让用户决定
2. **archive 写 memory 批量**：retrospective §6 Promote Candidates 写入 memory 必须逐条 🔴 STOP，禁止批量
3. **worktree 路径占用**：apply 子图 2 创建前增加路径占用检查（已存在 → 询问/重命名/abort）
4. **discard 软删除**（决策 2）

### P1 推荐（3 条）
5. **opsx:new 目录冲突**：start.md 步骤 4 之前增加目录冲突检查（与开新 change 闸门联动）
6. **finish squash hash 失效提示**：finish 前提示 retrospective.md 引用的 commit hash 在 squash 后失效，是否仍要 squash？
7. **多 change 并行 archive 调度**：archive 入口检查同期待合并，提示用户调度顺序

### P2 可选（5 条）
8. **回溯 snapshot tag**：plan-rollback 前打 git tag rollback-<ts> 方便恢复
9. **commit msg 改 _record 验证**：plan.md line 73-76 的 ⚠️ 改用 alloy _record 字段验证 draft hash 来源
10. **单 commit 严格判定**：apply.md line 275 跳过 retrospective 必须严格判断（feature 分支只有 1 个 non-merge commit）
11. **worktree 内分支锁**：apply 入口主动检查并强制切回 worktree-<name>
12. **stash 残留提醒**：apply 入口扫 git stash list，若有 → ⚠️ WARN 询问

### 不修
- **手动改制品文件**：已有 hash 保护，仅 error message 改进足矣

---

## §6 制品保存位置

### 流程图设计稿（5 个 HTML）
- `.superpowers/brainstorm/93857-1781303162/content-v2/`
  - start-flowchart.html
  - plan-flowchart.html
  - apply-flowchart.html
  - new-change-gate.html
  - discard-and-safety.html

### 浏览器查看
当前服务：http://localhost:57369（来自 brainstorm session 8607-1781306756）
重启后服务路径：`/tmp/brainstorm-<id>/content/` —— 需要重新启动 visual companion

---

## §7 下次会话恢复入口（2026-06-13 末次更新）

### 已完成里程碑（commit 历史）

```
24dc534  docs: archive P0 三连补丁实施计划            ← plan 文档
88e49cd  docs: 5 阶段 skill 系统化测试与重写 design   ← 正式 design
579373a  docs: 新增 alloy-skill-writing-guide.md     ← alloy 项目规范
86d170f  docs: skill-writing-guide 补 4 个章节       ← 通用指南补丁
```

### brainstorming 阶段全部完成

✅ 14 个 Q（Q1-Q7 + Q-A 至 Q-G）已决策（见 design §6）
✅ 通用指南补丁 G1-G4 全部写入（86d170f）
✅ alloy 项目规范 7 章 + 1 附录（579373a）
✅ 正式 design 文档（88e49cd）
✅ 第一份 plan：archive P0 三连补丁（24dc534）

### 下一会话开场指令

```
继续 alloy 5 阶段 skill 重写。
1. 看 docs/superpowers/specs/2026-06-13-skills-test-and-rewrite-design.md 了解整体设计
2. 按 docs/superpowers/plans/2026-06-13-archive-p0-patch.md 执行 archive P0 三连补丁
3. 用 Subagent-Driven 模式（superpowers:subagent-driven-development），每 Task 单独 dispatch fresh subagent
4. 完成后继续写 plan 2（apply.md P0 单条 #10）和 plan 3（finish.md P0 三连 #23 #24 #25）
```

### 待办状态

**阶段 1（P0 紧急补丁）：**
- [ ] plan 1：archive P0 三连（task #8 #9 #20）—— **plan 已就绪，待执行**
- [ ] plan 2：apply P0 单条（task #10）—— 待写
- [ ] plan 3：finish P0 三连（task #23 #24 #25）—— 待写

**独立任务：**
- [ ] task #11：discard 软删除（涉及新 CLI `_purge-discarded`）

**阶段 2（按规范统一重写）：** 顺序 archive → finish → apply → plan → start

**附属任务：**
- [ ] task #5：archive/finish 流程图（已并入阶段 2）
- [ ] task #14 #21 #22 #13 #26 #27 #17 #18 #19 #15 #16 #12 共 12 个 P1/P2 task（在阶段 2 重写时处理）

### 关键文档地图

| 文档 | 用途 |
|------|------|
| `docs/superpowers/specs/2026-06-13-skills-test-and-rewrite-design.md` | 正式 design（重写计划权威来源） |
| `docs/superpowers/specs/2026-06-13-skills-test-design-wip.md` | 本文档，brainstorming 工作笔记 |
| `docs/superpowers/plans/2026-06-13-archive-p0-patch.md` | plan 1 实施计划 |
| `docs/reference/skill-writing-guide.md` | 通用指南（含新 §3.4 四类术语 + §3.5 通用禁令） |
| `docs/reference/alloy-skill-writing-guide.md` | alloy 项目规范 |

### 流程图设计稿备份

start/plan/apply 三个 skill 已有流程图 HTML 备份：
`.superpowers/brainstorm/93857-1781303162/content-v2/`

archive/finish 流程图待新画（阶段 2 重写时同步出图）。

---

## §8 附录：用户给出的关键洞察（不可丢失）

1. **"git add 限路径，不用 -A/-a/."** — 横跨 5 个 skill 的硬约束
2. **"start --new 和 apply 开新 change 容易乱套"** — 触发 §4 决策 1
3. **"worktree 创建前要检查未 commit 变更"** — 触发 apply 子图 2 新增 HARD STOP
4. **"discard 重命名比硬删除安全"** — 触发 §4 决策 2
5. **"新 change 是否依赖当前 change，不好判断，交给用户"** — 双路径分流的核心理念
6. **"plan 需求变更的 🔴 STOP 不是矛盾"** — 判断逻辑 + 执行前反悔机会，并存合理
