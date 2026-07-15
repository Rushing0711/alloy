# 各 AI Agent 配置体系参考

> **用途:** Alloy 的 agent 适配依赖此文档。新增 agent 或验证现有 agent 行为时,先更新本文档(附证据来源),再调整代码。
> **目标 agent:** Claude Code / OpenCode / Pi
> **证据来源:** 每个结论标注来源(官方文档 URL 或 GitHub 文件路径)
> **调研日期:** 2026-06-24 初版,2026-07-11 全面重写(补全 12 个特性 + 证据),2026-07-13 OpenCode/Pi hook 机制(OpenCode 有 plugin `tool.execute.before`/`session.idle` 原生 hook,非"无独立 hook";Pi 有 `agent_settled` 等 33 事件,Stop 可实现),2026-07-14 新增第 14 章(运行时标识 env + 工具参数名,detectAgent 方案),2026-07-15 移除 Codex 支持(用户实测体验差),B 层 ALLOY_AGENT 补位机制随之删除,目标 agent 改为 3 个

## 特性对比总表

| 特性 | Claude Code | OpenCode | Pi |
|------|-------------|----------|-----|
| 指令文件 | `CLAUDE.md` | `AGENTS.md`(回退 `CLAUDE.md`) | `AGENTS.md`(回退 `CLAUDE.md`) |
| 本地指令 | `CLAUDE.local.md` | 无 per-project(有全局) | 不支持 |
| 配置文件 | `.claude/settings.json` | `opencode.json` | `.pi/settings.json` |
| Hook | PreToolUse/Stop(外部脚本,exit 2) | plugin `tool.execute.before`/`session.idle`(原生 hook) | TS 扩展(`tool_call`/`agent_settled`) |
| Permissions | `allow/deny`(`Bash(cmd *)`) | `opencode.json` permission(allow/ask/deny) | `.pi/permissions.json` |
| 交互工具 | `AskUserQuestion` | `question` 工具 | extension `ctx.ui` |
| Skills | `.claude/skills/` → `~/.claude/skills/` → `~/.claude/plugins/` | `.opencode/skills/` + `.claude/skills/` + `.agents/skills/` | `.pi/skills/` + `.agents/skills/` |
| Plugins | `/plugin install`(marketplace) | `opencode.json` plugin 数组 | `pi install` |
| Commands | `.claude/commands/*.md` | `.opencode/commands/*.md` | `.pi/prompts/*.md` |
| Worktree | `settings.json` `worktree.baseRef` | Worktree 服务(无 baseRef) | 不支持 |
| Subagent | 无原生 | `opencode.json` agent + `.opencode/agents/` | 无原生(SDK 嵌套) |
| 补全 | `alloy completion` | `opencode completion` | 不支持 |
| **运行时标识 env** | `CLAUDECODE=1` | `OPENCODE=1` | `PI_CODING_AGENT=true` |
| **write/edit 参数名** | `file_path` | `filePath`(驼峰) | `path`(主)/`file_path`(兼容) |

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

**关键洞察:** 3 个 agent 中,OpenCode/Pi 都读 `AGENTS.md`;Claude Code 只读 `CLAUDE.md`;OpenCode/Pi 兼容 `CLAUDE.md` 回退。

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

**alloy 适配:** OpenCode 无 per-project local,可用全局或 instructions 字段;Pi 不支持。

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

**alloy 闸门层:** Claude Code 用外部脚本 hook 协议(PreToolUse/Stop,exit 2);OpenCode 用 plugin `tool.execute.before` + `session.idle`(原生 hook,可拦截所有工具);Pi 用 TS 扩展 `tool_call` + `agent_settled`。业务逻辑(`hook-guard.ts` / `stop-guard.ts`)共用,入口适配层不同。

**三层 hook 对照(alloy 流程防护):**

| 层 | 作用 | claude-code | opencode | pi |
|----|------|-------------|----------|-----|
| **PreToolUse**(拦截非白名单写入 + user-gate) | `_hook-guard` | ✅ settings.json PreToolUse | ✅ plugin `tool.execute.before`(可拦截所有工具) | ✅ extension `tool_call` |
| **Stop**(检测文本输出代替问答) | `_stop-guard` | ✅ settings.json Stop | ✅ plugin `session.idle` | ✅ extension `agent_settled` |
| **pre-commit**(兜底 PreToolUse 盲区) | `_pre-commit-check` | ✅ `.git/hooks/pre-commit`(git 仓库级,所有 agent 共用) | ✅ 同左 | ✅ 同左 |

**用户级 vs 项目级(各 agent hook 路径分级):**

3 个 agent 的 hook 都支持用户级(全局)和项目级两层路径:

| agent | 项目级 | 用户级(全局) | 出处 |
|-------|--------|--------------|------|
| Claude Code | `.claude/settings.json` | `~/.claude/settings.json` | [settings](https://code.claude.com/docs/en/settings)(User/Project/Local 三级,优先级 Managed > CLI > Local > Project > User) |
| OpenCode | `.opencode/plugins/*.ts` | `~/.config/opencode/plugins/` | [plugins.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/plugins.mdx)(全局 config -> 项目 config -> 全局 plugin -> 项目 plugin) |
| Pi | `.pi/extensions/*.ts` | `~/.pi/agent/extensions/*.ts` | [extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) |

**alloy 设计决策:hook 与 permissions 仅限项目级,作为项目资源。** 即使 `alloy init --scope global`,hook/permissions 仍装项目级路径(`.claude/settings.json` / `.opencode/plugins/` / `.pi/extensions/`),不装用户级。理由:
1. **hook 绑定 alloy CLI 绝对路径**--`node <alloy-dist>/cli/index.js _hook-guard`。全局装会让所有项目指向单一 alloy 路径,多版本(开发版 + npm 全局版)冲突
2. **项目级更显式**--每个项目自主启用 alloy hook,不污染全局
3. **pre-commit 天然项目级**--`.git/hooks/pre-commit` 是 git 仓库级,与 hook/permissions 项目级一致
4. **scope=global 只影响 skills/commands 等共享资源**--hook/permissions 是项目工作流的一部分,不是跨项目共享资源

**alloy 当前实现状态(2026-07-13 更新):**
- Claude Code:三层全配 ✅
- OpenCode:**三层全配 ✅**(PreToolUse 用 plugin `tool.execute.before`,Stop 用 plugin `session.idle`,同一文件 `.opencode/plugins/alloy-guard.ts`;旧 custom tool 方案已迁移)
- Pi:**三层全配 ✅**(PreToolUse 用 extension `tool_call`,Stop 用 extension `agent_settled`,同一文件 `.pi/extensions/alloy-guard.ts`)

**3 个 agent 三层 hook 全部对齐。** pre-commit 是 git 仓库级(`.git/hooks/pre-commit`),所有 agent 共用。

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

**alloy 适配:** Claude Code/Pi 用 `Bash(cmd *)` 格式(一致);OpenCode 用工具级 + glob(格式不同,需 `toOpenCodeBashPermissions` 转换)。

---

## 6. 交互工具(AskUserQuestion 对应)

### Claude Code
- 工具: `AskUserQuestion`
- 支持: 多选/单选/文本输入
- alloy 用: USER_GATE 依赖此工具
- 证据: [Claude Code AskUserQuestion](https://docs.claude.com/en/docs/claude-code/...)

### OpenCode
- 工具: `question`
- 支持: options(label+description)、`multiple: true`(多选)、`custom: true`(自定义文本,默认开)
- plan-mode prompt 中明确引用为 "AskUserQuestion tool"
- 证据: [packages/opencode/src/tool/question.ts](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/tool/question.ts)
- **alloy 适配:** 可直接用 `question` 工具,语义对齐

### Pi
- **无内置交互工具**
- 内置工具仅 `read/bash/edit/write/grep/find/ls`
- extension 的 `ctx.ui` 提供 `select/confirm/input/notify/custom`
- 证据: [Pi extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)、`src/core/tools/index.ts`
- **alloy 适配:** 需自带 ask-question 扩展(通过 `ctx.ui` 实现)

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

**关键洞察:**
- 所有 3 个 agent 都读 `.agents/skills/`(项目级)和 `~/.agents/skills/`(全局级,**除 Claude Code**)
- Claude Code 只读 `.claude/skills/` 和 `~/.claude/skills/`(不读 `.agents/skills/`)
- npx skills add 为 Claude Code/Pi 创建符号链接到 `.agents/skills/`

**FAQ:为什么 init 矩阵中所有 agent 都显示"✓ 全局共享"?**

`~/.agents/skills/` 是 npx skills 的共享存放目录,3 个 agent 的读取方式:
- **OpenCode**: 直接读 `~/.agents/skills/`(官方文档明确,无符号链接)
- **Pi**: 读 `~/.pi/agent/skills/`(符号链接)+ `~/.agents/skills/`(直接读,双路径)
- **Claude Code**: 读 `~/.claude/skills/`(符号链接到 `~/.agents/skills/`)

所以 `~/.agents/skills/brainstorming` 存在时,3 个 agent 都能读到,显示"✓ 全局共享"是**正确的**,不是误判。只有 Claude Code 依赖符号链接(若 `~/.claude/skills/<name>` 符号链接丢失,Claude Code 才读不到);其他 agent 直接读 `~/.agents/skills/`,无符号链接丢失风险。

证据:
- OpenCode 官方:[skills 文档](https://opencode.ai/docs/skills) "Global agent-compatible: `~/.agents/skills/*/SKILL.md`"
- Pi 官方:skills.md + package-manager.ts

---

## 8. npx skills add 行为

`npx skills add obra/superpowers`(不带 `--agent`):
1. 装到 `.agents/skills/`(共享目录)
2. 为 claude-code 创建 `.claude/skills/<name>` 符号链接 → `../../.agents/skills/<name>`
3. 为 pi 创建 `.pi/skills/<name>` 符号链接 → `../../.agents/skills/<name>`
4. **OpenCode 直接读 `.agents/skills/`**(不需要符号链接)

- 所有 3 个 agent 都能用 npx 最新版
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

---

## 10. Commands / Prompt Templates

| agent | 项目级 | 全局级 | 调用 | 格式 |
|-------|--------|--------|------|------|
| Claude Code | `.claude/commands/*.md` | `~/.claude/commands/` | `/命令名` | Markdown |
| OpenCode | `.opencode/commands/*.md` | `~/.config/opencode/commands/` | `/命令名` | JSON 或 Markdown |
| Pi | `.pi/prompts/*.md` | `~/.pi/agent/prompts/` | `/模板名` | Markdown |

- 证据: 各 agent 官方文档

**alloy 对 OpenCode 的 command wrapper 适配:** OpenCode 的 `/` slash command 只从 `.opencode/commands/` 加载,skills 通过 agent 调 `skill({ name })` 工具按需加载,不在 `/` 列表里(证据:[OpenCode skills](https://opencode.ai/docs/skills) --"Skills are loaded on-demand via the native `skill` tool")。alloy init 装 alloy-* skills 到 `.opencode/skills/` 后,`/alloy-start` 等无提示。为此 alloy init 额外装 8 个 command wrapper 到 `.opencode/commands/alloy-{start,plan,apply,archive,finish,fix,status,discard}.md`(project)或 `~/.config/opencode/commands/`(global),wrapper 内容指示 agent 调 `skill({ name: "alloy-..." })` 加载对应 skill,从而 `/alloy-start` 能间接触发 skill。其他 agent(Claude Code/Pi)的 skills 触发机制不同,不需要 wrapper。`alloy clean` 清理时通过文件名 + 内容特征(`skill({ name: "alloy-..." })`)精确识别 alloy 装的 wrapper,不误删用户自定义的 alloy-* command。

---

## 11. Worktree

### Claude Code
- 支持: ✅
- 配置: `.claude/settings.json` 的 `worktree.baseRef`(alloy 用 `head`)
- 证据: [Claude Code worktree](https://docs.claude.com/en/docs/claude-code/worktrees)

### OpenCode
- 支持: ✅
- 配置: Worktree 服务(`packages/opencode/src/worktree/index.ts`),无 `baseRef` 配置
- `CreateInput` 仅 `name` + `startCommand`
- custom tool context 提供 `context.worktree`(worktree root)
- 实验性 workspaces(`OPENCODE_EXPERIMENTAL_WORKSPACES=true`)
- 证据: [OpenCode worktree](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/worktree/index.ts)

### Pi
- 支持: ❌
- 无 `--worktree` flag,无 worktree 设置
- 证据: [Pi args.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/cli/args.ts)

**alloy 适配:** Claude Code 有 `worktree.baseRef` 配置;OpenCode 有 worktree 但无 baseRef 配置;Pi 不支持。alloy 的 worktree 调度对 OpenCode/Pi 可能只能用原生 `git worktree add`。

---

## 12. Subagent

### Claude Code
- **无原生 subagent**
- alloy 用: SDD(subagent-driven-development)通过 Agent 工具实现

### OpenCode
- 支持: ✅
- 配置: `opencode.json` 的 `agent` 字段(JSON)或 `.opencode/agents/*.md` / `~/.config/opencode/agents/*.md`(markdown + frontmatter)
- 分两类: primary(Build/Plan)+ subagent(General/Explore/Scout)
- subagent 可被 primary 自动派发,或 `@mention` 手动调用
- 创建子 session,可导航切换
- 证据: [OpenCode agents.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/agents.mdx)

### Pi
- **不支持原生**(README 明确:"skips features like sub agents and plan mode")
- 可通过 SDK/extension 嵌套(`createAgentSession`)
- 证据: [Pi README](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md)

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

---

## 14. 运行时标识环境变量与工具参数名

> **用途:** alloy 运行时(被 hook/plugin/extension 调用时)感知当前是哪个 agent,用于差异化处理(如工具参数名 `filePath` vs `file_path` vs `path`、worktree 路径、错误提示文案等)。
> **调研日期:** 2026-07-14
> **方案:** A 层优先--A 层读 agent 运行时自注入的 env(3 个 agent),兜底返回 null。

### 14.1 运行时标识 env(A 层:agent 自注入,alloy 被动读)

| agent | env 变量 | 值 | 注入位置 | 证据 |
|-------|---------|-----|---------|------|
| Claude Code | `CLAUDECODE` | `1` | 所有子进程(Bash/PowerShell/hook/MCP) | [env-vars](https://code.claude.com/docs/en/env-vars)("Set to 1 in subprocesses Claude Code spawns") |
| OpenCode | `OPENCODE` | `1` | `packages/opencode/src/index.ts` 启动时 `process.env.OPENCODE = "1"` | [index.ts](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/index.ts) |
| Pi | `PI_CODING_AGENT` | `true` | `packages/coding-agent/src/cli.ts` 启动时 `process.env.PI_CODING_AGENT = "true"` | [cli.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/cli.ts) |

**关键:** 这 3 个 env 是 agent 运行时自己注入的,alloy 被动读取,不依赖 alloy init 配置。即使 alloy init 生成的 plugin/extension 全坏,这 3 个 agent 仍能被感知。

### 14.2 hook 进程拿 agent 上下文的途径

| agent | 途径 | 字段 |
|-------|------|------|
| Claude Code | stdin JSON + env | stdin:`tool_name`/`tool_input`/`session_id`/`cwd`/`hook_event_name`;env:`CLAUDE_PROJECT_DIR`/`CLAUDECODE` |
| OpenCode | plugin 回调参数(非 env) | `input.tool`/`input.sessionID`/`input.callID` + `output.args`;env:`OPENCODE`(进程继承) |
| Pi | extension 回调参数(非 env) | `event.toolName`/`event.toolCallId`/`event.input`;env:`PI_CODING_AGENT`(进程继承) |

### 14.3 write/edit 工具参数名(关键差异,曾导致 OpenCode 拦截失效)

| agent | write 参数名 | edit 参数名 | 证据 |
|-------|-------------|------------|------|
| Claude Code | `file_path` | `file_path` | [Claude Code tools](https://docs.claude.com/en/docs/claude-code/...) |
| OpenCode | `filePath`(驼峰) | `filePath`(驼峰) | [write.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/write.ts)/[edit.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/edit.ts) `Parameters = Schema.Struct({ filePath: ... })` |
| Pi | `path`(主)/`file_path`(兼容) | `filePath`(主)/`file_path`(兼容) | [write.ts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/tools/write.ts)`args?.file_path ?? args?.path` |

**历史 bug:** alloy init 生成的 OpenCode plugin 取 `args?.path ?? args?.file_path`,OpenCode write 工具实际参数是 `filePath`,导致拦截失效(commit 274aa23 修复)。

### 14.4 alloy detectAgent 实现(A 层优先)

```
detectAgent(env):
  # A 层:agent 运行时自注入 env(优先,不依赖 alloy init)
  if env.CLAUDECODE === "1": return "claude-code"
  if env.OPENCODE === "1": return "opencode"
  if env.PI_CODING_AGENT === "true": return "pi"
  # 兜底:无法确定
  return null
```

**优先级:** A 层优先(A 层是 agent 自注入,最可靠);兜底 null(按工具参数名兼容取 `file_path ?? filePath ?? path`)。

---

## alloy 安装/检测策略

### Skills 安装(installSuperpowers)

**只调一次 `npx skills add obra/superpowers -y`:**
- npx 装到 `.agents/skills/`(共享目录)
- 为 claude-code 创建 `.claude/skills/` 符号链接
- 为 pi 创建 `.pi/skills/` 符号链接
- OpenCode 直接读 `.agents/skills/`
- **所有 3 个 agent 都能用 npx 最新版**

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
