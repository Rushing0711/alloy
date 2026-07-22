---
behaviors:
  preconditions: 0
  hard_stops:    0
  user_gates:    0
  warns:         0
  artifacts: []
  transitions_to: ""
  external_calls: []
---

# Alloy CLI 命令行为规格

对应源码：`src/cli/commands/`

## alloy status

```
/alloy-status [name]（省略时显示所有活跃 change 总览）

输出指定 change 详情:
  阶段:    planned
  Change:  login-feature
  路径:    openspec/changes/login-feature/
  创建时间: 2026-05-28 09:00:00
  更新时间: 2026-05-28 15:30:00
  Worktree: .worktrees/login-feature/
  制品状态:
    draft     ✓
    proposal  ✓
    design    ✗
    specs     ✗
    tasks     ✗
    plans     ✗
  下一步:   等待 /alloy-apply

一致性检查（worktree 残留 / 孤儿 / git worktree list 孤立）由 `alloy doctor` 提供,不在 status 中自动附带。运行 `alloy doctor` 查看完整诊断。
```

## alloy doctor

```
alloy doctor [path] [--json]

诊断内容:
  1. 版本兼容性（7 项健康检查）:
     Node.js / OpenSpec / Superpowers / Alloy / Schema / Commands / Environment
     每项返回 pass / warn / fail，依据 compat.yaml 中的版本约束判断
     
     Superpowers 检测顺序:项目 skill → 用户 skill → 用户级 plugin → installed_plugins.json → npx skills list(覆盖手动安装到 ~/.claude/skills/ 的场景;手动安装无版本号时 compatible=true 不误报)

  2. 文件一致性（双向检查）:
     ├── worktree 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留"
     ├── worktree 字段为 null 但 .claude/worktrees/<name>/ 或 .worktrees/<name>/ 目录存在 → ⚠️ "worktree 孤儿"（状态写入缺失）
     └── git worktree list 中有孤立 worktree → ⚠️ 提示清理

  3. Agent 保护层级(检测项目装了哪些 agent + 各 agent 的保护):
     - hook 真闸门:装了 PreToolUse 等价 hook(Claude Code 的 PreToolUse,OpenCode 的 plugin tool.execute.before,Pi 的 tool_call 扩展,绝对路径正确)
     - 仅 skill(无 hook,保护降级):装了 alloy skill 但无 hook(任一 agent 未装 hook 或 hook 配置无效)
     - 检测逻辑:遍历 KNOWN_AGENTS,<agentDir>/skills/alloy-start/SKILL.md 存在 = 装了 skill;hasHookConfig 严格检测绝对路径 hook

--json: 以 JSON 格式输出 healthResults + consistencyWarnings + agentProtection
```

## alloy init

详见 00-overview.md"七、安装与初始化"章节。

```
alloy init [path] [--scope <project|global>] [--agents <id,id,...>] [--force]
```

选项:
- `--scope <project|global>`:安装范围,默认 `project`(交互式选择)
- `--agents <id,id,...>`:非交互式指定目标 agent(逗号分隔)。可用 agent:`claude-code, opencode, pi`
- `--force`:强制跳过所有确认(含 breaking 双重确认),直接执行

4 阶段流程:

1. **采集(collect)**:无交互,只读检测
   - Node 18+ / Git 2.20+ 硬校验(compat.yaml),不满足 exit(1)
   - 目录拒绝:$HOME + $HOME 下隐藏目录(以 . 开头),不满足 exit(1)
   - git 仓库状态:是否存在 / HEAD 是否 unborn / 已有 main_branch(从 openspec/config.yaml)
   - OpenSpec CLI 版本:是否需升级(不满足 compat.yaml)

2. **选择**:3 个交互
   - 范围(scope):Project / Global,默认 Project
   - 目标 agent(targetAgents):多选,3 个 agent(claude-code/opencode/pi)
   - 主分支名(mainBranch):已配置跳过,否则检测值/自定义

3. **规划 + 展示 + 确认**:无交互规划 + 1 个确认
   - agent 矩阵(动作标注):agent × 2 类 agent 专有产物(Superpowers Skills / Alloy Skills),标注将装/将升级/breaking/skip
   - 项目资源列表:openspec/ / openspec-commands / .gitignore / .gitattributes / pre-commit / hook / permissions / question-extension / shell 补全 / git init / 初始 commit(hook/permissions/question-extension 按 targetAgents 分派到对应 agent 目录)
   - breaking 警告(如有):不满足 compat.yaml 约束的产物
   - 确认逻辑:无 breaking 默认 Yes;有 breaking 双重确认默认 No;--force 跳过

4. **执行(execute)**:幂等
   - 按 ActionPlan 执行,每步检测已有 -> 决定动作
   - 硬错误(git init/OpenSpec CLI/openspec init 失败)exit(1)
   - 软错误(Superpowers 部分失败/permissions/补全失败)warn 继续
   - OpenCode command wrapper:目标 agent 含 opencode 时,额外在 `.opencode/commands/`(project)或 `~/.config/opencode/commands/`(global)装 8 个 `alloy-{start,plan,apply,archive,finish,fix,status,discard}.md` wrapper。OpenCode 的 `/` 只列 commands,skills 不在 `/` 列表(需 agent 调 `skill({ name })` 工具加载);wrapper 内容指示 agent 调 skill 工具加载对应 alloy skill,从而 `/alloy-start` 等 slash command 能间接触发 skill

版本管理:
- **`.alloy-version`**:`deploySkills` 时写入当前 alloy 包版本。再次 `init` 时用 semver.satisfies 判断兼容性(compat.yaml `compatible.alloy`)
- **compat.yaml 为准**:所有版本兼容性判断用 `semver.satisfies(version, constraint)`,废弃 semver 约定(0.x breaking/跨 major breaking)
- **breaking 判定**:不满足 compat.yaml 约束(含低于最低和高于最高)= breaking

## alloy update

详见 00-overview.md"七、安装与初始化 > alloy update"章节。

## 内部命令

| 命令 | 子命令 | 说明 |
|------|--------|------|
| `alloy _state` | `read\|write\|init\|merge\|check\|timestamp` | 读写 `.alloy.yaml` 状态文件。`init` 支持 `--at <timestamp>` 回填顶层 `started_at` + `--feature-branch <name>` 一次成型写入 feature_branch。**受管字段拦截**:`records`/`skill_usage`/`phase_timings` 禁 `write`/`merge`;`phase` 禁 `write`(走 `_phase start/complete` 或 `_guard --apply`,降级用 `_phase downgrade`,逃生阀 `ALLOY_FORCE_PHASE=1`);`worktree`/`worktree_branch`/`worktree_created_at` 实际值只能在 worktree 内写(主仓写 `null`/`skipped` 允许) |
| `alloy _skill` | `log\|skip` | 技能使用记录管理，持久化到 `skill_usage[]`。字段 `called_at`（调用时间，多次调用更新为最新）+ `count`（累加）。`log` 同一 skill+stage 已存在时 count++。**worktree cwd 守卫**:worktree 模式下必须在 worktree 内执行(OpenCode 需传 workdir 或显式 cd;Pi 不支持 worktree 不触发),主仓执行 exit 1,逃生阀 `ALLOY_FORCE_WORKTREE=1` |
| `alloy _guard` | `precheck\|verify-passed\|branch-position\|worktree-status\|user-gate\|main-clean\|parallel-phase\|dirty-check` + `<name> <phase> --apply` | 阶段转换校验 + phase 推进 + USER_GATE 闸门(`user-gate require/pass/reset`,配合 hook-guard 拦截 agent 跳过用户确认)。**`user-gate require/pass/reset` 实现细节**:用 `setPendingGate` 精准替换 `pending_gate` 行(正则替换,不触发 writeState 全量重写,保留 worktree_created_at 等字段引号);**不自动 commit**(pending_gate 作为临时状态,由下一个 `_artifact commit` / `_phase complete` 等命令的 `git add .alloy.yaml` 一起 commit,合并到有意义的 commit,避免 USER_GATE 独占 commit 噪音)。**`user-gate require/pass/reset` worktree cwd 守卫**:worktree 模式下必须在 worktree 内执行,主仓执行 exit 1。守卫双重检测:① state.worktree 字段有值;② git worktree list 有 `worktree-<change-name>` 分支(补救主仓 state 没同步 worktree 分支的盲区)。**前置 gate 检查(防跳过闸门)**:`require apply:sdd-ep-choice` 时检查 `apply:worktree-choice` 是否在 `gate_history`(已通过),未在则 exit 1--SKILL.md HARD_STOP 对 agent 不够强,实测 agent 跳过 worktree-choice 直接设 sdd-ep-choice,CLI 层硬约束兜底。**gate_history 写入时机**:`user-gate pass` / hook-guard clearAllPendingGates / Pi 自动通过 时把 gate 加入 `gate_history`(用 `addClearedGate` 精准追加,不触发 writeState 全量重写)。**gate_history 移除时机**:`user-gate reset` 时把 gate 从 `gate_history` 移除(用 `removeClearedGate` 精准移除)+ 重新设为 `pending_gate`--用户在 USER_GATE 选"暂停/取消/需要调整"后,hook-guard 已无条件 clear pending_gate + 加入 gate_history(把"暂停"语义吞了),agent 调 reset 恢复 gate 状态。**Pi 自动通过**:`PI_CODING_AGENT=true` 时 `apply:worktree-choice` / `apply:sdd-ep-choice` 不设 pending_gate,直接返回自动通过 + 输出路径引导(`-> 走 skipped 路径` / `-> 走 EP 路径`)+ 写入 gate_history(供后续 gate 前置检查)--Pi 不支持 worktree / SDD,SKILL.md 不再做 Pi 软约束(避免 Claude Code/OpenCode 多读 Pi 分支) |
| `alloy _phase` | `start\|complete\|reset\|downgrade` | 阶段时间记录 + phase 推进。`start` 推进到 -ing（进行中）+ 写 started_at + **检查上阶段 phase-complete gate 已通过**(进入新阶段 = 上阶段已确认完成),`complete` 推进到 -ed（已完成）+ 写 completed_at，`complete finish` 额外写顶层 `completed_at`（全周期完成时间）。**`start` 含上阶段 gate 检查(防跳过闸门)**:进入 plan/apply/archive/finish 时,检查上阶段 `<prev>:phase-complete` 是否在 `gate_history`(已通过),未在则 exit 1--SKILL.md HARD_STOP 对 agent 不够强,实测 agent 跳过 apply:phase-complete 直接 _phase start archive,CLI 层硬约束兜底。start 无上阶段,不检查。**`complete` 含 gate 下沉检查**:推进前检查当前阶段是否有未 clear 的 pending_gate(格式 `<phase>:<action>`),未 clear 时 exit 1 拒绝推进,强制先调问答工具或 `user-gate pass`。**`downgrade <change-dir> <to-phase>`**:降级 phase(绕过 _state write 拦截,内部完成 state 写入 + commit),用于 _phase complete 失败后的 §5.2.3 路径 B 降级。校验降级合法性(只能降级到前一个 phase:planned->started / applied->planned / archived->applied / finished->archived)。替代 `ALLOY_FORCE_PHASE=1 alloy _state write phase` 逃生阀 |
| `alloy _verify` | `phase-enter\|phase-exit <phase> <change-dir>` | 阶段转换状态校验——CLI 确定性校验制品 + state 字段 + 目录位置,不替代 agent 执行,只报告缺失项。`phase-enter` 期望 phase=-ing(进入阶段后),`phase-exit` 期望 phase=-ing(_phase complete 之前,尚未推进到 -ed)。比 `_guard precheck`(单点 phase 路由)更全面。空参数(如 bash 变量未设置)报 `⛔ [PRECONDITION_FAIL] 参数缺失` + 指明哪个参数空 + bash 变量提示 |
| `alloy _record` | `compute\|write\|check\|scan\|approver` | 制品 hash 记录管理。`scan` 批量校验(默认 draft/proposal/design/specs/tasks/plans,任一失败 exit 1) |
| `alloy _config` | `read\|write` | 读写 `openspec/config.yaml` 项目级配置 |
| `alloy _checkpoint` | `create\|list\|switch\|clean` | 检查点管理。`create` 支持 `--kind brainstorming\|progress`（brainstorming-N 发起变更锚点 / progress-<ts> 放弃变更进度快照）+ `--reason <原因>`。tag message 含原因/制品/phase/commit数/时间。phase 限制：start/plan 全程允许，apply 早期（worktree 未创建 + SDD/EP 未启动）允许，apply 中后期 + archive/finish 禁止。`create` 校验 working tree clean（dirty 拒绝）；`switch` 内部自动清理未提交 tracked 变更(`git restore --staged .` + `git restore .`,CLI 跑不经过 hook;untracked 保留 agent 重新生成时覆盖)+ `git checkout -B` 原子回退，输出 tag 指向的 records 状态（已锁定/缺失制品） |
| `alloy _retro` | `scaffold` | 从 `.alloy.yaml` + `git log` + `git tag` 权威生成 retrospective.md 的 §0 量化全景 + §4 技能审计，agent 只填定性章节。跨 session 中断也能完整生成 |
| `alloy _env` | `check` | 环境完整性检测（git 仓库 / openspec/config.yaml / schema.yaml / Alloy skills(alloy-start/SKILL.md)），4 项任一缺失 exit(1) |
| `alloy _progress` | `artifacts` | 制品进度扫描，输出每个制品状态（done/missing/hash-mismatch/pending），供 plan/apply 决定从哪个制品开始 |
| `alloy _artifact` | `commit\|reset` | `commit` 原子完成 hash 计算 + records 写入 + git add 限路径 + commit（重复锁定且 hash 未变时跳过）；`reset` 清掉指定制品的 record。**worktree cwd 守卫**:`commit` 在 worktree 模式下必须在 worktree 内执行(OpenCode 需传 workdir 或显式 cd;Pi 不支持 worktree 不触发),主仓执行 exit 1,逃生阀 `ALLOY_FORCE_WORKTREE=1` |
| `alloy _archive` | `<change-dir>` | 归档原子命令:调用 openspec archive CLI + 校验 Delta Spec promote + 校验目录移动。agent 禁自行 mkdir/cp/mv 模拟。成功输出 `-> ARCHIVE_DIR=openspec/changes/archive/<date>-<name>` 供后续步骤解析。**兜底**:agent 跳过 archive SKILL.md Step 1 的 `_phase start` 时,自动在新路径写 `phase_timings.archive.started_at` + 推进 `phase=archiving`(幂等) |
| `alloy _archive-dir` | `<change-name>` | 输出归档后目录路径(`openspec/changes/archive/<YYYY-MM-DD>-<name>`)。agent 用 `ARCHIVE_DIR=$(alloy _archive-dir <name>)` 替代手抄 `ls -d ... \| sort -r \| head -1` 内联计算--Pi/OpenCode bash 无 shell state 持久化,跨 bash 调用变量会丢;手抄易漏(OpenCode 实测 1/11 次遗漏导致空参错误)。`endsWith` 精确匹配,按日期降序取最新 |
| `alloy _worktree-create` | `<change-dir>` | worktree 创建原子命令(OpenCode 用;Claude Code 用 EnterWorktree 工具;Pi 不支持 worktree 不调):git worktree add `.worktrees/<change-name>` -b `worktree-<change-name>` + worktree 内 `_state write` worktree/worktree_branch/worktree_created_at 三字段 + commit。校验:主仓 + feature 分支 + 工作目录清洁 + .worktrees/ 在 .gitignore + worktree 分支不存在。agent 禁自行 git worktree add / _state write worktree 字段 / mkdir .worktrees 模拟。**禁用 feature 分支名建 worktree**(feature 分支已存在且已被主仓 checkout,fatal),worktree 分支名约定 `worktree-<change-name>` |
| `alloy _worktree-cleanup` | `<change-dir>` | worktree 清理原子命令:merge worktree 分支到 feature + remove worktree + branch -d + worktree_merged_at 记录。CLI 自己从 worktree 分支(`worktree-<change-name>`)读 state(用 `git show`),不依赖 agent 传参。agent 禁自行 git merge / worktree remove / branch -d 模拟。worktree remove 失败时,untracked 文件自动 `--force`(未进 git,删除不丢 commit);tracked 文件修改(非 .alloy.yaml)HARD_STOP 保护用户代码。**merge 进行中识别**:若 `.git/MERGE_HEAD` 存在(上次 merge 成功但 commit 被拦截),跳过 dirty 检查和重新 merge,直接用 `ALLOY_FORCE_WRITE=1 git commit --no-edit` 完成 merge commit |
| `alloy _finish-cleanup` | `<change-dir> <feature-branch>` | finish 阶段 squash merge 后原子删除 feature 分支(下沉 `git branch -D` 到 CLI)。前置:agent 已在 finish:confirm-merge USER_GATE 二次确认 + squash merge + commit 完成。为何下沉:hook-guard 拦截 `git branch -D`(§3.5.1 禁令),agent 不能直接跑;CLI 内部跑不经过 hook,可安全执行。校验链(任一失败 exit 1):feature-branch 变量已替换(非模板占位符)+ 不等于 main/master(防误删主分支)+ 分支存在 + 当前在 main 分支 + main 最近 5 个 commit 含 "squash merge" 痕迹。通过校验后 `git branch -D "<feature-branch>"` |
| `alloy _spec-audit` | — | spec 审计工具,检测 skill frontmatter 与 spec 的 behaviors 字段漂移。详见 `alloy _spec-audit --help` |
| `alloy _hook-guard` | - | hook 适配器(Claude Code 的 PreToolUse,OpenCode 的 plugin tool.execute.before,Pi 的 tool_call 扩展)。从 stdin 读 JSON,判定 Write/Edit 是否允许,exit 0(放行)/2(拦截)。由 `alloy init` 自动装到 `.claude/settings.json`(PreToolUse)/`.opencode/plugins/alloy-guard.ts`(plugin)/`.pi/extensions/alloy-guard.ts`(tool_call 扩展)。拦截 alloy 项目非 apply/finishing/finished 阶段写源码(含无活跃 change,`src/`/`scripts/` 等),白名单放行(`openspec/`/`.alloy.yaml`/`.claude/`/`docs/`/`*.md` 等)。**检测问答工具调用**(`AskUserQuestion`/`question`/`alloy-question`)自动 clear 所有 pending_gate--扫描主仓 + 所有 git worktree(`git worktree list` 兜底,不依赖主仓 state.worktree 字段:OpenCode hook-guard 在主仓执行,主仓 .alloy.yaml 的 worktree 字段为 null,worktree state 只在 worktree 分支写),用 `setPendingGate` 精准替换(不触发 writeState 全量重写,保留 worktree_created_at 等字段引号)。**worktree 路径拦截**:worktree 模式下 write/edit 源码/制品必须用 worktree 绝对路径前缀,相对路径/主仓绝对路径拦截 exit 2(OpenCode write/edit 与 bash 独立进程,不共享 cwd;Pi 不支持 worktree 不触发)。逃生阀 `ALLOY_FORCE_WRITE=1` |
| `alloy _pre-commit-check` | - | git pre-commit hook 适配器。读暂存文件(`git diff --cached --name-only`)+ 调 guardCheck 判定,exit 0(放行)/1(拦截)。由 `alloy init` 自动装到 `.git/hooks/pre-commit`。兜底 PreToolUse hook 盲区(agent 用 Bash 写文件绕过 Write/Edit)。**merge 进行中(.git/MERGE_HEAD 存在)放行**:merge commit 的文件已在 worktree 分支审查过。逃生阀 `ALLOY_FORCE_WRITE=1` |
| `alloy _stop-guard` | - | Stop hook 适配器(Claude Code 的 settings.json Stop hook,OpenCode 的 plugin session.idle,Pi 的 agent_settled 扩展)。从 stdin 读 `last_assistant_message`,检测 USER_GATE 文本输出模式(🔴 USER_GATE 或 1./2.+确认/选项/选择),命中 exit 2 + stderr 阻止 agent 结束,stderr 反馈给 agent 改用平台原生交互工具。解决弱模型用文本输出代替平台原生交互工具的盲区(hook-guard 管不到,不写源码不触发)。由 `alloy init` 自动装到 `.claude/settings.json` 的 `hooks.Stop`,OpenCode plugin 的 `session.idle`,Pi extension 的 `agent_settled` 事件。逃生阀 `ALLOY_FORCE_STOP=1` |
| `alloy _precheck` | `--cmd <空格分隔>` `--skill <空格分隔>` | Skill/Command 预检(多 agent 适配)。读 `openspec/config.yaml` 的 `target_agents`,对每个 agent 检测对应路径:cmd 查横线格式(`opsx-explore.md`)或斜杠格式(`opsx/explore.md`)两种文件名;skill 复用 `detectSkill`(查 project skill -> user skill -> user plugin)。全部就绪 exit 0,任一缺失 exit 1 + 引导 `alloy init`。被 alloy-start/plan/apply/archive/finish/fix 在 PRECONDITION_FAIL 步骤调用,替代原 skill-precheck.md 写死 `.claude/` 路径的 bash 脚本(只支持 Claude Code) |
| `alloy _infra-commit` | `[--message <msg>]` | 基础设施 commit(多 agent 适配)。读 `target_agents`,动态推导 agent 目录(`.claude/`/`.opencode/`/`.pi/` + 共享 `.agents/`)+ 项目资源(`.gitignore`/`.gitattributes`/`openspec/`/`opencode.json`/`CLAUDE.md`/`AGENTS.md`),逐个 `git add`(文件不存在跳过)+ `git commit`(幂等,无暂存跳过)。被 alloy-start 在 change 创建后调用,替代原 SKILL.md 写死 `git add .claude/` 的 bash(只支持 Claude Code) |
| `alloy _branch` | `context\|create` | 分支上下文读取 + 分支创建验证。`context` 输出 JSON `{"main_branch","current_branch"}`(main_branch 未配置 PRECONDITION_FAIL);`create --feature <b> --main <m>` 原子完成 `git checkout -b` + 验证当前分支(失败 exit 1 回退 USER_GATE,不自动 reset)。合并 alloy-start Step 1 ①②④⑤(2+2 次 LLM -> 1+1 次),缓解轻量级模型 RPM 限流 |
| `alloy _change` | `create <name>` | OpenSpec change 目录创建 + 验证。原子完成目录冲突预检 + `openspec new change` + `.openspec.yaml` 验证(目录已存在 PRECONDITION_FAIL 走 USER_GATE;openspec 失败 [FAIL];.openspec.yaml 缺失 PRECONDITION_FAIL 禁 alloy 补写)。合并 alloy-start Step 2+3(3 次 LLM -> 1 次) |
| `alloy _start` | `precheck\|bootstrap\|finalize` | start 阶段多步 bash 序列下沉。`precheck <dir>` 原子完成 env check + status + precheck + git 校验,输出 `-> route: <unified|resume|abort>`;`bootstrap <dir> --start-at <ts> --opsx-new-at <ts> --feature-branch <b>` 原子完成 6 步(state init + infra-commit + skill log x2 + worktree write + phase start,两 --at 同值 HARD_STOP);`finalize <dir>` 原子完成 4 步(artifact commit + checkpoint + verify + phase complete,verify&&complete 短路保护内化)。合并 alloy-start Step 4-7(6 次 -> 1 次)+ Step 10(3 次 -> 1 次),缓解轻量级模型 RPM 限流的核心命令 |
