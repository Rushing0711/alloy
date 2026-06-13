---
behaviors:
  stops: 0
  hard_stops: 0
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
| `alloy _state` | `read\|write\|init\|merge\|check\|timestamp` | 读写 `.alloy.yaml` 状态文件 |
| `alloy _skill` | `log\|skip` | 技能使用记录管理，持久化到 `skill_usage[]` |
| `alloy _guard` | `precheck\|verify-passed\|branch-position\|worktree-status` + `<name> <phase> --apply` | 阶段转换校验 + phase 推进 |
| `alloy _record` | `compute\|write\|check\|approver` | 制品 hash 记录管理 |
| `alloy _config` | `read\|write` | 读写 `openspec/config.yaml` 项目级配置 |
