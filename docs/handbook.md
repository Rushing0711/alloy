# Alloy 高级开发手册

> **目标读者：** 人类开发者
> **职责：** 让你理解 Alloy 的设计思路，知道每个阶段"为什么这样设计"、遇到选择时"该选哪个"、以及如何构建和调试 Alloy 本身。
> **不放入：** Agent 内部流程指令（给 Agent 看的见 specification/ 和 reference/）；终端输出精确格式（见 specification/02-visual-spec.md）。

---

## 一、Alloy 设计哲学

### 三层架构

Alloy 由三层构成，每层负责不同的可靠性级别：

```
CLI 控制层（TypeScript，确定性）
    ↓ 内部命令调用（_state / _guard / _record / _config）
Schema 制品层（DAG + instruction，硬约束）
    ↓ 技能编排
大模型内容层（文档/代码生成，柔性 + 人类审查）
```

| 层 | 在哪运行 | 内容 | 可靠性 |
|----|---------|------|--------|
| CLI | 终端 | 安装、诊断、状态总览、内部命令 | 确定性强（TypeScript） |
| Skill | Agent 内部 | 流程编排、阶段检测、审查窗口 | 硬约束（SKILL.md 指令 + CLI 内部命令） |
| AI 内容 | Agent 内部 | 文档生成、代码生成、交互决策 | 柔性（AI 发挥，人类审查） |

### 为什么是 5 阶段

```
start → plan → apply → archive → finish
```

每个阶段回答一个核心问题：

| 阶段 | 回答 | 产出 | 谁把关 |
|------|------|------|--------|
| start | "做什么" | draft.md | 你确认方案 |
| plan | "怎么做" | proposal → design → specs → tasks → plans | 你审查每个制品 |
| apply | "做出来" | 代码 + verify + retrospective | TDD + 双层验证 + 复盘 |
| archive | "记下来" | Delta Spec 合并 → 归档 | 你确认归档 |
| finish | "交出去" | merge / PR / keep | 你选择合入方式 |

**archive 和 finish 为什么要分开？** 先锁定文档证据链（archive），再合入代码（finish）。避免"代码合入了但 spec 没跟上"的窗口期。如果 archive 时发现 spec 有遗漏，还能补；代码一合入 PR，再改 spec 就是另一个 change 了。

### 三层防线

Alloy 不是靠"相信 Agent"来保证质量，而是靠三层防线：

| 防线 | 机制 | 能不能跳过 |
|------|------|-----------|
| 指令层 | SKILL.md 硬约束 + 反例定义 | Agent 可能跳过（第一层最弱） |
| 脚本层 | `alloy _guard` + `alloy _record check` | **不能**——TypeScript 硬阻断 |
| 审查层 | 每制品人工确认（不提供"跳过"） | **不能**——必须你点头 |

---

## 二、关键决策指南

### 分支策略

**Q: start 阶段为什么必须建分支？**

分支隔离的是**提交历史**。在主分支上开发有两个问题：

1. **commit 污染主分支历史**——draft.md、proposal.md 等中间制品会混入主分支，feature 分支 squash merge 后这些中间 commit 不会出现
2. **discard 无法安全清理**——如果 change 做到一半要放弃，在主分支上只能 `git reset`，可能误伤其他已提交的内容；在 feature 分支上直接删分支即可

**规则：** 每个 change 一条 feature 分支，命名 `feature/<change-name>`。分支由 start 阶段自动创建，apply 结束时合并回主分支。

### Worktree 决策

**Q: 什么时候需要 worktree？**

worktree 隔离的是**工作目录**。分支隔离的是提交历史，但同一时间只有一个分支能 checkout 在工作目录里。worktree 让你能同时 checkout 多个分支。

需要 worktree 的场景：**feature 开发期间需要切到其他分支**（如修紧急 bug、切 main 查东西）。有 worktree 就不用 stash/commit 当前进度，直接进另一个目录操作。

不需要 worktree 的场景：**feature 开发一气呵成，不需要中间切走**。在当前分支直接工作更简单。

**Q: 为什么 worktree 在 apply 内创建、内销毁，不带到 archive/finish？**

worktree 是 apply 的**本地实现细节**。apply 完成后代码已经合并回 feature 分支，worktree 的工作使命就结束了。archive/finish 感知不到 worktree 的存在——它们操作的是 feature 分支本身。这让每个阶段的职责清晰：apply 管实现，archive 管归档，finish 管合入。

**判断标准：**

> feature 开发期间需要切到其他分支？→ 是 → 用 worktree
> 
> feature 开发一气呵成？→ 否 → 在当前分支工作

### 执行策略：SDD vs executing-plans

**Q: 什么时候该选哪个？**

| 场景 | SDD（推荐） | executing-plans |
|------|:-----------:|:---------------:|
| 任务 ≥ 3 个、相互独立 | ✓ 最佳 | 非最佳 |
| 涉及不同文件/模块 | ✓ 并行无冲突 | 非最佳 |
| 新功能、多组件改造 | ✓ 推荐 | 可选 |
| 任务 1-2 个、紧密耦合 | 可选 | ✓ 更合适 |
| 共享状态或同一文件 | 可能冲突 | ✓ 串行安全 |
| 小修小改、重构单个模块 | 过头了 | ✓ 推荐 |

**选错了怎么办？** apply 步骤自带幂等检查——已完成的任务不重跑。选 SDD 后发现任务耦合紧密，可以退出重选 executing-plans；反过来也一样。不会有"做了一半回不了头"的问题。

---

## 三、5 阶段详解（人类视角）

### 3.1 Start — 需求探索

**你在做什么：** 告诉 Agent 你想做什么，Agent 引导你通过 brainstorming 把模糊想法变成清晰的方案。

**你需要配合的：**
- 回答 Agent 的追问（每次一个问题，目的是帮你把需求想清楚）
- 确认 Agent 提出的方案（关键决策、范围边界）
- 确认 change name 和 feature 分支名

**产出物：** `openspec/changes/<name>/draft.md`

### 3.2 Plan — 规划

**你在做什么：** 看 Agent 逐份生成规划制品，每份审查通过后才继续下一份。

**你需要配合的：**
- 审查 proposal（范围对不对？定位准不准？）
- 审查 design（技术方案是否合理？）
- 审查 specs（行为契约是否完整？）
- 审查 tasks（任务清单有没有遗漏？）
- 审查 plans（执行计划是否可操作？）

**什么算审查到位了：**
- 不看内容直接说"继续"——不够，你至少扫一眼
- Agent 展示了内容，你说"可以"——够了，不一定逐行细读
- 发现问题要求修改——这是审查的价值

### 3.3 Apply — 执行

**你在做什么：** 选择隔离方式和执行策略，Agent 实现代码、验证、复盘。

**你需要配合的：**
- 选是否建 worktree（见第二章决策指南）
- 选 SDD 还是 executing-plans（见第二章决策指南）
- 审视 verify 和 retrospective 的结果
- 确认 apply 完成

### 3.4 Archive — 归档

**你在做什么：** Agent 把 Delta Spec 合并到主 spec，change 目录移入 archive/。你只需确认。

**注意：** archive 完成后代码还在 feature 分支上，没有合入主分支。代码合入是 finish 的事。

### 3.5 Finish — 收尾

**你在做什么：** 选择代码合入方式：
- **本地 merge** — 合入主分支，本地完成
- **创建 PR** — 提交代码审查，等待 reviewer 批准
- **保留分支** — 暂不处理（选了 archive 后随时可以再跑 finish）

**选 PR 后：** 审查反馈通过自然对话处理。Agent 内部遵循 receiving-code-review 规范（验证优先、不盲从、技术推理）。

---

## 四、CLI 命令参考

### 4.1 外部命令

| 命令 | 参数 | 说明 |
|------|------|------|
| `alloy init` | `[path]` | 项目初始化：HOME 拦截 → 确保 git 仓库 → 安装依赖 → 部署 schema + skill |
| | `--scope <global\|project>` | 安装范围，默认 project |
| | `--inject-claude-md` | 注入 CLAUDE.md（默认关闭） |
| | `--agents <id,id,...>` | 非交互式模式，指定 AI 工具 |
| `alloy status` | `[path\|name] [--json]` | 查看活跃 change 总览或指定 change 详情 |
| | `--json` | JSON 格式输出 |
| `alloy doctor` | `[path]` | 诊断：版本兼容性、文件一致性 |
| | `--json` | JSON 格式输出 |
| `alloy update` | `[path]` | 重新部署 skill + schema。开发模式（有 .git）直接部署本地；用户模式查 npm registry 新版 |
| `alloy completion` | `[shell] [--install]` | 生成 shell 补全脚本 |
| `alloy --version`, `-v` | | 版本号 |
| `alloy --help`, `-h` | | 帮助 |

### 4.2 内部命令（Agent 调用，用户一般不直接使用）

| 命令 | 说明 |
|------|------|
| `alloy _state` | 读写 `.alloy.yaml` 状态文件（`read\|write\|init\|check`） |
| `alloy _guard` | 阶段转换校验 + phase 推进 |
| `alloy _record` | 制品 hash 记录管理（`compute\|write\|check\|approver`） |
| `alloy _config` | 读写 `openspec/config.yaml` 项目级配置 |

### 4.3 Slash Command（AI Agent 内使用）

| 命令 | 用途 |
|------|------|
| `/alloy:start [topic]` | 智能入口：自动检测状态，接续或新建 |
| `/alloy:plan [name]` | 制品生成，每步审查 |
| `/alloy:apply [name]` | 执行：worktree + 实现 + 验证 + 复盘 |
| `/alloy:archive [name]` | 归档：Delta Spec 合并 + 归档 |
| `/alloy:finish [name]` | 收尾：merge / PR / keep |
| `/alloy:fix` | Bug 修复入口：诊断 → 分流 |
| `/alloy:discard [name]` | 放弃当前 change，清理现场 |
| `/alloy:status [name]` | 查看阶段、制品状态、下一步 |

---

## 五、构建与测试

### 常规命令

```bash
npm run build        # tsc 编译 → dist/ + chmod +x dist/cli/index.js
npm run dev          # tsc --watch 开发模式
npm test             # vitest run（全量）
npm run test:watch   # vitest 交互式 watch 模式
```

### 本地调试：aldev

`aldev` 是一个 shell 函数，直接运行本地编译产物 `dist/cli/index.js`。适合 CLI 命令（init、status、doctor、update）的开发测试，不依赖 npm link。

```bash
npm run build                     # 先编译
aldev init                        # 测试 init 命令
aldev doctor                       # 测试 doctor 命令
aldev update                       # 测试 update 命令
aldev status                       # 测试 status 命令
```

**设置方法：** 在 shell rc 文件中添加：

```bash
# macOS / Linux（bash、zsh）
aldev() {
  node /path/to/your/alloy/dist/cli/index.js "$@"
}
```

```powershell
# Windows PowerShell
function aldev {
  node C:\path\to\your\alloy\dist\cli\index.js $args
}
```

WSL 用户同 Linux 配置，路径使用 WSL 内的绝对路径。

### 使用本地 alloy 测试 Skill 流程

当你在 Claude Code 的 skill 中需要调用 `alloy _state`、`alloy _guard` 等内部命令时，`alloy` 命令需要指向本地 dist，而非 npm 全局稳定版。使用 `altoggle` 管理这个切换：

```bash
altoggle       # 第一次执行：开启（alloy → 本地 dist）
altoggle       # 再执行一次：关闭（alloy → 稳定版）
               # 再执行：开启……如此循环
```

**原理：** `altoggle` 在 shell rc 文件中添加/注释 `alias alloy='node /path/to/alloy/dist/cli/index.js'`。开启时 skill 中调用的 `alloy` 命令指向本地代码；关闭时恢复 npm 全局安装的稳定版。

**设置方法：**

```bash
# macOS / Linux（bash、zsh）— 添加到 .zshrc 或 .bashrc
altoggle() {
  local rc="$HOME/.zshrc"    # bash 用户改为 .bashrc
  local alias_line="alias alloy='node $HOME/path/to/alloy/dist/cli/index.js'"

  if grep -q "^alias alloy=" "$rc" 2>/dev/null; then
    sed -i '' '/^alias alloy=/s/^/#/' "$rc"          # Linux 用 sed -i 不加 ''
    unalias alloy 2>/dev/null
    echo "→ alloy 开发 alias 已关闭（使用稳定版）"
  elif grep -q "^#alias alloy=" "$rc" 2>/dev/null; then
    sed -i '' '/^#alias alloy=/s/^#//' "$rc"         # Linux 用 sed -i 不加 ''
    echo "→ alloy 开发 alias 已开启（使用本地 dist）"
  else
    echo "" >> "$rc"
    echo "# Alloy 开发 alias — skill 中使用本地 dist" >> "$rc"
    echo "$alias_line" >> "$rc"
    echo "→ alloy 开发 alias 已添加（使用本地 dist）"
  fi
  source "$rc"
}
```

```powershell
# Windows PowerShell — 添加到 $PROFILE
function altoggle {
  $profilePath = $PROFILE
  $aliasLine = "Set-Alias alloy node C:\path\to\alloy\dist\cli\index.js"

  if (Select-String -Path $profilePath -Pattern "Set-Alias alloy" -Quiet) {
    # 简单的开关：删除或添加 alias 行
    $content = Get-Content $profilePath
    $newContent = $content | Where-Object { $_ -notmatch "Set-Alias alloy" }
    if ($content.Count -eq $newContent.Count) {
      # 已删除，重新添加
      $newContent += $aliasLine
      $newContent | Set-Content $profilePath
      Write-Host "→ alloy 开发 alias 已开启（使用本地 dist）"
    } else {
      $newContent | Set-Content $profilePath
      Remove-Item Alias:alloy -ErrorAction SilentlyContinue
      Write-Host "→ alloy 开发 alias 已关闭（使用稳定版）"
    }
  } else {
    Add-Content $profilePath $aliasLine
    Write-Host "→ alloy 开发 alias 已添加（使用本地 dist）"
  }
}
```

**注意：** Windows 用户建议使用 WSL 进行开发，WSL 内的 Node.js 行为和 Linux 一致。

### 测试约定

| 规则 | 说明 |
|------|------|
| Node.js ≥ 18 | 编译和测试通过即可，不依赖特定 Node.js 新 API |
| ESM 模块 | `"type": "module"`，import 用 `.js` 后缀 |
| `execSync` 用 `pipe` | 捕获输出静默运行，错误通过 try/catch 处理 |
| 类型统一放 `core/types.ts` | 避免 `AlloyState` 重复定义 |

### 跨层复盘清单

任何代码改动完成后，按以下 6 层逐一检查：

```
[ ] 1. 设计文档 (docs/specification/01-product-spec.md) — 设计描述需要更新吗？
[ ] 2. Schema    (openspec/schemas/alloy/) — DAG/制品/instructions 需要同步吗？
[ ] 3. Guard     (src/cli/commands/internal/guard.ts) — 检查规则完整吗？
[ ] 4. Skill 文档 (commands/alloy/*.md) — 流程描述/闸门指令需要更新吗？
[ ] 5. CLI 代码  (src/) — 实现对齐了吗？
[ ] 6. 测试      (test/) — 新增回归测试了吗？
```

不满足 6 层检查不提交。

---

## 六、配置参考

### 6.1 .alloy.yaml（per-change 状态文件）

每个 change 目录下的 `.alloy.yaml` 记录该 change 的状态：

```yaml
phase: started              # started / planned / applied / archived / finished
worktree: null              # null=未创建，"skipped"=跳过，路径=已创建
schema_version: 1           # schema 版本号
feature_branch: "feature/login"  # feature 分支名（start 阶段写入）
created_at: "2026-06-02 10:00:00"
updated_at: "2026-06-02 10:30:00"
phase_timings:              # 各阶段时间
  start:
    started_at: "2026-06-02 10:00:00"
    completed_at: "2026-06-02 10:07:35"
  plan:
    started_at: "2026-06-02 10:07:47"
    completed_at: "2026-06-02 10:15:30"
records:                    # 制品 hash 记录
  - artifact: proposal
    hash: "abc123"
    committed_at: "2026-06-02 10:15:00"
    approver: "human"
```

### 6.2 openspec/config.yaml（项目级配置）

```yaml
schema: alloy
alloy:
  main_branch: main    # 用户确认的主分支名
```

### 6.3 openspec/ 目录结构

```
openspec/
├── config.yaml              # 项目配置
├── changes/                 # Change 目录
│   ├── <change-name>/       # 单个 change
│   │   ├── .alloy.yaml      # 状态文件
│   │   ├── draft.md         # 草案（start）
│   │   ├── proposal.md      # 提案（plan）
│   │   ├── design.md        # 技术设计（plan）
│   │   ├── specs/           # 规格说明（plan）
│   │   ├── tasks.md         # 任务清单（plan）
│   │   ├── plans.md         # 执行计划（plan，writing-plans 生成）
│   │   ├── verify.md        # 验证报告（apply）
│   │   └── retrospective.md # 复盘（apply）
│   └── archive/             # 已归档 change
└── schemas/                 # Schema 定义
    └── alloy/
        ├── schema.yaml      # 制品 DAG 依赖定义
        ├── instructions/    # 制品指令文件
        └── templates/       # 制品模板
```

### 6.4 commands/ 目录结构

```
.claude/
└── commands/
    ├── alloy/               # 冒号版（Claude Code / Qoder / CodeBuddy）
    │   ├── start.md
    │   ├── plan.md
    │   ├── apply.md
    │   ├── archive.md
    │   ├── finish.md
    │   ├── fix.md
    │   ├── discard.md
    │   └── status.md
    │
    └── 横线版（自动生成，供 Cursor / OpenCode / Codex / Trae / Pi 使用）
        ├── alloy-start.md
        ├── alloy-plan.md
        ├── ...
```

---

## 七、故障排除 & 踩坑

### 常见错误

| 现象 | 原因 | 解决 |
|------|------|------|
| `openspec status` 报 `Invalid schema` | version 是 string、artifact 缺 description、apply 缺 requires | `openspec schemas` 验证 |
| `Template not found` | template 值含 `templates/` 前缀，OpenSpec 又加一遍 | 去掉前缀，只写文件名 |
| vitest mock 不生效 | ESM 模块不能用 `vi.spyOn(require(...))` | 用 `vi.mock` + `vi.mocked` |
| worktree 断线重连无法识别 | apply 创建 worktree 后没写 `.alloy.yaml` | apply Step 1 后立即 `alloy _state write worktree` |
| `.alloy.yaml` phase 不更新 | guard 无制品检查 | 补充制品缺失检查 |
| "Alloy 未初始化" | 未运行 `alloy init` | 运行 `alloy init` |
| "OpenSpec 项目结构未找到" | `openspec/config.yaml` 不存在 | 运行 `alloy init` |
| `alloy init` 报"拒绝在用户主目录初始化" | 当前目录是 `$HOME` | `cd` 到具体项目目录后重跑 |

### 诊断工具

```bash
alloy doctor              # 版本兼容性 + 文件一致性
alloy doctor --json       # JSON 格式输出
```

### 环境重置

```bash
# 删除 Alloy 相关文件
rm -rf .claude/commands/alloy/
rm -rf openspec/
rm -f .alloy.yaml

# 重新初始化
alloy init
```

---

## 附录

### 环境要求

- Node.js ≥ 18.0.0
- git ≥ 2.0.0
- Claude Code（推荐）

### Commit 消息格式

| 阶段 | Type | 格式示例 |
|------|------|---------|
| start — draft | `docs` | `docs(<name>): draft 已确认` |
| plan — 各制品 | `docs` | `docs(<name>): proposal 已确认` |
| apply — verify/retrospective | `docs` | `docs(<name>): verify 已确认` |
| apply — 代码实现 | `feat/fix/test/refactor` | 由 SDD 子 agent 决定 |
| archive — 归档 | `chore` | `chore(<name>): Delta Spec 已同步并归档` |
| finish — 收尾 | `chore` | `chore(<name>): 记录 finish 阶段完成时间` |
