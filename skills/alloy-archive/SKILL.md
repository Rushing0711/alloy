---
name: alloy-archive
description: Alloy 归档与收尾——当 apply 完成后，先同步 delta spec 再合入代码
---

# alloy-archive

你是 Alloy 的归档阶段编排器。你的职责是：验证 change 已完成收尾，执行 Delta Spec 合并和归档。

**核心原则：先锁定文档证据链，再合入代码。** 如果先 merge 代码再 archive spec，中间存在一个"代码合入了但 spec 没跟上"的窗口期——一旦出问题，审计链断裂。

**什么算"archive 操作不当"（反例）：**
- verify.md 的 Overall Decision 是 FAIL 但仍然继续归档——阻塞问题被无视
- 跳过 archive 直接手动 merge——Delta Spec 没有被同步，主 spec 落后于代码
- openspec archive 返回错误但忽视警告继续 finish——"反正代码对的，spec 后面再说"

---

## 前置检查（HARD STOP）

```
---
## Alloy · 归档与收尾 · Delta Spec 合并归档 + 代码收尾
---

### Step 1/3：前置检查
---

**1. phase 必须是 `applied`。** 如果 phase != applied，硬拒绝：

```
[HARD STOP] Change '<name>' 的 phase 为 '<phase>'，归档要求 phase=applied。
当前 phase 不支持归档。请先运行 /alloy-apply 完成执行阶段。
```

先通过 alloy-guard.sh 做硬校验：
```bash
bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> finished
```

**2. verify.md 存在且 Overall Decision 不是 FAIL：**
```bash
test -f openspec/changes/<name>/verify.md && ! grep -q '^- \[x\] ❌ FAIL' openspec/changes/<name>/verify.md
```
不满足 → "verify.md 不存在或 Overall Decision 为 FAIL。请先修复阻塞问题。"

---
### Step 2/3：归档 · openspec archive
---

归档中...
执行 openspec archive -y → delta spec 合并到主 spec → 移入 archive/

```bash
bash .claude/skills/alloy/scripts/alloy-archive.sh <project-dir> <change-name>
```

`alloy-archive.sh` 自动完成：
1. 验证 phase = applied
2. 执行 `openspec archive -y --change <name>`（自有幂等检查，已归档则跳过）
3. Delta Spec 合并到主 spec

如果 `openspec` CLI 不可用，警告但不阻断——spec 同步依赖 OpenSpec CLI。

```
✓ Delta Spec 已合并到主 spec
✓ Change 已归档到 archive/YYYY-MM-DD-<name>/
```

---
### Step 3/3：收尾 · superpowers:finishing-a-development-branch
---

归档完成，自动进入收尾...

```
请选择处理方式：
  1. 本地 merge  — 合入 main
  2. 创建 PR    — 提交代码审查
  3. 保持分支   — 暂不处理（后续可手动 /alloy-finish）
```

使用 Skill 工具加载 `superpowers:finishing-a-development-branch` 技能，传入上下文：
```
Change: <name>
归档状态：已归档（archive/YYYY-MM-DD-<name>/）
当前分支：<change-name>
```

技能加载后，按其指引提供 3 个选项。

### 各选项的后续行为

**选项 1：本地 merge**
- 代码合入 main 后，通过 alloy-guard.sh 更新 phase：
  ```bash
  bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> finished --apply
  ```
- 提示："代码已合入 main。Alloy 工作流完成。"

**选项 2：创建 PR**
- PR 创建后，通过 alloy-guard.sh 更新 phase：
  ```bash
  bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> finished --apply
  ```
- 提示："PR 已创建，等待审查。"
- 当用户收到 PR 审查反馈，遵循 superpowers:receiving-code-review 行为规范

**选项 3：保持分支**
- 通过 alloy-guard.sh 更新 phase：
  ```bash
  bash .claude/skills/alloy/scripts/alloy-guard.sh openspec/changes/<name> finished --apply
  ```
- 提示："分支已保留，spec 已归档。后续可手动 `/alloy-finish` 合入。"

---
### Alloy Archive 完成
---

✓ Delta Spec 已合并到主 spec
✓ Change 已归档到 archive/YYYY-MM-DD-<name>/
✓ 收尾处理：<选择的方式>
  phase → finished

## 闸门规则

- **phase 必须为 applied** —— 只有 apply 完成的 change 才能归档
- **verify.md 必须存在且非 FAIL** —— 阻塞问题必须先修复
- **先归档后合入** —— spec 文档先锁定，代码后合入，避免"代码合入了 spec 还没跟上"
