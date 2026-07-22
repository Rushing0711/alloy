# Phase 框 / Step 标题 / 状态符号 视觉规范

Alloy 各 skill 在阶段入口/出口必须输出 Phase 框、Step 标题、状态符号。本文件是简化版,完整规范见 `docs/specification/02-visual-spec.md`。

## Phase 框格式

用 `┌─┐` Unicode 单线框,38 字符宽:

```
┌─ Phase: apply ──────────────────────────┐
│  change: hello-script                    │
│  branch: feature/hello-script            │
│  worktree: skipped                       │
└──────────────────────────────────────────┘
```

**关键:** skill md 中的 Phase 框代码块是必须输出到终端的格式,不是文档示例。每次渲染阶段头部时执行 `date "+%Y-%m-%d %H:%M:%S"` 获取本地时间填 `<TIMESTAMP>`。

## Step 标题格式

`[Step N/M]` + 38 字符 `─` 下划线:

```
[Step 1/5] 探查现状 + 读取 .alloy.yaml
──────────────────────────────────────────
```

## 状态符号映射

| 符号 | 含义 | 节点类型 |
|------|------|---------|
| `⛔` | HARD_STOP / PRECONDITION_FAIL | 闸门型(绝对禁令/前置失败) |
| `🔴` | USER_GATE | 路径型(用户决策) |
| `⚠️` | WARN | 软提示(不阻断) |

## 输出规则

- 阶段入口/出口必须按本文件输出 Phase 框
- Step 标题用 `[Step N/M]` 格式
- `>` 块引用用于说明性文字
- `->` 引导行用于操作步骤

## 引用方式

SKILL.md 里"输出规则"段引用本文件代替内联(避免 5 处复制):

```markdown
**输出规则:** 阶段入口/出口按 alloy-shared/references/phase-frame.md 输出 Phase 框 + Step 标题 + 状态符号。
```

## 出处

- `docs/specification/02-visual-spec.md`(完整规范)
- `docs/reference/skill-writing-guide.md` §3.4 四类语义节点术语
