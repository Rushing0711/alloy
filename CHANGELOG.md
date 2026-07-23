# Changelog

本文件记录 @flyin-ai/alloy 的所有版本变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [0.5.1] - 2026-07-23

### Fixed

- **Windows 路径兼容**:hook 命令(pre-commit hook + Claude Code/opencode/Pi 的 PreToolUse/Stop hook)用正斜杠 + 双引号包路径,修复 Windows 上 bash/sh 执行时反斜杠被当转义符吃掉导致 `Cannot find module` 的 bug。macOS/Linux 无变化(路径本来就正斜杠)。

## [0.5.0] - 2026-07-22

本版本将 agent 缩减为 3 个(Claude Code/OpenCode/Pi)并完成 3 轮完全测试(含需求变更全流程),新增 hook 主动闸门机制(PreToolUse + USER_GATE + 制品检查),重设计 init 交互,下沉模块化 CLI 原子命令。

**BREAKING:** agent 从 8 个缩减为 3 个(剔除 Codex 等 5 个 experimental agent)。升级后运行 `alloy init` 重新选择 agent。

### Added

- **hook-guard PreToolUse 主动闸门**:`alloy _hook-guard` 拦截 Write/Edit,非 apply/finishing/finished 阶段禁写源码(`src/`/`scripts/`),白名单放行 `openspec/`/`.alloy.yaml`/`docs/`/`*.md`。逃生阀 `ALLOY_FORCE_WRITE=1`
- **USER_GATE 闸门机制**:`pending_gate` + `gate_history` 字段,agent 在关键决策点(锁定制品/创建 worktree/阶段完成)必须设 pending_gate + 调问答工具,hook-guard 检测问答工具调用自动 clear + addClearedGate。`_guard user-gate require/pass/reset` 管理 gate
- **git pre-commit hook 兜底**:`alloy _pre-commit-check` 拦截 Bash 写文件绕过 Write/Edit 的盲区
- **`_phase start` 制品完整性检查**:进入 plan/apply/archive/finish 时,检查上阶段 phase-complete gate 已通过 + 上阶段制品已产出(复用 ARTIFACT_CHECKS),堵"设 gate 跳过制品"漏洞
- **`_worktree-create syncGateHistoryFromMainRepo`**:Claude Code EnterWorktree / OpenCode _worktree-create 从 HEAD 创建 worktree 后,同步主仓工作区 gate_history 到 worktree .alloy.yaml(两种模式:--record-only + 非 --record-only)
- **`init` 重设计**:agent 矩阵显示 + Superpowers 多版本选择 + `--force` 覆盖 + 权限白名单交互
- **Pi/OpenCode 闸门适配**:多 agent 交互工具(AskUserQuestion / question / alloy-question)适配 + Pi 自动通过 worktree-choice/sdd-ep-choice(`PI_CODING_AGENT=true`)
- **command -> skill 迁移**:alloy 命令从 commands/ 迁移到 skills/,统一 skill 加载机制
- **`doctor` agent 能力检测 + 保护层级标注**:检测 3 个 agent 的 worktree / subagent / bash cwd 等能力

### Changed

- **agent 缩减为 3 个**:Claude Code/OpenCode/Pi,剔除 Codex 等 5 个 experimental agent。3 个 agent 经 3 轮完全测试(含需求变更全流程),0 `chore: clear USER_GATE` commit + gate_history 完整 + 流程跑完
- **模块化下沉**:重复 bash 序列(状态写入 + commit / hash-lock + commit / worktree 创建等)下沉为 CLI 原子命令,提升 agent 执行稳定性
- **`clearAllPendingGates` 不单独 commit**:gate_history 改动随下一个 `_artifact commit` / `_state write --commit` 一起落地,消除 `chore: clear USER_GATE` 污染历史(违反 d4b5db4 "state 写入不单独提交"规范的修复)
- **hook-guard worktree 兜底扫描**:`git worktree list` 扫描主仓 + 所有 worktree,不依赖主仓 state.worktree 字段(OpenCode hook-guard 在主仓执行,主仓 worktree 字段可能为 null)
- **gate 顺序硬约束**:`require apply:sdd-ep-choice` 检查 `apply:worktree-choice` 是否在 gate_history,防 agent 跳过前置 gate
- **拦截消息抗合理化**:gate 拦截消息加"合法路径:先走完 prev SKILL.md 产出制品"+ "gate 是阶段完成标志,不是跳过制品的通行证" + Red Flags
- **文档同步**:`cli-reference.md` + `08-cli-spec.md` + `gate-ceremony.md` 按代码对齐(幽灵命令修复 + 子命令补全 + 部署路径更新)

### Fixed

- **archive 死循环**:`specs/<name>.md` 直接文件格式(非 `<name>/spec.md` 目录格式)不再误判为缺失制品
- **worktree-cleanup 参数 + untracked 处理**:改为 `<change-dir>` 参数 + untracked 文件 `--force` 删除 + tracked modified 仍 HARD_STOP
- **`_state write` worktree 字段环境校验**:worktree/worktree_branch/worktree_created_at 实际值只能在 worktree 内写(主仓写 null/skipped 允许),防 feature 分支写 worktree state 导致 merge 冲突
- **skill-migration**:`disable-model-invocation` 恢复 finish/fix/discard + 流程内 skill 去掉 + spec/behaviors frontmatter 恢复(迁移误删)
- **Pi 适配优化**:SKILL.md 流程修复 + 多 agent 影响分析规则(CLAUDE.md 规则 9)
- **worktree/archive 阶段 3 处缺陷**(P1+P2a+P3)
- **gate-guard 稳定性 + retro verify 判定对齐**
- **finish 二次确认**:`finish:confirm-merge` USER_GATE + finish 阶段 checkpoint tag 清理校验

### Removed

- **Codex agent**:剔除 Codex 支持
- **5 个 experimental agent**:agent 从 8 个缩减到 3 个(仅保留 stable: Claude Code/OpenCode/Pi)

## [0.4.0] - 2026-07-08

本版本扩展 Superpowers 兼容范围至 v5+v6 双版本(非 BREAKING),升级 vendor 快照为 v6.1.1,并改进检测逻辑与 init 交互。

### Changed

- **compat `superpowers` 扩展为 `>=5.0.0 <7.0.0`**:v5+v6 双版本兼容(非 BREAKING,不放弃 v5)
- **vendor 快照升级为 v6.1.1**:14 个 skill,using-superpowers 压缩 117→62 行(v6.1.0 bootstrap 压缩)
- **`install.superpowers` `@5` → `@6`**:默认推荐 v6

### Added

- **`detectSkill` 多版本并存选最新版本**:semver 比较选最新,防御 5.1.0+6.1.1 并存导致检测与 Claude Code 注册不一致
- **`alloy init` 交互式 superpowers 版本选择**:检测到 v5 问是否升 v6 / 手动安装(version=null)问是否重装为 v6 / v6 现有覆盖逻辑 / 未安装直接装 v6
- **agent 分级 stable/experimental**:`AgentInfo` 加 `tier` 字段,`alloy init` 单级多选一次性展示全部 8 个 agent,选项后备注 (stable)/(实验性),`--agents` 非交互式不受限

## [0.3.1] - 2026-07-07

本版本修复两个与 Superpowers v6 升级无关的现有 bug,为 0.4.0(v6 升级)做准备。

### Fixed

- **`checkSuperpowers` 漏查 `~/.claude/skills/` 手动安装**:`health.ts` 的 `checkSuperpowers` 只查插件 `installed_plugins.json` + `npx skills list`,漏查项目级和用户级 skill 目录。调整为 项目 skill → 用户 skill → 用户级 plugin → `installed_plugins.json` → `npx skills list` 五级检测,复用 `detectSkill`。修复手动安装到 `~/.claude/skills/` 时 `alloy doctor` 误报"未安装"的 bug。
- **`doctor` worktree 孤儿检测漏查 `.claude/worktrees/`**:`doctor.ts` 的孤儿检测只查 `.worktrees/<name>/`,漏查 Claude Code agent 用 `EnterWorktree` 创建的 `.claude/worktrees/<name>/`。提取 `checkWorktreeConsistency` 独立函数,同时检测两个路径。修复 Claude Code agent 的 worktree 孤儿检测失效 bug。
- **`_worktree-cleanup` 因 worktree 内 `.alloy.yaml` 未提交修改而失败**:archive 流程在 ExitWorktree 前没确保 `.alloy.yaml` 已 commit,导致 `git worktree remove` 拒绝执行。修复:`archive.md` 加 ExitWorktree 前 commit `.alloy.yaml` 步骤(治本);`worktree-cleanup.ts` remove 失败时若仅 `.alloy.yaml` 修改则自动 `--force`(兜底,因 merge 已合入 commit 版本);错误消息"未跟踪文件"改"未提交修改"(`M` 是 modified 非 untracked)。
- **`opsx not found` 预检无安装提示**:`skill-precheck.md` 只检测 command 文件,没检测 openspec CLI 二进制,agent 遇 `opsx not found` 需摸索安装。修复:增加 `command -v openspec` 检测,失败时给 `npm install -g @fission-ai/openspec@1` 安装提示。
- **`_verify` 空参数错误不清晰**:agent 调 `_verify` 传空 bash 变量(如 `$ARCHIVE_DIR` 未设置)时,alloy 只报用法,不知哪个参数空。修复:空参数错误改为 `⛔ [PRECONDITION_FAIL] _verify 参数缺失` + 分别指明 `phase 参数为空` / `change-dir 参数为空(检查 bash 变量)` + 用法,帮 agent 定位根因。

### Changed

- **`commands/alloy/apply.md` worktree 路径约定措辞澄清:** "禁 `.worktrees/`"明确为按 agent 平台分场景(Claude Code 用 `.claude/worktrees/`,其他 agent 用 `.worktrees/`)
- **`commands/alloy/apply.md` "违反精神"段落限定 Claude Code 语境:** 避免与非 Claude Code agent 用 `.worktrees/` 的约定矛盾
- **`commands/alloy/status.md` + `start.md` + `docs/specification/01-product-spec/08-cli-spec.md` 孤儿检测说明同步:** 覆盖 `.claude/worktrees/` 和 `.worktrees/` 两个路径
- **`docs/specification/01-product-spec/00-overview.md` worktree 字段类型补 `.worktrees/<name>`:** 与两路径检测实现一致
- **`src/core/agents.ts` 导出 `CLAUDE_CODE_AGENT`**:消除 `health.ts` 的重复定义,配置变化时自动同步

## [0.3.0] - 2026-07-06

本版本聚焦 phase 语义清晰化 + agent 执行稳定性强化 + init 体验优化。

**BREAKING:** phase 期望值变更(见下方 Changed),旧 .alloy.yaml(0.2.0)进行中的 change 不兼容新版 skill md。升级前请完成或废弃进行中的 change,然后重新运行 `alloy init`。

**模型适配表现:**
- **强模型(GLM 5.1+ / DeepSeek V4 Pro):** 流程执行接近完美,_verify 同命令 && 连接 / AskUserQuestion 合规 / §7 正确填写全通过
- **中模型(step-3.7-flash / deepseek-v4-flash):** 偶有 _verify 拆开 / 双重呈现违规,通过 HARD_STOP + Red Flag 强化后改善
- **phase 双值语义:** 消除"phase=started 表示进行中还是已完成"的歧义,跨模型理解一致

### Added

- **phase 双值语义:** phase 从 5 值扩展到 10 值(starting/started, planning/planned, applying/applied, archiving/archived, finishing/finished),与 _phase start/complete 双 commit 语义对齐——-ing 表示进行中,-ed 表示已完成
- **`alloy _verify phase-enter/phase-exit <phase> <change-dir>` 校验型 CLI:** 阶段转换状态校验(制品 + state 字段 + 目录位置),比 `_guard precheck`(单点 phase 路由)更全面
- **`alloy init` 权限白名单交互步骤:** 支持 Claude Code / CodeBuddy / Pi 项目级 permissions(allow alloy/git/openspec 等,deny force/reset/rm),减少执行确认。幂等合并,重复执行不覆盖自定义
- **`.gitattributes` 强制 LF:** `alloy init` 创建 `.gitattributes` 含 `* text=auto eol=lf`,避免 Windows CRLF 警告
- **retrospective §7 偏差分类 scaffold 模板:** 8 类偏差 checkbox(AskUserQuestion 漏触发 / 纯文本列选项 / 跳过 USER_GATE / git 自救 / 路径错误 / worktree 相关 / 时间戳错误 / memory 相关)
- **start.md explore 阶段禁实现动作 HARD_STOP:** 禁 Write/Edit/创建文件/运行实现代码,防止 agent 在 explore 阶段直接写代码跳过流程
- **alloy-skill-writing-guide.md §4.1 "双重呈现"反例:** 先文本列 (a)/(b) 再调 AskUserQuestion 是违规,5 skill Red Flags 表加对应借口
- **apply.md worktree 创建方式 HARD_STOP:** Claude Code agent 必须用 EnterWorktree 工具,路径 `.claude/worktrees/<name>`,禁手动 git worktree add
- **agent-instruction-files.md 权限机制调研:** 官网验证 5 个 agent(Claude Code / OpenCode / CodeBuddy / Trae / Pi)支持项目级 permissions

### Changed

- **[BREAKING] phase 期望值变更:** `_guard precheck` / `_verify phase-enter` / `_verify phase-exit` 期望值从 -ed 改为 -ing(因为 _phase start 推进到 -ing)。旧 .alloy.yaml phase=started 在新版 skill md 期望 planning,不兼容
- **_phase start 推进到 -ing:** 原 _phase start 只写 started_at 不推进 phase(保持 started),改后推进到 -ing(starting/planning/applying/archiving/finishing)
- **_verify phase-exit 期望值 -ed → -ing:** 校验在 _phase complete 之前调用,phase 还是 -ing(尚未推进到 -ed)
- **_verify + _phase complete 必须同命令 && 连接:** 禁拆成两个 Bash 命令(如 `_verify && echo OK || echo FAIL` 后单独 `_phase complete`),防绕过短路保护
- **§7 checkbox 语义明确:** 勾选 [x] = 观察到该偏差(违规);无偏差时全部 [ ]。加"常见误解:[x] 不是'已检查'是'有此问题'"

### Removed

- **archive 阶段 memory 写入逻辑:** 读取 retrospective §6 Promote Candidates + 逐条 USER_GATE 写入 memory——破坏 hash-lock + worktree 未 commit 修改阻碍清理。retrospective 由 `/alloy:start` 阶段扫描最近 3 个归档学习
- **finish 阶段 retrospective 离场审查(USER_GATE):** archive/finish 不再管 retrospective.md,做好自己的归档/合入即可

### Fixed

- `verify.ts` checkArtifactHash 用 computeArtifactHash(支持 specs 目录,原 readFile 失败)
- `_verify phase-exit` stateFields 去 completed_at(_phase complete 还没执行,completed_at 未写)
- retro.ts §7 scaffold 模板缺失(原模板只有 §1-§6,agent 不知道填 §7)
- retro.ts §7 checkbox 语义歧义(agent 误勾选全部 [x] 但写"无偏差")

## [0.2.0] - 2026-06-17

本版本聚焦工作流 skill 的系统化加固——5 阶段 skill 全量重写，三层防御机制（Iron Law + Red Flags + Step 内 HARD_STOP）规模化覆盖。

**模型适配表现：**
- **强模型（GLM 5.1+、DeepSeek V4 Pro）：** 流程执行接近完美，所有 USER_GATE / HARD_STOP / 制品产出符合预期
- **中等模型（DeepSeek V4 Flash、mimo-v2-pro）：** 基本符合主线流程，存在少许偏差（偶发摘要简化、Step 顺序轻微跳跃），不影响最终交付
- **弱模型支持较差，按程度分两组：**
  - **较弱（qwen3.6-27b、qwen3.6-plus 等）：** 可跑通主线，brainstorming args 摘要丢失、分支选择跳过、attributionSkill 漂移、Step 顺序偏移
  - **最弱（qwen3.6:35b-a3b-coding-mxfp8 等）：** 流程会跑断，绕过 USER_GATE / 误把 slash-command 当 bash 等更严重失败

### Added

- `alloy _spec-audit` 命令：spec ↔ skill frontmatter 自动对账（8 skill 全覆盖）
- `_state merge` 子命令支持深层合并（phase_timings 等嵌套字段）
- 终端格式化模块 `format.ts`（boxPanel / tableWithBorder / statusLine / progressBar）
- `alloy completion --install` 支持 PowerShell 自动安装
- `alloy init` 检测逻辑改进（覆盖提示、Node 18 兼容）
- 终端 UI 依赖（picocolors / cli-table3 / boxen / ora）
- start.md 目录冲突预检 + 分支创建 HARD_STOP 闸门
- plan.md draft hash 校验（`_record check` 替代 commit message 解析）+ rollback snapshot tag
- `docs/reference/alloy-skill-writing-guide.md`：项目特定 skill 编写规范
- 5 阶段 skill 三层防御：Iron Law（含"违反字面 = 违反精神"）+ Red Flags ≥8 行 + Step 内 HARD_STOP 引用块

### Changed

- 5 阶段 skill 全量重写（start / plan / apply / archive / finish），frontmatter 迁移到四字段（preconditions / hard_stops / user_gates / warns）
- 重构分支与 worktree 体系，state 驱动替代硬编码；分支选择提前至 `/opsx:new` 之前
- 重写 `alloy:fix` 流程——环境感知 → 根因诊断 → 三分支修复
- 各阶段 phase_timings 写入改用 `_state merge`
- CLI 命令（init / status / doctor / update）输出添加颜色语义
- 共享禁令引用化（git 自救禁令 / git add 限路径 / memory 批写 / 阶段推进降级）

### Fixed

- 兼容任意 superpowers plugin marketplace（detectSkill / checkSuperpowers 不再硬编码 marketplace 名）
- 三个状态写入丢失 bug 修复（apply/finish/start）
- AskUserQuestion 交互规范内联 + start.md git add 整体失败 bug 修复（多路径拆独立命令）
- plan.md `opsx:continue` 调用后补充 `_skill log` 记录
- start.md brainstorming 返回后强制恢复 AskUserQuestion 交互风格
- finish.md `_state timestamp ensure` 指向 archive 目录，防止空目录残留 .alloy.yaml
- apply.md SDD 路径 `_skill log` 移到加载前
- worktree state 写入后未 commit 导致 worktree 内 state 为 null
- worktree 分支命名统一 + archive 归档变更时序修复 + retrospective 审批时间修正
- 各阶段 commit 合并规范 + worktree 生命周期修复 + finish 时序修复
- apply.md worktree 路径偏好环境自适应（优先 `.claude/worktrees/`）
- start.md DONE box 耗时改用计算公式
- fix.md 主分支保护 HARD STOP + 热修复合并前确认步骤
- retrospective 自指 hash 悖论（hash 列改填 "—"，仅存 .alloy.yaml）
- SESSION_START 跨调用残留问题
- progressBar 除零和溢出问题
- init.ts spinner 重复输出
- altoggle 关闭时清除当前 shell alias 残留

### Removed

- 5 个 skill 末尾的 dot 流程图（-489 行，提升可读性）
- 已弃用的 `docs/superpowers/` 历史快照（移至 `.gitignore`，磁盘保留）

## [0.1.1] - 2026-05-28

### Fixed

- Superpowers 安装失败时从本地 vendor 副本兜底部署

## [0.1.0] - 2026-05-27

### Added

- Alloy CLI 初始版本——融合 OpenSpec 与 Superpowers 的开发工作流工具
- `alloy init` 项目初始化命令
- `alloy status` 工作流状态查看命令
- `alloy doctor` 环境诊断命令
- `alloy update` 自更新命令
- `alloy completion` Shell 补全命令
- 五阶段工作流 skill：start / plan / apply / archive / finish
- 修复流程 skill：alloy:fix
- OpenSpec 制品 schema 定义
- Skill 预检、主分支检测等共享引用模块
