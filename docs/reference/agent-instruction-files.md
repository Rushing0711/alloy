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
- 2026-07-06 补充权限/白名单机制调研
  - Claude Code 是唯一支持项目级 permissions 文件的 agent
  - 其他 agent 权限主要通过全局配置或 IDE UI

## 权限/白名单机制调研

> **调研时间：** 2026-07-06(官网验证)
> **用途：** alloy init 的"配置权限白名单"步骤依赖此调研结论。

### 汇总表

| agent | 项目级配置 | 三态(allow/ask/deny) | 命令模式匹配 | 配置文件 |
|-------|-----------|---------------------|-------------|---------|
| Claude Code | ✓ 是 | allow/deny(无 ask) | ✓ `Bash(cmd *)` | `.claude/settings.json` |
| OpenCode | ✓ 是 | ✓ allow/ask/deny | ✗(工具级别) | `opencode.json` |
| CodeBuddy | ✓ 是 | ✓ allow/ask/deny | ✓ `Bash(cmd)` | `.codebuddy/settings.json` |
| Trae | ✓ 是 | ✓ allow/deny/ask | ✓ `Bash(cmd:*)` | `traecli config`(YAML) |
| Pi | ✓ 是(需插件) | allow/deny | ✓ `Bash(cmd *)` | `.pi/permissions.json` |
| Qoder | 待验证 | always_allow/always_ask/always_deny(用户反馈) | — | `docs.qoder.com/cloud-agents/permission-policies` |
| Cursor | ✗ 仅网络控制 | — | ✗ | `sandbox.json`(域名白名单,非命令) |
| Codex | ✗ 全局 | — | — | `~/.codex/config.toml` |
| Gemini CLI | ✗ 全局 | — | — | `~/.gemini/settings.json` |

### 关键洞察

1. **5 个 agent 支持项目级 permissions 文件**:Claude Code / OpenCode / CodeBuddy / Trae / Pi——alloy init 可项目级注入
2. **3 个 agent 支持 ask 三态**:OpenCode / CodeBuddy / Trae——除 allow/deny 外,还有"询问"状态
3. **4 个 agent 支持命令模式匹配**:Claude Code / CodeBuddy / Trae / Pi——可精确控制 `Bash(cmd *)`
4. **Cursor 只支持网络控制**:`sandbox.json` 控制域名白名单,不控制 bash 命令
5. **Codex / Gemini CLI 是全局配置**:非项目级,alloy init 只能提示用户手动配置

### 各 agent 详情(官网验证)

#### Claude Code

来源:https://docs.claude.com/en/docs/claude-code/settings

- **配置文件:** `.claude/settings.json`(项目级)
- **语法:** `permissions.allow` / `permissions.deny`
- **模式:** `Bash(cmd *)` / `Read(path)` / `Edit(path)`,`**` 递归通配
- **三态:** allow/deny(无 ask,未匹配则用户确认)
- **项目级 allow 需 workspace trust**(仓库提供文件时)

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Bash(npm run test *)", "Read(~/.zshrc)"],
    "deny": ["Bash(curl *)", "Read(./.env)"]
  }
}
```

#### OpenCode

来源:https://opencode.ai/docs/permissions

- **配置文件:** `opencode.json`(项目级)
- **语法:** `permission` 字段,支持对象或字符串
- **三态:** allow/ask/deny
- **粒度:** 工具级别(bash/edit 等),不支持命令模式匹配

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "*": "ask",
    "bash": "allow",
    "edit": "deny"
  }
}
```

#### CodeBuddy

来源:https://www.codebuddy.ai/docs/cli/permissions

- **配置文件:** `.codebuddy/settings.json` / `.codebuddy/settings.local.json`(项目级)
- **语法:** `permissions.allow` / `permissions.ask` / `permissions.deny`
- **模式:** `Bash(cmd)` / `Read(path)` / `Edit(path)`
- **三态:** allow/ask/deny
- **CLI flag:** `--allowedTools` / `--disallowedTools`
- `.codebuddy/settings.json` 不能绕过命令安全检查(防止恶意仓库)

```json
{
  "permissions": {
    "allow": ["Bash(npm test)", "Read(/tmp/data/**)"],
    "ask": ["WebFetch"],
    "deny": ["Bash(rm -rf *)", "Edit(.git/**)"]
  }
}
```

#### Trae

来源:https://docs.trae.cn/cli_tool-permission + https://docs.trae.cn/cli_permission-mode

- **配置:** `traecli config edit`(YAML 格式,项目级)
- **语法:** `allowed_tools` / `disallowed_tools` / `ask_tools`
- **模式:** `Bash(cmd:*)`(注意冒号分隔,非空格)
- **三态:** allow/deny/ask
- **permission_mode:** `default` / `plan` / `bypass_permissions`(全局审批模式)
- **CLI flag:** `--allowed-tool`

```yaml
allowed_tools:
  - Bash
  - Bash(cat:*)
  - Bash(git diff:*)
disallowed_tools:
  - Bash(rm -rf /)
ask_tools:
  - Bash(rm:*)
```

#### Pi

来源:https://www.npmjs.com/package/pi-permissions

- **配置文件:** `.pi/permissions.json`(项目级)或 `~/.pi/agent/permissions.json`(全局)
- **需插件:** `pi-permissions`(`pi install npm:pi-permissions`)
- **语法:** `permissions.allow` / `permissions.deny`
- **模式:** `Bash(cmd *)`,支持 glob `*` 通配
- **三态:** allow/deny(Deny always wins)
- 支持正则表达式控制 bash 命令,glob 模式控制文件 read/edit/write

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Bash(git commit *)"],
    "deny": ["Bash(git push *)", "Bash(rm -rf *)"]
  }
}
```

#### Qoder

来源:https://docs.qoder.com/cloud-agents/permission-policies(官网被 Vercel 安全检查拦截,未能直接验证)

- 用户反馈:支持 `always_allow` / `always_ask` / `always_deny` 三种策略
- 粒度:Bash / Read / Write 等工具
- 待官网可访问后补充语法细节

#### Cursor

来源:https://cursor.ac.cn/changelog/2-5

- **配置文件:** `sandbox.json`(项目级,但只控制**网络域名白名单**)
- **粒度:** 域名白名单 + 本地文件系统目录访问控制
- **不控制 bash 命令**——命令权限通过 IDE Settings UI
- 企业版支持强制网络策略

#### Codex (OpenAI)

来源:https://developers.openai.com/codex/permissions

- **配置文件:** `~/.codex/config.toml`(全局,非项目级)
- **字段:** `sandbox_mode` / `sandbox_workspace_write`(旧版)/ `allowed_permission_profiles`(新版 beta)
- **CLI flag:** `--sandbox` / `--ask-for-approval never`
- 权限 profile 支持文件系统路径规则(`:workspace_roots`)和网络域名白名单
- 项目级 `AGENTS.md` 是指令,不含权限配置

#### Gemini CLI

来源:https://geminicli.com/docs/cli/settings/

- **配置文件:** `~/.gemini/settings.json`(全局,非项目级)
- **字段:** `general.defaultApprovalMode`(default/auto_edit/plan/yolo)
- **sandbox:** `tools.sandboxAllowedPaths` / `tools.sandboxNetworkAccess`
- **CLI flag:** `--yolo` / `--approval-mode=yolo` / `--sandbox`
- 项目级 `GEMINI.md` 是指令,不含权限配置

### alloy init 的实现策略

**项目级注入(5 个 agent):**
- Claude Code:已实现 `writePermissionsConfig` 写 `.claude/settings.json`
- OpenCode / CodeBuddy / Trae / Pi:可扩展 `writePermissionsConfig` 支持各自配置文件格式

**全局配置提示(3 个 agent):**
- Codex / Gemini CLI / Cursor:在 AGENTS.md 加"权限配置提示"段,引导用户手动配置全局审批模式

### 待验证项

- [ ] Qoder 官网可访问后补充 `permission-policies` 语法细节
- [ ] OpenCode 是否支持命令模式匹配(当前看是工具级别)
