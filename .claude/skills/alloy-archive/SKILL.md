---
name: alloy-archive
description: Alloy 归档 - 硬校验 phase=finished，执行 openspec archive
---

# alloy-archive

```
---
## Alloy · 归档阶段 · Delta Spec 合并归档
---
```

## 前置检查（HARD STOP）

**phase MUST = `finished`。** 如果 phase != finished，硬拒绝：

```
[HARD STOP] Change '<name>' 的 phase 为 '<phase>'，归档要求 phase=finished。
请先运行 /alloy-finish 完成收尾。
```

## 执行

```
---
归档中...
---

执行 openspec archive -y
→ sync delta spec + 归档到 archive/YYYY-MM-DD-<name>/
phase → archived
```

### 完成

```
---
### Alloy Archive 完成
---

✓ Delta Spec 已合并到主 spec
✓ Change 已归档到 archive/YYYY-MM-DD-<name>/
  phase → archived
```
