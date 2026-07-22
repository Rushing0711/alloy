# git add 限路径禁令

`git add -A` / `git add .` 会暂存所有改动,可能意外包含敏感文件(`.env` / `credentials.json`)或大文件。alloy 要求所有 `git add` 必须显式列出路径。

## 标准措辞

SKILL.md 里需要写"git add 限路径"时,引用本文件代替内联(避免 7+ 处复制):

```markdown
[HARD_STOP] git add 必须显式列出路径(如 `git add src/foo.ts test/bar.ts openspec/changes/<name>/draft.md`),禁 `git add -A` / `git add .`(完整规则见 alloy-shared/references/git-add-path-ban.md)。
```

## 已由 hook 拦截(双保险)

`_pre-commit-check` 命令在 pre-commit 钩子里扫描 staged 文件,如果检测到 `git add -A` / `git add .` 模式,拒绝 commit。但 hook 是兜底,SKILL.md 仍需引用本禁令提醒 agent。

## 敏感文件清单(禁 git add)

alloy 项目级禁止 `git add` 的文件:

| 类别 | 文件模式 | 原因 |
|------|---------|------|
| 环境变量 | `.env` / `.env.local` / `.env.production` | 含密钥 |
| 凭证 | `credentials.json` / `credentials.yaml` | 含账号 |
| 私钥 | `*.pem` / `*.key` | 含私钥 |
| 依赖 | `node_modules/` | 体积大,可重装 |
| 编译产物 | `dist/` | 可重新生成 |
| 临时设计 | `docs/superpowers/` | 已在 .gitignore |

## 反例

- ❌ `git add -A` - 暂存所有改动,可能含 .env
- ❌ `git add .` - 同上,相对路径版
- ❌ `git add src/` - 暂存整个目录,可能含意外文件
- ✅ `git add src/cli/index.ts test/cli/index.test.ts` - 显式列出每个文件

## 与 hash-lock 的协同

制品 commit 时,`alloy _artifact commit <name>` 内部完成 `git add <制品路径>` + commit,无需 agent 手动 git add。agent 只在非制品 commit(如状态写入收尾、worktree 创建前的快照)时手写 git add,此时必须显式列出路径。

## 出处

- `CLAUDE.md` Git Safety Protocol:"不要 git add -A 或 git add .,要按文件名 add"
- `CLAUDE.md` 修改前置检查表
