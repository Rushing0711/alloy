# branch-naming.md

Alloy 分支命名白名单与 PRECONDITION_FAIL 校验。`start` 创建 feature 分支、`fix` 创建热修分支、用户自定义分支名时统一引用本文件。

## 白名单（与 `CLAUDE.md` 同源）

允许的 prefix（kebab-case 后缀）：

| prefix | 用途 | 示例 |
|--------|------|------|
| `feature/` | 新功能 change（start 默认） | `feature/user-auth` |
| `fix/` | Bug 修复 / 热修 | `fix/login-redirect` |
| `docs/` | 文档变更 | `docs/api-reference` |
| `refactor/` | 重构（无行为变更） | `refactor/extract-validator` |
| `test/` | 测试补全 / 验证分支 | `test/phase-5-validation` |
| `chore/` | 构建 / 配置 / 杂项 | `chore/bump-deps` |

**禁用 prefix**：`hotfix/`（用 `fix/` 替代）、`bugfix/`（用 `fix/`）、`master/` `main/` `dev/`（与主分支同名）、无 prefix 裸分支名（`wip` `tmp` 等）。

## PRECONDITION_FAIL 校验 bash

调用方在分支创建/确认前嵌入：

```bash
# 输入：$BRANCH_NAME（待创建或用户自定义的分支名）
# 输出：通过则 echo "✓ 分支命名合法"；不合法则 exit 1

ALLOY_BRANCH_PREFIXES="feature|fix|docs|refactor|test|chore"

if ! echo "$BRANCH_NAME" | grep -Eq "^(${ALLOY_BRANCH_PREFIXES})/[a-z0-9][a-z0-9._-]*$"; then
  echo "⛔ [PRECONDITION_FAIL] 分支名 \"$BRANCH_NAME\" 不在白名单："
  echo "  允许的 prefix: feature/ fix/ docs/ refactor/ test/ chore/"
  echo "  分支后缀须 kebab-case（小写字母数字 . _ -，不以 . _ - 开头）"
  echo ""
  echo "  禁止：agent 自动改写分支名后继续——分支命名是 PR / merge / 审计链入口，"
  echo "  必须 USER_GATE 让用户选择合法名称。"
  echo ""
  echo "  违反字面 = 违反精神：哪怕 \"hotfix/ 历史上能用\" 或 \"分支名只是临时\"，"
  echo "  也算违反白名单——历史 hotfix/ 名应在本次重新走 fix/ 路径。"
  exit 1
fi

echo "✓ 分支命名合法: $BRANCH_NAME"
```

## 与主分支同名校验（叠加约束）

白名单通过后仍需校验不与 `main_branch` 重合——`feature/main` 这种名称合法但语义混乱，建议另外校验。该校验由调用方（start.md 步骤 3）在白名单后追加：

```bash
if [ "$BRANCH_NAME" = "$MAIN_BRANCH" ]; then
  echo "⛔ [PRECONDITION_FAIL] 分支名与主分支同名: $BRANCH_NAME"
  exit 1
fi
```

## 调用方

- `start.md` 步骤 3 ②：默认 `feature/<change-name>`，用户自定义时强制走白名单校验
- `fix.md` 场景 3：固定 `fix/<desc>`（不再用 `hotfix/`）。用户自定义时同样校验
- `apply.md` worktree 路径占用 (b) 重命名分支：用户输入新分支名后校验

## Why

CLAUDE.md 规定的 6 个 prefix 是 squash merge 时 Conventional Commits 的语义来源，分支名 prefix 直接影响 PR 标题模板和归档审计链。`hotfix/` 不在白名单 = `fix/` 与 `hotfix/` 双轨并存导致 changelog 工具无法识别。**白名单是闸门型约束，不是建议。**
