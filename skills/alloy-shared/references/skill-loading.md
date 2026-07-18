# skill 加载方式(多 agent 适配)

alloy 的 alloy-start/plan/apply/finish/fix 等 skill 调用外部 skill(opsx 系列 + superpowers 系列)完成探查、需求设计、验证等工作。各 agent 的 skill 加载机制不同,本文件是统一对照表。

## 三平台 skill 加载机制差异

| agent | skill 加载工具 | 机制 | 证据 |
|-------|--------------|------|------|
| Claude Code | 有 `skill({ name })` 工具 | agent 主动调用工具,平台加载 SKILL.md 全文 | [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills) |
| OpenCode | 有 `skill({ name })` 工具 | agent 主动调用工具,平台加载 SKILL.md 全文 | [OpenCode skills.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/skills.mdx) |
| **Pi** | **无 `skill()` 工具** | agent 自己 `read` SKILL.md(或用户 `/skill:name` 强制) | [Pi skills.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md) "How Skills Work" |

**Pi 的关键限制:** Pi 内置工具仅 `read/bash/edit/write/grep/find/ls`(7 个),没有 `skill()` 工具。Pi skills.md 明确说:"When a task matches, the agent uses `read` to load the full SKILL.md (models don't always do this)"。alloy SKILL.md 里写 `skill({ name: "xxx" })` 对 Pi 是**死指令**--Pi 不认识这个工具调用,会反复探查找替代方案,浪费 LLM 往返。

## 统一调用对照表

alloy skill md 里调用外部 skill 时,用下表的多 agent 适配格式,**不要只写 `skill({ name })`**。

### opsx 系列 skill

| alloy 逻辑名 | skill 名 | Claude Code / OpenCode | Pi |
|-------------|---------|----------------------|-----|
| `opsx:explore` | `openspec-explore` | `skill({ name: "openspec-explore" })` | `read .pi/skills/openspec-explore/SKILL.md` |
| `opsx:new` | `openspec-new-change` | `skill({ name: "openspec-new-change" })` | `read .pi/skills/openspec-new-change/SKILL.md` |
| `opsx:continue` | `openspec-continue-change` | `skill({ name: "openspec-continue-change" })` | `read .pi/skills/openspec-continue-change/SKILL.md` |
| `opsx:verify` | `openspec-verify-change` | `skill({ name: "openspec-verify-change" })` | `read .pi/skills/openspec-verify-change/SKILL.md` |
| `opsx:archive` | `openspec-archive-change` | `skill({ name: "openspec-archive-change" })` | `read .pi/skills/openspec-archive-change/SKILL.md` |

### superpowers 系列 skill

| alloy 逻辑名 | skill 名(无 `superpowers:` 前缀) | Claude Code / OpenCode | Pi |
|-------------|--------------------------------|----------------------|-----|
| `superpowers:brainstorming` | `brainstorming` | `skill({ name: "brainstorming" })` | `read .pi/skills/brainstorming/SKILL.md` |
| `superpowers:using-git-worktrees` | `using-git-worktrees` | `skill({ name: "using-git-worktrees" })` | `read .pi/skills/using-git-worktrees/SKILL.md` |
| `superpowers:subagent-driven-development` | `subagent-driven-development` | `skill({ name: "subagent-driven-development" })` | `read .pi/skills/subagent-driven-development/SKILL.md` |
| `superpowers:executing-plans` | `executing-plans` | `skill({ name: "executing-plans" })` | `read .pi/skills/executing-plans/SKILL.md` |
| `superpowers:test-driven-development` | `test-driven-development` | `skill({ name: "test-driven-development" })` | `read .pi/skills/test-driven-development/SKILL.md` |
| `superpowers:requesting-code-review` | `requesting-code-review` | `skill({ name: "requesting-code-review" })` | `read .pi/skills/requesting-code-review/SKILL.md` |
| `superpowers:verification-before-completion` | `verification-before-completion` | `skill({ name: "verification-before-completion" })` | `read .pi/skills/verification-before-completion/SKILL.md` |
| `superpowers:finishing-a-development-branch` | `finishing-a-development-branch` | `skill({ name: "finishing-a-development-branch" })` | `read .pi/skills/finishing-a-development-branch/SKILL.md` |
| `superpowers:systematic-debugging` | `systematic-debugging` | `skill({ name: "systematic-debugging" })` | `read .pi/skills/systematic-debugging/SKILL.md` |
| `superpowers:writing-plans` | `writing-plans` | `skill({ name: "writing-plans" })` | `read .pi/skills/writing-plans/SKILL.md` |

## skill md 里的标准写法

alloy skill md 里调用外部 skill 时,用以下格式(不要只写 `skill({ name })`):

```markdown
加载 `<skill-name>` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`):
- Claude Code / OpenCode: 调 `skill({ name: "<skill-name>" })`
- Pi: `read .pi/skills/<skill-name>/SKILL.md`
```

**反例(对 Pi 无效):**
```markdown
调 `skill({ name: "openspec-explore" })` 加载 opsx skill
```

**正例(多 agent 适配):**
```markdown
加载 `openspec-explore` skill(多 agent 适配见 `alloy-shared/references/skill-loading.md`):
- Claude Code / OpenCode: 调 `skill({ name: "openspec-explore" })`
- Pi: `read .pi/skills/openspec-explore/SKILL.md`
```

## Pi 的特殊注意事项

1. **Pi 没有 `skill()` 工具** -- 只能用 `read` 加载 SKILL.md。alloy init 已为 alloy-* 和 opsx-* 装了 command wrapper(`.pi/prompts/*.md`),但 agent 在流程中不应依赖用户手动输入 slash command,应主动 `read` SKILL.md。

2. **superpowers skill 的路径** -- Pi 的 `.pi/skills/` 里有 superpowers skill 的符号链接(如 `brainstorming -> ../../.agents/skills/brainstorming`)。路径是 `.pi/skills/<name>/SKILL.md`(无 `superpowers:` 前缀)。

3. **Pi 的 skill 自动发现** -- Pi 启动时扫描 `.pi/skills/`,提取 name + description 注入 system prompt。agent 根据 description 匹配可能自动 `read` SKILL.md,但文档明确说"models don't always do this"。alloy SKILL.md 里必须明确指示 `read` 路径,不依赖自动发现。

4. **`disable-model-invocation` 字段** -- alloy-* skill 的 frontmatter 有 `disable-model-invocation: true`,Pi 不会自动发现,必须 agent 主动 `read` 或用户 `/skill:name`。

## 验证 skill 就绪

```bash
alloy _precheck --cmd "opsx/explore opsx/new" --skill "brainstorming"
```

`_precheck` 同时检测 command 文件和 skill 目录(任一存在即视为就绪)。详见 `skill-precheck.md`。

## 证据来源

- [Pi skills.md "How Skills Work"](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md):"When a task matches, the agent uses `read` to load the full SKILL.md"
- [Pi tools 源码目录](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/src/core/tools/):bash/edit/find/grep/ls/read/write(7 个,无 skill 工具)
- [Pi skills.md "Skill Commands"](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md):`/skill:name` 是用户侧 slash command,不是 agent 工具
- [Claude Code skills](https://docs.claude.com/en/docs/claude-code/skills):agent 有 `skill({ name })` 工具
- [OpenCode skills.mdx](https://github.com/anomalyco/opencode/blob/main/packages/web/src/content/docs/skills.mdx):agent 有 `skill({ name })` 工具
- [Agent Skills 标准](https://agentskills.io/specification):跨工具兼容的 skill 规范
