# 各 AI Agent 项目级指令文件参考

> **调研时间：** 2026-06-24
> **用途：** Alloy 的统一 agent 配置注入器依赖此调研结论。agent 升级或新增 agent 时，先更新本文档，再调整 `src/core/agents.ts`。

## 汇总表

| agent | 项目级文件 | 格式 | 全局级 | 交互选择工具 | 依据 |
|-------|-----------|------|--------|-------------|------|
| Claude Code | `CLAUDE.md` | md | `~/.claude/CLAUDE.md` | AskUserQuestion | 已知 |
| Codex | `AGENTS.md` | md | `~/.codex/AGENTS.md` | 无 | developers.openai.com/codex/guides/agents-md |
| Cursor | `.cursor/rules/*.mdc` | mdc（需 frontmatter） | UI 管理 | 部分（"提问"） | cursor.com/docs/context/rules |
| OpenCode | `AGENTS.md`（回退 `CLAUDE.md`） | md | `~/.config/opencode/opencode.json` | `question` | opencode.ai/docs/rules |
| CodeBuddy | `AGENTS.md`（兼容 `CODEBUDDY.md`） | md | UI 管理 | 查不到 | codebuddy.cn/docs/ide/User-guide/Rules |
| Qoder | `AGENTS.md` | md | 未文档化 | 查不到 | docs.qoder.com/user-guide/rules.md |
| Trae | `AGENTS.md`（兼容 `CLAUDE.md`） | md | UI 管理 | 查不到 | docs.trae.ai/ide/rules |
| Pi | `AGENTS.md` | md | `~/.pi/agent/AGENTS.md` | 查不到 | exitcode0.net（用户提供） |

## 关键洞察

1. **6 个 agent 共享 `AGENTS.md`**：Codex / OpenCode / CodeBuddy / Qoder / Trae / Pi 都读取项目根目录的 `AGENTS.md`
2. **Claude Code 是例外**：只读 `CLAUDE.md`
3. **Cursor 是例外**：用 `.cursor/rules/*.mdc`（需 frontmatter），旧版 `.cursorrules` 已废弃
4. **交互选择工具不全支持**：只有 Claude Code（AskUserQuestion）和 OpenCode（question）明确支持；Cursor 部分；其余无或查不到

## 各 agent 详情

### Claude Code
- 项目级：`CLAUDE.md`
- 全局级：`~/.claude/CLAUDE.md`
- 交互工具：AskUserQuestion（原生支持）
- 专有配置：`.claude/settings.json`（worktree.baseRef 等）
- 依据：已知

### Codex (OpenAI)
- 项目级：`AGENTS.md`（支持 `AGENTS.override.md` 覆盖，逐级目录合并）
- 全局级：`~/.codex/AGENTS.md`（`CODEX_HOME` 可改）
- 交互工具：无通用选项工具
- 依据：developers.openai.com/codex/guides/agents-md

### Cursor
- 项目级：`.cursor/rules/*.mdc`（需 frontmatter，纯 `.md` 被忽略）
- 全局级：UI 管理，无文件路径
- 交互工具：部分（"提问/Ask"工具存在，选项支持存疑）
- 依据：cursor.com/docs/context/rules
- 备注：旧版 `.cursorrules` 已废弃

### OpenCode
- 项目级：`AGENTS.md`（无则回退 `CLAUDE.md`）
- 全局级：`~/.config/opencode/opencode.json` 的 `instructions` 数组
- 交互工具：`question`（header + 问题 + 选项列表）
- 依据：opencode.ai/docs/rules、opencode.ai/docs/tools/

### CodeBuddy
- 项目级：`.codebuddy/rules/*/RULE.mdc` 或根目录 `CODEBUDDY.md`（兼容 `AGENTS.md`）
- 全局级：用户规则 UI 管理
- 交互工具：查不到
- 依据：codebuddy.cn/docs/ide/User-guide/Rules

### Qoder
- 项目级：`.qoder/rules/` 或根目录 `AGENTS.md`（冲突时 rules 优先）
- 全局级：未文档化
- 交互工具：查不到
- 依据：docs.qoder.com/user-guide/rules.md

### Trae
- 项目级：`.trae/rules/*.md`（最多 3 层嵌套）；兼容 `AGENTS.md` / `CLAUDE.md`（需开关开启）
- 全局级：全局规则 UI 管理
- 交互工具：查不到
- 依据：docs.trae.ai/ide/rules

### Pi
- 项目级：`AGENTS.md`
- 全局级：`~/.pi/agent/AGENTS.md`（与项目级合并生效）
- 交互工具：查不到
- 依据：exitcode0.net/posts/understanding-pi-agent-extension-model（用户提供）

## 版本变更追踪

- 2026-06-24 初版调研
  - Cursor 旧版 `.cursorrules` 已废弃，改用 `.cursor/rules/*.mdc`
  - Pi 的指令文件路径由用户提供（exitcode0.net）
