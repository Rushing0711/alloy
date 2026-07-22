# 状态符号含义(⛔ / 🔴 / ⚠️)

Alloy 用 emoji 标记四类语义节点,本文件是符号 -> 节点类型 -> 行为含义的单一来源。

## 四类语义节点

| 术语 | 符号 | 触发主体 | 含义 | Agent 行为 | 违反后果 |
|------|------|---------|------|-----------|---------|
| `PRECONDITION_FAIL` | `⛔` | 系统/状态 | 前置条件校验失败(环境、phase、依赖) | 立即中止本次会话,输出修复指引 | 不可继续--继续=带病执行 |
| `HARD_STOP` | `⛔` | 对 Agent 的绝对禁令 | 无论看似多合理 agent 都不许跨越的边界 | 拒绝执行,回到流程或终止 | 违反 Iron Law |
| `USER_GATE` | `🔴` | 对用户的硬交互 | 必须用户决策才能继续(不可逆/方向选择/资源占用) | 调用平台问答工具等待用户输入 | 沉默 ≠ 授权 |
| `WARN` | `⚠️` | 对当前会话的软提示 | 风险存在但不阻断 | 提示并记录,继续执行 | 仅留痕 |

## 关键区分(最常被混淆)

### PRECONDITION_FAIL vs HARD_STOP

```
PRECONDITION_FAIL  vs  HARD_STOP
─────────────────       ───────────────
触发:进入 skill 时    触发:执行过程中
原因:环境/状态不对    原因:agent 想跨越边界
对象:用户应修复       对象:agent 应停手
```

### HARD_STOP vs USER_GATE

```
HARD_STOP  vs  USER_GATE
─────────       ──────────
拒绝者:agent   决策者:用户
"agent 不许做"  "用户必须选"
单向禁令         双/多选交互
```

## 与技能类型的映射

| 技能类型 | 主用节点 | 辅用节点 |
|---------|---------|---------|
| 闸门型 | PRECONDITION_FAIL + HARD_STOP | USER_GATE(不可逆操作) |
| 路径型 | USER_GATE + WARN | HARD_STOP(极少数硬约束) |
| 参考型 | - | WARN(gotcha 提示) |
| 心智型 | - | - |

## SKILL.md 引用方式

SKILL.md 里"状态符号"段引用本文件代替内联(避免 5 处复制):

```markdown
**状态符号:** `⛔` = HARD_STOP / PRECONDITION_FAIL,`🔴` = USER_GATE,`⚠️` = WARN(完整含义见 alloy-shared/references/hard-stop-meaning.md)。
```

## 反例(什么算混用)

- ❌ `"phase ≠ archived -> HARD STOP"` - 这是前置条件失败,应是 `PRECONDITION_FAIL`,措辞应是"环境不满足,请运行 X 修复",而非"违反 Iron Law"
- ❌ `"merge 冲突时禁止 git merge --abort,🔴 STOP"` - 禁令对象是 agent 不是用户,应是 `HARD_STOP`;用户决策"放弃/保留"才是后续的 `USER_GATE`
- ❌ `"git pull 失败 -> ⚠️ WARN 继续"` - 基础过期会污染下游 merge,这是阻断条件,应升 `PRECONDITION_FAIL` 或 `USER_GATE`,不是 `WARN`

## 写法约定

- 在 skill 正文里用 `[PRECONDITION_FAIL]` / `[HARD_STOP]` / `[USER_GATE]` / `[WARN]` 标记节点起点
- emoji 映射:`⛔` / `⛔` / `🔴` / `⚠️`
- frontmatter 若有节点统计字段(`hard_stops` / `user_gates` / `warns` / `preconditions`),按四类分别计数,禁止合并
- 同一节点不要兼具两类语义(HARD_STOP 之后立刻 USER_GATE 是合法的串联,但单个节点不能既是禁令又是询问)

## 出处

- `docs/reference/skill-writing-guide.md` §3.4 四类语义节点术语
- `docs/specification/02-visual-spec.md` §七 状态符号
