# opsx 调用方式(多 agent 适配)

alloy 的 alloy-start/plan/apply/archive 等 skill 调用 opsx 系列(explore/new/continue/verify/archive 等)生成或校验 OpenSpec 制品。

`alloy init` 用 `openspec init --delivery both` 同时装 **command 和 skill** 两种形态,各 agent 按自身机制触发:

## 各 agent 的触发方式

| agent | command 形态 | skill 形态 | agent 主动触发方式 |
|-------|------------|-----------|------------------|
| Claude Code | `.claude/commands/opsx-continue.md` | `.claude/skills/openspec-continue-change/SKILL.md` | `skill({ name: "opsx-continue" })` 或 `skill({ name: "openspec-continue-change" })` 均可(command 合并进 skill,两者等价) |
| OpenCode | `.opencode/commands/opsx-continue.md` | `.opencode/skills/openspec-continue-change/SKILL.md` | `skill({ name: "openspec-continue-change" })`(skill 工具只加载 SKILL.md,command 用户侧触发) |
| Pi | `.pi/prompts/opsx-continue.md` | `.pi/skills/openspec-continue-change/SKILL.md` | `skill({ name: "openspec-continue-change" })` |

## 命名映射

alloy skill md 用逻辑名 `opsx:xxx`(冒号),实际触发时映射为 skill 名:

| alloy 逻辑名 | skill 名 | 说明 |
|-------------|---------|------|
| `opsx:explore` | `openspec-explore` | 无 `-change` 后缀 |
| `opsx:new` | `openspec-new-change` | 有 `-change` 后缀 |
| `opsx:continue` | `openspec-continue-change` | 有 `-change` 后缀 |
| `opsx:verify` | `openspec-verify-change` | 有 `-change` 后缀 |
| `opsx:archive` | `openspec-archive-change` | 有 `-change` 后缀 |
| `opsx:apply` | `openspec-apply-change` | 有 `-change` 后缀 |

## 调用规则

1. **opsx 是 skill/command,不是 openspec CLI 子命令。** 禁止跑 `openspec continue` / `openspec explore` / `openspec new` 等 CLI 命令--这些命令不存在或语义不同(如 `openspec new change` 是创建 change,不是 opsx:new 的完整流程)。opsx skill/command 内部会调正确的 openspec CLI 子命令。

2. **agent 主动触发用 skill 工具:** 调 `skill({ name: "openspec-continue-change" })`(按上表映射)。skill 工具加载 SKILL.md 全文,agent 按 SKILL.md 指令执行,等价于用户输入 slash command。

3. **用户侧也可手动触发 slash command:** 用户在 chat 输入 `/opsx-continue`(OpenCode/Pi)或 `/opsx:continue`(Claude Code),平台加载 command 文件作为 prompt。但 agent 在流程中不应依赖用户手动触发,应主动调 skill 工具。

## 为什么 delivery=both

OpenSpec CLI 的 `delivery` 配置:`both`(command+skill)| `commands`(只 command)| `skills`(只 skill)。

alloy 用 `both`:
- Claude Code:command 合并进 skill,两者等价,agent 调 skill 工具即可
- OpenCode/Pi:command 和 skill 分开,agent 的 skill 工具只加载 SKILL.md(command 是用户侧触发)。装 both 后,agent 能通过 skill 工具触发 opsx,不依赖用户手动输入 slash command

## 验证 opsx 就绪

```bash
alloy _precheck --cmd "opsx/explore opsx/new" --skill "brainstorming"
```

`_precheck` 同时检测 command 文件和 skill 目录(任一存在即视为就绪)。详见 `skill-precheck.md`。
