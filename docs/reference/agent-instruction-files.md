# 各 AI Agent 项目级指令文件参考

> **初版调研时间：** 2026-06-24（持续更新）
> **用途：** Alloy 的统一 agent 配置注入器依赖此调研结论。agent 升级或新增 agent 时，先更新本文档，再调整 `src/core/agents.ts`。
> **目标 agent：** Claude Code / Codex / Pi / OpenCode（其他 agent 需要时再调研，目前不考虑）

## 汇总表

| agent | 官网 | GitHub | 项目级文件 | 格式 | 全局级 | 交互选择工具 | 依据 |
|-------|------|--------|-----------|------|--------|-------------|------|
| Claude Code | code.claude.com | 无公开仓库 | `CLAUDE.md` | md | `~/.claude/CLAUDE.md` | AskUserQuestion | 已知 |
| Codex | chatgpt.com/codex | 无公开仓库（npm 安装） | `AGENTS.md` | md | `~/.codex/AGENTS.md` | 无 | developers.openai.com/codex/guides/agents-md |
| OpenCode | opencode.ai | github.com/anomalyco/opencode | `AGENTS.md`（回退 `CLAUDE.md`） | md | `~/.config/opencode/opencode.json` | `question` | opencode.ai/docs/rules |
| Pi | pi.dev | github.com/earendil-works/pi | `AGENTS.md` | md | `~/.pi/agent/AGENTS.md` | 查不到 | exitcode0.net（用户提供） |

## 关键洞察

1. **3 个 agent 共享 `AGENTS.md`**：Codex / OpenCode / Pi 都读取项目根目录的 `AGENTS.md`
2. **Claude Code 是例外**：只读 `CLAUDE.md`
3. **交互选择工具不全支持**：只有 Claude Code（AskUserQuestion）和 OpenCode（question）明确支持；Codex 无；Pi 查不到

## 各 agent 详情

### Claude Code
- 官网：https://code.claude.com
- GitHub：无公开仓库（Anthropic 官方 CLI，通过 npm 安装）
- 项目级：`CLAUDE.md`
- 全局级：`~/.claude/CLAUDE.md`
- 交互工具：AskUserQuestion（原生支持）
- 专有配置：`.claude/settings.json`（项目共享，worktree.baseRef 等）/ `.claude/settings.local.json`（本地，gitignore）/ `~/.claude/settings.json`（全局）
- hook 机制：`settings.json` 的 `hooks.PreToolUse` 数组，matcher 如 `Write|Edit`，外部脚本从 stdin 读 `tool_input.file_path`，exit 2 阻断工具调用（详见 hook 机制章节）
- 依据：已知

### Codex (OpenAI)
- 官网：https://chatgpt.com/codex
- GitHub：无公开仓库（OpenAI 官方 CLI，通过 npm 安装 `@openai/codex`）
- 项目级：`AGENTS.md`（支持 `AGENTS.override.md` 覆盖，逐级目录合并）
- 全局级：`~/.codex/AGENTS.md`（`CODEX_HOME` 可改）
- 交互工具：无通用选项工具
- 专有配置：`~/.codex/config.toml`（全局，权限 profile）/ `.codex/settings.local.json`（项目级，hook 配置，与 Claude Code 同款）
- hook 机制：与 Claude Code **同款协议**（Comet `platforms.ts` 标注 `hookFormat: 'claude-code'`），写 `.codex/settings.local.json` 的 `hooks.PreToolUse`，同一份 hook 脚本可在两个 agent 上跑
- 依据：developers.openai.com/codex/guides/agents-md

### OpenCode
- 官网：https://opencode.ai
- GitHub：https://github.com/anomalyco/opencode（注：旧地址 `sst/opencode` 已重定向到此，组织从 sst 迁移到 anomalyco）
- 项目级：`AGENTS.md`（无则回退 `CLAUDE.md`）
- 全局级：`~/.config/opencode/opencode.json` 的 `instructions` 数组
- 交互工具：`question`（header + 问题 + 选项列表）
- 专有配置：`opencode.json`（项目级，`permission` 字段）/ `~/.config/opencode/opencode.json`（全局）
- hook 机制：**无 PreToolUse 类钩子**，但支持**覆盖内置工具**实现等价拦截--在 `.opencode/tools/write.ts`、`.opencode/tools/edit.ts` 放同名 custom tool，custom tool 优先于内置工具（`takes precedence`），在 `execute(args, context)` 里读 phase 判定，不允许则返回 blocked 消息，允许则用 node fs 执行写入（详见 hook 机制章节）
- 依据：opencode.ai/docs/rules、opencode.ai/docs/tools/、opencode.ai/docs/permissions

### Pi
- 官网：https://pi.dev
- GitHub：https://github.com/earendil-works/pi（monorepo，coding-agent 在 `packages/coding-agent`）
- 项目级：`AGENTS.md`
- 全局级：`~/.pi/agent/AGENTS.md`（与项目级合并生效）
- 交互工具：查不到
- 专有配置：`.pi/extensions/*.ts`（TS 扩展，订阅事件）/ `.pi/permissions.json`（项目级权限）/ `~/.pi/agent/permissions.json`（全局权限，需 `pi-permissions` 插件）
- hook 机制：TS 扩展订阅 `tool_call` 事件（等价于 PreToolUse），在回调里跑逻辑判定，能 block 工具调用；已有 `damage-control` 扩展验证可行（详见 hook 机制章节）
- 依据：exitcode0.net/posts/understanding-pi-agent-extension-model（用户提供）、github.com/earendil-works/pi

## 版本变更追踪

- 2026-06-24 初版调研
  - Pi 的指令文件路径由用户提供（exitcode0.net）
- 2026-07-06 补充权限/白名单机制调研
  - Claude Code / OpenCode / Pi 支持项目级 permissions 文件
  - Codex 是全局配置（`~/.codex/config.toml`）
- 2026-07-08 补充 hook/生命周期钩子机制调研 + 官网/GitHub 地址
  - 确定 Alloy 闸门层支持 4 个 agent：Claude Code / Codex / Pi / OpenCode
  - Claude Code + Codex 同款 hook 协议（`hookFormat: 'claude-code'`），一份适配器白送
  - Pi 用 TS 扩展订阅 `tool_call` 事件，OpenCode 用 custom tool 覆盖内置 write/edit
  - OpenCode 仓库从 `sst/opencode` 迁移到 `anomalyco/opencode`（GitHub 重定向）
  - 补充各 agent 官网和 GitHub 地址
  - 删除非目标 agent（Cursor/CodeBuddy/Qoder/Trae/Gemini CLI 等）的调研信息，需要时再调研

## 配置文件对照表(settings.json 对应)

> **用途:** Claude Code 的 settings.json 含 hook + permissions + 其他配置。其他 agent 的对应配置文件不同,此表作为快速参考。

| agent | 项目级配置 | 全局级配置 | hook 机制 | permissions |
|-------|----------|----------|----------|-------------|
| Claude Code | `.claude/settings.json` | `~/.claude/settings.json` | `hooks.PreToolUse`(外部脚本,exit 2 阻断) | `permissions.allow/deny`(`Bash(cmd *)`) |
| Codex | `.codex/settings.local.json`(hook) | `~/.codex/settings.json`(hook)+ `~/.codex/config.toml`(权限) | `hooks.PreToolUse`(同款协议) | `~/.codex/config.toml`(全局,非项目级) |
| OpenCode | `opencode.json`(权限)+ `.opencode/tools/*.ts`(hook) | `~/.config/opencode/opencode.json`(指令)+ `~/.config/opencode/tools/`(hook) | custom tool 覆盖内置(`takes precedence`) | `opencode.json` 的 `permission` 字段 |
| Pi | `.pi/permissions.json`(权限)+ `.pi/extensions/*.ts`(hook) | `~/.pi/agent/permissions.json`+ `~/.pi/agent/extensions/` | TS 扩展 `tool_call` 事件(回调 block) | `.pi/permissions.json`(`allow/deny`) |

**关键差异:**
1. **hook 形态**:Claude Code/Codex 用 settings.json 的 `hooks.PreToolUse`;Pi 用 TS 扩展;OpenCode 用 custom tool 覆盖
2. **permissions 位置**:Claude Code 在 settings.json;Codex 在 config.toml(仅全局);OpenCode 在 opencode.json;Pi 在 .pi/permissions.json
3. **全局路径**:Claude Code `~/.claude/`;Codex `~/.codex/`;OpenCode `~/.config/opencode/`(XDG);Pi `~/.pi/agent/`

**alloy init 的 global scope 路径对应(通过 `globalBase` 配置):**
- claude-code:`~/.claude/skills/`
- codex:`~/.codex/skills/`
- opencode:`~/.config/opencode/skills/`(非 `~/.opencode/`)
- pi:`~/.pi/agent/skills/`(非 `~/.pi/`)

## 权限/白名单机制调研

> **调研时间：** 2026-07-06（官网验证）
> **用途：** alloy init 的"配置权限白名单"步骤依赖此调研结论。

### 汇总表

| agent | 项目级配置 | 三态(allow/ask/deny) | 命令模式匹配 | 配置文件 |
|-------|-----------|---------------------|-------------|---------|
| Claude Code | ✓ 是 | allow/deny(无 ask) | ✓ `Bash(cmd *)` | `.claude/settings.json` |
| OpenCode | ✓ 是 | ✓ allow/ask/deny | ✗(工具级别) | `opencode.json` |
| Pi | ✓ 是(需插件) | allow/deny | ✓ `Bash(cmd *)` | `.pi/permissions.json` |
| Codex | ✗ 全局 | - | - | `~/.codex/config.toml` |

### 关键洞察

1. **3 个 agent 支持项目级 permissions 文件**：Claude Code / OpenCode / Pi--alloy init 可项目级注入
2. **1 个 agent 支持 ask 三态**：OpenCode--除 allow/deny 外，还有"询问"状态
3. **2 个 agent 支持命令模式匹配**：Claude Code / Pi--可精确控制 `Bash(cmd *)`
4. **Codex 是全局配置**：非项目级，alloy init 只能提示用户手动配置

### 各 agent 详情（官网验证）

#### Claude Code

来源：https://docs.claude.com/en/docs/claude-code/settings

- **配置文件：** `.claude/settings.json`（项目级）
- **语法：** `permissions.allow` / `permissions.deny`
- **模式：** `Bash(cmd *)` / `Read(path)` / `Edit(path)`，`**` 递归通配
- **三态：** allow/deny（无 ask，未匹配则用户确认）
- **项目级 allow 需 workspace trust**（仓库提供文件时）

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

来源：https://opencode.ai/docs/permissions

- **配置文件：** `opencode.json`（项目级）
- **语法：** `permission` 字段，支持对象或字符串
- **三态：** allow/ask/deny
- **粒度：** 工具级别（bash/edit 等），不支持命令模式匹配

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

#### Pi

来源：https://www.npmjs.com/package/pi-permissions

- **配置文件：** `.pi/permissions.json`（项目级）或 `~/.pi/agent/permissions.json`（全局）
- **需插件：** `pi-permissions`（`pi install npm:pi-permissions`）
- **语法：** `permissions.allow` / `permissions.deny`
- **模式：** `Bash(cmd *)`，支持 glob `*` 通配
- **三态：** allow/deny（Deny always wins）
- 支持正则表达式控制 bash 命令，glob 模式控制文件 read/edit/write

```json
{
  "permissions": {
    "allow": ["Bash(npm run *)", "Bash(git commit *)"],
    "deny": ["Bash(git push *)", "Bash(rm -rf *)"]
  }
}
```

#### Codex (OpenAI)

来源：https://developers.openai.com/codex/permissions

- **配置文件：** `~/.codex/config.toml`（全局，非项目级）
- **字段：** `sandbox_mode` / `sandbox_workspace_write`（旧版）/ `allowed_permission_profiles`（新版 beta）
- **CLI flag：** `--sandbox` / `--ask-for-approval never`
- 权限 profile 支持文件系统路径规则（`:workspace_roots`）和网络域名白名单
- 项目级 `AGENTS.md` 是指令，不含权限配置

## hook/生命周期钩子机制调研

> **调研时间：** 2026-07-08
> **用途：** Alloy 真闸门（PreToolUse 等价物）的适配依赖此调研结论。决定哪些 agent 能形成"模型跳不过"的硬拦截。

### 汇总表

| agent | hook 形态 | 能动态判定? | 能 block? | Alloy 闸门层支持 |
|-------|----------|------------|----------|----------------|
| Claude Code | 外部脚本 PreToolUse（settings.json `hooks.PreToolUse`） | ✅ 脚本读 `.alloy.yaml` 算 phase | ✅ exit 2 阻断 | ✅ P0（基准） |
| Codex | 同款（`hookFormat: 'claude-code'`） | ✅ | ✅ exit 2 | ✅ P0（白送） |
| Pi | TS 扩展 `tool_call` 事件 | ✅ 扩展跑逻辑 | ✅ 回调 block | ✅ P1 |
| OpenCode | 覆盖内置工具（custom tool `takes precedence`） | ✅ execute 跑逻辑 | ✅ 返回 blocked | ✅ P1 |

### 关键洞察

1. **4 个 Alloy 闸门层 agent 各有不同的 hook 形态，但都能动态判定 + block**：Claude Code/Codex 用外部脚本，Pi 用 TS 扩展事件，OpenCode 用 custom tool 覆盖。业务逻辑（读 phase + 路径判定）可共用，入口适配层不同。
2. **Claude Code + Codex 同款协议是关键杠杆**：Comet `platforms.ts` 验证两者共用 `hookFormat: 'claude-code'`，同一份 `settings.local.json` hook 配置和同一份脚本两个 agent 通吃，适配成本为 0。
3. **OpenCode 的"覆盖内置工具"是隐蔽能力**：官方文档 `custom-tools.mdx` 明说 custom tool 同名时 `takes precedence`，但没有独立的 "hooks" 文档页。调研时要挖到 custom-tools 层才能发现。
4. **Pi 的 `tool_call` 事件已有生产验证**：`damage-control` 扩展用此事件拦截 bash 和文件修改，对照 `.pi/damage-control-rules.yaml` 评估，能 block 或 ask。

### 各 agent 详情

#### Claude Code

来源：https://docs.claude.com/en/docs/claude-code/hooks

- **hook 形态：** 外部脚本，harness 在工具调用前执行
- **配置位置：** `.claude/settings.json` / `.claude/settings.local.json`（项目）/ `~/.claude/settings.json`（全局）的 `hooks.PreToolUse` 数组
- **配置格式：** `{ matcher: "Write|Edit", hooks: [{ type: "command", command: "node /path/guard.js --project-root /path" }] }`
- **输入：** stdin JSON，含 `tool_input.file_path`
- **block 方式：** exit 2（Claude Code hook 协议：exit 2 = 阻断工具调用，exit 0 = 放行）
- **生命周期钩子全集：** `PreToolUse` / `PostToolUse` / `UserPromptSubmit` / `SessionStart` / `SessionEnd` / `Stop` / `SubagentStop` / `Notification` / `PreCompact`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "node /path/alloy-hook-guard.js --project-root /path" }]
      }
    ]
  }
}
```

#### Codex

来源：Comet `platforms.ts` 验证 + developers.openai.com/codex

- **hook 形态：** 与 Claude Code **同款**（外部脚本 PreToolUse）
- **配置位置：** `.codex/settings.local.json`（项目）/ `~/.codex/settings.json`（全局）
- **配置格式：** 与 Claude Code 完全相同 `{ hooks: { PreToolUse: [...] } }`
- **输入/block：** 同 Claude Code（stdin JSON + exit 2）
- **依据：** Comet `installClaudeCodeHooks` 函数注释明说 "Claude Code, Codex, Amazon Q format"，同一份适配器多个 agent 通吃，唯一差异是 `skillsDir`（`.claude` / `.codex`）

#### Pi

来源：github.com/earendil-works/pi、disler/pi-vs-claude-code 对比文档

- **hook 形态：** TypeScript 扩展，订阅事件
- **配置位置：** `.pi/extensions/*.ts`（项目）/ `~/.pi/agent/extensions/*.ts`（全局）
- **关键事件：** `tool_call`（等价 PreToolUse，工具调用前）/ `tool_result` / `tool_execution_start/end` / `session_start` / `session_compact` / `context` / `agent_end` / `resources_discover`
- **扩展 API：** `export default function(pi: ExtensionAPI) { pi.on("tool_call", async (event) => { ... }) }`
- **block 方式：** 回调里返回 block 决定，或抛错中止
- **生产验证：** `damage-control` 扩展用 `tool_call` 事件拦截 bash 命令和文件修改，对照 `.pi/damage-control-rules.yaml`，能 block 或 ask

```ts title=".pi/extensions/alloy-guard.ts"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function alloyGuard(pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    // 读 .alloy.yaml 的 phase，判定是否允许
    // 不允许 -> 返回 block 决定
    // 允许 -> 放行
  });
}
```

#### OpenCode

来源：opencode.ai/docs/custom-tools、github.com/anomalyco/opencode

- **hook 形态：** **无独立 hook 机制**，通过覆盖内置工具实现等价拦截
- **配置位置：** `.opencode/tools/*.ts`（项目）/ `~/.config/opencode/tools/`（全局）
- **覆盖原理：** custom tool 同名时 `takes precedence`（优先于内置工具）
- **关键工具：** 覆盖 `write`、`edit`（Alloy 闸门核心拦这两个）
- **扩展 API：** `export default tool({ description, args, async execute(args, context) { ... } })`，context 含 `sessionID/messageID/directory/worktree/agent`
- **block 方式：** execute 返回 `"blocked: ..."` 字符串，LLM 收到返回值知道被拒
- **限制：** 覆盖后需自己实现写入逻辑（node fs），除非能调原内置工具（待验证）

```ts title=".opencode/tools/write.ts"
import { tool } from "@opencode-ai/plugin"
import fs from "node:fs/promises"
import { readPhase, isWriteAllowed } from "../alloy-guard-core.js"

export default tool({
  description: "Alloy-gated write",
  args: { path: tool.schema.string(), content: tool.schema.string() },
  async execute(args, context) {
    const phase = await readPhase(context.directory)
    if (!isWriteAllowed(phase, args.path)) {
      return `blocked: phase=${phase}, write 临时禁止`
    }
    await fs.writeFile(args.path, args.content)
    return `written: ${args.path}`
  },
})
```

### Alloy 闸门层适配策略

**业务逻辑共用（`src/core/hook-guard.ts`，纯函数，平台无关）：**
- 输入：`(filePath, phase, state)`
- 输出：`{ allowed: boolean, reason: string }`
- 逻辑：读 `.alloy.yaml` 的 phase + 路径，按 phase 判定 allow/deny

**入口适配层（`src/core/platforms/<agent>.ts`，每 agent 一个）：**
- `claude-code.ts`：stdin JSON 解析 + exit code 映射（Claude Code + Codex 共用，差 `skillsDir`）
- `pi.ts`：生成 `.pi/extensions/alloy-guard.ts`，订阅 `tool_call` 事件
- `opencode.ts`：生成 `.opencode/tools/write.ts` + `.edit.ts`，覆盖内置工具

**安装（`alloy init` 时）：**
- Claude Code/Codex：写 `settings.local.json` 的 `PreToolUse` 数组
- Pi：复制 `.pi/extensions/alloy-guard.ts`
- OpenCode：复制 `.opencode/tools/write.ts` + `.edit.ts`

## alloy init 的实现策略

**项目级权限注入（3 个 agent）：**
- Claude Code：已实现 `writePermissionsConfig` 写 `.claude/settings.json`
- OpenCode / Pi：可扩展 `writePermissionsConfig` 支持各自配置文件格式

**全局配置提示（1 个 agent）：**
- Codex：在 AGENTS.md 加"权限配置提示"段，引导用户手动配置全局审批模式

## 待验证项

- [ ] OpenCode 是否支持命令模式匹配（当前看是工具级别）
- [ ] OpenCode 覆盖后的 custom tool 能否在 execute 里调用原内置工具（避免自己实现 fs 逻辑）
- [ ] Pi 的 `tool_call` 事件回调能否同步 block（还是只能异步返回决定）
- [ ] Codex 的 `settings.local.json` hook 是否完全兼容 Claude Code 的全部生命周期钩子（PreToolUse 已验证，其他待查）
