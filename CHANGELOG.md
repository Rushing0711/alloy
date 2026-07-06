# Changelog

本文件记录 @flyin-ai/alloy 的所有版本变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

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
