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
### [Step 2/3] openspec archive

> 归档中...
> 执行 openspec archive -y → delta spec 合并到主 spec → 移入 archive/
>
> ```bash
> alloy _archive <project-dir> <change-name>
> ```
>
> `alloy _archive` 自动完成：
> 1. 验证 phase = applied
> 2. 执行 `openspec archive -y --change <name>`（自有幂等检查，已归档则 Skip)
> 3. Delta Spec 合并到主 spec
> 4. 更新 phase → archived
> 5. 提交归档变更（`git add` + `git commit`）
>
> `alloy _archive` 内部区分两类错误：
> - `openspec` CLI 不可用（command not found）→ ⚠️ 警告但继续，用户需稍后安装 OpenSpec CLI 重新归档
> - `openspec archive` 实际执行失败（权限、磁盘、冲突等）→ [HARD STOP] 阻断，不推进 phase
>
> ```
> ✓ Delta Spec 已合并到主 spec
> ✓ Change 已归档到 archive/YYYY-MM-DD-<name>/
> ✓ phase → archived
> ✓ 归档变更已提交
> ```

### Step 3/3：完成
```
┌──────────────────────────────────────┐
│ Alloy [4/5] · Phase: Archive — DONE  │
└──────────────────────────────────────┘
```

> ✓ Delta Spec 已合并到主 spec
> ✓ Change 已归档到 archive/YYYY-MM-DD-<name>/
> ✓ phase → archived
> ✓ 归档变更已提交
>
> 代码尚未合入，分支仍保留。运行 `/alloy:finish` 完成代码合入与现场清理。

---

## 闸门规则

- **phase 必须为 applied** —— 只有 apply 完成的 change 才能归档
- **verify.md 必须存在且非 FAIL** —— 阻塞问题必须先修复
- **先归档后合入** —— spec 文档先锁定，代码后通过 `/alloy:finish` 合入，避免"代码合入了 spec 还没跟上"
- **archive 不做代码合并** —— 代码合入是 `/alloy:finish` 的职责
