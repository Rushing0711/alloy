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
/alloy:status [name]（省略时显示所有活跃 change 总览）

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
  下一步:   等待 /alloy:apply

每次 status 运行时自动附带一致性检查:
  1. worktree 字段有值但磁盘路径不存在 → "worktree 残留"
  2. worktree 字段为 null 但 .worktrees/<name>/ 目录存在 → "worktree 孤儿"
  3. git worktree list 中孤立 worktree → 提示清理
```

## alloy doctor

```
alloy doctor [path] [--json]

诊断内容:
  1. 版本兼容性（7 项健康检查）:
     Node.js / OpenSpec / Superpowers / Alloy / Schema / Commands / Environment
     每项返回 pass / warn / fail，依据 compat.yaml 中的版本约束判断

  2. 文件一致性（双向检查）:
     ├── worktree 字段有值但磁盘路径不存在 → ⚠️ "worktree 残留"
     ├── worktree 字段为 null 但 .worktrees/<name>/ 目录存在 → ⚠️ "worktree 孤儿"（状态写入缺失）
     └── git worktree list 中有孤立 worktree → ⚠️ 提示清理

--json: 以 JSON 格式输出 healthResults + consistencyWarnings
```

## alloy init

详见 00-overview.md"七、安装与初始化"章节。

## alloy update

详见 00-overview.md"七、安装与初始化 > alloy update"章节。

## 内部命令

| 命令 | 子命令 | 说明 |
|------|--------|------|
| `alloy _state` | `read\|write\|init\|merge\|check\|timestamp` | 读写 `.alloy.yaml` 状态文件。`init` 支持 `--at <timestamp>` 回填顶层 `started_at` + `--feature-branch <name>` 一次成型写入 feature_branch |
| `alloy _skill` | `log\|skip` | 技能使用记录管理，持久化到 `skill_usage[]`。字段 `called_at`（调用时间，多次调用更新为最新）+ `count`（累加）。`log` 同一 skill+stage 已存在时 count++ |
| `alloy _guard` | `precheck\|verify-passed\|branch-position\|worktree-status` + `<name> <phase> --apply` | 阶段转换校验 + phase 推进 |
| `alloy _phase` | `start\|complete\|reset` | 阶段时间记录。`complete finish` 额外写顶层 `completed_at`（全周期完成时间） |
| `alloy _record` | `compute\|write\|check\|approver` | 制品 hash 记录管理 |
| `alloy _config` | `read\|write` | 读写 `openspec/config.yaml` 项目级配置 |
| `alloy _checkpoint` | `create\|list\|switch\|clean` | 检查点管理。`create` 支持 `--kind brainstorming\|progress`（brainstorming-N 发起变更锚点 / progress-<ts> 放弃变更进度快照）+ `--reason <原因>`。tag message 含原因/制品/phase/commit数/时间。phase 限制：start/plan 全程允许，apply 早期（worktree 未创建 + SDD/EP 未启动）允许，apply 中后期 + archive/finish 禁止。`create` 校验 working tree clean（dirty 拒绝）；`switch` 用 `git checkout -B` 原子回退，输出 tag 指向的 records 状态（已锁定/缺失制品） |
| `alloy _retro` | `scaffold` | 从 `.alloy.yaml` + `git log` + `git tag` 权威生成 retrospective.md 的 §0 量化全景 + §4 技能审计，agent 只填定性章节。跨 session 中断也能完整生成 |
| `alloy _env` | `check` | 环境完整性检测（git 仓库 / openspec/config.yaml / schema.yaml / Alloy commands start.md），4 项任一缺失 exit(1) |
| `alloy _progress` | `artifacts` | 制品进度扫描，输出每个制品状态（done/missing/hash-mismatch/pending），供 plan/apply 决定从哪个制品开始 |
| `alloy _artifact` | `commit\|reset` | `commit` 原子完成 hash 计算 + records 写入 + git add 限路径 + commit（重复锁定且 hash 未变时跳过）；`reset` 清掉指定制品的 record |
| `alloy _spec-audit` | — | spec 审计工具，详见 `alloy _spec-audit --help` |
