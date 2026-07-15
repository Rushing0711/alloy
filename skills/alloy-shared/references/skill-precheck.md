# Skill 预检

所有 alloy 阶段命令共享的技能/命令可用性检测。各命令在 SKILL.md 里声明所需依赖,预检时调 `alloy _precheck` CLI(多 agent 适配)。

## 使用方式

在 SKILL.md 里按以下格式声明所需依赖:

```
Skill 预检--确认以下可用：
  cmd: opsx/explore opsx/new
  skill: brainstorming
```

## 预检调用

把声明的 cmd 和 skill 列表传入 `alloy _precheck`:

```bash
alloy _precheck --cmd "opsx/explore opsx/new" --skill "brainstorming"
```

- `--cmd`:空格分隔的 cmd 列表(声明格式,如 `opsx/explore`;CLI 内部归一化为 `opsx-explore.md` 或 `opsx/explore.md` 两种文件名都查)
- `--skill`:空格分隔的 skill 列表(如 `brainstorming`)

CLI 读 `openspec/config.yaml` 的 `target_agents`,对每个 agent 检测对应路径:
- Claude Code: `.claude/commands/` + `~/.claude/commands/`
- OpenCode: `.opencode/commands/` + `~/.config/opencode/commands/`
- Pi: `.pi/prompts/` + `~/.pi/agent/prompts/`

skill 检测复用 `detectSkill`(已多 agent 适配,查 project skill -> user skill -> user plugin)。

## 输出

- 全部就绪:exit 0,输出 ✓ 清单
- 任一缺失:exit 1,输出 ✗ 清单 + 引导 `alloy init`

## SKILL.md 里的调用模板

```bash
# Skill 预检(⛔ PRECONDITION_FAIL):多 agent 适配,调 alloy _precheck
if ! alloy _precheck --cmd "opsx/explore opsx/new" --skill "brainstorming"; then
  echo "⛔ [PRECONDITION_FAIL] skill/cmd 缺失,请按提示运行 alloy init"
  exit 1
fi
```

**任一不可用 -> 引导 `alloy init` -> STOP。不存在降级。**

## 为什么下沉为 CLI

原 skill-precheck.md 写死 `.claude/commands/` 路径 + `opsx/explore` 斜杠格式,只支持 Claude Code。扩展到 4 个 agent 时:
1. 路径不同(各 agent commands/skills 目录不同)
2. cmd 文件名格式不同(Claude Code 支持子目录 `opsx/explore.md`,其他 agent 是横线 `opsx-explore.md`)
3. skill 检测路径不同(OpenCode/Pi 读 `.agents/skills/` 共享目录 + 各自的 agent 目录)

bash 脚本写死路径不可维护。下沉为 CLI(TypeScript 实现)后,路径推导集中在 `agents.ts`/`getCommandsTargetDir`/`detectSkill`,多 agent 适配有测试覆盖,skill md 只负责声明依赖 + 调 CLI。
