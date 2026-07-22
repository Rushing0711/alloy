# Alloy CLI 命令速查

> **权威参考**：本文件是 alloy CLI 命令的权威用法。调整 CLI 后必须同步更新本文件（见 CLAUDE.md 关键规则第 6 条）。skill md 调用 CLI 命令时，以本文件为准；不要凭记忆猜命令名/参数，先查本文件。

调用方式：`node dist/cli/index.js <command>`（本地开发）或 `alloy <command>`（已 link/安装）。

## 用户命令

面向终端用户，6 个。

### alloy init

初始化 Alloy 项目(4 阶段:采集 -> 选择 -> 规划+展示+确认 -> 执行)。

```
alloy init [path] [--scope <project|global>] [--agents <id,id,...>] [--force]
```

选项:
- `--scope <project|global>`:安装范围,默认 project(交互式选择)
- `--agents <id,id,...>`:非交互式指定 agent(逗号分隔)。可用:claude-code, opencode, pi
- `--force`:跳过所有确认(含 breaking 双重确认)
- `--help, -h`:显示帮助

流程:
1. 采集:Node 18+ / Git 2.20+ 硬校验 + 目录拒绝($HOME/隐藏目录)+ git 状态 + OpenSpec CLI 版本
2. 选择:范围 + 目标 agent + 主分支名(3 交互)
3. 规划+展示+确认:agent 矩阵(动作标注)+ 项目资源列表 + breaking 警告 + 确认(breaking 双重确认)
4. 执行:幂等安装,按 compat.yaml 判断兼容性

资源分类:
- agent 无关:Node/Git/目录/git 状态/OpenSpec CLI(采集校验,不装或 OpenSpec CLI 装)
- agent 相关:alloy skills/opsx/hook/permissions/Superpowers(矩阵,按 scope 装)
- 项目资源:openspec/.gitignore/.gitattributes/pre-commit/settings.json/shell 补全/git init/commit(总是装到当前目录)
- OpenCode 专属:目标 agent 含 opencode 时,额外装 8 个 command wrapper 到 `.opencode/commands/alloy-*.md`(project)或 `~/.config/opencode/commands/`(global)。OpenCode 的 `/` 只列 commands,skills 不在 `/` 列表;wrapper 指示 agent 调 `skill({ name })` 加载对应 alloy skill,让 `/alloy-start` 等 slash command 能间接触发 skill
- Pi 专属:目标 agent 含 pi 时,额外装 8 个 command wrapper 到 `.pi/prompts/alloy-*.md`(project)或 `~/.pi/agent/prompts/`(global)。Pi 的 `/` 只从 `.pi/prompts/` 加载 prompt template,skills 不自动触发(Pi 无 `skill({ name })` 工具);wrapper 指示 agent `read` 对应 `.pi/skills/alloy-*/SKILL.md`,让 `/alloy-start` 等 slash command 能间接触发 skill

示例:
```bash
alloy init                         # 交互式,当前目录,project 范围
alloy init /path/to/repo --scope global
alloy init --agents claude-code,opencode   # 非交互式
alloy init --force                 # 跳过所有确认(含 breaking),直接执行
```

### alloy status

查看活跃 change 总览，指定 name 查看详情。

```
alloy status [path|name] [options]
```

参数：
- `path`：项目路径（默认当前目录）
- `name`：change 名称（查看详情）

选项：
- `--json`：JSON 格式输出
- `--help, -h`：显示帮助

示例：
```bash
alloy status                       # 当前目录活跃 change 总览
alloy status user-auth             # 查看名为 user-auth 的 change 详情
alloy status --json                # JSON 输出（程序消费）
```

**易错**：查特定 change 用 `alloy status <name>`，**禁用 `--change`**（不支持）。

**输出含"当前 agent"行**：在 agent 上下文里运行时(CLAUDECODE/OPENCODE/PI_CODING_AGENT/ALLOY_AGENT env 已设),输出首行显示检测到的 agent;终端直接运行时不显示。

### alloy doctor

诊断：版本兼容性、文件一致性、agent 保护层级。

```
alloy doctor [path] [options]
```

选项：
- `--json`：JSON 格式输出
- `--help, -h`：显示帮助

输出含 "Agent 保护层级" 段(检测项目装了哪些 agent + 各 agent 的保护)：
- ✓ hook 真闸门:装了 hook(Claude Code 的 PreToolUse,Pi 的 tool_call 扩展,OpenCode 的 custom tool,绝对路径正确)
- ⚠️ 仅 skill(无 hook,保护降级)：装了 alloy skill 但无 hook(如 Pi/OpenCode,或 Claude Code 未装 hook / hook 配置无效)

### alloy update

刷新 init 写过的所有产物到当前 alloy 版本。从 `openspec/config.yaml` 读 `install_scope` + `target_agents`,复用 init 的矩阵展示 + execute 流程。用户模式额外升级 alloy CLI + OpenSpec CLI + Superpowers;开发模式跳过 npm/npx 升级。

```
alloy update [path] [--force]
```

选项:
- `--force, -f`:跳过确认,直接执行
- `--help, -h`:显示帮助

### alloy clean

清理 `alloy init` 装的产物。交互问 scope(project/global),按 scope 清理所有 init 装的产物:alloy skills(+ .alloy-version)/ OpenSpec Commands / OpenCode + Pi command wrapper / Superpowers / hook / permissions / .gitignore / .gitattributes / .pre-commit / openspec schema。只清 alloy 注入的部分,保留用户配置(specs/changes/用户 settings key/用户 gitignore 规则)。

```
alloy clean [path] [options]
```

选项:
- `--scope <project|global>`:清理范围,不传则交互式选择
- `--force, -f`:跳过确认,直接执行
- `--help, -h`:显示帮助

行为:
- 解析 scope(`--scope` 传参或交互问)
- 扫描将删除/修改的路径清单(按 scope)
- 展示清单 + 确认(空清单提示退出;`--force` 跳过)
- 执行删除:删 alloy-* 目录/.alloy-version/opsx 文件;改 settings.json/.gitignore/.gitattributes/openspec/config.yaml;删 .pre-commit/openspec/schemas/alloy
- Superpowers 清理:调 `npx skills remove obra/superpowers`(skill 散在多个目录,npx 一次清所有);失败不 fallback 删文件,提示用户手动

**不清 shell 补全**:`alloy completion` 是 alloy CLI 功能,不属于 init 产物,clean 不清。如需移除补全,手动编辑 `~/.zshrc` 删除 `source <(alloy completion ...)` 行。

**scope 互相独立**:选 project 清当前目录,选 global 清 $HOME;即使另一处已装,仍按本次 scope 清理。

### alloy completion

生成 shell 补全脚本。

```
alloy completion [shell] [options]
```

参数：
- `shell`：`bash` / `zsh` / `pwsh` / `powershell`（默认从 `$SHELL` 检测）

选项：
- `--install`：自动注册到 shell 配置文件（永久生效）
- `--help, -h`：显示帮助

示例：
```bash
alloy completion --install              # 自动安装（推荐）
source <(alloy completion zsh)          # 临时启用 zsh 补全
source <(alloy completion bash)         # 临时启用 bash 补全
```

## 内部命令（`_` 开头）

面向 skill md 编排，28 个。Agent 通过这些命令操作 state、推进 phase、锁定制品 hash、归档等。**Agent 不直接写 YAML**——必须通过 `_state` / `_artifact` / `_phase` 等原子命令操作 `.alloy.yaml`。

### alloy _state

读写 change 状态（`.alloy.yaml`）。受管字段（`records` / `skill_usage` / `phase_timings`）禁止用 `write` / `merge` 直接操作，必须用专用命令。

```
alloy _state <init|read|write|merge|timestamp|check> <change-dir> [field] [value]
```

子命令：
- `init <change-dir> [--at <ts>] [--feature-branch <branch>]`：非破坏性初始化（已存在则跳过）。`--at` 补录全周期开始时间；`--feature-branch` 记录 feature 分支
- `read <change-dir> <field>`：读字段（null 输出 `null`，对象/数组输出 JSON）
- `write <change-dir> <field> <value>`：覆盖写字段。**受管字段（records/skill_usage/phase_timings）被拦截**，改用 `_artifact commit` / `_skill log` / `_phase start|complete`
- `merge <change-dir> <field> <partial-json>`：深合并字段（新增 key 添加，已有 key 不覆盖，null sentinel 可覆盖）。**records / skill_usage 被拦截**
- `timestamp ensure <change-dir> <phase>`：幂等写 `phase_timings.<phase>.started_at`，已存在不覆盖，输出当前值
- `check <change-dir> <phase>`：校验当前 phase 是否等于期望值，不匹配 exit 1

字段值类型：
- `null` 字符串 → `null`
- `schema_version` → number
- `{...}` / `[...]` → JSON.parse
- 其他 → string

示例：
```bash
alloy _state init openspec/changes/user-auth
alloy _state read openspec/changes/user-auth phase
alloy _state write openspec/changes/user-auth feature_branch feature/user-auth
alloy _state write openspec/changes/user-auth feature_branch feature/user-auth --commit
alloy _state timestamp ensure openspec/changes/user-auth plan
alloy _state check openspec/changes/user-auth planned
```

`write --commit`:写 state 后原子完成 `git add .alloy.yaml` + `git commit -m "chore: _state write <field>"`(幂等,无变更跳过)。替代 SKILL.md 手写 `git add .alloy.yaml && git commit`。

### alloy _guard

阶段转换校验 + 多种子命令路由。

```
# phase 转换校验（原逻辑）
alloy _guard <change-dir> <target-phase> [--apply]

# 子命令
alloy _guard branch-position <change-dir>
alloy _guard verify-passed <change-dir>
alloy _guard precheck <change-dir> <expected-phase>
alloy _guard worktree-status <change-dir>
alloy _guard user-gate <require|pass|reset> <change-dir> [<gate-id>]
alloy _guard main-clean <change-dir>
alloy _guard parallel-phase <phase1,phase2,...> [--exclude <name>]
alloy _guard dirty-check [cwd]
```

子命令说明：
- **phase 转换**（无子命令关键字，直接传 change-dir + target-phase）：校验 `started→planned`、`planned→applied`、`applied→archived`、`archived→finished` 的合法性 + 制品完整性 + hash 一致性。`--apply` 通过则推进 phase
- `branch-position <change-dir>`：输出 `on-feature` / `on-main` / `feature-missing` / `feature-lost:<branch>` / `on-other:<current>`。退出码 0=位置正确，1=不正确
- `verify-passed <change-dir>`：读 verify.md 判定，输出 `PASS` / `FAIL` / `WARNING`。退出码 0=PASS/WARNING，1=FAIL。判定规则(`parseVerifyDecision`,retro scaffold 复用同一函数):行首 `- [x]` checkbox + ❌ FAIL -> FAIL;`- [x]` + ⚠️ WARNING -> WARNING;其他(含无标记或纯文本"WARNING: 无"字眼) -> PASS。**禁 grep 整个 verify.md**:OpenCode verify.md 含 "**WARNING:** 无" 描述会被旧 `/WARNING/i` 误判 WARNING
- `precheck <change-dir> <expected-phase>`：单点 phase 路由校验。`expected-phase` 支持逗号分隔多值（如 `planned,applied`）。输出 `PASS:<phase>` / `FAIL:<reason>`。退出码 0=通过，1=不通过
- `worktree-status <change-dir>`：输出 `done:<path>:<branch>` / `stale:<path>` / `skipped` / `pending`。退出码始终 0（查询命令）
- `user-gate require <change-dir> <gate-id>`：设 pending_gate,后续 Write/Edit 非白名单被 hook-guard 拦截(即使 apply 阶段),直到问答工具(AskUserQuestion/question/alloy-question)调用自动 clear,或手动 `user-gate pass` 降级。**实现**:用 `setPendingGate` 精准替换 `pending_gate` 行(正则替换),不触发 writeState 全量重写--保留 worktree_created_at 等字段引号格式;**不自动 commit**(pending_gate 作为临时状态,由下一个 `_artifact commit` / `_phase complete` 等命令的 `git add .alloy.yaml` 一起 commit,合并到有意义的 commit,避免 USER_GATE 独占 commit 噪音)。**worktree cwd 守卫**:worktree 模式下必须在 worktree 内执行,主仓执行 exit 1。守卫双重检测:① state.worktree 字段有值;② git worktree list 有 `worktree-<change-name>` 分支(补救主仓 state 没同步 worktree 分支的盲区)。**前置 gate 检查(防跳过闸门)**:`require apply:sdd-ep-choice` 时检查 `apply:worktree-choice` 是否在 `gate_history`(已通过),未在则 exit 1--SKILL.md HARD_STOP 对 agent 不够强,实测 agent 跳过 worktree-choice 直接设 sdd-ep-choice,CLI 层硬约束兜底。**gate_history 写入时机**:`user-gate pass` / hook-guard clearAllPendingGates / Pi 自动通过 时把 gate 加入 `gate_history`(用 `addClearedGate` 精准追加)。**Pi 自动通过**:`PI_CODING_AGENT=true` 时 `apply:worktree-choice` / `apply:sdd-ep-choice` 不设 pending_gate,直接返回自动通过 + 输出路径引导(`-> 走 skipped 路径` / `-> 走 EP 路径`)+ 写入 gate_history--Pi 不支持 worktree / SDD,SKILL.md 不再做 Pi 软约束(避免 Claude Code/OpenCode 多读 Pi 分支)。**覆盖节点**:start(lock-draft/phase-complete)+ plan(lock-`<artifact>`/phase-complete,5 个制品)+ apply(requirement-change/worktree-choice/sdd-ep-choice/lock-verify/lock-retrospective/phase-complete)+ archive(worktree-cleanup/delta-spec-review/phase-complete)+ discard(confirm-delete)+ finish(choose-method/confirm-merge)。制品锁定 + 阶段完成类 USER_GATE 必须设 pending_gate,防止 agent 用纯文本呈现代替问答工具
- `user-gate pass <change-dir>`：清除 pending_gate(手动降级 / 无问答工具的 agent)。用 `setPendingGate` 精准替换,不自动 commit(与 require 对称)。**pass 时把 cleared gate 加入 `gate_history`**(用 `addClearedGate`),供后续 gate 前置检查 + _phase start 检查
- `user-gate reset <change-dir> <gate-id>`：把 gate 从 `gate_history` 移除 + 重新设为 `pending_gate`。**用途**:用户在 USER_GATE 选"暂停/取消/需要调整"后,hook-guard 已无条件 clear pending_gate + 加入 gate_history(把"暂停"语义吞了),agent 调 reset 恢复 gate 状态。用 `removeClearedGate` 精准移除 + `setPendingGate` 重新设。**不自动 commit**(与 require/pass 对称)。**worktree cwd 守卫**:与 require/pass 对称。**幂等**:gate 不在 gate_history 时只设 pending_gate,不报错
- **gate 下沉检查**:`_phase complete <change-dir> <phase>` 在推进阶段前,会检查当前阶段是否有未 clear 的 pending_gate(格式 `<phase>:<action>`)。如果有,拒绝推进(exit 1),强制 agent 先调问答工具或 `user-gate pass`。这是"主动闸门下沉为被动检查"--无论 agent 是否主动调 `user-gate require`,只要推进阶段就必须 clear gate,接近 100% 强制
- **上阶段 phase-complete gate 检查(防跳过闸门)**:`_phase start <change-dir> <phase>` 进入 plan/apply/archive/finish 时,检查上阶段 `<prev>:phase-complete` 是否在 `gate_history`(已通过),未在则 exit 1。SKILL.md HARD_STOP 对 agent 不够强,实测 agent 跳过 apply:phase-complete 直接 _phase start archive,CLI 层硬约束兜底。start 无上阶段,不检查
- **hook-guard clearAllPendingGates 扫描 worktree 路径**:问答工具调用触发 hook-guard 清 pending_gate 时,扫描主仓 + 所有 git worktree(`git worktree list` 兜底,不依赖主仓 state.worktree 字段)。原因:OpenCode hook-guard 在主仓执行,主仓 .alloy.yaml 的 worktree 字段为 null(worktree state 只在 worktree 分支写),依赖主仓 worktree 字段定位会漏扫 worktree 内 .alloy.yaml,导致 worktree 内 pending_gate 永远不被 clear,agent 无法推进阶段。用 `setPendingGate` 精准替换,不触发 writeState 全量重写。collectPhases / collectPendingGates / collectWorktreePaths 同样用 `git worktree list` 兜底,确保 worktree 内 phase / pending_gate / worktree 路径被正确收集
- `main-clean <change-dir>`:检查主仓 git status 是否 clean(worktree 模式下,主仓应 clean)。读 .alloy.yaml 的 worktree 字段:skipped/null -> 输出 "skipped";worktree 模式 -> 检查主仓 git status --porcelain,非空 exit 1 + 输出 dirty 文件 + 修复路径,空输出 "✓ 主仓 clean"。主仓 root 推导:`git rev-parse --git-common-dir` 绝对路径(worktree cwd)-> dirname;相对路径(主仓 cwd)-> `git rev-parse --show-toplevel`。**用于** alloy-apply Step 2 完成前主仓清洁度校验(替代 24 行手写 bash)
- `parallel-phase <phase1,phase2,...> [--exclude <name>]`:扫描所有 change(活跃 + 归档),统计 phase 在指定列表中的数量。输出 `none` / `single:<name>` / `parallel:N` + change 列表。`--exclude <name>` 排除当前 change。exit 0 始终(WARN 不阻断)。**用于** alloy-plan/archive/finish 多 change 并行检测(替代 find+grep+wc 手写 bash)。归档 change 名剥离 `YYYY-MM-DD-` 前缀
- `dirty-check [cwd]`:检查工作目录 git status 是否 clean。dirty -> exit 1 + 输出 dirty 文件列表 + 修复提示(禁自动 reset --hard / checkout . 清场);clean -> 输出 "✓ 工作目录 clean"。缺参数时用 process.cwd()。**用于** alloy-start/plan 的 dirty 检测(替代手写 git status --porcelain)

允许的 phase 转换：`started→planned`、`planned→applied`、`applied→archived`、`archived→finished`。`-ing` 进行中态由 `_phase start/complete` 推进，**不通过 `_guard --apply`**。

### alloy _phase

阶段开始/完成/回溯。自动写 `phase_timings` + git add 限路径 + commit。

```
alloy _phase <start|complete|reset|downgrade> <change-dir> <phase>
```

子命令：
- `start <change-dir> <phase> [--at <ts>]`：幂等写 `started_at` + 推进到 `-ing` 态 + commit。`--at` 补录实际开始时间。**检查上阶段 phase-complete gate 已通过(防跳过闸门)**:进入 plan/apply/archive/finish 时,检查 `<prev-phase>:phase-complete` 是否在 `gate_history`(已通过),未在则 exit 1--SKILL.md HARD_STOP 对 agent 不够强,实测 agent 跳过 apply:phase-complete 直接 _phase start archive,CLI 层硬约束兜底。start 无上阶段,不检查。若 pending_gate 残留是 `<prev>:phase-complete`(已通过但未 clear),自动 clear
- `complete <change-dir> <phase>`：写 `completed_at` + 推进到 `-ed` 态 + commit。**前置：必须先 `_phase start`**（`started_at` 缺失则 PRECONDITION_FAIL）。**gate 下沉检查**:推进前检查当前阶段是否有未 clear 的 pending_gate(格式 `<phase>:<action>`,但 `<phase>:phase-complete` 放行--该 gate 由本命令自动设,重试 complete 时不应被拦),未 clear 时 exit 1 拒绝推进。**#3 自动设 gate**:commit 后自动设 `<phase>:phase-complete` pending_gate(非 finish 阶段),agent 调问答工具确认进下一阶段时 hook-guard 自动 clear + add gate_history--下沉避免 agent 漏设 gate(实测 OpenCode 会话 apply->archive 跳过 gate 被 HARD_STOP 拦)。finish 阶段无下一阶段,不设 gate。`finish` 阶段额外写顶层 `completed_at`
- `reset <change-dir> <phase>`：删除 `phase_timings.<phase>` 整个 key + commit（回溯清理专用，不存在则幂等跳过）
- `downgrade <change-dir> <to-phase>`：降级 phase(绕过 _state write 拦截,记录降级 commit)。替代 `ALLOY_FORCE_PHASE=1 alloy _state write phase` 逃生阀。校验降级合法性:只能降级到前一个 phase(planned->started / applied->planned / archived->applied / finished->archived / archiving->applied / planning->started)。用于 _phase complete 失败后的降级路径(§5.2.3 路径 B)

phase 取值：`start` / `plan` / `apply` / `archive` / `finish`。

`-ing` → `-ed` 映射：`starting→started`、`planning→planned`、`applying→applied`、`archiving→archived`、`finishing→finished`。

示例：
```bash
alloy _phase start openspec/changes/user-auth plan
alloy _phase complete openspec/changes/user-auth plan
alloy _phase reset openspec/changes/user-auth plan   # 回溯清理
```

### alloy _artifact

制品 hash-lock + git commit（原子操作）。

```
alloy _artifact <reset|commit> <change-dir> <artifact>
```

子命令：
- `commit <change-dir> <artifact>`：计算 hash + 写 records + `git add` 限路径 + commit。重复锁定（hash 未变）跳过；hash 变了（回溯后重新生成）允许重锁。commit message：首锁 `docs(<change>): 锁定 <artifact>`，重锁 `docs(<change>): 重锁 <artifact> [<old>-><new>]`。**worktree cwd 守卫**:worktree 模式下必须在 worktree 内执行(OpenCode 需传 workdir 或显式 cd),主仓执行 exit 1,逃生阀 `ALLOY_FORCE_WORKTREE=1`。Pi 不支持 worktree,不触发
- `reset <change-dir> <artifact>`：清除 hash 记录 + 删除制品文件（回溯重做制品时用）

制品 id 白名单（8 个）：
| id | 文件 |
|----|------|
| `draft` | `draft.md` |
| `proposal` | `proposal.md` |
| `design` | `design.md` |
| `specs` | `specs/`（目录，递归 hash） |
| `tasks` | `tasks.md` |
| `plans` | `plans.md` |
| `verify` | `verify.md` |
| `retrospective` | `retrospective.md` |

示例：
```bash
alloy _artifact commit openspec/changes/user-auth proposal
alloy _artifact reset openspec/changes/user-auth plans   # 回溯重做 plans
```

### alloy _verify

阶段转换状态校验（CLI 确定性校验，不替代 agent 执行，只报告缺失项）。比 `_guard precheck`（单点 phase 路由）更全面：校验 phase + 制品 + state 字段 + 目录位置。

```
alloy _verify phase-enter|phase-exit <phase> <change-dir>
```

- `phase-enter <phase> <change-dir>`：校验进入阶段（应处于 `-ing` 态）
- `phase-exit <phase> <change-dir>`：校验退出阶段（制品/state 字段齐全）

**易错**：只支持 `phase-enter` / `phase-exit` 两个子命令，**禁用 `run` 等其他子命令**。

支持的 phase：`start` / `plan` / `apply` / `archive` / `finish`。

校验规则（部分）：
- `plan-exit`：必须存在 `proposal` / `design` / `specs` / `tasks` / `plans` 制品 + `phase_timings.plan.started_at`
- `apply-exit`：必须存在 `verify` / `retrospective` 制品 + `phase_timings.apply.started_at`
- `archive-exit` / `finish-enter` / `finish-exit`：change 目录必须在 `archive/` 下

示例：
```bash
alloy _verify phase-enter plan openspec/changes/user-auth
alloy _verify phase-exit plan openspec/changes/user-auth
```

### alloy _progress

查询制品进度状态。

```
alloy _progress artifacts <change-dir>
```

输出每个制品的状态行（退出码始终 0，查询命令）：
- `<artifact>:done:<hash>`：文件存在 + hash 匹配
- `<artifact>:missing`：文件不存在
- `<artifact>:hash-mismatch:<old>!=<new>`：文件存在但 hash 不匹配
- `<artifact>:pending`：文件存在但无 record（未审批）

按固定顺序输出：`draft` / `proposal` / `design` / `specs` / `tasks` / `plans` / `verify` / `retrospective`。

### alloy _checkpoint

检查点（git tag）管理。回退锚点。

```
alloy _checkpoint <create|list|switch|clean> <change-dir> [...]
```

子命令：
- `create <change-dir> [--reason <原因>] [--kind <brainstorming|progress>]`：在当前 HEAD 打 tag。`--kind brainstorming` 打 `brainstorming-N`（N=现有数+1）；`--kind progress` 打 `progress-<ts>`；不传打 `<ts>`。**前置**：phase 允许（start/plan/apply 早期）+ working tree clean（拒绝 dirty）
- `list <change-dir> [--json]`：列出该 change 所有 checkpoint tag + 注释
- `switch <change-dir> <tag>`：`git checkout -B <feature-branch> <tag>` 强制重置分支到 tag。**前置**：phase 允许 + tag 属于当前 change + 不在 worktree 内
- `clean <change-dir> [--verify]`：删除该 change 所有 checkpoint tag(archive/discard/finish 时调用)。`--verify`:清理后再 list 残留 tag,有残留 exit 1(用于 finish 阶段强制校验,替代 13 行手写后置校验 bash)

phase 限制：仅 `start` / `plan` 阶段全程允许；`apply` 阶段仅当 worktree 未创建 + SDD/EP 未启动时允许；`archive` / `finish` 禁止。

tag 命名：`alloy-checkpoint-<change-name>-<ts>` / `-brainstorming-N` / `-progress-<ts>`。

### alloy _record

制品 hash 记录操作（底层命令，优先用 `_artifact commit`）。

```
alloy _record <write|check|scan|compute|approver> <change-dir> [artifact] [hash] [committed_at] [approver]
```

子命令：
- `write <change-dir> <artifact> <hash> <committed_at> <approver>`：写入/覆盖 record（不 git commit，底层操作）
- `check <change-dir> [artifact]`：校验 record hash 与当前文件 hash 是否一致。输出 `[PASS]` / `[FAIL]` / `[WARN]`(无 records 或 artifact 未找到时 `[WARN]` + exit 1)
- `scan <change-dir> [artifact...]`：批量校验（默认 `draft/proposal/design/specs/tasks/plans`）。任一失败 exit 1（HARD_STOP）
- `compute <change-dir> <artifact>`：计算并输出当前制品 hash（不写 record）
- `approver`：输出当前 git user.name（审批人）

### alloy _config

读写项目级配置（`openspec/config.yaml` 的 `alloy` 字段）。

```
alloy _config <read|write> <project-root> [field] [value]
```

子命令：
- `read <project-root> <field>`：读 `alloy.<field>`，null 输出 `null`
- `write <project-root> <field> <value>`：写 `alloy.<field>`

常用字段：`main_branch`（主分支名，默认 `main`）。

示例：
```bash
alloy _config read . main_branch
alloy _config write . main_branch master
```

### alloy _skill

记录 skill 使用情况（`skill_usage` 数组）。受管字段，禁止 `_state write` 直接操作。

```
alloy _skill <log|skip> <change-dir> <stage> <skill> [--via <source>] [--reason <reason>] [--at <ts>]
```

- `log`：记录使用。`--via` 标记调用来源；`--at` 补录实际使用时间（补录场景豁免 `started_at` 前置校验）。同一 skill+stage 组合幂等更新，`count` +1
- `skip`：记录跳过。`--reason` 推荐填写(代码不强制,但 retrospective §4 技能审计会引用)

stage 取值：`start` / `plan` / `apply` / `archive` / `finish`。


**worktree cwd 守卫**:worktree 模式下(apply 阶段 state.worktree 有值),必须在 worktree 内执行(OpenCode 需传 workdir 或显式 cd)。主仓执行 exit 1,逃生阀 `ALLOY_FORCE_WORKTREE=1`。Pi 不支持 worktree,不触发。
**前置**（非 `--at` 补录时）：`phase_timings.<stage>.started_at` 必须已存在——agent 跳过 `_phase start` 时早期拦截。

示例：
```bash
alloy _skill log openspec/changes/user-auth start opsx:explore --via start.md
alloy _skill skip openspec/changes/user-auth apply superpowers:tdd --reason "已有测试覆盖"
```

### alloy _env

环境完整性检测。

```
alloy _env check
```

**易错**：必须带 `check` 子命令，无子命令直接 exit 1。

检测 4 项基础设施，任一缺失 exit 1：
1. git 仓库
2. `openspec/config.yaml` 含 `schema: alloy`
3. `openspec/schemas/alloy/schema.yaml`
4. Alloy skills（按 agent 命名规则检测 `alloy-start/SKILL.md`）

### alloy _retro

生成 `retrospective.md` 骨架。

```
alloy _retro scaffold <change-dir>
```

自动填充 §0 量化全景（时间线/制品审批链/commit 汇总/阶段耗时/检查点/任务完成比/变更规模/worktree 状态/验证状态/计划策略/提交链）+ §4 全周期技能审计。agent 需补 §1/§2/§3/§5/§6/§7 定性分析。**验证状态判定**:与 `_guard verify-passed` 同一函数 `parseVerifyDecision`,精确匹配 `- [x]` + 标记,避免 grep "WARNING" 字眼误判(如 OpenCode verify.md 含 "**WARNING:** 无" 描述性文本不应标 WARNING)。**§7 自检提示**:覆盖 PRECONDITION_FAIL / HARD_STOP / cat heredoc / Bash 变量拆调用 / 重锁 hash 等典型偏差,明确"已修复的偏差也算偏差",防止 agent 把已修复偏差误判为非偏差。

### alloy _spec-audit

检测 skill 文件与 spec 文件的 `behaviors` frontmatter 差异。对账方向：skill → spec（skill 是真相源）。

```
alloy _spec-audit [--fix]
```

选项：
- `--fix`：交互式修复，逐条确认后用 skill 的值更新 spec frontmatter
- `--help, -h`：显示帮助

退出码：0=全部一致（或 `--fix` 修复后对齐），1=存在不一致。

### alloy _archive

归档 change（原子操作：调用 `openspec archive` CLI + 校验 Delta Spec promote + 校验目录移动）。**Agent 禁自行 mkdir/cp/mv 模拟归档——本命令是唯一合法路径。**

```
alloy _archive <change-dir>
```

行为：
- 检测 change 是否含 `specs/` 目录，无则传 `--skip-specs`
- 调用 `openspec archive <name> -y`（`-y` 必传，agent 非交互）
- 校验归档目录存在：`openspec/changes/archive/<YYYY-MM-DD>-<name>/`
- 校验每个 capability 的主 spec 已 promote
- **输出 `-> ARCHIVE_DIR=openspec/changes/archive/<date>-<name>` 引导行**,后续步骤(delta-spec-review USER_GATE、phase complete 等)用此路径,禁手写 `ls -d ... | sort -r | head -1`
- **兜底:agent 跳过 archive SKILL.md Step 1 的 `_phase start` 时,自动在新路径写 `phase_timings.archive.started_at` + 推进 `phase=archiving`**(幂等,agent 按流程执行 Step 1 时不覆盖)
- **内部完成归档 commit**:`git add openspec/specs/ openspec/changes/` + `git commit -m "chore(<name>): 归档目录移动"`(限路径 + 幂等,无 staged 改动跳过)。替代 SKILL.md 手写 `_chore-commit` 调用。commit 失败输出 ⚠️ 提示,agent 需手动修复

### alloy _archive-dir

输出归档后目录路径(`openspec/changes/archive/<YYYY-MM-DD>-<name>`)。agent 用 `ARCHIVE_DIR=$(alloy _archive-dir <name>)` 替代手抄内联计算--Pi/OpenCode bash 无 shell state 持久化,跨 bash 调用 `$ARCHIVE_DIR` 会丢;手抄 `ls -d ... | sort -r | head -1` 易漏(OpenCode 实测 1/11 次遗漏导致空参错误)。

```
alloy _archive-dir <change-name>
```

参数:
- `<change-name>`:change 名(如 `add-hello-script`),不是路径

行为:
- 找 `openspec/changes/archive/*-<name>` 目录(按名称降序取最新,日期格式 `YYYY-MM-DD` 字符串排序 = 日期排序)
- 找到 -> 输出相对路径(如 `openspec/changes/archive/2026-07-18-add-hello-script`),不带 `-> ARCHIVE_DIR=` 前缀,agent 直接 `ARCHIVE_DIR=$(alloy _archive-dir <name>)` 捕获
- 找不到 -> exit 1 + 引导
- `endsWith` 精确匹配:`test-change` 不误匹配 `test-change-v2`

多 agent 适配:Claude Code / OpenCode / Pi 都用此命令,无平台差异。

### alloy _chore-commit

原子完成 `git add --paths + git commit --message`(限路径 + 幂等)。替代 SKILL.md 里手写的 `git add <path> && git commit -m "..."` 裸 bash 序列(6 处:apply L106/L252/L272, archive L163/L351, finish L366)。

```
alloy _chore-commit <change-dir> --msg <message> --paths <p1,p2,...> [--cwd <dir>]
```

参数:
- `<change-dir>`:change 目录路径(如 `openspec/changes/<name>`)
- `--msg <message>`:commit message(支持多行,用 `\n` 分隔)
- `--paths <p1,p2,...>`:要 add 的文件路径(逗号分隔,**禁 `git add -A` / `git add .`**,必须显式列路径)
- `--cwd <dir>`:可选,git 命令的 cwd(默认 `process.cwd()`)

行为:
- `git add -- <p1> <p2> ...`(限路径)
- 检查 staged 改动(`git diff --cached --quiet`):无改动跳过 commit(幂等)
- `git commit -F <tmpfile>`(用 -F 文件方式提交,避免 heredoc + 变量展开在 Claude Code Bash(eval)触发 "command too long")
- 临时文件写在 `.git/alloy-chore-msg-<random>.txt`,commit 后删除

使用场景(SKILL.md 6 处可下沉):
- apply 阶段开始前状态快照(`.alloy.yaml`)
- skill log 后 commit worktree 创建前
- worktree skipped 决策 commit
- archive 前 `.alloy.yaml` 同步
- 归档目录移动 commit
- finish 延期 deferred_at commit

多 agent 适配:Claude Code / OpenCode / Pi 都用此命令,无平台差异。

### alloy _fix

alloy-fix skill 的辅助 CLI。目前支持关键词检测。

```
alloy _fix detect-keywords <description>
```

参数:
- `<description>`:要扫描的描述文本(可含空格,多参数会拼接)

行为:
- 扫描描述中的关键词:优化/性能/performance/refactor/重构/改造/增强/enhancement/提升/更好/更快
- 命中 -> 输出关键词列表(去重,空格分隔)
- 未命中 -> 不输出(bash $() 捕获为空,保持 `[ -n "$HIT" ]` 兼容)

用于 alloy-fix SKILL.md 的关键词二次 USER_GATE 检测(task L6)。
替代手写 `KEYWORDS="..." + grep -Eo`(3 行 bash),关键词列表固化在 CLI 代码,避免 agent 误改。

多 agent 适配:Claude Code / OpenCode / Pi 都用此命令,无平台差异。

### alloy _worktree-create

worktree 创建（原子操作：git worktree add + _state write 三字段 + commit）。**OpenCode 用;Claude Code 用 EnterWorktree 工具(后调 `--record-only` 模式记录 state);Pi 不支持 worktree,不调本命令。**

```
alloy _worktree-create <change-dir>
alloy _worktree-create --record-only <change-dir> --path <worktree-path> --branch <worktree-branch>
```

参数：
- `<change-dir>`：change 目录路径（如 `openspec/changes/<name>`）
- `--record-only`（可选）：Claude Code EnterWorktree 后用,仅记录 state 三字段 + commit,不创建 worktree(EnterWorktree 已创建)。需配合 `--path` + `--branch`

原子完成(默认模式):
1. 校验当前在主仓(不在 worktree 内) + 当前分支 = feature_branch + 主仓工作目录清洁
2. 校验 .worktrees/ 已在 .gitignore + worktree-<change-name> 分支不存在
3. `git worktree add .worktrees/<change-name> -b worktree-<change-name>`(worktree 分支名约定,不是 feature 分支)
4. worktree 内 `_state write worktree / worktree_branch / worktree_created_at` 三字段
5. worktree 内 `git add .alloy.yaml + commit`

`--record-only` 模式:跳过步骤 1-3(EnterWorktree 已创建 worktree),直接在 worktree 内执行步骤 4-5(state write 三字段 + commit)。`--path` 传 worktree 绝对路径,`--branch` 传 worktree 分支名(如 `worktree-<change-name>`)。

**易错**:
- 禁用 feature 分支名建 worktree(`git worktree add .worktrees/feature/x -b feature/x` -- feature 分支已存在且已被主仓 checkout,fatal)。worktree 分支名约定 `worktree-<change-name>`
- agent 不手动 git worktree add / _state write worktree 字段 / mkdir .worktrees -- 本命令是唯一合法路径(OpenCode)
- Claude Code agent 必须用 `EnterWorktree(name)` 工具创建 worktree(路径 `.claude/worktrees/<name>`),创建后调 `--record-only` 模式记录 state(不能省略,否则 state 无 worktree 字段,后续 worktree-cleanup 失败)
- Pi 不支持 worktree(bash 工具无 cwd 参数,session cwd 不解绑),禁调本命令;Pi 下 `alloy _guard worktree-status` 强制返回 `skipped`

### alloy _worktree-cleanup

worktree 清理（原子操作：merge worktree 分支到 feature + remove worktree + branch -d + 记录 `worktree_merged_at`）。**前置：agent 已 ExitWorktree 回主仓。**

```
alloy _worktree-cleanup <change-dir>
```

参数：
- `<change-dir>`：change 目录路径（如 `openspec/changes/<name>`）

CLI 自己从 worktree 分支（`worktree-<change-name>`）读 state（用 `git show`），不依赖 agent 传参。

**易错**：必须在主仓执行（ExitWorktree 后）+ 当前分支 = feature 分支。CLI 从 **worktree 分支**读 state（不是 feature 分支），解决 agent 在 feature 分支读 state 为 null 的问题（state 写在 worktree 分支，feature 读不到）。

**merge 进行中识别**:若 `.git/MERGE_HEAD` 存在(上次 merge 成功但 commit 被拦截),跳过 dirty 检查和重新 merge,直接用 `ALLOY_FORCE_WRITE=1 git commit --no-edit` 完成 merge commit。解决 archive 阶段 pre-commit hook 拦截 worktree 分支带过来的 apply 产物(scripts/ 等)导致 merge commit 失败的重试问题。

### alloy _finish-cleanup

finish 阶段 squash merge 后,原子删除 feature 分支(下沉 `git branch -D` 到 CLI)。**前置:agent 已在 finish:confirm-merge USER_GATE 二次确认 + squash merge + commit 完成。**

```
alloy _finish-cleanup <change-dir> <feature-branch>
```

参数：
- `<change-dir>`：change 目录路径(如 `openspec/changes/archive/<date>-<name>`)
- `<feature-branch>`：要删除的 feature 分支名(从 .alloy.yaml feature_branch 字段读,非模板占位符)

**为何下沉到 CLI:**
1. hook-guard 拦截 `git branch -D`(§3.5.1 禁令),agent 不能直接跑
2. CLI 内部跑不经过 hook,可安全执行
3. CLI 内置变量校验 + main 分支保护 + squash merge 完成校验,比 SKILL.md 模板更可靠

**校验链(任一失败 exit 1):**
1. feature-branch 变量已替换(非 `<feature_branch>` 模板占位符)
2. feature-branch 不等于 main/master(防误删主分支)
3. feature-branch 存在(`git rev-parse --verify`)
4. 当前在 main 分支(squash merge 后应已 `git checkout main`)
5. main 最近 5 个 commit 含 "squash merge" 痕迹(确认 squash merge 已完成)

**通过校验后**:`git branch -D "<feature-branch>"`。

### alloy _hook-guard

PreToolUse hook 适配器(Claude Code 用,Pi/OpenCode 通过扩展/plugin 调用)。从 stdin 读 JSON,判定 Write/Edit 是否允许,exit 0(放行)/ 2(拦截)。由 `alloy init` 自动装到:
- Claude Code:`.claude/settings.json` 的 `hooks.PreToolUse`
- Pi:`.pi/extensions/alloy-guard.ts`(订阅 tool_call 事件,回调调本命令)
- OpenCode:`.opencode/plugins/alloy-guard.ts`(plugin `tool.execute.before`,可拦截所有工具含 question)

```
alloy _hook-guard
```

行为：
- 从 stdin 读 JSON（`{tool_name, tool_input:{file_path}}`）
- 检测问答工具(`AskUserQuestion`/`question`/`ask`/`alloy-question`) -> 自动 clear 所有 pending_gate + 放行
- 只拦截 `Write` / `Edit` 工具
- 扫描 `openspec/changes/*/.alloy.yaml`(含 `archive/*/`)收集所有 change 的 phase(活跃 + 归档)+ worktree 路径
- 非 alloy 项目（无 `openspec/changes/` 目录） -> 放行
- **worktree 路径拦截**:有 worktree 模式 change 时,write/edit 源码/制品路径(`scripts/`/`src/`/`openspec/changes/<name>/` 非 .alloy.yaml)必须用 worktree 绝对路径前缀。相对路径或主仓绝对路径 -> 拦截 exit 2(防止文件落主仓污染 feature 分支)
- alloy 项目但无活跃 change（phases 空） -> 拦截（强制先 /alloy-start 创建 change,防绕过整个流程）
- 有任一 change 在 apply/finishing/finished 阶段（`applying`/`applied`/`finishing`/`finished`） -> 放行（允许写源码 / finish 合入 main 的 commit）
- 非 apply 阶段 + 白名单路径（`openspec/`/`.alloy.yaml`/`.claude/`/`.agents/`/`.opencode/`/`.pi/`/`docs/`/`*.md`/`.gitignore`/`.gitattributes`/`opencode.json`） -> 放行
- 非 apply 阶段 + 非白名单路径（`src/`/`scripts/`/代码文件） -> 拦截 exit 2

**逃生阀**：`ALLOY_FORCE_WRITE=1` 环境变量绕过（仅限修复畸形状态）。

**不直接调用**:本命令由 agent 的 hook 机制自动触发(Claude Code 的 PreToolUse hook,Pi 的 tool_call 扩展,OpenCode 的 custom tool),agent 不主动调用。

### alloy _pre-commit-check

git pre-commit hook 适配器。读暂存文件(`git diff --cached --name-only`)+ 调 guardCheck 判定,exit 0(放行)/ 1(拦截)。由 `alloy init` 自动装到 `.git/hooks/pre-commit`。

```
alloy _pre-commit-check
```

行为:
- 读 git 暂存文件列表
- **merge 进行中(.git/MERGE_HEAD 存在) -> 放行**:merge commit 的文件已在 worktree 分支审查过,不应拦截
- 复用 `guardCheck`(与 PreToolUse hook 行为一致):非 alloy 放行 / alloy 无活跃 change 拦截 / apply/finishing/finished 放行 / 白名单放行 / 非白名单拦截 / pending_gate 拦截
- 有暂存文件被拦 -> exit 1(拦截 commit)
- 全通过 -> exit 0(放行 commit)

**兜底 PreToolUse hook 盲区**:agent 用 Bash 写文件(`echo > / cat << / tee`)绕过 Write/Edit hook,但 commit 时 pre-commit 检查暂存文件,拦住。

### alloy _stop-guard

Stop hook 适配器(Claude Code / OpenCode / Pi)。检测 agent 在 USER_GATE 用纯文本输出 1./2. 选项代替 AskUserQuestion 的违规行为,返回 additionalContext 提醒 agent 改用工具。

```
alloy _stop-guard
```

行为:
- 从 stdin 读 JSON(`{last_assistant_message, stop_hook_active}`)
- `stop_hook_active=true` -> 放行(防死循环,Stop hook 已提醒过)
- 检测 `last_assistant_message` 含 USER_GATE 文本模式:
  - `🔴 USER_GATE` 标记(alloy 专属)
  - 或 `1` + `2` + 确认/选项/选择 关键词组合
- 命中 -> exit 2 + stderr,Claude Code 把 stderr 作为 error 反馈给 agent,对话继续,agent 收到后修正
- 未命中 -> exit 0

**解决的问题**:弱模型在 USER_GATE 用文本输出选项让用户回复 a/b,跳过 AskUserQuestion 工具调用。hook-guard 管不到(不写源码不触发),Stop hook 在回合结束时检测 `last_assistant_message`,命中则 exit 2 阻止结束 + stderr 提醒 agent 改用 AskUserQuestion。

**为什么用 exit 2 + stderr 而不是 additionalContext JSON**:additionalContext 依赖较新版本 + stdout 易被 shell profile 污染导致 JSON validation failed。exit 2 + stderr 跨版本通吃,更可靠。

**逃生阀**:`ALLOY_FORCE_STOP=1` 绕过(仅限修复畸形状态)。

**部署路径**:Claude Code `.claude/settings.json` hooks.Stop;Pi `.pi/extensions/alloy-guard.ts` agent_settled;OpenCode `.opencode/plugins/alloy-guard.ts` session.idle。由 `alloy init` 自动装到对应路径。

### alloy _precheck

Skill/Command 预检(多 agent 适配)。检测指定 cmd 和 skill 是否在所有目标 agent 的路径里就绪。

```
alloy _precheck --cmd "opsx/explore opsx/new" --skill "brainstorming"
```

参数:
- `--cmd <空格分隔>`:cmd 列表(声明格式,如 `opsx/explore`;CLI 内部归一化为 `opsx-explore.md` 或 `opsx/explore.md` 两种文件名都查)
- `--skill <空格分隔>`:skill 列表(如 `brainstorming writing-plans`)

行为:
- 读 `openspec/config.yaml` 的 `target_agents`,对每个 agent 检测对应路径
- cmd:查 `<agentBase>/<commandsSubdir>/` 下横线格式(`opsx-explore.md`)或斜杠格式(`opsx/explore.md`),project 级 + global 级(HOME)都查
- skill:复用 `detectSkill`(查 project skill -> user skill -> user plugin)
- openspec CLI 也可用性检测(opsx 命令依赖 openspec 二进制)
- 全部就绪 exit 0,任一缺失 exit 1 + 引导 `alloy init`

**被调用方**:alloy-start/plan/apply/archive/finish/fix 在 PRECONDITION_FAIL 步骤调用,替代原 `skill-precheck.md` 写死 `.claude/commands/` 路径的 bash 脚本(只支持 Claude Code)。

### alloy _infra-commit

基础设施 commit(多 agent 适配)。动态推导 agent 目录 + 项目资源,git add + commit。

```
alloy _infra-commit [--message <msg>]
```

参数:
- `--message <msg>`:commit message(默认 `chore: 提交 alloy 基础设施文件`)

行为:
- 读 `target_agents`,动态推导 git add 目标:
  - 各 agent 目录(`.claude/`/`.opencode/`/`.pi/`)+ 共享 `.agents/`
  - `.gitignore`/`.gitattributes`/`openspec/config.yaml`/`openspec/schemas/`
  - `opencode.json`(含 opencode 时,根目录配置)
  - `CLAUDE.md`/`AGENTS.md`(存在则加)
- 逐个 `git add`(文件不存在跳过)
- 幂等:无暂存变更跳过 commit(exit 0)

**被调用方**:alloy-start 在 change 创建后的"基础设施 commit"步骤调用,替代原 SKILL.md 写死 `git add .claude/` 的 bash(只支持 Claude Code)。init execute.ts 的初始 commit 也复用 `getInfraCommitTargets` 同一逻辑。

**不直接调用**:本命令由 agent 的 Stop hook 自动触发,agent 不主动调用。

**逃生阀**:`ALLOY_FORCE_WRITE=1` 环境变量绕过(仅限修复畸形状态)。

**不直接调用**:本命令由 `.git/hooks/pre-commit` 自动触发,agent 不主动调用。

### alloy _branch

分支上下文读取 + 分支创建验证。合并 alloy-start Step 1 ①②④⑤ 的多步 bash(2+2 次 LLM 往返 -> 1+1 次),缓解轻量级模型 RPM 限流。

```
alloy _branch context
alloy _branch create --feature <branch> --main <main-branch>
```

子命令:

- `context`:读 `openspec/config.yaml` 的 main_branch + git 当前分支,输出 JSON `{"main_branch":"<main>","current_branch":"<current>"}`。agent 读取后在后续命令里用对应的值。main_branch 未配置 -> ⛔ PRECONDITION_FAIL exit 1(引导 `alloy init`)。
- `create --feature <branch> --main <main-branch>`:`git checkout -b <feature> <main>` + 验证当前分支 = feature。
  - 失败(仍在 main / checkout 失败 / 分支已存在) -> ⛔ [FAIL] exit 1,SKILL.md 指示回退 USER_GATE
  - feature = main -> ⛔ PRECONDITION_FAIL exit 1
  - 不自动 reset/checkout(§3.5.1 git 自救禁令)

**被调用方**:alloy-start Step 1 ①②(分支上下文读取)+ ④⑤(分支创建验证)。

### alloy _change

OpenSpec change 目录创建 + 验证。合并 alloy-start Step 2+3 的多步 bash(3 次 LLM 往返 -> 1 次)。

```
alloy _change create <name>
```

子命令:

- `create <name>`:目录冲突预检 + `openspec new change <name>` + `.openspec.yaml` 验证。
  - 目录已存在 -> ⛔ PRECONDITION_FAIL exit 1(走 USER_GATE 让用户决策:改名 / 接续 / 中止)
  - openspec CLI 失败 -> ⛔ [FAIL] exit 1
  - .openspec.yaml 缺失 -> ⛔ PRECONDITION_FAIL exit 1(禁 alloy 补写,退出让用户排查 openspec CLI)

**被调用方**:alloy-start Step 2+3(目录冲突预检 + opsx:new + .openspec.yaml 验证)。

### alloy _start

start 阶段多步 bash 序列下沉。合并 alloy-start 状态检测(precheck,5 次 -> 1 次)、Step 4-7(bootstrap,6 次 -> 1 次)和 Step 10(finalize,3 次 -> 1 次)。缓解轻量级模型 RPM 限流的核心命令。

```
alloy _start precheck --cmd "opsx/explore opsx/new" --skill "brainstorming"
alloy _start bootstrap <change-dir> --start-at <ts> --opsx-new-at <ts> --feature-branch <branch>
alloy _start finalize <change-dir>
```

子命令:

- `precheck --cmd <cmds> --skill <skills>`:状态检测原子命令,合并 5 步(5 次 LLM 往返 -> 1 次,任一失败 exit 1):
  1. env check(git 仓库 + openspec/config.yaml 含 schema: alloy + schema.yaml + Alloy skills)
  2. status 检测活跃 change(含归档目录扫描)
  3. 捕获 START_TIME(仅统一流程,即无活跃 change 时)
  4. precheck(cmd + skill 就绪检测,仅统一流程)
  5. git 仓库就绪(已由 env check 覆盖,不单独校验)

  参数:
  - `--cmd <cmds>`:空格分隔的 cmd 列表(声明格式,如 `opsx/explore opsx/new`)
  - `--skill <skills>`:空格分隔的 skill 列表(如 `brainstorming`)

  输出(人类可读 + `->` 标注关键信息):
  - env 失败:⛔ PRECONDITION_FAIL + 缺失项 + exit 1
  - 有活跃 change:`-> active_changes: <n>` + 列表 + `-> route: resume` + exit 0
  - 无活跃 change + precheck 通过:`-> start_time: <ts>` + precheck 结果 + `-> route: unified` + exit 0
  - 无活跃 change + precheck 失败:`-> start_time: <ts>` + precheck 缺失项 + `-> route: abort` + exit 1

  agent 根据 `-> route` 决策:abort -> 引导 alloy init;resume -> USER_GATE 路由;unified -> 用 start_time 继续。

  ⛔ 禁止在 precheck 后重复跑 `test -f openspec/config.yaml` / `git rev-parse --git-dir` / `alloy _env check` / `alloy status` / `alloy _precheck`--已由 precheck 覆盖,重复 = 浪费 LLM 往返 = 限流风险。

- `bootstrap <change-dir> --start-at <ts> --opsx-new-at <ts> --feature-branch <branch>`:原子完成 6 步(任一步失败 exit 1,不继续):
  1. state init(写 started_at + feature_branch,先于 phase start / skill log)
  2. infra-commit(基础设施 commit,幂等)
  3. skill log opsx:explore(补录 --at=start-at)
  4. skill log opsx:new(补录 --at=opsx-new-at)
  5. state write worktree null(标记非 worktree 模式)
  6. phase start(写 phase_timings.start.started_at + 推进到 starting + commit)

  参数:
  - `--start-at <ts>`:start 阶段开始时间(= START_TIME,explore 执行时间)
  - `--opsx-new-at <ts>`:opsx:new 执行时间(= OPSX_NEW_START)
  - `--feature-branch <branch>`:feature 分支名(= $FEATURE_BRANCH)

  约束(内化到 CLI):`--start-at` 与 `--opsx-new-at` 必须不同值(同值 -> ⛔ HARD_STOP exit 1)。

- `finalize <change-dir>`:原子完成 4 步(任一步失败 exit 1,不继续):
  1. artifact commit draft(hash-lock + records + commit)
  2. checkpoint create --kind brainstorming(draft 锚点 tag,必须在 artifact commit 之后、phase complete 之前)
  3. verify phase-exit start(校验 draft + state 字段;失败 exit 1,阻止 phase complete)
  4. phase complete(写 completed_at + 推进到 started + commit)

  约束(内化到 CLI):checkpoint 时序(artifact commit 后、phase complete 前);verify && phase complete 短路保护(verify 失败时 phase complete 不执行,无需 agent 手写 `&&`)。

  CLI 拦截(越界回退防护):`phase=starting + records 有 draft` 时拒绝执行(防 agent 跳过 `_artifact reset draft` 直接调本命令,导致 hash 未变跳过 commit + checkpoint dirty 失败)。越界回退场景必须先 `alloy _artifact reset <change-dir> draft` 清 records 的 draft hash,再调本命令。

**被调用方**:alloy-start 状态检测(precheck)+ Step 4-7(bootstrap)+ Step 10(finalize)。

**设计目的**:减少 LLM 往返次数,缓解轻量级模型(如 step-3.7-flash 限 10 RPM)的限流压力。precheck 把状态检测 5 次 LLM 往返合并为 1 次,bootstrap 把 6 次合并为 1 次,finalize 把 3 次合并为 1 次。

## 易错点汇总

1. **`alloy status` 查特定 change 用 `alloy status <name>`**，禁用 `--change`（不支持）
2. **`alloy _verify` 只支持 `phase-enter|phase-exit <phase> <change-dir>`**，禁用 `run` 等其他子命令
3. **`alloy _skill` 是命令名**（不是 `_skill-usage`），文件名是 `skill-usage.ts` 但命令注册为 `_skill`
4. **`alloy _env check` 必须带 `check` 子命令**，无子命令 exit 1
5. **`alloy _state write/merge` 禁操作受管字段**：`records`（用 `_artifact commit`）、`skill_usage`（用 `_skill log/skip`）、`phase_timings`（用 `_phase start/complete/reset`；`merge` 放开 `phase_timings` 但 `write` 仍拦截）、`phase`（用 `_phase start/complete` 或 `_guard --apply`，逃生阀 `ALLOY_FORCE_PHASE=1`）
6. **`alloy _phase complete` 前必须先 `_phase start`**：`started_at` 缺失则 PRECONDITION_FAIL
7. **`alloy _checkpoint` 仅 start/plan/apply 早期允许**：archive/finish 阶段禁止；apply 中后期（worktree 已创建或 SDD/EP 已启动）禁止
8. **`alloy _archive` 是唯一合法归档路径**：禁自行 mkdir/cp/mv 模拟
9. **`alloy _worktree-cleanup` 必须在主仓执行**（ExitWorktree 后），且当前分支 = feature 分支；state 字段通过参数传入，不从 archive-dir 读
10. **制品 id 白名单**：`draft` / `proposal` / `design` / `specs` / `tasks` / `plans` / `verify` / `retrospective`（8 个，其他 id 拒绝）
11. **`alloy _guard --apply` 只处理 `-ed` 态转换**（started→planned 等），`-ing` 进行中态由 `_phase start/complete` 推进
12. **`alloy _guard precheck` 支持逗号分隔多 phase**：如 `alloy _guard precheck <dir> planned,applied`
13. **`alloy _artifact commit` 重复锁定检测**：hash 未变跳过（避免回溯再提交污染历史），hash 变了允许重锁
14. **`alloy _skill log` 前置校验**：非 `--at` 补录时，`phase_timings.<stage>.started_at` 必须已存在
15. **内部命令不支持 `--help`**（除 `_spec-audit`）：无参数运行看 usage，或查本文件
16. **`alloy _start bootstrap` 两 `--at` 必须不同值**：`--start-at` 与 `--opsx-new-at` 同值 -> HARD_STOP exit 1（called_at 语义=实际调用时间，两技能不同步骤调用）
17. **`alloy _change create` 目录冲突时走 USER_GATE**：exit 1 后 agent 不得自动复用/覆盖，必须 USER_GATE 让用户决策（改名 / 接续 / 中止）
18. **`alloy _branch create` 失败时回退 USER_GATE**：exit 1 后 agent 不自动 reset/checkout（§3.5.1 git 自救禁令），回退到 change name + 分支决策 USER_GATE
19. **`alloy _start bootstrap/finalize` 任一步失败不继续**：内部按序执行，失败立即 exit 1，不回滚（回滚需用户介入，符合 §3.5.1）
16. **`alloy _state write worktree/branch/created_at` 实际值只能在 worktree 内写**：主仓写实际值会被拒（PRECONDITION_FAIL），写 `null`（清理）或 `skipped`（跳过 worktree）允许。防止 feature 分支写 worktree state 导致 merge 冲突。
17. **`alloy _state write phase` 被拦截**：phase 推进必须走 `_phase start/complete` 或 `_guard --apply`，确保阶段时间链 + 制品完整性。降级用 `_phase downgrade <change-dir> <to-phase>`（替代 `ALLOY_FORCE_PHASE=1 alloy _state write phase` 逃生阀，内部完成 state 写入 + commit）
18. **`alloy _hook-guard` hook 逃生阀**:`ALLOY_FORCE_WRITE=1` 绕过 hook 拦截(仅限修复畸形状态)。hook 由 `alloy init` 自动装到 `.claude/settings.json`(PreToolUse) / `.pi/extensions/alloy-guard.ts`(tool_call 扩展) / `.opencode/plugins/alloy-guard.ts`(plugin tool.execute.before),拦截非 apply 阶段写源码
19. **`alloy _guard user-gate require` 后写源码被拦**:pending_gate 期间,hook-guard 拦截非白名单写入(即使 apply 阶段)。需先用问答工具(AskUserQuestion/question,自动 clear pending_gate)或 `alloy _guard user-gate pass <change-dir>` 降级。解决弱模型忘记用问答工具与用户确认的问题
20. **pre-commit hook 兜底 PreToolUse 盲区**:agent 用 Bash 写文件(`echo > / cat << / tee`)绕过 Write/Edit hook,但 `git commit` 时 pre-commit 检查暂存文件,拦住。逃生阀 `ALLOY_FORCE_WRITE=1`。由 `alloy init` 自动装到 `.git/hooks/pre-commit`
21. **`alloy _start precheck` 后禁重复检查**:precheck 已原子完成 env check + status + precheck + git 校验,禁再跑 `test -f openspec/config.yaml` / `git rev-parse --git-dir` / `alloy _env check` / `alloy status` / `alloy _precheck`--重复 = 浪费 LLM 往返 = 限流风险(step-3.7-flash 限 10 RPM,实测 16 秒内 11 次调用即触顶 429)。agent 根据 `-> route: <unified|resume|abort>` 决策即可
22. **`_phase complete` 强制检查 pending_gate**:`_phase complete <dir> <phase>` 推进阶段前,检查当前阶段是否有未 clear 的 pending_gate(格式 `<phase>:<action>`)。未 clear 时 exit 1,拒绝推进。agent 必须先调问答工具(AskUserQuestion/question/alloy-question,自动 clear)或 `alloy _guard user-gate pass <dir>` 手动降级,才能 complete。这是 gate 下沉机制--接近 100% 强制 USER_GATE 物理确认
23. **`_artifact commit` / `_skill log` worktree cwd 守卫**:apply 阶段 worktree 模式下(state.worktree 有值),这两个命令必须在 worktree 内执行(git-dir != git-common-dir)。OpenCode 无 EnterWorktree,session cwd 不解绑,主仓执行会导致 records/skill_usage 写进 feature 分支,破坏 worktree 隔离。在主仓执行时 exit 1,引导 `cd <worktree-path>`。逃生阀 `ALLOY_FORCE_WORKTREE=1`(仅限修复畸形状态,如 worktree 已删除但 state 未更新)。Pi 不支持 worktree,不会进 worktree 模式,不触发本守卫
24. **`_guard user-gate require/pass` worktree cwd 守卫**:worktree 模式下必须在 worktree 内执行。主仓执行会写 pending_gate 到主仓 .alloy.yaml(应写 worktree)+ commit 进 feature 分支,破坏 worktree 隔离。用 `setPendingGate` 精准替换 pending_gate 行(不触发 writeState 全量重写,保留 worktree_created_at 引号)+ 自动 commit。同理 `_artifact commit`/`_skill log`/`_guard user-gate require/pass` 都有守卫,`_phase start/complete` 等写 .alloy.yaml 的命令也应遵守(后续逐步覆盖)。Pi 不支持 worktree,不会进 worktree 模式,不触发本守卫
25. **worktree 路径拦截(hook-guard)**:worktree 模式下,write/edit 工具用相对路径或主仓绝对路径写源码/制品(`scripts/`/`src/`/`openspec/changes/<name>/` 非 .alloy.yaml)会被 hook-guard 拦截 exit 2。OpenCode 的 write/edit 工具与 bash 独立进程,不共享 cwd,bash 里传 workdir 不影响 write/edit。必须用 worktree 绝对路径前缀(`<worktree-path>/scripts/...`)。逃生阀 `ALLOY_FORCE_WRITE=1`。Pi 不支持 worktree,不会进 worktree 模式,不触发本守卫
