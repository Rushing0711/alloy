# archive Red Flags 完整表（第三层防御——任一借口出现即 STOP）

主文件保留 5 条核心，完整 11 条在此。

| 借口 | 现实 |
|------|------|
| "verify.md FAIL 是小问题，先归档再说" | FAIL = 阻塞问题。归档不可逆——带着 FAIL 归档意味着 spec 与代码偏差被永久封存。 |
| "跳过 archive 直接 merge，spec 后面补" | Delta Spec 不同步 = 主 spec 落后。"后面补"的 spec 永远不会补。 |
| "openspec archive 报错了，但代码是对的" | 归档报错 = Delta Spec 合并失败。忽略 = 主 spec 停留在旧版本。 |
| "spec 合并看起来没问题，直接继续" | 没看过的 spec 变更 = 代码与规格可能已分叉。审查只需 1 分钟，修复分叉需要 1 小时。 |
| "worktree 合并没问题，直接清理吧" | merge 结果必须审查——未审查的合并可能引入意外变更或冲突残留。确认只需 30 秒，修复遗漏需要 1 小时。 |
| "memory 条目都挺合理的，直接写入" | memory 影响所有后续会话。写入不当"经验"污染全局行为。确认只需 1 分钟。 |
| "worktree 合并冲突了，跳过清理吧" | 冲突不解决 = 代码丢失。worktree 变更没合入 feature 就删除 = 白做。 |
| "merge 冲突了，git merge --abort 一下让流程继续" | 冲突 = 代码状态未达预期，自动 abort = 隐藏真问题。退出 skill 让用户处理是唯一合法路径（§3.5.1）。 |
| "memory 候选都对，全部写入吧" | 单次确认承担不了全局污染风险。每条独立 USER_GATE，无例外（§5.2.2）。 |
| "另一个 change 也在 archive，等一下吧" | 多 change 并行 archive = Delta Spec 合并顺序敏感。先归档晚开始的 = 主 spec 状态错乱。必须串行。 |
