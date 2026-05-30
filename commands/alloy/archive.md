---
name: "Alloy: Archive"
description: Alloy 归档——apply 完成后，锁定 Delta Spec 并归档 change
category: Workflow
tags: [alloy, workflow]
---

# alloy-archive

你是 Alloy 的归档阶段编排器。你的职责是：验证 change 已完成执行，执行 Delta Spec 合并和归档，将 phase 推进到 `archived`。

**核心原则：先锁定文档证据链，再合入代码。** archive 只负责 spec 归档，代码合入由后续的 `/alloy:finish` 完成。

**什么算"archive 操作不当"（反例）：**
- verify.md 的 Overall Decision 是 FAIL 但仍然继续归档——阻塞问题被无视
- 跳过 archive 直接手动 merge——Delta Spec 没有被同步，主 spec 落后于代码
- openspec archive 返回错误但忽视警告继续——"反正代码对的，spec 后面再说"

---

## 前置检查（HARD STOP）

```
┌──────────────────────────────────────┐
│ Alloy [4/5] · Phase: Archive         │
└──────────────────────────────────────┘
```

### [Step 1/3] 前置检查

**1. phase 必须是 `applied`。** 如果 phase != applied，硬拒绝：

```
[HARD STOP] Change '<name>' 的 phase 为 '<phase>'，归档要求 phase=applied。
当前 phase 不支持归档。请先运行 /alloy:apply 完成执行阶段。
```

先通过 `alloy _guard` 做硬校验：
```bash
alloy _guard openspec/changes/<name> archived
```

**2. verify.md 存在且 Overall Decision 不是 FAIL：**
```bash
test -f openspec/changes/<name>/verify.md && ! grep -q '^- \[x\] ❌ FAIL' openspec/changes/<name>/verify.md
```
不满足 → "verify.md 不存在或 Overall Decision 为 FAIL。请先修复阻塞问题。"

---
### [Step 2/3] /opsx:archive

> [Step 2/3] /opsx:archive
> 正在归档——Delta Spec 合并到主 spec → 移入 archive/...

使用 Slash 命令 `/opsx:archive` 执行归档。这是 OpenSpec 的标准归档命令，Alloy 不重复建造。

**Agent 执行：** 调用 `/opsx:archive`，传入 change name。该命令自动完成：
- Delta Spec 合并到主 spec（`openspec/specs/`）
- Change 目录移至 `openspec/changes/archive/YYYY-MM-DD-<name>/`
- 自有幂等检查——已归档则 Skip

**错误处理：**
- `/opsx:archive` 返回错误（权限、冲突等）→ [HARD STOP]，不推进 phase
- `/opsx:archive` 不可用（OpenSpec 未安装）→ 引导用户运行 `alloy init` 安装 OpenSpec

归档成功后，Agent 执行 git commit（确保归档变更被版本追踪）：
```bash
git add openspec/specs/ openspec/changes/archive/ 2>/dev/null
git commit -m "chore(<name>): Delta Spec 已同步并归档" 2>/dev/null
```
（git commit 失败不阻断——可能没有变更或不在 git 仓库中）

> ✓ Delta Spec 已合并到主 spec
> ✓ Change 已归档到 archive/YYYY-MM-DD-<name>/
> ✓ 归档变更已提交

### Step 3/3：完成

**通过 `alloy _guard` 校验并推进 phase：**
```bash
alloy _guard openspec/changes/<name> archived --apply
```

```
┌──────────────────────────────────────────────────────┐
│ Alloy [4/5] · Phase: Archive — DONE                  │
└──────────────────────────────────────────────────────┘
```

> ✓ Delta Spec 已合并到主 spec
> ✓ Change 已归档到 archive/YYYY-MM-DD-<name>/
> ✓ phase → archived

**根据 worktree 状态动态提示：**

```bash
alloy _state read openspec/changes/<name> worktree
```

- worktree 有值 → 代码在独立 worktree 分支上，尚未合入。运行 `/alloy:finish` 完成代码合入与现场清理。
- worktree 为 `null` → 代码在当前分支上。运行 `/alloy:finish` 完成收尾。

---

## 闸门规则

- **phase 必须为 applied** —— 只有 apply 完成的 change 才能归档
- **verify.md 必须存在且非 FAIL** —— 阻塞问题必须先修复
- **先归档后合入** —— spec 文档先锁定，代码后通过 `/alloy:finish` 合入，避免"代码合入了 spec 还没跟上"
- **archive 不做代码合并** —— 代码合入是 `/alloy:finish` 的职责
