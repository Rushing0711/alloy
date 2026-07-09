# Alloy CLI 命令速查

> **权威参考**：本文件是 alloy CLI 命令的权威用法。调整 CLI 后必须同步更新本文件（见 CLAUDE.md 关键规则第 6 条）。skill md 调用 CLI 命令时，以本文件为准；不要凭记忆猜命令名/参数，先查本文件。

调用方式：`node dist/cli/index.js <command>`（本地开发）或 `alloy <command>`（已 link/安装）。

## 用户命令

面向终端用户，5 个。

### alloy init

项目初始化：检测环境 → 安装依赖 → 部署 schema + skill。

```
alloy init [path] [options]
```

选项：
- `--scope <project|global>`：安装范围，默认 `project`
- `--agents <id,id,...>`：非交互式模式，指定要安装的 AI 工具（逗号分隔）。可用 agent：`claude-code, codebuddy, qoder, cursor, opencode, codex, trae, pi`
- `--help, -h`：显示帮助

示例：
```bash
alloy init                         # 交互式，当前目录，project 范围
alloy init /path/to/repo --scope global
alloy init --agents claude-code,cursor   # 非交互式
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

### alloy doctor

诊断：版本兼容性、文件一致性。

```
alloy doctor [path] [options]
```

选项：
- `--json`：JSON 格式输出
- `--help, -h`：显示帮助

### alloy update

从 alloy 包重新部署 skill + schema。自动检测 scope（project/global）。用户模式下检查 npm registry 是否有新版本。

```
alloy update [path]
```

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

面向 skill md 编排，15 个。Agent 通过这些命令操作 state、推进 phase、锁定制品 hash、归档等。**Agent 不直接写 YAML**——必须通过 `_state` / `_artifact` / `_phase` 等原子命令操作 `.alloy.yaml`。

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
```

子命令说明：
- **phase 转换**（无子命令关键字，直接传 change-dir + target-phase）：校验 `started→planned`、`planned→applied`、`applied→archived`、`archived→finished` 的合法性 + 制品完整性 + hash 一致性。`--apply` 通过则推进 phase
- `branch-position <change-dir>`：输出 `on-feature` / `on-main` / `feature-missing` / `feature-lost:<branch>` / `on-other:<current>`。退出码 0=位置正确，1=不正确
- `verify-passed <change-dir>`：读 verify.md 判定，输出 `PASS` / `FAIL` / `WARNING`。退出码 0=PASS/WARNING，1=FAIL
- `precheck <change-dir> <expected-phase>`：单点 phase 路由校验。`expected-phase` 支持逗号分隔多值（如 `planned,applied`）。输出 `PASS:<phase>` / `FAIL:<reason>`。退出码 0=通过，1=不通过
- `worktree-status <change-dir>`：输出 `done:<path>:<branch>` / `stale:<path>` / `skipped` / `pending`。退出码始终 0（查询命令）

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

## 易错点汇总

1. **`alloy status` 查特定 change 用 `alloy status <name>`**，禁用 `--change`（不支持）
2. **`alloy _verify` 只支持 `phase-enter|phase-exit <phase> <change-dir>`**，禁用 `run` 等其他子命令
3. **`alloy _skill` 是命令名**（不是 `_skill-usage`），文件名是 `skill-usage.ts` 但命令注册为 `_skill`
4. **`alloy _env check` 必须带 `check` 子命令**，无子命令 exit 1
5. **`alloy _state write/merge` 禁操作受管字段**：`records`（用 `_artifact commit`）、`skill_usage`（用 `_skill log/skip`）、`phase_timings`（用 `_phase start/complete/reset`；`merge` 放开 `phase_timings` 但 `write` 仍拦截）
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
