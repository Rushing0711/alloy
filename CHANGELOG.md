# Changelog

本文件记录 @flyin-ai/alloy 的所有版本变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

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
