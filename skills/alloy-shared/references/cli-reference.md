# Alloy CLI 命令速查

> **权威参考**：本文件是 alloy CLI 命令的权威用法。调整 CLI 后必须同步更新本文件（见 CLAUDE.md 关键规则第 6 条）。skill md 调用 CLI 命令时，以本文件为准；不要凭记忆猜命令名/参数，先查本文件。

调用方式：`node dist/cli/index.js <command>`（本地开发）或 `alloy <command>`（已 link/安装）。

## 用户命令

面向终端用户，5 个。

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

清理 `alloy init` 装的产物。交互问 scope(project/global),按 scope 清理所有 init 装的产物:alloy skills(+ .alloy-version)/ OpenSpec Commands / OpenCode command wrapper / Superpowers / hook / permissions / .gitignore / .gitattributes / .pre-commit / openspec schema。只清 alloy 注入的部分,保留用户配置(specs/changes/用户 settings key/用户 gitignore 规则)。

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

面向 skill md 编排，17 个。Agent 通过这些命令操作 state、推进 phase、锁定制品 hash、归档等。**Agent 不直接写 YAML**——必须通过 `_state` / `_artifact` / `_phase` 等原子命令操作 `.alloy.yaml`。

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
alloy _state timestamp ensure openspec/changes/user-auth plan
alloy _state check openspec/changes/user-auth planned
```

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
alloy _guard user-gate <require|pass> <change-dir> [<gate-id>]
```

子命令说明：
- **phase 转换**（无子命令关键字，直接传 change-dir + target-phase）：校验 `started→planned`、`planned→applied`、`applied→archived`、`archived→finished` 的合法性 + 制品完整性 + hash 一致性。`--apply` 通过则推进 phase
- `branch-position <change-dir>`：输出 `on-feature` / `on-main` / `feature-missing` / `feature-lost:<branch>` / `on-other:<current>`。退出码 0=位置正确，1=不正确
- `verify-passed <change-dir>`：读 verify.md 判定，输出 `PASS` / `FAIL` / `WARNING`。退出码 0=PASS/WARNING，1=FAIL
- `precheck <change-dir> <expected-phase>`：单点 phase 路由校验。`expected-phase` 支持逗号分隔多值（如 `planned,applied`）。输出 `PASS:<phase>` / `FAIL:<reason>`。退出码 0=通过，1=不通过
- `worktree-status <change-dir>`：输出 `done:<path>:<branch>` / `stale:<path>` / `skipped` / `pending`。退出码始终 0（查询命令）
- `user-gate require <change-dir> <gate-id>`：设 pending_gate,后续 Write/Edit 非白名单被 hook-guard 拦截(即使 apply 阶段),直到问答工具(AskUserQuestion/question)调用自动 clear,或手动 `user-gate pass` 降级
- `user-gate pass <change-dir>`：清除 pending_gate(手动降级 / 无问答工具的 agent)。pending_gate 是临时状态,不 commit

允许的 phase 转换：`started→planned`、`planned→applied`、`applied→archived`、`archived→finished`。`-ing` 进行中态由 `_phase start/complete` 推进，**不通过 `_guard --apply`**。

### alloy _phase

阶段开始/完成/回溯。自动写 `phase_timings` + git add 限路径 + commit。

```
alloy _phase <start|complete|reset> <change-dir> <phase>
```

子命令：
- `start <change-dir> <phase> [--at <ts>]`：幂等写 `started_at` + 推进到 `-ing` 态 + commit。`--at` 补录实际开始时间
- `complete <change-dir> <phase>`：写 `completed_at` + 推进到 `-ed` 态 + commit。**前置：必须先 `_phase start`**（`started_at` 缺失则 PRECONDITION_FAIL）。`finish` 阶段额外写顶层 `completed_at`
- `reset <change-dir> <phase>`：删除 `phase_timings.<phase>` 整个 key + commit（回溯清理专用，不存在则幂等跳过）

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
- `commit <change-dir> <artifact>`：计算 hash + 写 records + `git add` 限路径 + commit。重复锁定（hash 未变）跳过；hash 变了（回溯后重新生成）允许重锁。commit message：首锁 `docs(<change>): 锁定 <artifact>`，重锁 `docs(<change>): 重锁 <artifact> [<old>-><new>]`
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
- `clean <change-dir>`：删除该 change 所有 checkpoint tag（archive/discard/finish 时调用）

phase 限制：仅 `start` / `plan` 阶段全程允许；`apply` 阶段仅当 worktree 未创建 + SDD/EP 未启动时允许；`archive` / `finish` 禁止。

tag 命名：`alloy-checkpoint-<change-name>-<ts>` / `-brainstorming-N` / `-progress-<ts>`。

### alloy _record

制品 hash 记录操作（底层命令，优先用 `_artifact commit`）。

```
alloy _record <write|check|scan|compute|approver> <change-dir> [artifact] [hash] [committed_at] [approver]
```

子命令：
- `write <change-dir> <artifact> <hash> <committed_at> <approver>`：写入/覆盖 record（不 git commit，底层操作）
- `check <change-dir> [artifact]`：校验 record hash 与当前文件 hash 是否一致。输出 `[PASS]` / `[FAIL]`
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
- `skip`：记录跳过。`--reason` 必填原因

stage 取值：`start` / `plan` / `apply` / `archive` / `finish`。

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

自动填充 §0 量化全景（时间线/制品审批链/commit 汇总/阶段耗时/检查点/任务完成比/变更规模/worktree 状态/验证状态/计划策略/提交链）+ §4 全周期技能审计。agent 需补 §1/§2/§3/§5/§6/§7 定性分析。

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

### alloy _worktree-cleanup

worktree 清理（原子操作：merge worktree 分支到 feature + remove worktree + branch -d + 记录 `worktree_merged_at`）。**前置：agent 已 ExitWorktree 回主仓。**

```
alloy _worktree-cleanup <change-dir>
```

参数：
- `<change-dir>`：change 目录路径（如 `openspec/changes/<name>`）

CLI 自己从 worktree 分支（`worktree-<change-name>`）读 state（用 `git show`），不依赖 agent 传参。

**易错**：必须在主仓执行（ExitWorktree 后）+ 当前分支 = feature 分支。CLI 从 **worktree 分支**读 state（不是 feature 分支），解决 agent 在 feature 分支读 state 为 null 的问题（state 写在 worktree 分支，feature 读不到）。

### alloy _hook-guard

PreToolUse hook 适配器(Claude Code 用,Pi/OpenCode 通过扩展/工具调用)。从 stdin 读 JSON,判定 Write/Edit 是否允许,exit 0(放行)/ 2(拦截)。由 `alloy init` 自动装到:
- Claude Code:`.claude/settings.json` 的 `hooks.PreToolUse`
- Pi:`.pi/extensions/alloy-guard.ts`(订阅 tool_call 事件,回调调本命令)
- OpenCode:`.opencode/tools/write.ts` + `edit.ts`(覆盖内置工具,execute 调本命令)

```
alloy _hook-guard
```

行为：
- 从 stdin 读 JSON（`{tool_name, tool_input:{file_path}}`）
- 只拦截 `Write` / `Edit` 工具
- 扫描 `openspec/changes/*/.alloy.yaml`(含 `archive/*/`)收集所有 change 的 phase(活跃 + 归档)
- 非 alloy 项目（无 `openspec/changes/` 目录） -> 放行
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
- 复用 `guardCheck`(与 PreToolUse hook 行为一致):非 alloy 放行 / alloy 无活跃 change 拦截 / apply/finishing/finished 放行 / 白名单放行 / 非白名单拦截 / pending_gate 拦截
- 有暂存文件被拦 -> exit 1(拦截 commit)
- 全通过 -> exit 0(放行 commit)

**兜底 PreToolUse hook 盲区**:agent 用 Bash 写文件(`echo > / cat << / tee`)绕过 Write/Edit hook,但 commit 时 pre-commit 检查暂存文件,拦住。

### alloy _stop-guard

Stop hook 适配器(仅 Claude Code)。检测 agent 在 USER_GATE 用纯文本输出 1./2. 选项代替 AskUserQuestion 的违规行为,返回 additionalContext 提醒 agent 改用工具。

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

**仅 Claude Code**:依赖 Stop hook + `last_assistant_message` 字段。OpenCode 用 plugin session.idle,Pi 用 extension agent_settled。由 `alloy init` 自动装到 `.claude/settings.json` 的 `hooks.Stop`。

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
16. **`alloy _state write worktree/branch/created_at` 实际值只能在 worktree 内写**：主仓写实际值会被拒（PRECONDITION_FAIL），写 `null`（清理）或 `skipped`（跳过 worktree）允许。防止 feature 分支写 worktree state 导致 merge 冲突。
17. **`alloy _state write phase` 被拦截**：phase 推进必须走 `_phase start/complete` 或 `_guard --apply`，确保阶段时间链 + 制品完整性。逃生阀 `ALLOY_FORCE_PHASE=1`（仅限修复畸形状态）
18. **`alloy _hook-guard` hook 逃生阀**:`ALLOY_FORCE_WRITE=1` 绕过 hook 拦截(仅限修复畸形状态)。hook 由 `alloy init` 自动装到 `.claude/settings.json`(PreToolUse) / `.pi/extensions/alloy-guard.ts`(tool_call 扩展) / `.opencode/tools/write.ts+edit.ts`(custom tool),拦截非 apply 阶段写源码
19. **`alloy _guard user-gate require` 后写源码被拦**:pending_gate 期间,hook-guard 拦截非白名单写入(即使 apply 阶段)。需先用问答工具(AskUserQuestion/question,自动 clear pending_gate)或 `alloy _guard user-gate pass <change-dir>` 降级。解决弱模型忘记用问答工具与用户确认的问题
20. **pre-commit hook 兜底 PreToolUse 盲区**:agent 用 Bash 写文件(`echo > / cat << / tee`)绕过 Write/Edit hook,但 `git commit` 时 pre-commit 检查暂存文件,拦住。逃生阀 `ALLOY_FORCE_WRITE=1`。由 `alloy init` 自动装到 `.git/hooks/pre-commit`
