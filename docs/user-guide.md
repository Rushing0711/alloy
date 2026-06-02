# Alloy 用户手册

> Alloy 是一套融合 OpenSpec 和 Superpowers 的开发工作流 CLI 工具。用 OpenSpec 管理"构建什么"（需求追踪、Delta Spec、审计归档），用 Superpowers 管理"如何构建"（流程闸门、TDD、系统化调试、验证）。

## 目录

1. [快速开始](#1-快速开始)
2. [CLI 命令参考](#2-cli-命令参考)
3. [AI Agent 工作流](#3-ai-agent-工作流)
4. [配置参考](#4-配置参考)
5. [故障排除](#5-故障排除)

---

## 1. 快速开始

### 1.1 安装

```bash
npm install -g @flyin-ai/alloy
```

### 1.2 初始化项目

```bash
alloy init
```

初始化过程会：
1. 检测环境（Node.js、git、Claude Code）
2. 安装 OpenSpec CLI
3. 初始化 OpenSpec 项目结构（`openspec/` 目录）
4. 安装 Superpowers
5. 部署 Alloy commands 到 `.claude/commands/alloy/`
6. 部署 schema 到 `openspec/schemas/`
7. 更新 `.gitignore` 规则
8. 注入 CLAUDE.md 工作流提示（可选）
9. 运行兼容性检查
10. 注册 shell 补全

### 1.3 开始第一个 Change

在 Claude Code 中输入：

```
/alloy:start <功能描述>
```

例如：

```
/alloy:start 添加用户登录功能
```

Alloy 会引导你完成：
- 需求探索和设计（brainstorming）
- 生成 draft.md
- 选择 feature 分支
- 提交初始制品

---

## 2. CLI 命令参考

### 2.1 alloy init

初始化项目，安装依赖，部署 schema 和 commands。

**用法：**

```bash
alloy init [path] [options]
```

**参数：**

- `path` — 项目路径（默认当前目录）

**选项：**

- `--scope <project|global>` — 安装范围，默认 `project`
- `--inject-claude-md` — 注入 CLAUDE.md 工作流标记（默认关闭）
- `--help, -h` — 显示帮助

**示例：**

```bash
# 在当前目录初始化
alloy init

# 在指定路径初始化
alloy init /path/to/project

# 全局安装
alloy init --scope global

# 注入 CLAUDE.md
alloy init --inject-claude-md
```

**输出示例：**

```
  🔍 检测环境...
     Node.js v20.10.0 ✓
     git ✓
     Claude Code ✓

  📥 OpenSpec CLI...
     ✓ @fission-ai/openspec@1 已安装

  📂 初始化 OpenSpec 项目结构...

  📥 Superpowers...
     ✓ obra/superpowers@5 已安装

  🚀 部署 Alloy commands...
     ✓ /path/to/project/.claude/commands/alloy/start.md
     ✓ /path/to/project/.claude/commands/alloy/plan.md
     ✓ /path/to/project/.claude/commands/alloy/apply.md
     ✓ /path/to/project/.claude/commands/alloy/archive.md
     ✓ 项目 schema → /path/to/project/openspec/schemas/

  🩺 兼容性检查...
     ✓ node-version >=18.0.0（要求 >=18.0.0）
     ✓ git-installed true（要求 true）

  🐚 注册 shell 补全...
     ✓ shell 补全已注册 → ~/.zshrc

  ✅ Alloy 就绪！
     在 Claude Code 中输入 /alloy:start <topic> 开始工作
```

### 2.2 alloy status

查看活跃 change 状态。

**用法：**

```bash
alloy status [path|name] [options]
```

**参数：**

- `path` — 项目路径（默认当前目录）
- `name` — change 名称（查看详情模式）

**选项：**

- `--json` — JSON 格式输出
- `--help, -h` — 显示帮助

**示例：**

```bash
# 查看所有活跃 change
alloy status

# 查看指定 change 详情
alloy status my-feature

# JSON 格式输出
alloy status --json
```

**输出示例（概览模式）：**

```
活跃 Change：
  my-feature          started     artifacts: draft ✓ proposal ✗ design ✗ specs ✗ tasks ✗ plans ✗
  another-feature     planned     artifacts: draft ✓ proposal ✓ design ✓ specs ✗ tasks ✗ plans ✗

下一步：my-feature 等待 /alloy:plan；another-feature 等待 /alloy:apply
```

**输出示例（详情模式）：**

```
阶段:    started
Change:  my-feature
路径:    /path/to/project/openspec/changes/my-feature
创建时间: 2026-06-02 10:00:00
更新时间: 2026-06-02 10:30:00
制品状态:
  draft        ✓
  proposal     ✗
  design       ✗
  specs        ✗
  tasks        ✗
  plans        ✗
下一步:   继续 /alloy:plan，等待下一个制品生成
```

### 2.3 alloy doctor

诊断版本兼容性和文件一致性。

**用法：**

```bash
alloy doctor [path] [options]
```

**参数：**

- `path` — 项目路径（默认当前目录）

**选项：**

- `--json` — JSON 格式输出
- `--help, -h` — 显示帮助

**示例：**

```bash
# 运行诊断
alloy doctor

# JSON 格式输出
alloy doctor --json
```

**输出示例：**

```
健康检查：
  ✓ Node.js: v20.10.0（要求 >=18.0.0）
  ✓ OpenSpec: v1.2.0（要求 >=1.0.0）
  ✓ Superpowers: 已安装 v5（要求 >=5.0.0）
  ✓ Alloy: v0.1.1（要求 >=0.1.0）
  ✓ Schema: 兼容（要求 v1）
  ✓ Commands: 8/8 完整
  ✓ Environment: git ✓

文件一致性：✓ 无问题
```

**检查项目：**

- **健康检查：** Node.js 版本、OpenSpec CLI 版本、Superpowers 版本、Alloy CLI 版本、Schema 版本兼容性、Commands 文件完整性、环境（git 安装）
- **文件一致性：** worktree 残留检测、worktree 孤儿检测、孤立 worktree 检测

### 2.4 alloy update

更新 command 文件到最新版。

**用法：**

```bash
alloy update [path]
```

**参数：**

- `path` — 项目路径（默认当前目录）

**选项：**

- `--help, -h` — 显示帮助

**示例：**

```bash
# 更新当前项目
alloy update

# 更新指定项目
alloy update /path/to/project
```

**行为：**

1. 自动检测 scope（project/global）
2. 开发模式：从本地构建重新部署
3. 用户模式：检查 npm registry 是否有新版本，询问确认后升级
4. 部署最新 commands 和 schema
5. 更新 CLAUDE.md 标记区域（如果存在）

**输出示例：**

```
  发现新版本: v0.2.0（当前 v0.1.0）
  🩺 兼容性检查…
     ✓ 兼容性检查通过
  是否升级 alloy？ (y/N) y
  ✓ alloy CLI 已升级
  ✓ commands/ → 部署 8 个文件到 1 个 agent
  ✓ schema/ → 已部署
  ✓ CLAUDE.md → Alloy 标记区域已更新
```

### 2.5 alloy version

查看版本号。

**用法：**

```bash
alloy --version
alloy -v
```

**输出示例：**

```
alloy v0.1.1
```

### 2.6 alloy completion

生成 shell 补全脚本。

**用法：**

```bash
alloy completion [shell] [options]
```

**参数：**

- `shell` — 目标 shell（bash / zsh / pwsh / powershell，默认从 `$SHELL` 检测）

**选项：**

- `--install` — 自动注册到 shell 配置文件（永久生效）
- `--help, -h` — 显示帮助

**行为说明：**

| 命令 | 行为 |
|------|------|
| `alloy completion zsh` | 仅输出补全脚本（不安装） |
| `alloy completion --install` | 自动安装到 rc 文件（永久生效） |
| `source <(alloy completion zsh)` | 临时启用（当前 session） |

**示例：**

```bash
# 方式 1：自动安装（推荐，支持 bash/zsh/powershell）
alloy completion --install

# 方式 2：临时启用（当前 session）
source <(alloy completion zsh)
source <(alloy completion bash)
```

---

## 3. AI Agent 工作流

### 3.1 概述

Alloy 的核心工作流在 AI Agent（如 Claude Code）中执行。通过 `/alloy:*` 命令驱动，每个阶段有明确的产出物和 commit。

### 3.2 阶段流程

```
start → plan → apply → archive → finish
```

| 阶段 | 命令 | 产出物 | Commit 说明 |
|------|------|--------|-------------|
| Start | `/alloy:start <topic>` | draft.md | `docs(<name>): draft 已确认` |
| Plan | `/alloy:plan [name]` | proposal.md, design.md, specs/, tasks.md | `docs(<name>): <artifact> 已确认` |
| Apply | `/alloy:apply [name]` | 代码实现、verify.md、retrospective.md | `feat(<name>): <实现内容>` |
| Archive | `/alloy:archive [name]` | retrospective.md | `docs(<name>): archive 归档` |
| Finish | `/alloy:finish [name]` | 状态更新为 finished | `chore(<name>): finish 收尾` |

### 3.3 Start 阶段

**命令：** `/alloy:start <功能描述>`

**执行流程：**

1. 检测项目是否已初始化（`openspec/config.yaml`）
2. 扫描活跃 change
3. 探查项目上下文（`opsx:explore` 技能）
4. 需求设计（`superpowers:brainstorming` 技能）
5. 生成 `draft.md`
6. 创建 change 目录和状态文件
7. 选择 feature 分支
8. 提交制品

**产出物：** `openspec/changes/<name>/draft.md`

**Commit：** `docs(<name>): draft 已确认`

### 3.4 Plan 阶段

**命令：** `/alloy:plan [name]`

**执行流程：**

1. 读取 draft.md
2. 生成 proposal.md（提案）
3. 生成 design.md（技术设计）
4. 生成 specs/（规格说明）
5. 生成 tasks.md（任务清单）
6. 每个制品确认后提交

**产出物：**
- `openspec/changes/<name>/proposal.md`
- `openspec/changes/<name>/design.md`
- `openspec/changes/<name>/specs/`
- `openspec/changes/<name>/tasks.md`

**Commit：** 每个制品单独提交，格式 `docs(<name>): <artifact> 已确认`

### 3.5 Apply 阶段

**命令：** `/alloy:apply [name]`

**执行流程：**

1. 创建 worktree 隔离环境
2. 按任务清单实现功能（SDD + TDD）
3. 代码验证
4. 制品验证（生成 verify.md）
5. 复盘（生成 retrospective.md）

**产出物：**
- 代码实现
- `openspec/changes/<name>/verify.md`
- `openspec/changes/<name>/retrospective.md`

**Commit：** `feat(<name>): <实现内容>`

### 3.6 Archive 阶段

**命令：** `/alloy:archive [name]`

**执行流程：**

1. 回顾整个 change 过程
2. 生成 retrospective.md（回顾文档）
3. 归档 change

**产出物：** `openspec/changes/<name>/retrospective.md`

**Commit：** `docs(<name>): archive 归档`

### 3.7 Finish 阶段

**命令：** `/alloy:finish [name]`

**执行流程：**

1. 更新状态为 finished
2. 清理 worktree（如果存在）

**Commit：** `chore(<name>): finish 收尾`

### 3.8 其他命令

- `/alloy:fix` — Bug 修复流程
- `/alloy:discard` — 丢弃 change
- `/alloy:status [name]` — 查看状态

---

## 4. 配置参考

### 4.1 .alloy.yaml 状态文件

每个 change 目录下的 `.alloy.yaml` 记录该 change 的状态。

**字段说明：**

```yaml
phase: started          # 当前阶段：started/planned/applied/archived/finished
worktree: null          # worktree 路径（null 表示未创建，"skipped" 表示用户选择跳过）
schema_version: 1       # schema 版本号
feature_branch: null    # feature 分支名称
created_at: "2026-06-02 10:00:00"  # 创建时间
updated_at: "2026-06-02 10:30:00"  # 更新时间
records: []             # 制品记录（hash、审批时间、审批人）
phase_timings: {}       # 阶段时间记录
```

**phase 值说明：**

- `started` — Start 阶段完成，等待 Plan
- `planned` — Plan 阶段完成，等待 Apply
- `applied` — Apply 阶段完成，等待 Archive
- `archived` — Archive 阶段完成，等待 Finish
- `finished` — 工作流完成

### 4.2 openspec/ 目录结构

```
openspec/
├── config.yaml              # OpenSpec 项目配置
├── changes/                 # Change 目录
│   ├── <change-name>/       # 单个 change
│   │   ├── .alloy.yaml      # 状态文件
│   │   ├── draft.md         # 草案
│   │   ├── proposal.md      # 提案
│   │   ├── design.md        # 技术设计
│   │   ├── specs/           # 规格说明
│   │   ├── tasks.md         # 任务清单
│   │   └── retrospective.md # 回顾文档
│   └── archive/             # 已归档 change
└── schemas/                 # Schema 定义
    └── alloy/
        ├── schema.yaml      # 制品 DAG 依赖定义
        ├── instructions/    # 制品指令文件
        └── templates/       # 制品模板
```

### 4.3 commands/ 目录结构

```
.claude/
└── commands/
    ├── alloy/               # 冒号版命令（Claude Code/Qoder/CodeBuddy）
    │   ├── start.md         # /alloy:start
    │   ├── plan.md          # /alloy:plan
    │   ├── apply.md         # /alloy:apply
    │   ├── archive.md       # /alloy:archive
    │   ├── finish.md        # /alloy:finish
    │   ├── fix.md           # /alloy:fix
    │   ├── discard.md       # /alloy:discard
    │   └── status.md        # /alloy:status
    │
    └── 横线版（自动生成，供 Cursor/OpenCode/Codex/Trae/Pi 使用）
        ├── alloy-start.md
        ├── alloy-plan.md
        ├── alloy-apply.md
        ├── alloy-archive.md
        ├── alloy-finish.md
        ├── alloy-fix.md
        ├── alloy-discard.md
        └── alloy-status.md
```

> **注意：** `alloy init` 部署时会自动为不支持冒号的 Agent 生成横线版命令文件。冒号版和横线版内容相同，仅文件名和 frontmatter 中的 `:` 替换为 `-`。

---

## 5. 故障排除

### 5.1 常见错误

#### "Alloy 未初始化"

**错误信息：** `⚠️ Alloy 未初始化，请先运行 alloy init`

**解决方案：**

```bash
alloy init
```

#### "OpenSpec 项目结构未找到"

**错误信息：** `openspec/config.yaml 不存在`

**解决方案：**

```bash
alloy init
```

#### "缺少必要依赖"

**错误信息：** `❌ 缺少必要依赖，请先安装 git`

**解决方案：**

安装 git：

```bash
# macOS
brew install git

# Ubuntu/Debian
sudo apt-get install git

# Windows
# 下载 Git for Windows: https://git-scm.com/download/win
```

#### "OpenSpec CLI 安装失败"

**错误信息：** `✗ OpenSpec CLI 安装失败`

**解决方案：**

```bash
# 手动安装
npm install -g @fission-ai/openspec@1

# 然后重新初始化
alloy init
```

#### "Superpowers 安装失败"

**错误信息：** `⚠ Superpowers 安装失败，请稍后手动运行 alloy init 重试`

**解决方案：**

```bash
# 重新运行 init
alloy init
```

#### "command 部署失败"

**错误信息：** `✗ command 部署失败: <error message>`

**解决方案：**

```bash
# 检查权限
ls -la .claude/commands/

# 重新部署
alloy update
```

### 5.2 使用 alloy doctor 诊断

运行诊断命令检查环境：

```bash
alloy doctor
```

**健康检查项目：**

- ✓ Node.js 版本 >= 18.0.0
- ✓ OpenSpec CLI 版本兼容
- ✓ Superpowers 版本兼容
- ✓ Alloy CLI 版本兼容
- ✓ Schema 版本兼容性（校验各 change 的 schema_version）
- ✓ Commands 文件完整性（检查 8 个 command 文件是否完整）
- ✓ git 已安装

**文件一致性检查：**

- ✓ worktree 残留检测
- ✓ worktree 孤儿检测
- ✓ 孤立 worktree 检测

### 5.3 查看 Change 历史

#### 查看活跃 Change

```bash
alloy status
```

#### 查看指定 Change 详情

```bash
alloy status <change-name>
```

#### 查看已归档 Change

```bash
ls openspec/changes/archive/
```

### 5.4 重置环境

如果环境出现问题，可以完全重置：

```bash
# 删除 Alloy 相关文件
rm -rf .claude/commands/alloy/
rm -rf openspec/
rm -f .alloy.yaml

# 重新初始化
alloy init
```

### 5.5 更新 Alloy

```bash
# 检查更新
alloy update

# 手动升级 npm 包
npm update -g @flyin-ai/alloy

# 重新部署 commands
alloy update
```

### 5.6 Shell 补全不工作

```bash
# 重新注册补全
alloy completion --install

# 或手动加载
source <(alloy completion zsh)  # zsh
source <(alloy completion bash) # bash
```

---

## 附录

### A. 环境要求

- Node.js >= 18.0.0
- git >= 2.0.0
- Claude Code（推荐）

### B. 相关文档

- [alloy-design.md](alloy-design.md) — 产品规格
- [alloy-dev-guide.md](alloy-dev-guide.md) — 开发指南
- [workflow-design.md](workflow-design.md) — 设计推导
- [project-background.md](project-background.md) — 项目背景

### C. 获取帮助

```bash
# 查看 Alloy 帮助
alloy --help

# 查看特定命令帮助
alloy init --help
alloy status --help
alloy doctor --help
alloy update --help
alloy completion --help
```
