# 各 AI Agent 配置体系参考

> **用途:** Alloy 的 agent 适配依赖此文档。新增 agent 或验证现有 agent 行为时,先更新本文档(附证据来源),再调整代码。
> **目标 agent:** Claude Code / OpenCode / Pi / Codex
> **证据来源:** 每个结论标注来源(官方文档 URL 或 GitHub 文件路径)
> **调研日期:** 2026-06-24 初版,2026-07-11 全面重写(补全 12 个特性 + 证据),2026-07-13 OpenCode/Pi hook 机制,2026-07-14 新增第 14 章(运行时标识 env + 工具参数名,detectAgent 方案),2026-07-15 移除 Codex 支持(用户实测体验差),B 层 ALLOY_AGENT 补位机制随之删除,目标 agent 改为 3 个;2026-08-02 **重新加入 Codex**(实测验证:env 注入 CODEX_CI/CODEX_THREAD_ID、request_user_input 工具存在但仅 Plan mode 可用、PreToolUse hook 同款协议触发正常、skills 规范改为共享 .agents/skills/),目标 agent 改为 4 个;**同日修正 worktree 误判**--实测 exec_command 有 `workdir` 参数 + apply_patch 支持绝对路径,Codex 与 OpenCode 同机制支持 worktree(早期依据"无 EnterWorktree 工具"误判为不支持)

## 特性对比总表

| 特性 | Claude Code | OpenCode | Pi | Codex |
|------|-------------|----------|-----|-------|
| 指令文件 | `CLAUDE.md` | `AGENTS.md`(回退 `CLAUDE.md`) | `AGENTS.md`(回退 `CLAUDE.md`) | `AGENTS.md`(+`AGENTS.override.md` 覆盖链) |
| 本地指令 | `CLAUDE.local.md` | 无 per-project(有全局) | 不支持 | 不支持 |
| 配置文件 | `.claude/settings.json` | `opencode.json` | `.pi/settings.json` | `~/.codex/config.toml`(全局)+ `.codex/hooks.json`(项目) |
| Hook | PreToolUse/Stop(外部脚本,exit 2) | plugin `tool.execute.before`/`session.idle`(原生 hook) | TS 扩展(`tool_call`/`agent_settled`) | PreToolUse/Stop 等(协议同 Claude Code,exit 2;`hooks.json` 载体) |
| Permissions | `allow/deny`(`Bash(cmd *)`) | `opencode.json` permission(allow/ask/deny) | `.pi/permissions.json` | config.toml 全局(非项目级,alloy 不自动配置) |
| 交互工具 | `AskUserQuestion` | `question` 工具 | `alloy-question` 工具(alloy extension 注册) | `request_user_input`(Default 模式可用,需 init 开启 feature;exec 降级文本) |
| Skills | `.claude/skills/` → `~/.claude/skills/` → `~/.claude/plugins/` | `.opencode/skills/` + `.claude/skills/` + `.agents/skills/` | `.pi/skills/` + `.agents/skills/` | `.agents/skills/` → `~/.agents/skills/`(共享目录,无专属路径) |
| Plugins | `/plugin install`(marketplace) | `opencode.json` plugin 数组 | `pi install` | plugin 分发(`.codex-plugin/plugin.json`,代码层) |
| Commands | `.claude/commands/*.md` | `.opencode/commands/*.md` | `.pi/prompts/*.md` | `~/.codex/prompts/*.md`(全局,CODEX_HOME) |
| Worktree | `settings.json` `worktree.baseRef` | Worktree 服务(无 baseRef) | 不支持 | 支持(exec_command `workdir` + apply_patch 绝对路径,同 OpenCode 机制) |
| Subagent | 无原生 | `opencode.json` agent + `.opencode/agents/` | 无原生(SDK 嵌套) | 支持(`collaboration__spawn_agent`,TOML 配置) |
| 补全 | `alloy completion` | `opencode completion` | 不支持 | 不支持 |
| **运行时标识 env** | `CLAUDECODE=1` | `OPENCODE=1` | `PI_CODING_AGENT=true` | `CODEX_CI=1` / `CODEX_THREAD_ID`(无 `CODEX=1`) |
| **write/edit 参数名** | `file_path` | `filePath`(驼峰) | `path`(主)/`file_path`(兼容) | Bash 工具为 `exec_command`(`command` 参数) |

---

## 1. 指令文件

### Claude Code
- 项目级: `CLAUDE.md`
- 全局级: `~/.claude/CLAUDE.md`
- 证据: [Claude Code 文档](https://docs.claude.com/en/docs/claude-code/memory)

### OpenCode
- 项目级: `AGENTS.md`(回退 `CLAUDE.md`)
- 全局级: `~/.config/opencode/AGENTS.md`
- 证据: [OpenCode rules.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/rules.mdx)

### Pi
- 项目级: `AGENTS.md`(回退 `CLAUDE.md`)
- 全局级: `~/.pi/agent/AGENTS.md`
- 父目录遍历: 从当前目录向上查找
- 证据: [Pi resource-loader.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/resource-loader.ts)

### Codex
- 项目级: `AGENTS.md`(每级目录依次检查 `AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames` 备用名,每目录最多取一个)
- 全局级: `~/.codex/AGENTS.md`(存在 `~/.codex/AGENTS.override.md` 则读它,`CODEX_HOME` 可改)
- 合并顺序: 全局文件最先 → 仓库根 → 嵌套目录(越靠近 CWD 覆盖力越强,根到当前目录拼接)
- 加载上限: `project_doc_max_bytes`(默认 32 KiB)
- 证据: [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

**关键洞察:** 4 个 agent 中,OpenCode/Pi/Codex 都读 `AGENTS.md`(Codex 还有 override 覆盖链);Claude Code 只读 `CLAUDE.md`;OpenCode/Pi 兼容 `CLAUDE.md` 回退。

---

## 2. 本地指令(gitignore 的本地指令文件)

### Claude Code
- `CLAUDE.local.md`(项目级,gitignore)
- 证据: [Claude Code 文档](https://docs.claude.com/en/docs/claude-code/memory)

### OpenCode
- 无 per-project local 约定
- 全局个人规则: `~/.config/opencode/AGENTS.md`(不提交,跨项目)
- `opencode.json` 的 `instructions` 字段可引用任意文件(含 gitignored)
- 证据: [OpenCode rules.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/rules.mdx)

### Pi
- **不支持**(无 `.local.` 变体,`resource-loader.ts` 仅查找 `AGENTS.md`/`CLAUDE.md`)
- 证据: [Pi resource-loader.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/resource-loader.ts)

### Codex
- **不支持**(无 `.local.` 变体,指令文件只有 `AGENTS.md`/`AGENTS.override.md`)
- 证据: [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

**alloy 适配:** OpenCode 无 per-project local,可用全局或 instructions 字段;Pi/Codex 不支持。

---

## 3. 配置文件

### Claude Code
- 项目级: `.claude/settings.json` + `.claude/settings.local.json`(本地,gitignore)
- 全局级: `~/.claude/settings.json`
- 格式: JSON
- 证据: [Claude Code settings](https://docs.claude.com/en/docs/claude-code/settings)

### OpenCode
- 项目级: `opencode.json` + `.opencode/` 目录
- 全局级: `~/.config/opencode/opencode.json` + `~/.config/opencode/tui.json`
- 格式: JSON/JSONC
- 优先级链: CLI flags > `OPENCODE_CONFIG_CONTENT` > `OPENCODE_CONFIG` > 项目 `opencode.json` > `~/.config/opencode/opencode.json` > `.opencode/` > 远程 `.well-known/opencode`
- 证据: [OpenCode config](https://opencode.ai/docs/config)

### Pi
- 项目级: `.pi/settings.json` + `.pi/extensions/*.ts`(需信任)
- 全局级: `~/.pi/agent/settings.json` + `~/.pi/agent/extensions/*.ts`
- 格式: JSON
- 证据: [Pi settings](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md)

### Codex
- 全局级: `~/.codex/config.toml`(权限 profile、模型、skills 开关等,`CODEX_HOME` 可改)
- 项目级: `.codex/hooks.json`(hook 配置,与 settings.json 的 hooks 段同构)+ `.codex/agents/*.toml`(自定义 subagent)
- 格式: TOML / JSON
- 证据: [Codex config basics](https://learn.chatgpt.com/docs/config-file/config-basics) + [Codex hooks](https://learn.chatgpt.com/docs/hooks)

---

## 4. Hook / 生命周期钩子

### Claude Code
- 形态: 外部脚本,PreToolUse/Stop 等
- 配置: `.claude/settings.json` 的 `hooks.PreToolUse` / `hooks.Stop`
- 输入: stdin JSON(含 `tool_input.file_path`)
- block: exit 2(exit 0 放行)
- 事件全集: PreToolUse/PostToolUse/UserPromptSubmit/SessionStart/SessionEnd/Stop/SubagentStop/Notification/PreCompact
- 证据: [Claude Code hooks](https://docs.claude.com/en/docs/claude-code/hooks)

### OpenCode
- **形态 1: Plugin 系统(原生 hook,推荐)**--Plugin 是 JS/TS 模块,导出 hook 函数,启动时自动加载
  - 配置: `.opencode/plugins/*.ts`(项目)/ `~/.config/opencode/plugins/`(全局),或 `opencode.json` 的 `plugin` 数组装 npm 包
  - 加载顺序: 全局 config -> 项目 config -> 全局 plugin 目录 -> 项目 plugin 目录
  - 关键 hook:
    - `tool.execute.before`--工具执行前拦截,**throw error 阻止工具运行**(PreToolUse 等价,可拦截所有工具含 question)
    - `tool.execute.after`--工具执行后(PostToolUse 等价)
    - `session.idle`--session 空闲时(Stop 等价,agent 完成响应后触发)
    - `session.created` / `session.compacted` / `session.deleted` / `session.error` / `session.updated` / `session.status` / `session.diff`
    - `file.edited` / `message.updated` / `permission.asked` / `command.executed` / `tui.prompt.append` 等 20+ 事件
  - 证据: [OpenCode plugins.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/plugins.mdx)("tool.execute.before" / "session.idle" / ".env protection" 示例用 throw 阻止 read)
- **形态 2: Custom tool 覆盖(备选,有盲区)**--同名 custom tool `takes precedence` 优先于内置工具
  - 配置: `.opencode/tools/*.ts`(项目)/ `~/.config/opencode/tools/`(全局)
  - 限制: 只在 agent 调该工具时触发,**检测不到其他工具调用**(如 question)--pending_gate 设了无法自动 clear
  - 证据: [OpenCode custom-tools](https://opencode.ai/docs/custom-tools)
- **alloy 适配:** PreToolUse 应优先用 plugin `tool.execute.before`(可拦截所有工具),Stop 用 plugin `session.idle`。custom tool 覆盖方案有盲区(alloy 早期方案,待迁移到 plugin)

### Pi
- 形态: TS 扩展,订阅事件
- 配置: `.pi/extensions/*.ts`(项目)/ `~/.pi/agent/extensions/*.ts`(全局)
- 事件(33 个,最丰富):
  - **Tool**: `tool_call`(PreToolUse 等价)/ `tool_result`(PostToolUse 等价)/ `tool_execution_start` / `tool_execution_end`
  - **Agent**: `before_agent_start` / `agent_start` / `agent_end` / `agent_settled`(Stop 等价,Pi 完全停止后触发)/ `turn_start` / `turn_end` / `message_start` / `message_update` / `message_end`
  - **Session**: `session_start` / `session_shutdown` / `session_before_switch` / `session_before_fork` / `session_before_compact` / `session_compact` / `session_before_tree` / `session_tree` / `session_info_changed`
  - **Model**: `context` / `before_provider_headers` / `before_provider_request` / `after_provider_response` / `model_select` / `thinking_level_select`
  - **Input/Resource**: `user_bash` / `input` / `project_trust` / `resources_discover`
- block: 回调返回 block 决定,或抛错中止
- 生产验证: `damage-control` 扩展用 `tool_call` 拦截 bash 和文件修改
- 证据: [Pi extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)(`agent_settled` 描述:"Use agent_settled for status integrations that need to know Pi will not continue running automatically")

### Codex
- 形态: 外部脚本,**协议与 Claude Code 同款**(stdin JSON + exit 2 阻断 + `permissionDecision: deny` + `additionalContext`)
- 配置: `<repo>/.codex/hooks.json`(项目级,需项目被 trust)/ `~/.codex/hooks.json`(全局),或 config.toml `[hooks]` 内联;结构 `{"hooks": {"PreToolUse": [{"matcher": "...", "hooks": [{"type": "command", "command": "..."}]}]}}` 与 settings.json 同构
- 事件全集: PreToolUse/PostToolUse/PermissionRequest/PreCompact/PostCompact/UserPromptSubmit/SubagentStart/SubagentStop/Stop/SessionStart/SessionEnd
- PreToolUse stdin JSON: `session_id` / `cwd` / `hook_event_name` / `tool_name`(实测 `Bash`)/ `tool_input.command` / `permission_mode`
- block: exit 2 + stderr(实测 0.146.0:"Command blocked by PreToolUse hook");新格式 `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "..."}}`
- **trust 机制:** 项目级 hooks.json 需用户 trust(CLI `/hooks` 审查,或 `--dangerously-bypass-hook-trust` 绕过);未 trust 时 `codex exec` 会挂起等待(实测)
- 证据: [Codex hooks](https://learn.chatgpt.com/docs/hooks)

**alloy 闸门层:** Claude Code 用外部脚本 hook 协议(PreToolUse/Stop,exit 2);OpenCode 用 plugin `tool.execute.before` + `session.idle`(原生 hook,可拦截所有工具);Pi 用 TS 扩展 `tool_call` + `agent_settled`;Codex 用 `hooks.json` 外部脚本(协议同 Claude Code,实测复用 `_hook-guard`/`_stop-guard` 脚本即可)。业务逻辑(`hook-guard.ts` / `stop-guard.ts`)共用,入口适配层不同。

**三层 hook 对照(alloy 流程防护):**

| 层 | 作用 | claude-code | opencode | pi | codex |
|----|------|-------------|----------|-----|-------|
| **PreToolUse**(拦截非白名单写入 + user-gate + 检测问答工具 clear pending_gate) | `_hook-guard` | ✅ settings.json PreToolUse | ✅ plugin `tool.execute.before`(可拦截所有工具) | ✅ extension `tool_call` | ✅ `.codex/hooks.json` PreToolUse(同款协议) |
| **Stop**(检测文本输出代替问答) | `_stop-guard` | ✅ settings.json Stop | ✅ plugin `session.idle` | ✅ extension `agent_settled` | ✅ `.codex/hooks.json` Stop(实测触发) |
| **pre-commit**(兜底 PreToolUse 盲区) | `_pre-commit-check` | ✅ `.git/hooks/pre-commit`(git 仓库级,所有 agent 共用) | ✅ 同左 | ✅ 同左 | ✅ 同左 |

**PreToolUse 层的问答工具检测(三平台统一机制):**

四个 agent 的 PreToolUse 层都会检测问答工具调用,自动 clear 所有 pending_gate(通过 `_hook-guard` 的 `clearAllPendingGates`):

| agent | 检测的工具名 | 触发方式 | 证据(代码) |
|-------|------------|---------|------------|
| Claude Code | `AskUserQuestion` | `_hook-guard` 从 stdin 读 `tool_name`,匹配 `ASK_TOOLS` 集合 | `hook-guard.ts` `ASK_TOOLS = {"AskUserQuestion", "question", "ask", "alloy-question"}` |
| OpenCode | `question` | plugin `tool.execute.before` 检测 `toolName === "question"`,调 `_hook-guard` | `.opencode/plugins/alloy-guard.ts` |
| Pi | `alloy-question` | extension `tool_call` 检测 `toolName === "alloy-question"`,调 `_hook-guard` | `.pi/extensions/alloy-guard.ts` |
| Codex | `request_user_input` | hook stdin 的 `tool_name` 匹配 `ASK_TOOLS`(实测 PreToolUse stdin 含 tool_name) | `hook-guard.ts` `ASK_TOOLS`(含 request_user_input) |

**关键:** Pi 的问答工具检测在 `alloy-guard.ts` extension(不是 `alloy-question.ts` extension)。`alloy-question.ts` 只负责注册工具 + 弹 TUI;`alloy-guard.ts` 订阅 `tool_call` 事件,检测到 `alloy-question` 工具调用时调 `_hook-guard` 触发 clear。两个 extension 协作:`alloy-question` 提供工具,`alloy-guard` 检测调用并 clear gate。

**用户级 vs 项目级(各 agent hook 路径分级):**

4 个 agent 的 hook 都支持用户级(全局)和项目级两层路径:

| agent | 项目级 | 用户级(全局) | 出处 |
|-------|--------|--------------|------|
| Claude Code | `.claude/settings.json` | `~/.claude/settings.json` | [settings](https://code.claude.com/docs/en/settings)(User/Project/Local 三级,优先级 Managed > CLI > Local > Project > User) |
| OpenCode | `.opencode/plugins/*.ts` | `~/.config/opencode/plugins/` | [plugins.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/plugins.mdx)(全局 config -> 项目 config -> 全局 plugin -> 项目 plugin) |
| Pi | `.pi/extensions/*.ts` | `~/.pi/agent/extensions/*.ts` | [extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) |
| Codex | `.codex/hooks.json`(需 trust) | `~/.codex/hooks.json` | [hooks](https://learn.chatgpt.com/docs/hooks)(四层发现:~/.codex/hooks.json → config.toml → repo/.codex/hooks.json → repo/config.toml,多层合并加载) |

**alloy 设计决策:hook / permissions / question extension 仅限项目级,作为项目资源。** 即使 `alloy init --scope global`,hook/permissions/question extension 仍装项目级路径(`.claude/settings.json` / `.opencode/plugins/` / `.pi/extensions/alloy-guard.ts` / `.pi/extensions/alloy-question.ts`),不装用户级。理由:
1. **hook 绑定 alloy CLI 绝对路径**--`node <alloy-dist>/cli/index.js _hook-guard`。全局装会让所有项目指向单一 alloy 路径,多版本(开发版 + npm 全局版)冲突
2. **question extension 同理**--注册 `alloy-question` 工具供 LLM 调用,与 alloy 版本绑定,全局装会多版本冲突
3. **项目级更显式**--每个项目自主启用 alloy hook/question,不污染全局
4. **pre-commit 天然项目级**--`.git/hooks/pre-commit` 是 git 仓库级,与 hook/permissions/question 项目级一致
5. **scope=global 只影响 skills/commands 等共享资源**--hook/permissions/question 是项目工作流的一部分,不是跨项目共享资源

**alloy 当前实现状态(2026-07-16 更新):**
- Claude Code:三层全配 ✅(PreToolUse 检测 AskUserQuestion 自动 clear pending_gate)
- OpenCode:**三层全配 ✅**(PreToolUse 用 plugin `tool.execute.before`,检测 `question` 工具自动 clear pending_gate;Stop 用 plugin `session.idle`,同一文件 `.opencode/plugins/alloy-guard.ts`;旧 custom tool 方案已迁移)
- Pi:**三层全配 ✅**(PreToolUse 用 extension `tool_call`,检测 `alloy-question` 工具自动 clear pending_gate;Stop 用 extension `agent_settled`,同一文件 `.pi/extensions/alloy-guard.ts`)
- Codex:**三层全配 ✅**(2026-08-02 实测:PreToolUse/Stop 协议与 Claude Code 同款,载体 `.codex/hooks.json`,复用 `_hook-guard`/`_stop-guard` 脚本;注意项目 hooks 需用户 trust)

**4 个 agent 三层 hook 全部对齐 + 问答工具检测全配。** pre-commit 是 git 仓库级(`.git/hooks/pre-commit`),所有 agent 共用。问答工具检测(clear pending_gate)统一通过 `_hook-guard` 的 `ASK_TOOLS` 集合 + `clearAllPendingGates` 实现,入口适配层不同(Claude Code stdin / OpenCode plugin / Pi extension / Codex hooks.json stdin)。

**OpenCode 旧 custom tool 盲区(已修复):** 早期方案 `.opencode/tools/write.ts+edit.ts` 覆盖内置 write/edit,只在 agent 调这两个工具时触发 hook,检测不到 `question` 工具调用,导致 `pending_gate` 设了无法自动 clear。已迁移到 plugin `tool.execute.before`(可拦截所有工具,检测到 question 时自动 `clear-all` pending_gate)。`alloy clean` 仍兼容清理旧 tools 路径(迁移前部署的项目)。

---

## 5. Permissions / 白名单

### Claude Code
- 配置: `.claude/settings.json`
- 语法: `permissions.allow` / `permissions.deny`
- 模式: `Bash(cmd *)` / `Read(path)` / `Edit(path)`,`**` 递归通配
- 三态: allow/deny(无 ask,未匹配则用户确认)
- 项目级 allow 需 workspace trust
- 证据: [Claude Code settings](https://docs.claude.com/en/docs/claude-code/settings)

### OpenCode
- 配置: `opencode.json`(项目级)
- 语法: `permission` 字段,支持对象或字符串
- 三态: **allow/ask/deny**(独有 ask)
- 粒度: 工具级别(`bash`/`edit`/`read`)+ glob 命令匹配(`"bash": { "git *": "allow", "rm *": "deny" }`)
- 代理级覆盖: 为特定代理单独配置权限
- 证据: [OpenCode permissions](https://opencode.ai/docs/permissions)

### Pi
- 配置: `.pi/permissions.json`(项目级)或 `~/.pi/agent/permissions.json`(全局)
- 需插件: `pi-permissions`(`pi install npm:pi-permissions`)
- 语法: `permissions.allow` / `permissions.deny`
- 模式: `Bash(cmd *)`,支持 glob + 正则
- 三态: allow/deny(Deny always wins)
- 证据: [pi-permissions npm](https://www.npmjs.com/package/pi-permissions)

### Codex
- 配置: `~/.codex/config.toml`(全局,非项目级)--`approval_policy` / `permission_mode`(default/acceptEdits/plan/dontAsk/bypassPermissions)
- 项目级: 不支持(与 Pi/Claude Code 不同,无项目级 permissions 文件)
- 动态决策: `PermissionRequest` hook(工具即将请求审批时,可 allow/deny 或不做决定)
- **alloy 适配:** 不自动配置项目级 permissions(同当年结论);闸门靠 hook 层 + SKILL.md 硬约束
- 证据: [Codex hooks](https://learn.chatgpt.com/docs/hooks)(PermissionRequest 事件)+ [config reference](https://learn.chatgpt.com/docs/config-file/config-reference)

**alloy 适配:** Claude Code/Pi 用 `Bash(cmd *)` 格式(一致);OpenCode 用工具级 + glob(格式不同,需 `toOpenCodeBashPermissions` 转换);Codex 仅全局,不自动配置。

---

## 6. 交互工具(AskUserQuestion 对应)

> **用途:** alloy SKILL.md 里的 `🔴 USER_GATE` / `🔴 STOP` 需要平台原生交互工具让用户物理选择。四平台机制不同,alloy 通过 `alloy-shared/references/interaction-style.md` 统一调用示例。

### Claude Code
- **工具:** `AskUserQuestion`(内置,无需 alloy 部署)
- **支持:** 多选/单选/文本输入
- **alloy 用:** USER_GATE 依赖此工具
- **调用方式:** agent 调 `AskUserQuestion({ questions: [{ question, options: [{label, description}] }] })`
- **部署:** 无需(alloy init 不装,工具内置)
- **清理:** 无需
- 证据: [Claude Code AskUserQuestion](https://docs.claude.com/en/docs/claude-code/...)

### OpenCode
- **工具:** `question`(内置,无需 alloy 部署)
- **支持:** options(label+description)、`multiple: true`(多选)、`custom: true`(自定义文本,默认开)
- **调用方式:** agent 调 `question({ question, options: [{label, description}], multiple?: true })`
- **部署:** 无需(alloy init 不装,工具内置)
- **清理:** 无需
- plan-mode prompt 中明确引用为 "AskUserQuestion tool"
- 证据: [packages/opencode/src/tool/question.ts](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/tool/question.ts)

### Codex
- **工具:** `request_user_input`(内置,无需 alloy 部署)
- **schema:** `{ id: string(必填), header, question, options: [{label, description}], isOther?: boolean, isSecret?: boolean }`;无 `multiSelect`;1-5 个问题;响应 `{ answers: { <id>: { answers: [label] } } }`
- **可用性(源码 + 实测 0.146.0):** 源码 `protocol/src/config_types.rs` 的 `allows_request_user_input()` 只匹配 `ModeKind::Plan`;Default 模式需开启实验 feature `default_mode_request_user_input`(features/src/lib.rs,UnderDevelopment,默认关闭)。实测:开启后 Default 模式(TUI)可用,报错从 "unavailable in Default mode" 变为 "not supported in exec mode"(仅 exec 非交互不可用,合理)
- **alloy 适配:** `interactiveTool: "partial"`--init/update 自动写 `~/.codex/config.toml` 的 `[features] default_mode_request_user_input = true`(幂等);exec 非交互模式报错后降级为结构化文本选项,不反复重试;`ASK_TOOLS` 含 `request_user_input`(调用可触发 clear pending_gate)
- 证据: [openai/codex features/src/lib.rs](https://github.com/openai/codex/blob/main/codex-rs/features/src/lib.rs)(FeatureSpec DefaultModeRequestUserInput)+ [tool_config.rs](https://github.com/openai/codex/blob/main/codex-rs/tools/src/tool_config.rs)(request_user_input_available_modes)+ [Codex SDK RequestUserInput](https://codex-sdk.hexdocs.pm/0.16.0/Codex.Protocol.RequestUserInput.md)

### Pi
- **无内置交互工具**--内置工具仅 `read/bash/edit/write/grep/find/ls`(7 个)
- **alloy 方案(两个 extension 协作):**
  - `alloy-question.ts`:用 `pi.registerTool()` 注册 `alloy-question` 工具供 LLM 调用,工具内部用 `ctx.ui.custom()` + 自定义 OptionList 组件弹出 TUI(不用 SelectList,自定义以控制颜色/对齐/checkbox)
  - `alloy-guard.ts`:订阅 `tool_call` 事件,检测到 `alloy-question` 工具调用时调 `_hook-guard` 触发 `clearAllPendingGates`(自动 clear pending_gate)
- **调用方式:** agent 调 `alloy-question({ question, options: [{label, description}], multiple?: true })`,工具内部弹出 TUI,用户选择后返回选中 label;同时 `alloy-guard` 检测到调用自动 clear pending_gate
- **TUI 样式设计:** 详见下方 §6.1 alloy-question TUI 样式设计
- **部署条件:** 只有 `target_agents` 含 `pi` 时才装(`getQuestionSupportedAgents()` 返回 `["pi"]`),两个 extension 同时装
- **部署范围:** 仅项目级(`.pi/extensions/alloy-question.ts` + `.pi/extensions/alloy-guard.ts`),即使 `alloy init --scope global` 也装项目级(沿用 hook/permissions 模式,见 §4 设计决策;避免多版本冲突)
- **清理:** `alloy clean` 识别文件名 `alloy-question.ts` + 内容含 `registerTool` 标记,直接删文件;`alloy-guard.ts` 单独识别清理
- **更新:** `alloy update` 复用 init execute 逻辑,自动刷新部署两个 extension
- **依赖:** extension `import { Type } from "typebox"` + `@earendil-works/pi-tui`(Pi 运行时提供,alloy 项目不装)
- 证据: [Pi extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)、[Pi tools 源码](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/core/tools/)
- **详见:** `alloy-shared/references/interaction-style.md`(三平台调用示例)

### 6.1 alloy-question TUI 样式设计

**背景:** Pi 无内置交互工具,alloy 用 extension 注册 `alloy-question` 工具,LLM 在 USER_GATE 时调用,弹出 TUI 让用户选选项。设计目标是深色终端上清晰美观,按键响应可靠。

**关键技术决策:**

1. **按键处理:用注入的 keybindings,不调 `getKeybindings()`**
   - 官方指导([Pi extensions.md L2213](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)):`ctx.ui.custom()` 回调参数 `(tui, theme, keybindings, done)`,应用注入的 `keybindings` 参数,不调 `getKeybindings()` 或 `setKeybindings()`
   - 错误做法(曾导致 TUI 卡住):`const kb = getKeybindings(); kb.matches(data, "tui.select.up")` -- `getKeybindings()` 返回全局实例,可能未初始化或配置不一致
   - 正确做法:`ctx.ui.custom((tui, theme, keybindings, done) => { ... list = new OptionList(options, multiple, keybindings) ... })`,OptionList 内部 `this.keybindings.matches(data, "tui.select.up/down/confirm/cancel")`
   - keybinding 名称(和 SelectList 源码一致):`tui.select.up` / `tui.select.down` / `tui.select.confirm` / `tui.select.cancel`
   - space 多选切换用 `matchesKey(data, Key.space)`(Key 枚举,`tui.select.*` 无 space)

2. **颜色:用 ANSI truecolor 绕过 Pi theme**
   - 原因:Pi dark theme 的 `accent` 解析为浅蓝/青系(`borderAccent` 是 `cyan`),偏淡;`theme.fg()` 只接受预定义颜色名,不支持 hex
   - 方案:直接用 ANSI escape code 嵌入颜色,绕过 theme 限制
   - 常量定义:
     ```
     BRIGHT_WHITE  = \x1b[97m  (亮白,标题用)
     NORMAL_WHITE  = \x1b[37m  (普通白,内容用)
     DEEP_BLUE     = \x1b[38;2;74;158;255m  (深蓝 #4A9FF,选中项用)
     DIM_GRAY      = \x1b[90m  (暗灰,description 用)
     RESET_FG      = \x1b[39m  (只 reset 前景色)
     BOLD          = \x1b[1m
     RESET_BOLD    = \x1b[22m
     ```

3. **样式规则(用户确认的最终风格):**

   | 元素 | 颜色 | 说明 |
   |------|------|------|
   | 标题(question) | 亮白 + bold | `brightWhite(bold(text))` -- 醒目 |
   | 边框(DynamicBorder) | 深蓝 | `deepBlue(s)` -- 与选中色呼应 |
   | 非选中项 label | 普通白 | `normalWhite(text)` -- 不抢眼 |
   | 选中项 label | 深蓝 + bold | `deepBlue(bold(text))` -- 高亮当前光标 |
   | description(选中/非选中) | 暗灰 | `DIM_GRAY` -- 辅助信息不随选中变色 |
   | 底部操作提示 | 普通白 | `normalWhite(text)` |

4. **序号 + checkbox 规则:**
   - 序号:统一 `1.`/`2.`/`3.` + `padEnd(3)`(3 字符宽),选中/非选中宽度一致避免抖动
   - 多选 checkbox:`[x] `(已选)/`[ ] `(未选),4 字符宽
   - 单选:无 checkbox,序号后直接 label

5. **description 对齐:**
   - 缩进 = 序号宽(3) + checkbox 宽(4) = 7 字符(多选)或 3 字符(单选)
   - 与 label 起始严格对齐,单选多选都对齐

6. **抖动修复:**
   - 去掉 ▶ 选中标记(选中/非选中序号宽度一致)
   - 去掉选项间空行(空行没背景,上下移动视觉抖动)
   - 所有行结构统一

7. **布局结构(showSingleSelect / showMultiSelect):**
   ```
   ┌─ DynamicBorder(deepBlue) ────────┐
   │ ❓ <question>(brightWhite + bold) │
   │                                   │
   │ 1. [ ] option1 label              │  ← normalWhite / 选中 deepBlue+bold
   │        description(暗灰)          │
   │ 2. [ ] option2 label              │
   │        description(暗灰)          │
   │                                   │
   │   ↑↓ navigate  space toggle  ... │  ← normalWhite
   └─ DynamicBorder(deepBlue) ────────┘
   ```

8. **单选/多选行为:**
   - 单选:↑↓ 移动光标,enter 确认当前高亮,esc 取消
   - 多选:↑↓ 移动光标,space 切换 checkbox,enter 确认所有选中(空选中则确认当前高亮),esc 取消

9. **单选项自动转 confirm TUI:**
   - 问题:单选项 = 确认场景(非选择),select TUI 展示单选项用户只能 enter 或 esc,失去"选择"意义
   - 方案:`execute` 检测 `!multiple && options.length === 1` 时,自动追加 `{ label: "取消", description: "退出当前操作" }`,变成 2 选项(确认/取消)
   - 行为:用户选"取消"(追加项)返回 `cancelled: true`,agent 收到退出流程;选原选项正常返回
   - 语义对齐:单选项本质是 confirm,补"取消"后 = 确认/取消 2 选项,正好是 confirm 语义,用 select TUI 呈现保持一致性
   - 不报错阻断:工具自动补选项顺滑过渡,弱模型误传单选项不会卡住流程

**实现位置:** `src/core/agent-config.ts` 的 `generatePiQuestionExtensionContent()` 函数生成完整 extension TS 字符串,内联 `OptionList` 类 + `showSingleSelect` / `showMultiSelect` 函数 + ANSI 颜色常量。`alloy init` / `alloy update` 部署到 `.pi/extensions/alloy-question.ts`。

### 四平台对比

| agent | 工具名 | 来源 | 多选 | 部署 | 清理 |
|-------|--------|------|------|------|------|
| Claude Code | `AskUserQuestion` | 内置 | ✅ | 无需 | 无需 |
| OpenCode | `question` | 内置 | ✅(`multiple: true`) | 无需 | 无需 |
| Pi | `alloy-question` | alloy extension 注册 | ✅(`multiple: true`) | `alloy init` 装 `.pi/extensions/` | `alloy clean` 删文件 |

---

## 7. Skills 检测路径(核心)

### Claude Code
1. 项目级: `.claude/skills/<name>/SKILL.md`
2. 用户级: `~/.claude/skills/<name>/SKILL.md`
3. 用户插件: `~/.claude/plugins/cache/<marketplace>/superpowers/<version>/skills/<name>/`(有版本号)
- 证据: [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills) + alloy `detectSkill` 实现

### OpenCode
1. 项目级: `.opencode/skills/` + `.claude/skills/` + `.agents/skills/`(从 CWD 向上到 git worktree root)
2. 用户级: `~/.config/opencode/skills/` + `~/.claude/skills/` + `~/.agents/skills/`
3. 用户插件(npm): `~/.cache/opencode/node_modules/superpowers/skills/<name>/`(通过 `opencode.json` 的 `plugin` 数组装,Bun 自动装到 `~/.cache/opencode/node_modules/`)
- 证据: [OpenCode skills.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/skills.mdx)、[plugins.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/plugins.mdx)

### Pi
1. 项目级(受信任后): `.pi/skills/` + `.agents/skills/`(cwd 和祖先目录,直到 git repo root)
2. 全局: `~/.pi/agent/skills/` + `~/.agents/skills/`
3. 用户插件(pi install 装的 package):
   - git: `~/.pi/agent/git/<host>/<path>/skills/<name>/`(如 `~/.pi/agent/git/github.com/obra/superpowers/skills/`)
   - npm: `~/.pi/agent/npm/node_modules/<package>/skills/<name>/`
4. Settings: `skills` 数组(可配置额外路径,如 `["~/.claude/skills"]`)
5. CLI: `--skill <path>`(repeatable)
- 证据: [Pi skills.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)、[package-manager.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/package-manager.ts)(npm L1999-2000,git L2039,2028)

### Codex
1. REPO 级: `$CWD/.agents/skills/`、`$CWD/../.agents/skills/`、`$REPO_ROOT/.agents/skills/`(从 CWD 逐级向上)
2. USER 级: `~/.agents/skills/`
3. ADMIN 级: `/etc/codex/skills`
4. SYSTEM: 随 Codex 内置(skill-creator、plan 等)
- 支持符号链接的 skill 文件夹;技能变更自动检测(未出现则重启 Codex)
- 禁用: `~/.codex/config.toml` 的 `[[skills.config]]` 条目
- 证据: [Build skills](https://learn.chatgpt.com/docs/build-skills)(加载位置表)

**关键洞察:**
- 所有 4 个 agent 中,OpenCode/Pi/Codex 都读 `.agents/skills/`(项目级)和 `~/.agents/skills/`(全局级,**除 Claude Code**)
- Claude Code 只读 `.claude/skills/` 和 `~/.claude/skills/`(不读 `.agents/skills/`)
- npx skills add 为 Claude Code/Pi 创建符号链接到 `.agents/skills/`;OpenCode/Codex 直接读共享目录

**FAQ:为什么 init 矩阵中所有 agent 都显示"✓ 全局共享"?**

`~/.agents/skills/` 是 npx skills 的共享存放目录,4 个 agent 的读取方式:
- **OpenCode**: 直接读 `~/.agents/skills/`(官方文档明确,无符号链接)
- **Pi**: 读 `~/.pi/agent/skills/`(符号链接)+ `~/.agents/skills/`(直接读,双路径)
- **Claude Code**: 读 `~/.claude/skills/`(符号链接到 `~/.agents/skills/`)
- **Codex**: 直接读 `~/.agents/skills/`(官方文档 USER 级路径,无符号链接)

所以 `~/.agents/skills/brainstorming` 存在时,4 个 agent 都能读到,显示"✓ 全局共享"是**正确的**,不是误判。只有 Claude Code 依赖符号链接(若 `~/.claude/skills/<name>` 符号链接丢失,Claude Code 才读不到);其他 agent 直接读 `~/.agents/skills/`,无符号链接丢失风险。

证据:
- OpenCode 官方:[skills 文档](https://opencode.ai/docs/skills) "Global agent-compatible: `~/.agents/skills/*/SKILL.md`"
- Pi 官方:skills.md + package-manager.ts

---

## 7.1 Skill 加载机制(关键差异)

> **用途:** alloy skill md 里调用外部 skill(opsx/superpowers)时,各 agent 的加载机制不同。本章节是 `alloy-shared/references/skill-loading.md` 的证据源。
> **调研日期:** 2026-07-16
> **核心差异:** Claude Code/OpenCode 有 `skill({ name })` 工具;**Pi/Codex 没有该工具,agent 需自己 `read` SKILL.md 或用平台提及语法(`$skill-name`)**。

### 四平台 skill 加载工具对比

| agent | skill 加载工具 | 机制 | 证据 |
|-------|--------------|------|------|
| Claude Code | 有 `skill({ name })` 工具 | agent 主动调用工具,平台加载 SKILL.md 全文 | [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills) |
| OpenCode | 有 `skill({ name })` 工具 | agent 主动调用工具,平台加载 SKILL.md 全文 | [OpenCode skills.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/skills.mdx) |
| **Pi** | **无 `skill()` 工具** | agent 自己 `read` SKILL.md(或用户 `/skill:name` 强制) | [Pi skills.md "How Skills Work"](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md) |
| **Codex** | **无 `skill()` 工具**(实测 0.146.0) | 渐进式披露:宿主按 description 匹配自动加载;显式:`$skill-name` 提及或 `read` SKILL.md | [Build skills](https://learn.chatgpt.com/docs/build-skills) |

### Codex 的 skill 加载机制

- **渐进式披露:** 宿主初始只加载每个 skill 的 name + description(总预算 ≤2% 上下文或 8,000 字符),被选中后才加载完整 SKILL.md 正文
- **隐式触发:** 任务匹配 description 时宿主自动选择(description 是主要触发机制,需前置关键用例和触发词)
- **显式触发:** Codex CLI/IDE 中 `$skill-name` 提及或 `/skills` 列表
- **实测工具集无 `skill()` 工具**(0.146.0:exec_command/write_stdin/update_plan/request_user_input/apply_patch/view_image/collaboration__* 等),alloy SKILL.md 里应写 `$skill-name` 或 `read .agents/skills/<name>/SKILL.md`

### Pi 的 skill 加载机制(官方文档确认)

Pi skills.md "How Skills Work" 章节明确说明:

> 1. At startup, pi scans skill locations and extracts names and descriptions
> 2. The system prompt includes available skills in XML format per the specification
> 3. **When a task matches, the agent uses `read` to load the full SKILL.md** (models don't always do this; use prompting or `/skill:name` to force it)
> 4. The agent follows the instructions, using relative paths to reference scripts and assets

**Pi 内置工具全集**(源码 `src/core/tools/` 目录确认):`bash` / `edit` / `find` / `grep` / `ls` / `read` / `write`(7 个,**无 skill 加载工具**)。

证据: [Pi tools 源码目录](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/core/tools/)

### Pi 的两种 skill 触发方式

| 方式 | 触发者 | 机制 | 适用场景 |
|------|--------|------|---------|
| **自动加载** | agent 自己 | 根据 description 匹配,agent 用 `read` 加载 SKILL.md | 文档明确说"models don't always do this",不可靠 |
| **强制加载** | 用户 | `/skill:name` slash command(如 `/skill:openspec-explore`) | 需 `enableSkillCommands: true`;agent 在流程中不应依赖用户手动触发 |
| **agent 主动 read** | agent 自己 | `read .pi/skills/<name>/SKILL.md` | **alloy 推荐方式**,在 SKILL.md 里明确指示路径 |

### alloy 适配方案

alloy skill md 里调用外部 skill 时,用多 agent 适配格式(见 `alloy-shared/references/skill-loading.md`):

```markdown
加载 `<skill-name>` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`):
- Claude Code / OpenCode: 调 `skill({ name: "<skill-name>" })`
- Pi: `read .pi/skills/<skill-name>/SKILL.md`
- Codex: `$<skill-name>` 提及或 `read .agents/skills/<skill-name>/SKILL.md`
```

**反例(对 Pi/Codex 无效):**
```markdown
调 `skill({ name: "openspec-explore" })` 加载 opsx skill
```

### superpowers skill 命名映射

alloy skill md 里用 `superpowers:brainstorming` 等带前缀的逻辑名,但 Pi 的 skill name 是 `brainstorming`(无前缀):

| alloy 逻辑名 | skill name(Pi 路径用) | Pi read 路径 |
|-------------|---------------------|-------------|
| `superpowers:brainstorming` | `brainstorming` | `.pi/skills/brainstorming/SKILL.md` |
| `superpowers:using-git-worktrees` | `using-git-worktrees` | `.pi/skills/using-git-worktrees/SKILL.md` |
| `superpowers:subagent-driven-development` | `subagent-driven-development` | `.pi/skills/subagent-driven-development/SKILL.md` |
| `superpowers:test-driven-development` | `test-driven-development` | `.pi/skills/test-driven-development/SKILL.md` |
| `superpowers:systematic-debugging` | `systematic-debugging` | `.pi/skills/systematic-debugging/SKILL.md` |
| `superpowers:verification-before-completion` | `verification-before-completion` | `.pi/skills/verification-before-completion/SKILL.md` |
| `superpowers:finishing-a-development-branch` | `finishing-a-development-branch` | `.pi/skills/finishing-a-development-branch/SKILL.md` |
| `superpowers:executing-plans` | `executing-plans` | `.pi/skills/executing-plans/SKILL.md` |
| `superpowers:requesting-code-review` | `requesting-code-review` | `.pi/skills/requesting-code-review/SKILL.md` |

### Pi 的 command wrapper 两种模式

alloy init 为 Pi 装的 `.pi/prompts/*.md` command wrapper 有两种模式:

| wrapper 类型 | 内容模式 | 示例 |
|-------------|---------|------|
| `alloy-*.md` | **指示 agent read**(间接) | "读取 `.pi/skills/alloy-start/SKILL.md`" |
| `opsx-*.md` | **直接嵌入 SKILL.md 内容**(直接) | 完整 SKILL.md 内容在 wrapper 里 |

**注意:** `opsx-*.md` wrapper 直接嵌入 SKILL.md 内容,agent 输入 `/opsx-explore` 时 Pi 会加载完整内容。但 alloy SKILL.md 里写 `skill({ name: "openspec-explore" })` 不会触发 `/opsx-explore` command--Pi 不认识 `skill({ name })` 工具调用。agent 在流程中应主动 `read .pi/skills/openspec-explore/SKILL.md`,不依赖 slash command。

### 历史背景

alloy 早期 SKILL.md 只写 `skill({ name: "xxx" })`(Claude Code 语法),对 Pi 无效。Pi 会反复探查找替代方案(如 `ls .pi/skills/`、`alloy --help`、`alloy ask-question`),浪费 LLM 往返,最终触发 429 限流。2026-07-16 调研后,统一改为多 agent 适配格式(见 `alloy-shared/references/skill-loading.md`)。

---

## 8. npx skills add 行为

`npx skills add obra/superpowers`(不带 `--agent`):
1. 装到 `.agents/skills/`(共享目录)
2. 为 claude-code 创建 `.claude/skills/<name>` 符号链接 → `../../.agents/skills/<name>`
3. 为 pi 创建 `.pi/skills/<name>` 符号链接 → `../../.agents/skills/<name>`
4. **OpenCode/Codex 直接读 `.agents/skills/`**(不需要符号链接)

- 所有 4 个 agent 都能用 npx 最新版(Codex 官方规范 USER 级 `~/.agents/skills/` 与共享目录一致)
- skills CLI 来源: [vercel-labs/skills](https://github.com/vercel-labs/skills)
- Supported Agents 表: https://github.com/vercel-labs/skills#supported-agents

**`--agent` 参数:**
- `-a, --agent <agents...>`: 指定 agent(如 `claude-code`, `opencode`, `pi`)
- `--agent '*'`: 所有 agent(但装到 `.agents/skills/` 共享,不为特定 agent 创建符号链接)
- `--copy`: 复制文件(而非符号链接)

---

## 9. Plugins

### Claude Code
- 安装: `/plugin install`(marketplace)
- marketplace: 官方 `claude-plugins-official` / `obra/superpowers-marketplace`
- 插件文件位置: `~/.claude/plugins/cache/<marketplace>/<plugin-name>/<version>/`
- 插件含: skills/agents/hooks/MCP/commands
- 证据: [Claude Code plugins](https://docs.claude.com/en/docs/claude-code/plugins)

### OpenCode
- 安装: `opencode.json` 的 `plugin` 数组(如 `"plugin": ["superpowers@git+https://github.com/obra/superpowers.git"]`)
- 插件位置: `.opencode/plugins/`(项目)或 `~/.config/opencode/plugins/`(全局)
- npm plugins 装到 `~/.cache/opencode/node_modules/`(Bun 自动装)
- 证据: [OpenCode plugins.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/plugins.mdx)

### Pi
- 安装: `pi install npm:@foo/bar` 或 `pi install git:github.com/user/repo`
- package 文件位置:
  - npm: `~/.pi/agent/npm/node_modules/<package-name>/`
  - git: `~/.pi/agent/git/<host>/<path>/`(如 `~/.pi/agent/git/github.com/obra/superpowers/`)
- settings 记录: user settings(`~/.pi/agent/settings.json`)或 project settings(`.pi/settings.json`,用 `-l`)
- package 含: extensions/skills/prompt-templates/themes
- 证据: [Pi packages.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)、[package-manager.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/package-manager.ts) L1999-2000(npm),L2039,2028(git)

### Codex
- 安装: plugin 分发(`.codex-plugin/plugin.json` 清单指向 skills 目录),可捆绑 MCP 连接器
- 插件位置: ChatGPT/Codex 通用插件目录(桌面端/CLI)
- 可捆绑 hooks(plugin manifest 或 `defaulthooks/hooks.json`),收到 `PLUGIN_ROOT`/`PLUGIN_DATA` env
- **alloy 不涉及**:独立 skill 文件夹(.agents/skills/)已覆盖 alloy 场景,无需打包 plugin
- 证据: [Skills & Plugins](https://learn.chatgpt.com/docs/skills-and-plugins) + [Hooks](https://learn.chatgpt.com/docs/hooks)

---

## 10. Commands / Prompt Templates

| agent | 项目级 | 全局级 | 调用 | 格式 |
|-------|--------|--------|------|------|
| Claude Code | `.claude/commands/*.md` | `~/.claude/commands/` | `/命令名` | Markdown |
| OpenCode | `.opencode/commands/*.md` | `~/.config/opencode/commands/` | `/命令名` | JSON 或 Markdown |
| Pi | `.pi/prompts/*.md` | `~/.pi/agent/prompts/` | `/模板名` | Markdown |
| Codex | 无项目级 | `~/.codex/prompts/*.md`(`CODEX_HOME` 可改) | `/提示词名` | Markdown(frontmatter: description/argument-hint) |

> **Codex 说明:** 无项目级 prompts(openspec CLI 的 codex adapter 装全局 `~/.codex/prompts/opsx-*.md`,证据:openspec-cli `dist/core/command-generation/adapters/codex.js`)。alloy 不给 Codex 装 command wrapper(Codex 的 skill 显式调用是 `$skill-name`,不是 `/` 列表)

- 证据: 各 agent 官方文档

**alloy 对 OpenCode 的 command wrapper 适配:** OpenCode 的 `/` slash command 只从 `.opencode/commands/` 加载,skills 通过 agent 调 `skill({ name })` 工具按需加载,不在 `/` 列表里(证据:[OpenCode skills](https://opencode.ai/docs/skills) --"Skills are loaded on-demand via the native `skill` tool")。alloy init 装 alloy-* skills 到 `.opencode/skills/` 后,`/alloy-start` 等无提示。为此 alloy init 额外装 8 个 command wrapper 到 `.opencode/commands/alloy-{start,plan,apply,archive,finish,fix,status,discard}.md`(project)或 `~/.config/opencode/commands/`(global),wrapper 内容指示 agent 调 `skill({ name: "alloy-..." })` 加载对应 skill,从而 `/alloy-start` 能间接触发 skill。Claude Code 的 skills 触发机制不同(原生支持 `/alloy-start` 从 `.claude/commands/` 加载),不需要 wrapper。

**alloy 对 Pi 的 command wrapper 适配:** Pi 的 `/` slash command 只从 `.pi/prompts/` 加载 prompt template,skills 虽在 `.pi/skills/` 但 `/alloy-start` 不会自动触发 skill 加载(Pi 无 `skill({ name })` 工具,内置仅 read/bash/edit/write/grep/find/ls,详见 §7.1 Skill 加载机制)。alloy init 装 alloy-* skills 到 `.pi/skills/` 后,`/alloy-start` 无提示。为此 alloy init 装两类 command wrapper 到 `.pi/prompts/`(project)或 `~/.pi/agent/prompts/`(global):
- **8 个 alloy-* wrapper**(`alloy-{start,plan,apply,archive,finish,fix,status,discard}.md`):指示 agent `read` 对应 `.pi/skills/alloy-.../SKILL.md` 文件,从而 `/alloy-start` 能间接触发 skill
- **11 个 opsx-* wrapper**(`opsx-{explore,new,continue,verify,archive,apply,bulk-archive,ff,onboard,propose,sync}.md`):直接嵌入 opsx SKILL.md 内容,用户输入 `/opsx-explore` 时加载完整 skill

**alloy SKILL.md 里的 skill 调用适配:** alloy skill md 里调用外部 skill(opsx/superpowers)时,用多 agent 适配格式(见 `alloy-shared/references/skill-loading.md`),不写 `skill({ name })`(对 Pi 无效)。Pi 的 agent 主动 `read .pi/skills/<name>/SKILL.md` 加载。

`alloy clean` 清理时通过文件名 + 内容特征(OpenCode: `skill({ name: "alloy-..." })`;Pi: `.pi/skills/alloy-.../SKILL.md`)精确识别 alloy 装的 wrapper,不误删用户自定义的 alloy-* command/prompt。

---

## 11. Worktree

> **调研日期:** 2026-07-17 三 agent worktree 行为实测 + 根因分析
> **核心结论:** Claude Code 和 OpenCode 能让 agent 在 worktree 内操作;**Pi 不能,alloy 对 Pi 强制 `worktree=skipped`**。

### 11.1 三 agent worktree 能力对比

| 能力 | Claude Code | OpenCode | Pi |
|------|-------------|----------|-----|
| 原生 worktree 工具 | ✅ `EnterWorktree(name)` | ✅ Worktree 服务(创建新 instance) | ❌ 无 |
| session cwd 切到 worktree | ✅ `EnterWorktree` 切 session cwd | ❌ 不切当前 session(新 instance 是另一 session) | ❌ 无 session 级切换 |
| bash 工具 cwd 持久 | ❌ 每次重置到 session cwd | ❌ 每次重置到 `instanceCtx.directory` | ❌ 每次重置到 session 启动 cwd |
| bash 工具 per-call cwd 参数 | ❌ 无 | ✅ `workdir` 参数 | ❌ 无(cwd 在 `createBashToolDefinition` 闭包绑定) |
| **agent 进 worktree 的方式** | `EnterWorktree` 切 session cwd | agent 每次调 bash 传 `workdir=<worktree>` | **无法进 worktree** |
| apply 阶段 pwd 实测 | `.claude/worktrees/<name>` | 主仓(agent 传 workdir) | 主仓 |
| alloy 适配 | `EnterWorktree` 创建 worktree | `alloy _worktree-create` + agent 传 workdir | **强制 `worktree=skipped`** |

### 11.2 Claude Code

- **支持:** ✅
- **机制:** `EnterWorktree(name)` 工具创建 git worktree + **切换 session 的 working directory 到 worktree**
- **官方描述:** "Creates an isolated git worktree and switches into it ... it moves the session's working directory and write access to that location"
- **效果:** session cwd 切到 `.claude/worktrees/<name>`,后续所有 Bash/Read/Write/Edit 默认在 worktree 内执行(bash 每次重置 cwd,但重置到 worktree)
- **配置:** `.claude/settings.json` 的 `worktree.baseRef`(alloy 用 `head`,从当前 feature 分支分出)
- **证据:** [Claude Code worktree](https://docs.claude.com/en/docs/claude-code/worktrees)、[tools-reference EnterWorktree](https://code.claude.com/docs/en/tools-reference)("switches into it" / "moves the session's working directory")

### 11.3 OpenCode

- **支持:** ✅
- **机制:** Worktree 服务(`packages/opencode/src/worktree/index.ts`)创建 git worktree,但**不切当前 session cwd**(新 instance 是另一 session)
- **关键:** OpenCode 的 bash 工具(`packages/opencode/src/tool/shell.ts`)有 **`workdir` 参数**,agent 每次调用传 `workdir=<worktree>` 进入 worktree 执行
- **源码:** `const cwd = params.workdir ? yield* resolvePath(params.workdir, ...) : instanceCtx.directory`
- **效果:** agent 调 `alloy _worktree-create` 创建 worktree 后,后续每个 bash 命令传 `workdir=<worktree>` 路径,命令在 worktree 内执行
- **配置:** 无 `baseRef` 配置;`CreateInput` 仅 `name` + `startCommand`;实验性 workspaces(`OPENCODE_EXPERIMENTAL_WORKSPACES=true`)
- **证据:** [OpenCode worktree](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/worktree/index.ts)、[shell.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/shell.ts)

### 11.4 Pi(不支持 worktree)

- **支持:** ❌ **alloy 对 Pi 强制 `worktree=skipped`**
- **根因(三层缺失):**
  1. **无 `EnterWorktree` 等价工具:** Pi 内置工具仅 `read/bash/edit/write/grep/find/ls`(7 个),无 worktree 工具,无 session cwd 切换机制
  2. **bash 工具无 per-call cwd 参数:** Pi bash 工具 schema 仅 `command` + `timeout`,cwd 在 `createBashToolDefinition(cwd, options)` 创建时闭包绑定,agent 调用时无法指定 cwd
  3. **session cwd 不解绑:** 即使 `alloy _worktree-create` 用 `git worktree add` 创建了 worktree 目录,Pi 的 session cwd 仍在主仓,后续所有 bash/write/edit 在主仓执行
- **实测后果(2026-07-17):** Pi 下 apply 阶段创建 worktree 后,agent 后续 bash 命令在主仓执行,SDD 子 agent 的 `git commit` 落 feature 分支(不在 worktree 分支),破坏 worktree 隔离。commit `a3c799d`/`53fbd22` 落 feature 分支,worktree 分支只有 `_worktree-create` 的初始 commit
- **对比 OpenCode/Codex 为什么正常:** OpenCode bash 工具有 `workdir` 参数;Codex 的 `exec_command` 也有 `workdir` 参数(实测 0.146.0,`cwd` 参数名无效),agent 每次调用传 worktree 路径,命令在 worktree 内执行,SDD commit 落 worktree 分支
- **alloy 适配:** Pi 下 `alloy _guard worktree-status` 检测 `PI_CODING_AGENT=true` 直接返回 `skipped`;apply SKILL.md 检测 Pi 跳过 worktree-choice USER_GATE,直接走 skipped 路径(apply 在 feature 分支执行)
- **证据:** [Pi bash.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/bash.ts)(`createBashToolDefinition(cwd, options)`,cwd 闭包绑定)、[Pi args.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/cli/args.ts)(无 `--worktree` flag)、[Pi tools 源码目录](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/core/tools/)(7 个工具,无 worktree/session 切换)

### 11.5 Codex(支持 worktree,同 OpenCode 机制)

- **支持:** ✅(2026-08-02 实测修正--早期误判为不支持,依据"工具集无 EnterWorktree"不充分)
- **机制(与 OpenCode 同构,无 EnterWorktree 工具):**
  1. **`exec_command` 有 `workdir` 参数**(实测 0.146.0:传 `workdir=<worktree>` 后 `pwd` 返回 worktree 路径;注意参数名是 `workdir` 不是 `cwd`,`cwd` 会被忽略回退 session 目录)
  2. **`apply_patch` 支持绝对路径**(实测:绝对路径成功写入 worktree 目录;相对路径落 session cwd 主仓)
  3. **官方 worktree 概念:** 桌面 app 有 Worktree 环境类型 + Codex-managed worktrees(`$CODEX_HOME/worktrees`)+ Handoff 流程;CLI 开发者模式为 `git worktree add` + `cd <worktree> && codex`
- **alloy 适配:** 同 OpenCode--`alloy _worktree-create <change-dir>` 创建(路径 `.worktrees/<name>`),agent 每个 bash 传 `workdir=<worktree>`,`apply_patch` 用绝对路径写 worktree 内文件
- **证据:** 实测(codex-cli 0.146.0)+ [Worktrees(learn.chatgpt.com)](https://learn.chatgpt.com/docs/environments/git-worktrees)

### 11.6 alloy worktree 调度策略

| Agent | worktree 创建方式 | state 写入 | apply 执行位置 |
|-------|------------------|-----------|--------------|
| Claude Code | `EnterWorktree(name)` 工具(harness 层) | agent 在 worktree 内手动写三字段 | worktree 内(session cwd 已切) |
| OpenCode | `alloy _worktree-create <change-dir>`(CLI 原子命令) | 命令内部在 worktree 内写三字段 + commit | worktree 内(agent 传 `workdir`) |
| Pi | **不创建**(强制 skipped) | `worktree: skipped` | feature 分支(无 worktree 隔离) |
| Codex | `alloy _worktree-create <change-dir>`(CLI 原子命令) | 命令内部在 worktree 内写三字段 + commit | worktree 内(agent 传 `workdir`;apply_patch 用绝对路径) |

**设计原则(不变):** worktree state(`worktree`/`worktree_branch`/`worktree_created_at`)只在 worktree 分支写,主仓 feature 分支保持 `null`。防止 merge worktree -> feature 时 .alloy.yaml 冲突。Claude Code(EnterWorktree 解绑 session cwd)、OpenCode 和 Codex(agent 传 workdir)都能让 agent 在 worktree 内操作,读 worktree 分支 state,守卫正常工作。Pi 无法满足"agent 在 worktree 内操作"前提,因此强制 skipped,不破坏该原则。

---

## 12. Subagent

### Claude Code
- **支持通过 Agent 工具分派子 agent**(alloy 用此实现 SDD)
- Agent 工具:`Agent({ description, prompt, subagent_type })`,可指定 general-purpose/Explore/Plan 等子 agent 类型
- alloy 用: SDD(subagent-driven-development)通过 Agent 工具分派 implementer/reviewer 子 agent
- 证据: [Claude Code sub-agents](https://code.claude.com/docs/en/sub-agents)

### OpenCode
- 支持: ✅
- 配置: `opencode.json` 的 `agent` 字段(JSON)或 `.opencode/agents/*.md` / `~/.config/opencode/agents/*.md`(markdown + frontmatter)
- 分两类: primary(Build/Plan)+ subagent(General/Explore/Scout)
- subagent 可被 primary 自动派发,或 `@mention` 手动调用
- 创建子 session,可导航切换
- alloy 用: SDD 通过 OpenCode subagent 机制分派子 agent
- 证据: [OpenCode agents.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/agents.mdx)

### Pi(不支持 SDD)
- **不支持原生 subagent**(README 明确:"skips features like sub agents and plan mode")
- 可通过 SDK/extension 嵌套(`createAgentSession`),或装 `pi-subagents` 可选包获得 `subagent` 工具
- **alloy 不依赖可选包**,因此 Pi 下 SDD(subagent-driven-development)不可用
- alloy 适配: apply 阶段 SDD/EP USER_GATE 检测 Pi 时**只给 `executing-plans` 选项**(隐藏 SDD),用 EP 在当前 session 顺序执行
- 证据: [Pi README](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md)、[pi-tools.md subagents](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)("Pi core does not ship a standard subagent tool")

### Codex
- **支持:** ✅(默认启用 subagent workflows)
- **工具:** `collaboration__spawn_agent` / `collaboration__send_message` / `collaboration__wait_agent` 等(实测 0.146.0 工具集)
- **配置:** `~/.codex/agents/*.toml`(个人)/ `.codex/agents/*.toml`(项目);字段 `name`/`description`/`developer_instructions` + 可选 `model`/`sandbox_mode`/`mcp_servers`/`skills.config`
- **内置 agent:** `default`(通用)/ `worker`(实现/修复)/ `explorer`(只读探索)
- **并发上限:** `[agents] max_concurrent_threads_per_session`
- **alloy 适配:** SDD 可用(不强制 EP,与 Claude Code/OpenCode 相同走正常 USER_GATE 选择)
- 证据: [Codex Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

**alloy SDD 调度策略:**

| Agent | SDD 可用 | 分派方式 | EP 降级 |
|-------|---------|---------|--------|
| Claude Code | ✅ | Agent 工具(`subagent_type: general-purpose`) | 可选 |
| OpenCode | ✅ | OpenCode subagent 机制(`@mention` 或自动派发) | 可选 |
| Pi | ❌ | 无原生 subagent(alloy 不依赖 pi-subagents 可选包) | **强制 EP** |
| Codex | ✅ | `collaboration__spawn_agent`(TOML 配置 worker/explorer) | 可选 |

---

## 13. 补全(shell completion)

### Claude Code
- 支持: ✅(alloy 自己的补全,非 claude-code)
- 命令: `alloy completion`
- 注册: `source <(alloy completion bash/zsh)` 写入 `~/.zshrc` / `~/.bashrc`

### OpenCode
- 支持: ✅
- 命令: `opencode completion`(yargs `.completion()`)
- 注册: `eval "$(opencode completion)"`(bash)/ `SHELL=/bin/zsh opencode completion`(zsh)
- 证据: [packages/opencode/src/index.ts](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/index.ts)

### Pi
- 支持: ❌
- 无 `completion` 命令(仅 install/remove/update/list/config)
- 证据: [Pi args.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/cli/args.ts)

### Codex
- 支持: ❌(无 `codex completion` 命令)
- 证据: [Codex CLI reference](https://learn.chatgpt.com/docs/codex/developer-commands)(无 completion 子命令)

---

## 14. 运行时标识环境变量与工具参数名

> **用途:** alloy 运行时(被 hook/plugin/extension 调用时)感知当前是哪个 agent,用于差异化处理(如工具参数名 `filePath` vs `file_path` vs `path`、worktree 路径、错误提示文案等)。
> **调研日期:** 2026-07-14
> **方案:** A 层优先--A 层读 agent 运行时自注入的 env(4 个 agent),兜底返回 null。

### 14.1 运行时标识 env(A 层:agent 自注入,alloy 被动读)

| agent | env 变量 | 值 | 注入位置 | 证据 |
|-------|---------|-----|---------|------|
| Claude Code | `CLAUDECODE` | `1` | 所有子进程(Bash/PowerShell/hook/MCP) | [env-vars](https://code.claude.com/docs/en/env-vars)("Set to 1 in subprocesses Claude Code spawns") |
| OpenCode | `OPENCODE` | `1` | `packages/opencode/src/index.ts` 启动时 `process.env.OPENCODE = "1"` | [index.ts](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/index.ts) |
| Pi | `PI_CODING_AGENT` | `true` | `packages/coding-agent/src/cli.ts` 启动时 `process.env.PI_CODING_AGENT = "true"` | [cli.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/cli.ts) |
| Codex | `CODEX_CI` | `1`(exec 非交互模式) | codex exec 注入(`codex exec` 实测 env 含 `CODEX_CI=1` + `CODEX_THREAD_ID=<session-id>`) | 实测 0.146.0 + [is-ai-agent](https://docs.rs/crate/is-ai-agent/0.3.0)(CODEX_THREAD_ID/CODEX_SANDBOX/CODEX_CI) |
| Codex | `CODEX_THREAD_ID` | 会话 id(交互/exec 均注入) | 每次 codex 会话注入,值如 `019fc195-...` | 同上 |

**关键:** 这 4 个 env 是 agent 运行时自己注入的(Codex 无 `CODEX=1`,只有 `CODEX_CI`/`CODEX_THREAD_ID`),alloy 被动读取,不依赖 alloy init 配置。即使 alloy init 生成的 plugin/extension 全坏,这 4 个 agent 仍能被感知。

**Codex 检测优先级陷阱(实测 2026-08-02):** codex 会话的 shell 继承用户 shell env(用户若全局 `export CLAUDECODE=1`,codex 子进程里也有 `CLAUDECODE=1`)。`detectAgent` 必须先检测 `CODEX_CI`/`CODEX_THREAD_ID` 再检测 `CLAUDECODE`,否则 codex 会话被误判为 claude-code。

### 14.2 hook 进程拿 agent 上下文的途径

| agent | 途径 | 字段 |
|-------|------|------|
| Claude Code | stdin JSON + env | stdin:`tool_name`/`tool_input`/`session_id`/`cwd`/`hook_event_name`;env:`CLAUDE_PROJECT_DIR`/`CLAUDECODE` |
| OpenCode | plugin 回调参数(非 env) | `input.tool`/`input.sessionID`/`input.callID` + `output.args`;env:`OPENCODE`(进程继承) |
| Pi | extension 回调参数(非 env) | `event.toolName`/`event.toolCallId`/`event.input`;env:`PI_CODING_AGENT`(进程继承) |
| Codex | stdin JSON + env | stdin:`tool_name`/`tool_input`/`session_id`/`cwd`/`hook_event_name`/`permission_mode`(实测与 Claude Code 同构);env:`CODEX_CI`/`CODEX_THREAD_ID` |

### 14.3 write/edit 工具参数名(关键差异,曾导致 OpenCode 拦截失效)

| agent | write 参数名 | edit 参数名 | 证据 |
|-------|-------------|------------|------|
| Claude Code | `file_path` | `file_path` | [Claude Code tools](https://docs.claude.com/en/docs/claude-code/...) |
| OpenCode | `filePath`(驼峰) | `filePath`(驼峰) | [write.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/write.ts)/[edit.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/edit.ts) `Parameters = Schema.Struct({ filePath: ... })` |
| Pi | `path`(主)/`file_path`(兼容) | `filePath`(主)/`file_path`(兼容) | [write.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/write.ts)`args?.file_path ?? args?.path` |
| Codex | 无独立 write/edit 工具(用 `apply_patch`);bash 工具是 `exec_command`(`command` 参数) | 同左 | 实测 0.146.0 工具集 |

**历史 bug:** alloy init 生成的 OpenCode plugin 取 `args?.path ?? args?.file_path`,OpenCode write 工具实际参数是 `filePath`,导致拦截失效(commit 274aa23 修复)。

### 14.4 hook 事件参数结构(关键差异,曾导致 Pi 拦截失效)

| agent | hook 入口 | 工具名字段 | 工具输入字段 | 证据 |
|-------|---------|-----------|------------|------|
| Claude Code | `_hook-guard` stdin JSON | `tool_name` | `tool_input.file_path` | [hooks](https://docs.claude.com/en/docs/claude-code/hooks) |
| OpenCode | plugin `tool.execute.before` | `input.tool` | `output.args.filePath`(驼峰) | [plugins.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/plugins.mdx) |
| Pi | extension `tool_call` 事件 | `event.toolName` | `event.input`(可变,write 用 `input.path`/`input.file_path`,edit 用 `input.filePath`/`input.file_path`) | [extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) |
| Codex | `_hook-guard` stdin JSON(实测 0.146.0) | `tool_name`(实测值 `Bash`,工具列表名是 `exec_command`) | `tool_input.command`(Bash/apply_patch) | [Hooks](https://learn.chatgpt.com/docs/hooks)(PreToolUse stdin 字段) |

**历史 bug(2026-07-16 修复):** alloy-guard extension 早期取 `event?.tool ?? event?.name`(工具名)+ `event?.args?.path`(文件路径),Pi 实际字段是 `event.toolName` + `event.input`,导致 alloy-question 检测和 write/edit 拦截全部失效(5 次 HARD_STOP 需手动降级)。修复:统一用 `event.toolName` + `event.input.path ?? event.input.filePath ?? event.input.file_path`。

### 14.5 alloy detectAgent 实现(A 层优先)

```
detectAgent(env):
  # 0 层:AI_AGENT 通用规范(格式 <agent-id>_<version>_agent)
  # A 层:agent 运行时自注入 env(优先,不依赖 alloy init)
  if env.CODEX_CI === "1" or env.CODEX_THREAD_ID: return "codex"  # 必须最先!
  if env.CLAUDECODE === "1": return "claude-code"
  if env.OPENCODE === "1": return "opencode"
  if env.PI_CODING_AGENT === "true": return "pi"
  # 兜底:无法确定
  return null
```

**优先级:** A 层优先(A 层是 agent 自注入,最可靠);兜底 null(按工具参数名兼容取 `file_path ?? filePath ?? path`)。

**Codex 检测必须最先(实测 2026-08-02):** codex 会话 shell 继承用户 env(实测 codex exec 的 env 里同时有 `CODEX_CI=1` 和 `CLAUDECODE=1`)。若 `CLAUDECODE` 判断在前,codex 会话会被误判为 claude-code,导致 worktree-status、SDD 降级等逻辑走错分支。Codex 官方 env 文档未列出 `CODEX_CI`/`CODEX_THREAD_ID`(第三方检测库 is-ai-agent/proofkit/Vercel detect-agent 确认),但实测注入稳定。

---

## alloy 安装/检测策略

### Skills 安装(installSuperpowers)

**只调一次 `npx skills add obra/superpowers -y`:**
- npx 装到 `.agents/skills/`(共享目录)
- 为 claude-code 创建 `.claude/skills/` 符号链接
- 为 pi 创建 `.pi/skills/` 符号链接
- OpenCode 直接读 `.agents/skills/`
- **所有 4 个 agent 都能用 npx 最新版**

**fallbackInstall 仅在 npx 失败时(网络问题):**
- 复制 vendor 到 `.agents/skills/`
- 为 claude-code/pi 创建符号链接
- 非 npx 失败场景**不 fallback**(避免覆盖 npx 最新版)

### Skills 检测(detectSkill)

按 agent 实际路径检测,**项目级 → 用户级 → 用户插件**(避免重复安装):

| agent | 项目级 | 用户级 | 用户插件 |
|-------|--------|--------|----------|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` | `~/.claude/plugins/cache/<mk>/superpowers/<ver>/skills/` |
| OpenCode | `.opencode/skills/` + `.claude/skills/` + `.agents/skills/` | `~/.config/opencode/skills/` + `~/.claude/skills/` + `~/.agents/skills/` | `~/.cache/opencode/node_modules/superpowers/skills/`(npm) |
| Pi | `.pi/skills/` + `.agents/skills/` | `~/.pi/agent/skills/` + `~/.agents/skills/` | `~/.pi/agent/git/github.com/obra/superpowers/skills/`(git)+ `~/.pi/agent/npm/node_modules/superpowers/skills/`(npm) |

**关键修正:**
- OpenCode/Pi 也读 `.agents/skills/`(之前遗漏)
- Claude Code 不读 `.agents/skills/`(只读 `.claude/skills/`)

---

## 证据来源汇总(Codex 部分)

- [Build skills(learn.chatgpt.com)](https://learn.chatgpt.com/docs/build-skills): SKILL.md 格式、目录结构、加载位置(REPO/USER/ADMIN)、渐进式披露、`$` 提及
- [Skills & Plugins(learn.chatgpt.com)](https://learn.chatgpt.com/docs/skills-and-plugins): skill vs plugin 关系、显式/隐式触发
- [AGENTS.md(learn.chatgpt.com)](https://learn.chatgpt.com/docs/agent-configuration/agents-md): 指令文件层级、override 链、合并顺序、project_doc_max_bytes
- [Hooks(learn.chatgpt.com)](https://learn.chatgpt.com/docs/hooks): 事件全集、PreToolUse stdin/exit 2/permissionDecision、hooks.json 配置、trust 机制
- [Environment variables(learn.chatgpt.com)](https://learn.chatgpt.com/docs/config-file/environment-variables): CODEX_HOME/CODEX_API_KEY 等(官方未列出 CODEX_CI/CODEX_THREAD_ID)
- [Subagents(learn.chatgpt.com)](https://learn.chatgpt.com/docs/agent-configuration/subagents): 默认启用、TOML 配置、内置 worker/explorer、并发上限
- [is-ai-agent](https://docs.rs/crate/is-ai-agent/0.3.0): CODEX_THREAD_ID/CODEX_SANDBOX/CODEX_CI 检测
- [openai/codex #3064](https://github.com/openai/codex/issues/3064): 沙箱不继承用户 env(但自注入 agent env)
- [openspec-cli codex adapter](https://github.com/fission-ai/openspec)(dist/core/command-generation/adapters/codex.js): prompts 装全局 `~/.codex/prompts/opsx-*.md`
- **实测记录(2026-08-02,codex-cli 0.146.0):** env 注入 CODEX_CI/CODEX_THREAD_ID;request_user_input 默认仅 Plan mode,开启 `default_mode_request_user_input` feature 后 Default 模式可用(仅 exec 不可用);PreToolUse hook 触发 + exit 2 阻断;项目 hooks.json 需 trust;工具集含 collaboration__spawn_agent(有 subagent);exec_command 有 `workdir` 参数 + apply_patch 支持绝对路径(支持 worktree,机制同 OpenCode);无 EnterWorktree 工具(不构成不支持 worktree 的依据)

## 证据来源汇总

| agent | 官方文档 | GitHub 仓库 |
|-------|---------|-----------|
| Claude Code | https://docs.claude.com/en/docs/claude-code | 无公开仓库(npm 安装) |
| OpenCode | https://opencode.ai/docs | https://github.com/anomalyco/opencode |
| Pi | https://pi.dev/docs | https://github.com/earendil-works/pi |
| skills CLI | - | https://github.com/vercel-labs/skills |
| Superpowers | - | https://github.com/obra/superpowers |

---

## 版本变更追踪

- 2026-06-24 初版调研(5 个 agent,含 Cursor/CodeBuddy 等)
- 2026-07-06 补充权限/白名单机制
- 2026-07-08 补充 hook/生命周期钩子 + 官网/GitHub 地址
- 2026-07-11 整合 skill/command/插件分层 + 新增 omp
- 2026-07-11 **全面重写**:聚焦 alloy 目标 4 agent(去掉 omp/Cursor 等),12 个特性对比,补全证据来源;修正 Codex skills 路径(`.agents/skills/` 非 `.codex/skills/`);确认 OpenCode/Pi 也读 `.agents/skills/`;新增本地指令/交互工具/Worktree/Subagent/补全 5 个特性调研
- 2026-07-14 新增第 14 章:运行时标识 env(`CLAUDECODE`/`OPENCODE`/`PI_CODING_AGENT`,Codex 无)+ 工具参数名(write/edit 的 `file_path`/`filePath`/`path` 差异)+ A+B 组合 detectAgent 方案(A 层读 agent 自注入 env,B 层 alloy init 注入 `ALLOY_AGENT=codex` 补位)
- 2026-07-15 移除 Codex 支持(用户实测体验差),B 层 ALLOY_AGENT 补位机制随之删除,目标 agent 改为 3 个
- 2026-07-16 第 4/6 章补充:Pi alloy-guard extension 检测 alloy-question 工具调用触发 clearAllPendingGates;三平台 PreToolUse 层问答工具检测机制统一说明(ASK_TOOLS 集合 + clearAllPendingGates);Pi 两个 extension(alloy-question 注册工具 + alloy-guard 检测调用)协作关系
- 2026-07-16 第 14 章补充:新增 14.4 hook 事件参数结构(Claude Code stdin / OpenCode plugin input+output / Pi extension event.toolName+event.input);修复 Pi alloy-guard extension 字段名错误(event.tool/event.name -> event.toolName,event.args -> event.input),此前导致 alloy-question 检测和 write/edit 拦截全部失效
- 2026-07-17 第 11 章重写:三 agent worktree 行为实测(Claude Code EnterWorktree 切 session cwd / OpenCode bash workdir 参数 / Pi bash 无 cwd 参数),Pi 实测 worktree 不可用(commit 落 feature 分支),alloy 对 Pi 强制 `worktree=skipped`。保留"worktree state 只在 worktree 分支写"原则不动
- 2026-07-17 第 12 章补充:Pi 不支持原生 subagent,SDD 在 Pi 下不可用(alloy 不依赖 pi-subagents 可选包),apply 阶段 Pi 强制 EP;修正 Claude Code 描述(有 Agent 工具分派子 agent,非"无原生 subagent")
