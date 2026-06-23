---
behaviors:
  preconditions: 5
  hard_stops:    8
  user_gates:    8
  warns:         2
  artifacts: [draft]
  transitions_to: started
  external_calls: [opsx:explore, opsx:new, superpowers:brainstorming]
---

# alloy start 行为规格

详见 skill 文件：`commands/alloy/start.md`

## 命令格式

```
/alloy:start [topic]
```

## 状态检测

**第一步：** 检查 `openspec/config.yaml` 是否存在——不存在则引导 `alloy init`。

**第二步：** 扫描 `openspec/changes/*/.alloy.yaml`，统计 phase != `finished` 的 change。

## 全新开始（无活跃 change + 用户提供了 topic）

```
→ 全新开始: explore + brainstorming → draft.md（唯一产出，包含 Why/What/关键决策/范围边界）
→ brainstorming 的详细设计论述写入 draft.md"关键决策"章节，不单独产出 superpowers spec 文件
→ brainstorming 确认后，由 Agent 建议 kebab-case change name，用户确认后调用 `/opsx:new` 创建 change 目录 + `alloy _state init` 写入初始状态
→ git 仓库就绪：已由 `alloy init` 保证（HOME 拦截 + `ensureGitRepo` 兜底）。start 阶段仅校验 `git rev-parse --git-dir`，不再兜底 git init
→ 基础设施 commit（锚点，确保可创建分支）：start 步骤 9 把 init 写入的 `.claude/` `.gitignore` `openspec/` 等文件首次提交进 git
→ 分支选择:
  ① 主分支读取：`alloy init` 阶段已确认并写入 `openspec/config.yaml`，start 阶段直接读取（`alloy _config read . main_branch`）。未配置 → PRECONDITION_FAIL，引导重跑 `alloy init`
  ② 检测当前分支位置：
    - 在主分支上 → HARD STOP（不允许在主分支开发），只展示"新建分支"
    - 在 feature 分支且名称含 change 名 → 提示可沿用
    - 在非主分支的已有分支上 → 展示选项
  → 选项：切换到已有非主分支 / 新建 feature 分支（默认 feature/<change-name>）
→ 分支确认后写入 `.alloy.yaml`（`phase=started`，`feature_branch`，`worktree=null`）
→ hash+commit（draft.md + .alloy.yaml），已有项目同步提交 alloy init 基础设施文件
  （`.claude/` `.gitignore` `openspec/`，含 `CLAUDE.md` 如已注入），
  确保全部内容落在正确分支上。`.superpowers/` 已由 `.gitignore` 忽略
→ draft.md 存放在 change 目录内（openspec/changes/<name>/draft.md），非项目根目录
```

## 自由探索（无活跃 change + 无 topic）

```
→ Agent 扫描项目上下文（README、requirement.md、已有代码等）
  ├── 有上下文 → 基于项目信息引导，提出建议方向或追问
  └── 空项目无可读上下文 → "请提供主题: alloy start <topic>"
```

## 接续（有 1 个活跃 change）

自动接续，从 phase 断点继续。

## 多选（有多个活跃 change）

列出所有活跃 change，用户选择接续哪个，或 `--new <topic>` 开新 change。

## --new \<topic\>

无论是否有活跃 change，直接开始新 change 流程。多个 change 可并行 planning，但不能同时 apply（一个 session 只能有一个工作中的 worktree）。
