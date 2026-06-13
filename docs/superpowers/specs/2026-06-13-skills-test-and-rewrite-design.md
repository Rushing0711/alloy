# Alloy 5 阶段 Skill 系统化测试与重写 设计

> 日期：2026-06-13
> 目标：基于升级后的 skill-writing-guide.md + 新增的 alloy-skill-writing-guide.md，系统化重写 alloy 5 个阶段 skill（start / plan / apply / archive / finish），并修复 brainstorming 阶段发现的 20 个隐患
> 范围：5 个阶段 skill 文件 + discard.md（独立任务）+ 配套 frontmatter 字段定义、规范文档、流程图
> 前置：通用指南 4 章节补丁已 commit（86d170f）；alloy 项目规范已 commit（579373a）

---

## 一、问题根因

### 1.1 五个 skill 与 skill-writing-guide 的偏离

按通用指南（升级版）§3.3 三层防御 + §3.4 四类术语 + §3.5 通用禁令模式审计，5 个 skill 全员偏离：

| 偏离维度 | 现状 | 后果 |
|---------|------|------|
| 第一层"显式无例外"覆盖 | 仅顶部 Iron Law 1 条 | 多个高危禁令无第一层 |
| 第二层"违反字面=违反精神" | 全员缺失 | agent 可在压力下变通字面规则 |
| 第三层 Red Flags | 部分有，覆盖不全 | 新借口未被拦截（如 merge 冲突 abort） |
| 四类术语区分 | HARD STOP 同时承担 PRECONDITION 和 Agent 禁令两类语义 | 二元不清晰，frontmatter 数字与正文不对账 |
| 通用禁令嵌入（git 自救命令） | 全员未嵌入 | merge/rebase/pull 冲突时 agent 可能自动 abort，工作消失 |
| frontmatter `behaviors` | 全员偏低标称 | 标称数字与实际节点数差异 1-8 不等 |
| 流程图 | 仅 start/plan/apply 有设计稿（HTML 备份），archive/finish 无 | 复杂分支无可视化辅助 |

### 1.2 20 个隐患的归类

按 [WIP §5](2026-06-13-skills-test-design-wip.md) 列出 12 条 + 后续分析新发现 8 条 = 20 条隐患，按优先级与 skill 分布：

**P0 必修（8 条）：**
- archive：merge 冲突自动 abort（#8）/ memory 批量写入（#9）/ 入口 git status 未检查（#20）
- apply：worktree 路径占用未检查（#10）
- discard：硬删除不可恢复（#11，独立任务）
- finish：git pull silent 继续（#23）/ phase 推进早于 merge（#24）/ branch -D 变量未校验（#25）

**P1 推荐（5 条）：**
- start：opsx:new 目录冲突未检查（#12）
- archive：worktree state silent fallback（#21）/ Delta Spec STOP 未强制打包 diff（#22）
- archive+finish：多 change 并行调度未提示（#14）
- finish：squash 后 retrospective hash 失效（#13）

**P2 可选（7 条）：**
- plan：rollback 前未打 snapshot tag（#15）/ commit msg 验证薄弱（#16）
- apply：retrospective 跳过判定不严（#17）/ worktree 内分支未锁（#18）/ stash 残留未提示（#19）
- finish：worktree-branch 与 feature-branch 注释不清（#26）/ 保持分支无 deferred_at（#27）

### 1.3 共性结论

1. **frontmatter `hard_stops` 普遍偏低**——5 个 skill 全部低估，finish 甚至写 0
2. **第二层防御"违反字面=违反精神"全员缺失**——这是抗合理化的核心防御，不能用 Red Flags 替代
3. **`git ... --abort/--reset/--restore/--checkout` 类自救命令**跨 archive/finish 同款隐患，应抽成共享禁令
4. **memory 批量写入**仅 archive 一处但污染全局，已升级 P0
5. **squash merge 后 hash 失效**仅 finish 一处但跨 retrospective/审计链路，已升级 P1（hash 失效是不可恢复但不立即破坏）
6. **frontmatter `stops` 字段二义**与 HARD_STOP 混淆，应改名为 `user_gates`

---

## 二、术语与规范基础

本设计依赖以下文档：

| 文档 | 用途 |
|------|------|
| `docs/reference/skill-writing-guide.md` | 通用规则。本次重写基于的核心规范 |
| `docs/reference/alloy-skill-writing-guide.md` | alloy 项目特定约定 |
| `docs/specification/02-visual-spec.md` | 终端输出视觉规范 |
| `docs/specification/01-product-spec/` | 各 skill 的产品规范（00 overview + 01-08） |

### 2.1 四类语义节点术语

| 术语 | 触发主体 | 含义 | alloy 视觉 |
|------|---------|------|-----------|
| `PRECONDITION_FAIL` | 系统/状态 | 前置条件校验失败 | `⛔ PRECONDITION FAIL` |
| `HARD_STOP` | 对 Agent | 绝对禁令 | `⛔ HARD STOP` |
| `USER_GATE` | 对用户 | 必须用户决策 | `🔴 STOP` |
| `WARN` | 对会话 | 软提示不阻断 | `⚠️ WARN` |

### 2.2 frontmatter 四字段

```yaml
behaviors:
  preconditions: <number>      # PRECONDITION_FAIL 节点数
  hard_stops:    <number>      # HARD_STOP 节点数
  user_gates:    <number>      # USER_GATE 节点数（替换历史 stops 字段）
  warns:         <number>      # WARN 节点数
  artifacts:     [<list>]
  transitions_to: <phase>
  external_calls: [<list>]
```

历史 `stops` 字段废弃，重写时统一迁移。

### 2.3 三层防御与五要素禁令

每个 skill 必须包含三层防御（通用 §3.3）：
- 第一层：显式无例外条款（Iron Law + 步骤就近禁令）
- 第二层：违反字面=违反精神（一句话）
- 第三层：Red Flags 自检表

通用禁令（通用 §3.5）按"触发场景 / 禁令清单 / WHY / 标准措辞 / 嵌入位置"五要素规范化。

---

## 三、重写计划

### 3.1 总体策略：C + A + D3 + E2 + F2

经过 7 轮决策（Q-A 至 Q-G）确定的策略组合：

| 决策 | 内容 |
|------|------|
| 层 1（重写策略） | **C：分两阶段**——先全员 P0 紧急补丁（最小侵入），再按规范统一重写 |
| 层 2（执行节奏） | **A：阶段串行**——阶段 1 串行做完再进阶段 2 |
| Q-D（discard 归属） | **D3：独立任务**——discard 软删除涉及新 CLI，与阶段 1/2 解耦 |
| Q-E（阶段 1 commit 粒度） | **E2：按 skill 拆 commit**——archive/apply/finish 各一个 commit |
| Q-F（重写前 design） | **F2：不写 design**——直接按 alloy 指南 §6 检查清单逐项重写 |

### 3.2 阶段 1：P0 紧急补丁

**约束：** 最小侵入式补丁，仅插入 HARD_STOP 措辞 / PRECONDITION_FAIL 检查 / 修改判断逻辑。**不动 frontmatter，不补三层防御，不画流程图**——这些放阶段 2。

**Commit 1：archive P0 三连**
- task #8：在 worktree merge 步骤前嵌入通用 §3.5.1 git 自救禁令清单
- task #9：将 memory 写入 STOP 改为逐条 USER_GATE（删除"写入所有"选项）
- task #20：archive 入口增加 PRECONDITION_FAIL `git status -uno` 必须 clean 检查

**Commit 2：apply P0 单条**
- task #10：worktree 创建前增加路径占用检查 PRECONDITION_FAIL，已存在 → USER_GATE（复用/重命名/abort）

**Commit 3：finish P0 三连**
- task #23：`git pull` 失败从 silent echo 升级为 PRECONDITION_FAIL 或 USER_GATE
- task #24：`alloy _guard finished --apply` 推进 phase 后插入降级注释——按 alloy 指南 §5.2.3 路径 B（保持现状但显式记录失败时的降级动作）
- task #25：`git branch -D <feature_branch>` 前增加变量校验 PRECONDITION_FAIL（feature_branch != main_branch && != ""）

**审查门：** 阶段 1 三个 commit 全部通过 `npm test` + `npm run build` + 手动跑一次 5 阶段流程，确认无回归后进阶段 2。

### 3.3 独立任务：discard 软删除（task #11）

与阶段 1/2 并行进行，独立 PR：
- 分支重命名：`feature/<name>` → `discarded/<name>-<ts>`
- worktree 移动：`.claude/worktrees/<name>/` → `.claude/worktrees/.discarded/<name>-<ts>/`
- change 目录移动：`openspec/changes/<name>/` → `openspec/changes/.discarded/<name>-<ts>/`
- 新增 CLI：`alloy _purge-discarded [--older-than 30d]`
- 保留精确字符串确认 `discard <name>` 仪式感
- discard.md 提示语改为"30 天内可恢复"

### 3.4 阶段 2：按规范统一重写

**顺序与重灾度对齐：**

| 顺序 | skill | 隐患数 | 主要工作 |
|------|-------|-------|---------|
| 1 | archive | 6 条 | 多子链（Delta Spec / worktree / memory）+ 模板地位 |
| 2 | finish | 6 条 | 三选一分支（merge/PR/保持）+ 复用 archive 模式 |
| 3 | apply | 5 条 | worktree 子图 2 + retrospective 子流程 |
| 4 | plan | 2 条 | 5 制品审查窗口 |
| 5 | start | 1 条 | 入口路由 + 开新 change 闸门 |

**每个 skill 重写产出：**
1. frontmatter 迁移到新四字段
2. Iron Law 重申（升级措辞为最核心 HARD_STOP）
3. 三层防御补全：
   - 第一层：步骤就近的"无例外"条款
   - 第二层：关键禁令的"违反字面=违反精神"措辞
   - 第三层：Red Flags 表扩展（覆盖新借口）
4. 嵌入通用 §3.5.1 git 自救禁令（就近触发命令前）
5. 嵌入 alloy §5.2 特定禁令（git add 限路径 / memory 批量 / phase 推进降级）
6. 流程图（dot 格式，吃掉 task #5）
7. 处理该 skill 剩余 P1/P2 task

**重写检查清单：** 严格按 alloy 指南 §6 执行（必检 17 项 + 推荐 6 项）。

### 3.5 task 与阶段对应表

| 阶段 | tasks |
|------|-------|
| 阶段 1 commit 1 | #8 #9 #20 |
| 阶段 1 commit 2 | #10 |
| 阶段 1 commit 3 | #23 #24 #25 |
| 独立 | #11 |
| 阶段 2 archive | #14 #21 #22（剩余 archive P1/P2） |
| 阶段 2 finish | #13 #14 #26 #27（剩余 finish P1/P2） |
| 阶段 2 apply | #17 #18 #19（剩余 apply P2） |
| 阶段 2 plan | #15 #16 |
| 阶段 2 start | #12 |
| 阶段 2 流程图 | task #5（archive/finish 流程图，apply/plan/start 复用现有 HTML 设计稿） |

注：task #14（多 change 并行调度 WARN）跨 archive 和 finish，重写时同款代码分别嵌入两个 skill。

---

## 四、验证策略

### 4.1 阶段 1 验证

每个 commit 提交前：
1. `npm test` 通过
2. `npm run build` 通过
3. 手动跑一次该 skill 的最小路径，确认补丁生效（merge 冲突造一个 / git status 故意脏一次 / git pull 模拟失败）
4. 手动确认无回归（其他 skill 流程仍工作）

### 4.2 阶段 2 验证

每个 skill 重写完成后：
1. 节点审计——按通用指南 §5.2.2 手段 1 输出对账报告，frontmatter 数字与正文一致
2. 压力场景重放——按通用指南 §5.2.2 手段 2 用三种压力组合（时间+沉没成本 / 权威+务实 / 疲惫+社交）测试
3. 跨 skill 链路追踪——按通用指南 §5.2.2 手段 3 检查同隐患是否跨 skill 重现（应该已被通用禁令覆盖）
4. `npm test` + `npm run build` 通过
5. 完整 5 阶段流程跑一遍（用真实小 change 走 start → plan → apply → archive → finish）

### 4.3 最终验证（阶段 2 全部完成后）

- 5 个 skill frontmatter 数字与正文实际节点数 100% 对账
- 20 个 backlog task 100% 解决（或明确归档"暂不修"）
- 通用指南 §3.5 通用禁令清单中的 git 自救禁令在 5 个 skill 全部嵌入
- alloy 指南 §5.2 三条特定禁令在相关 skill 嵌入
- `wc -l` 五个 skill 主文件均 < 300 行（通用指南 §6.1）

---

## 五、风险与缓解

| 风险 | 缓解 |
|------|------|
| 阶段 1 补丁与阶段 2 重写产生冲突 | 阶段 1 补丁刻意"只插不删"，阶段 2 重写时可推翻整段重做 |
| 阶段 2 串行耗时长 | archive 是模板，建立后后续 4 个是"复制 + 适配"——预计 archive 占 40%，其他 4 个共占 60% |
| 流程图工作量爆炸 | 阶段 2 重写时同步画图，复用 start/plan/apply 已备份的 HTML 设计稿；archive/finish 新画 |
| 重写期 frontmatter 不一致 | 阶段 1 不改 frontmatter；阶段 2 一次性按新四字段写入，不存在中间状态 |
| 5 阶段链路 e2e 回归 | 每个 commit 后跑完整 5 阶段最小用例（用一个 hello-world 级别 change） |

---

## 六、决策记录

完整 brainstorming 决策链：

| Q | 内容 | 决策 |
|---|------|------|
| Q1 | 通用指南 4 类术语用纯文本还是 emoji | C：通用纯文本，alloy 项目保持 emoji |
| Q2 | "🔴 STOP" 重命名 | A：USER_GATE |
| Q3 | 通用禁令模式位置 | A：新开通用 §3.5 |
| Q4 | alloy 检查清单结构 | C：单源引用 + alloy 增量分必检/推荐 |
| Q5 | behaviors 字段方案 | B：新四字段 + 5 skill 重写时迁移 |
| Q6 | USER_GATE 工具对应 | A：CC 必须用 AskUserQuestion，其他平台降级 |
| Q7 | 项目规范附录目标值 | C：只列现状偏离，不写应有目标 |
| Q-A | 隐患 task 范围 | A2：全部 20 条 |
| Q-B | 已被指南收编的隐患 | B2：单独 task，描述指向指南条款 |
| Q-C | task 依赖关系 | C1：不建依赖，独立 task |
| Q-D | discard 软删除归属 | D3：独立任务并行 |
| Q-E | 阶段 1 commit 粒度 | E2：按 skill 拆 commit |
| Q-F | 阶段 2 是否写 design doc | F2：不写，直接按 alloy 指南 §6 重写 |
| Q-G | 是否立即写 design 文档 | G1：立即写（即本文档） |

---

## 七、参考

- 通用指南 4 章节补丁 commit：`86d170f`
- alloy 项目规范 commit：`579373a`
- WIP 工作笔记（2026-06-13 brainstorming 过程）：[2026-06-13-skills-test-design-wip.md](2026-06-13-skills-test-design-wip.md)
- 旧 design：[2026-06-12-alloy-gate-hardening-design.md](2026-06-12-alloy-gate-hardening-design.md)（13 处闸门补强，已部分落地）
- 流程图设计稿（备份）：`.superpowers/brainstorm/93857-1781303162/content-v2/`
