# git 自救命令禁令

agent 看到 merge/rebase/pull 失败时为"让流程继续"会主动跑破坏性 git 命令,但每一个都会清空"用户视为有价值的当前状态"。Skill 流程退出比"清理状态再继续"更安全--退出后用户至少能看到现场。

## 禁令清单

| 命令 | agent 的合理化 | 真实后果 |
|------|--------------|---------|
| `git merge --abort` | "让流程干净地失败,重来一次" | 用户已 stage 的冲突解决方案被冲掉 |
| `git rebase --abort` | "rebase 出错了,回到起点重做" | 中途已解决的冲突全部丢失 |
| `git reset --hard` | "工作树状态不对,回到干净状态" | 未提交的所有改动消失,包括用户刚写的代码 |
| `git checkout .` | "把这些意外改动撤销掉" | 工作树未提交改动全部丢失 |
| `git restore .` | 同上的现代写法 | 同上 |
| `git restore --staged .` | "暂存区清空重新来" | 用户精心 stage 的部分提交计划消失 |
| `git stash` / `git stash drop` | "先 stash 一下让流程继续" | stash 容易被遗忘 / drop 直接丢工作 |
| `git clean -fd` | "把这些 untracked 文件清掉" | 用户尚未 add 的新文件消失 |
| `git push --force` / `--force-with-lease` | "远端分歧了,覆盖一下" | 别人推送的提交被覆盖 |
| `git branch -D` | "squash merge 完了,删掉 feature 分支" | agent 误判分支名/变量未替换会强删主分支;下沉到 `alloy _finish-cleanup`(含变量校验 + 主分支保护 + squash merge 完成校验) |

## 用户输命令禁令(通用 HARD_STOP)

**agent 禁让用户输命令字面,用户手动 = 用户 shell 执行,agent 不解读用户输入的命令文本。**

违反字面 = 违反精神:哪怕"用户主动输了 `git restore .`,我帮他执行效率更高",也算违反--agent 跑任何 §3.5.1 禁令命令都是违规,无论命令来源是 agent 自己想出来的还是用户输入的。

**反例(OpenCode 实测踩坑):**
1. agent 输出"请手动执行 `git restore .` 丢弃未提交变更"
2. 用户回纯文本"git restore ."
3. agent 真的执行了 `git restore .`(被 hook 拦)
4. agent 改让用户输 `git checkout HEAD -- <path> && rm <file>`
5. 用户回纯文本命令
6. agent 真的执行了(绕过 hook,因为不是 §3.5.1 清单内的命令)

**正确行为:**
- agent 需要破坏性 git 操作时,下沉到 CLI 原子命令(如 `alloy _checkpoint switch` / `alloy _finish-cleanup`),CLI 内部跑不经过 hook
- agent 禁输出"请手动执行 `<命令>`"让用户输命令字面--这是变相让 agent 跑命令
- agent 可以输出"请在你的 shell 执行 `<命令>`"让用户在自己的终端执行,agent 不解读结果(用户执行后回到 agent 继续对话)

**区分:**
- ✅ "请在你的 shell 执行 `git stash list` 查看残留 stash" -- 用户在终端执行,agent 不解读
- ❌ "请手动执行 `git restore .`" -- agent 期待用户输入命令字面,然后 agent 执行

## SKILL.md 标准措辞

SKILL.md 里需要写"git 自救禁令"时,引用本文件代替内联(避免 15+ 处复制):

```markdown
[HARD_STOP] git 操作失败禁运行 git merge --abort / rebase --abort / reset --hard / checkout . / restore . / stash drop / clean -fd / push --force 任何一个(完整清单见 alloy-shared/references/git-self-rescue-ban.md)。退出 skill 让用户处理是唯一合法路径。

违反字面 = 违反精神:哪怕看似"只清理一下让流程继续",也算违反禁令(见 alloy-shared/references/iron-law-violation-pattern.md)。
```

## 嵌入位置(就近嵌入,不集中)

- merge / rebase / pull 命令前一行
- worktree 创建 / 合并 / 清理步骤的注释里
- 任何 `git commit` 失败处理分支里

集中放置的禁令在 agent 执行到某步时已不在注意力范围。

## 已由 hook 拦截(双保险)

`permissions deny` 已配置以下 deny(三 agent 对齐):
- `git push --force*`
- `git reset --hard*`
- `git checkout .*`
- `git restore .*`
- `git stash drop*`
- `git merge --abort*`
- `git clean -fd*`
- `git branch -D*`(下沉到 `alloy _finish-cleanup`,agent 禁直接跑)
- `rm -rf*` / `rm -fr*`

但 hook 只在 agent 遵守 settings 时生效。SKILL.md 仍需引用本禁令提醒 agent 不要尝试绕过(例如通过 Bash 间接调用,或让用户输命令字面 agent 代执行)。

## 冲突时的合法行为

1. 报告冲突现场:`git status` + `git diff`
2. 调用 USER_GATE 让用户决定保留方案/放弃方案/手动解决
3. 等待用户输入后再继续

## 出处

- `docs/reference/skill-writing-guide.md` §5.1 git 自救命令禁令
- `CLAUDE.md` Git Safety Protocol
