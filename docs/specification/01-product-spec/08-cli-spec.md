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
   - agent 矩阵(动作标注):agent × 5 类产物(OpenSpec Commands / Superpowers Skills / Alloy Skills / hooks / permissions),标注将装/将升级/breaking/skip
   - 项目资源列表:openspec/ / .gitignore / .gitattributes / pre-commit / settings.json / shell 补全 / git init / 初始 commit
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
| `alloy _state` | `read\|write\|init\|merge\|check\|timestamp` | 读写 `.alloy.yaml` 状态文件。`init` 支持 `--at <timestamp>` 回填顶层 `started_at` + `--feature-branch <name>` 一次成型写入 feature_branch。**受管字段拦截**:`records`/`skill_usage`/`phase_timings` 禁 `write`/`merge`;`phase` 禁 `write`(走 `_phase start/complete` 或 `_guard --apply`,逃生阀 `ALLOY_FORCE_PHASE=1`);`worktree`/`worktree_branch`/`worktree_created_at` 实际值只能在 worktree 内写(主仓写 `null`/`skipped` 允许) |
| `alloy _skill` | `log\|skip` | 技能使用记录管理，持久化到 `skill_usage[]`。字段 `called_at`（调用时间，多次调用更新为最新）+ `count`（累加）。`log` 同一 skill+stage 已存在时 count++ |
| `alloy _guard` | `precheck\|verify-passed\|branch-position\|worktree-status\|user-gate` + `<name> <phase> --apply` | 阶段转换校验 + phase 推进 + USER_GATE 闸门(`user-gate require/pass`,配合 hook-guard 拦截 agent 跳过用户确认) |
| `alloy _phase` | `start\|complete\|reset` | 阶段时间记录 + phase 推进。`start` 推进到 -ing（进行中）+ 写 started_at，`complete` 推进到 -ed（已完成）+ 写 completed_at，`complete finish` 额外写顶层 `completed_at`（全周期完成时间） |
| `alloy _verify` | `phase-enter\|phase-exit <phase> <change-dir>` | 阶段转换状态校验——CLI 确定性校验制品 + state 字段 + 目录位置,不替代 agent 执行,只报告缺失项。`phase-enter` 期望 phase=-ing(进入阶段后),`phase-exit` 期望 phase=-ing(_phase complete 之前,尚未推进到 -ed)。比 `_guard precheck`(单点 phase 路由)更全面。空参数(如 bash 变量未设置)报 `⛔ [PRECONDITION_FAIL] 参数缺失` + 指明哪个参数空 + bash 变量提示 |
| `alloy _record` | `compute\|write\|check\|approver` | 制品 hash 记录管理 |
| `alloy _config` | `read\|write` | 读写 `openspec/config.yaml` 项目级配置 |
| `alloy _checkpoint` | `create\|list\|switch\|clean` | 检查点管理。`create` 支持 `--kind brainstorming\|progress`（brainstorming-N 发起变更锚点 / progress-<ts> 放弃变更进度快照）+ `--reason <原因>`。tag message 含原因/制品/phase/commit数/时间。phase 限制：start/plan 全程允许，apply 早期（worktree 未创建 + SDD/EP 未启动）允许，apply 中后期 + archive/finish 禁止。`create` 校验 working tree clean（dirty 拒绝）；`switch` 用 `git checkout -B` 原子回退，输出 tag 指向的 records 状态（已锁定/缺失制品） |
| `alloy _retro` | `scaffold` | 从 `.alloy.yaml` + `git log` + `git tag` 权威生成 retrospective.md 的 §0 量化全景 + §4 技能审计，agent 只填定性章节。跨 session 中断也能完整生成 |
| `alloy _env` | `check` | 环境完整性检测（git 仓库 / openspec/config.yaml / schema.yaml / Alloy commands start.md），4 项任一缺失 exit(1) |
| `alloy _progress` | `artifacts` | 制品进度扫描，输出每个制品状态（done/missing/hash-mismatch/pending），供 plan/apply 决定从哪个制品开始 |
| `alloy _artifact` | `commit\|reset` | `commit` 原子完成 hash 计算 + records 写入 + git add 限路径 + commit（重复锁定且 hash 未变时跳过）；`reset` 清掉指定制品的 record |
| `alloy _archive` | `<change-dir>` | 归档原子命令:调用 openspec archive CLI + 校验 Delta Spec promote + 校验目录移动。agent 禁自行 mkdir/cp/mv 模拟 |
| `alloy _worktree-cleanup` | `<change-dir>` | worktree 清理原子命令:merge worktree 分支到 feature + remove worktree + branch -d + worktree_merged_at 记录。CLI 自己从 worktree 分支(`worktree-<change-name>`)读 state(用 `git show`),不依赖 agent 传参。agent 禁自行 git merge / worktree remove / branch -d 模拟。worktree remove 失败时,untracked 文件自动 `--force`(未进 git,删除不丢 commit);tracked 文件修改(非 .alloy.yaml)HARD_STOP 保护用户代码 |
| `alloy _spec-audit` | — | spec 审计工具,检测 skill frontmatter 与 spec 的 behaviors 字段漂移。详见 `alloy _spec-audit --help` |
| `alloy _hook-guard` | - | hook 适配器(Claude Code 的 PreToolUse,OpenCode 的 plugin tool.execute.before,Pi 的 tool_call 扩展)。从 stdin 读 JSON,判定 Write/Edit 是否允许,exit 0(放行)/2(拦截)。由 `alloy init` 自动装到 `.claude/settings.json`(PreToolUse)/`.opencode/plugins/alloy-guard.ts`(plugin)/`.pi/extensions/alloy-guard.ts`(tool_call 扩展)。拦截 alloy 项目非 apply/finishing/finished 阶段写源码(含无活跃 change,`src/`/`scripts/` 等),白名单放行(`openspec/`/`.alloy.yaml`/`.claude/`/`docs/`/`*.md` 等)。逃生阀 `ALLOY_FORCE_WRITE=1` |
| `alloy _pre-commit-check` | - | git pre-commit hook 适配器。读暂存文件(`git diff --cached --name-only`)+ 调 guardCheck 判定,exit 0(放行)/1(拦截)。由 `alloy init` 自动装到 `.git/hooks/pre-commit`。兜底 PreToolUse hook 盲区(agent 用 Bash 写文件绕过 Write/Edit)。逃生阀 `ALLOY_FORCE_WRITE=1` |
| `alloy _stop-guard` | - | Stop hook 适配器(Claude Code 的 settings.json Stop hook,OpenCode 的 plugin session.idle,Pi 的 agent_settled 扩展)。从 stdin 读 `last_assistant_message`,检测 USER_GATE 文本输出模式(🔴 USER_GATE 或 1./2.+确认/选项/选择),命中 exit 2 + stderr 阻止 agent 结束,stderr 反馈给 agent 改用平台原生交互工具。解决弱模型用文本输出代替平台原生交互工具的盲区(hook-guard 管不到,不写源码不触发)。由 `alloy init` 自动装到 `.claude/settings.json` 的 `hooks.Stop`,OpenCode plugin 的 `session.idle`,Pi extension 的 `agent_settled` 事件。逃生阀 `ALLOY_FORCE_STOP=1` |
| `alloy _precheck` | `--cmd <空格分隔>` `--skill <空格分隔>` | Skill/Command 预检(多 agent 适配)。读 `openspec/config.yaml` 的 `target_agents`,对每个 agent 检测对应路径:cmd 查横线格式(`opsx-explore.md`)或斜杠格式(`opsx/explore.md`)两种文件名;skill 复用 `detectSkill`(查 project skill -> user skill -> user plugin)。全部就绪 exit 0,任一缺失 exit 1 + 引导 `alloy init`。被 alloy-start/plan/apply/archive/finish/fix 在 PRECONDITION_FAIL 步骤调用,替代原 skill-precheck.md 写死 `.claude/` 路径的 bash 脚本(只支持 Claude Code) |
| `alloy _infra-commit` | `[--message <msg>]` | 基础设施 commit(多 agent 适配)。读 `target_agents`,动态推导 agent 目录(`.claude/`/`.opencode/`/`.pi/` + 共享 `.agents/`)+ 项目资源(`.gitignore`/`.gitattributes`/`openspec/`/`opencode.json`/`CLAUDE.md`/`AGENTS.md`),逐个 `git add`(文件不存在跳过)+ `git commit`(幂等,无暂存跳过)。被 alloy-start 在 change 创建后调用,替代原 SKILL.md 写死 `git add .claude/` 的 bash(只支持 Claude Code) |
