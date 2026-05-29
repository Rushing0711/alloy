# Alloy CLI 跨平台兼容设计

> 状态：待实施 · 日期：2026-05-30 · 版本：v0.1.0

## 目标

`alloy` CLI 在以下平台一等支持：
- macOS
- Linux
- Windows Git Bash
- Windows PowerShell

## 核心策略：Shell 脚本 → TypeScript

参照 OpenSpec 的纯 TypeScript 架构，将 3 个 shell 脚本逻辑移植为 CLI 内部命令，消除 `bash`/`sed`/`awk`/`uname`/`date` 等外部依赖。

## 一、命令架构

```
alloy CLI
├── 用户命令（alloy --help 显示）
│   ├── init          项目初始化
│   ├── status        查看活跃 change
│   ├── doctor        诊断兼容性
│   ├── update        更新 skill 文件
│   └── completion    生成 shell 补全
│
└── 内部命令（--help 不显示，SKILL.md 调用）
    ├── _guard        阶段闸门校验（替代 alloy-guard.sh）
    ├── _state        状态文件读写（替代 alloy-state.sh）
    └── _archive      归档操作（替代 alloy-archive.sh）
```

内部命令 `_` 前缀，`--help` 中不列出。`parseArgs` 解析到 `_` 开头命令时跳过帮助展示。

## 二、代码结构

```
src/cli/commands/
├── init.ts            # 用户命令
├── status.ts
├── doctor.ts
├── update.ts
├── completion.ts
└── internal/
    ├── guard.ts       # alloy _guard
    ├── state.ts       # alloy _state
    └── archive.ts     # alloy _archive
```

`cli/index.ts` switch 逻辑将 `_` 前缀命令路由到 `internal/` 对应模块。

## 三、迁移详设

### 3.1 alloy-state.sh → state.ts

```
alloy _state read  <change-dir> <field>        → stdout 输出字段值
alloy _state write <change-dir> <field> <value> → 写入字段值，自动更新 updated_at
alloy _state check <change-dir> <phase>          → 校验 phase 匹配，不匹配 exit 1
```

实现：`yaml.parse` 读全量 YAML → 读取或修改 → `yaml.stringify` 写回。不再用 grep/sed 正则操作。

### 3.2 alloy-guard.sh → guard.ts

```
alloy _guard <change-dir> <target-phase> [--apply]
```

三个职责：
1. 校验 phase 转换合法性——`case` 映射表，仅允许 `started→planned` / `planned→applied` / `applied→archived` / `archived→finished`
2. 按转换类型检查制品完整性——`fs.existsSync` 检查对应文件/目录存在
3. `--apply` 时执行 phase 更新 → git add + git commit（如转换要求提交）

git 操作通过 `execSync` 调用，与 `init.ts`/`update.ts` 一致。

### 3.3 alloy-archive.sh → archive.ts

```
alloy _archive <project-dir> <change-name> [--dry-run]
```

步骤：
1. 调用 `_state check` 验证 phase = applied
2. `execSync("openspec archive -y <name>")` 执行归档
3. 调用 `_state write` 更新 phase → archived
4. `execSync("git add ... && git commit ...")` 提交变更

### 3.4 completion 简化

`alloy init` 时自动将补全注册到 shell 配置文件：
- bash → `~/.bashrc` 追加 `source <(alloy completion)`
- zsh → `~/.zshrc` 追加 `source <(alloy completion)`
- PowerShell → 暂不支持（未来扩展）

注册失败不阻断 init。`alloy completion` 命令保留，供手动执行。

## 四、跨平台关键点

| 关注点 | 处理方式 |
|--------|---------|
| 路径分隔符 | 全部用 `node:path`（join/dirname/basename），不手动拼 `/` |
| 外部命令 | `execSync` 调 `git` 和 `openspec`，在 Git Bash 和 PowerShell 中均可访问 |
| sed -i 平台差异 | 删除 shell 脚本后自然消失 |
| uname 平台检测 | 删除，不再需要 |
| YAML 健壮性 | `yaml.parse/stringify` 替代 grep/sed 正则，处理引号/多行值 |

## 五、SKILL.md 引用更新

| 文件 | 旧调用 | 新调用 |
|------|--------|--------|
| `alloy-plan/SKILL.md` | `bash .../alloy-guard.sh ... --apply` | `alloy _guard ... --apply` |
| `alloy-apply/SKILL.md` | `bash .../alloy-state.sh write ...` | `alloy _state write ...` |
| `alloy-archive/SKILL.md` | `bash .../alloy-archive.sh ...` | `alloy _archive ...` |

SKILL.md 通过 `alloy` CLI 调用内部命令，scope（project/global）不影响调用方式——始终 `alloy _command`，不写死路径。

## 六、测试策略

- 删除 `test/shell/` 目录（3 个 bats 文件）
- 内部命令用 vitest 编写单元测试，mock `node:fs` 和 `node:child_process`
- 现有 TypeScript 测试（`test/cli/*.test.ts`）已有 vitest + mock 模式，新测试沿用
- 完成后单一测试框架：`npm test` → vitest 全量

新增测试文件：
- `test/cli/internal/guard.test.ts`
- `test/cli/internal/state.test.ts`
- `test/cli/internal/archive.test.ts`

## 七、文件改动清单

| 层 | 操作 | 文件 |
|----|------|------|
| 新增 | `src/cli/commands/internal/guard.ts` | guard 命令 |
| 新增 | `src/cli/commands/internal/state.ts` | state 命令 |
| 新增 | `src/cli/commands/internal/archive.ts` | archive 命令 |
| 修改 | `src/cli/index.ts` | 路由 `_guard`/`_state`/`_archive` |
| 修改 | `src/cli/commands/completion.ts` | init 自动注册补全 |
| 删除 | `skills/alloy/scripts/` | 整个目录（3 个 .sh 文件） |
| 修改 | `skills/alloy-plan/SKILL.md` | 引用更新 |
| 修改 | `skills/alloy-apply/SKILL.md` | 引用更新 |
| 修改 | `skills/alloy-archive/SKILL.md` | 引用更新 |
| 删除 | `test/shell/` | bats 测试目录 |
| 新增 | `test/cli/internal/guard.test.ts` | guard 单元测试 |
| 新增 | `test/cli/internal/state.test.ts` | state 单元测试 |
| 新增 | `test/cli/internal/archive.test.ts` | archive 单元测试 |
| 修改 | `docs/alloy-design.md` | 命令参考+架构章节更新 |
| 修改 | `docs/alloy-dev-guide.md` | 去掉 bats 测试说明，更新测试约定 |

## 八、不在此次范围

- Slash Command `-` → `:` 命名约定改动（独立话题，后续处理）
- PowerShell 补全脚本（completion 当前目标 bash/zsh，PowerShell 未来扩展）
- 版本兼容性矩阵（`compat.yaml` 增强）——独立设计
