# Changelog

本文件记录 @flyin-ai/alloy 的所有版本变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [0.2.0-beta.1] - 2026-06-11

### Fixed

- start.md Step 3 分支创建闸门加固——插入⑥验证 HARD STOP（脚本校验 + 人类审查窗口）+ Red Flags 补充 4 条分支跳过借口 + Step 4 前置条件
- start.md skill_usage 记录在 change name 确定之前无法执行——移至目录创建后批量补录
- fix.md _skill log 批量命令加 && 链接 + 同类 bug 修复

## [0.2.0-beta.0] - 2026-06-10

### Added

- `_state merge` 子命令支持深层合并（phase_timings 等嵌套字段）
- 终端格式化模块 `format.ts`——boxPanel、tableWithBorder、statusLine、progressBar 函数
- output.ts 输出层统一 CLI 输出格式
- alloy init 检测逻辑改进——覆盖提示、Node 18 兼容
- alloy completion --install 支持 PowerShell 自动安装
- apply.md SDD commit 前增加 untracked 文件检查
- start.md 分支检测逻辑优化
- apply 阶段 worktree 生命周期和技能融合完善
- 降级 @inquirer/prompts v7，Node 18 支持箭头选择
- 终端 UI 依赖（picocolors/cli-table3/boxen/ora）

### Changed

- 重构分支与 worktree 体系，state 驱动替代硬编码
- 分支选择提前至 /opsx:new 之前，优化前置检查规则
- 重写 alloy:fix 流程——环境感知→根因诊断→三分支修复
- start/plan/apply/archive/finish 各阶段 phase_timings 写入改用 `_state merge`
- CLI 命令（init/status/doctor/update）输出添加颜色语义
- 锁定 boxen/ora/string-width 低版本兼容 Node 18

### Fixed

- apply.md worktree state 写入后未 commit 导致 worktree 内 state 为 null
- worktree 分支命名统一 + archive 归档变更时序修复 + retrospective 审批时间修正
- 各阶段 commit 合并规范 + worktree 生命周期修复 + finish 时序修复
- phase_timings merge 调用加变量空值兜底 + _state write 禁令注释
- apply.md worktree 路径偏好环境自适应（优先 .claude/worktrees/）
- start.md DONE box 耗时从 XmXs 改为计算公式
- plan.md DRAFT_RECORD None 安全处理
- fix.md 加主分支保护 HARD STOP——禁止在 main 上直接修改代码
- fix.md 热修复合并前增加确认步骤，避免自动合并
- retrospective 自指 hash 悖论——hash 列改填 "—"，hash 仅存 .alloy.yaml
- SESSION_START 跨调用残留问题——改 date 输出 + agent 捕获占位符
- progressBar 除零和溢出问题
- init.ts spinner 重复输出和 skipped 分支
- 统一 PowerShell 为小写 powershell
- altoggle 关闭时清除当前 shell 的 alias 残留
- 修复 completion 输出中的 PowerShell 大小写
- 扩展 AlloyState 类型支持 null 值

### Removed

- 删除 docs/superpowers/ 过时设计文档

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
