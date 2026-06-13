# §5.2.3 phase 推进降级路径

各 skill 在推进 phase 后，如果后续阶段失败，agent 不得自动 `git reset --hard` / `git checkout .` 清场。降级路径如下：

## 通用降级 3 步（apply / archive 适用）

若推进后续阶段失败，用户须手动按以下 3 步回退：

```bash
alloy _state set <CHANGE_DIR> phase <previous-phase>
git checkout HEAD~1 -- <CHANGE_DIR>/.alloy.yaml  # 撤销 phase commit 中的状态变更
git reset HEAD~1                                 # 退回 phase commit
```

`<previous-phase>` 对应：
- apply 阶段降级 → `planned`
- archive 阶段降级 → `applied`
- finish 阶段降级 → `archived`

## 禁令

- 禁止 agent 自动 `git reset --hard` / `git checkout .` 清场（详见 §3.5.1 git 自救禁令）
- 违反字面 = 违反精神：哪怕"清理一下让流程重启"，也算违反禁令——退出 skill 让用户决策是唯一合法路径

## 边界

- start 是 phase 推进起点（无前序 phase），phase=started 写入失败时降级路径只有"重跑 /alloy:start"——不存在 phase 回退场景。本阶段无 §5.2.3 适用空间。
