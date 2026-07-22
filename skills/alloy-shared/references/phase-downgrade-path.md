# §5.2.3 phase 推进降级路径

各 skill 在推进 phase 后，如果后续阶段失败，agent 不得自动 `git reset --hard` / `git checkout .` 清场。降级路径如下：

## 通用降级 1 步（apply / archive / finish / plan 适用）

若推进后续阶段失败，用户须手动调降级命令回退 phase：

```bash
alloy _phase downgrade <CHANGE_DIR> <previous-phase>
```

`_phase downgrade` 内部原子完成：校验降级合法性（只能降级到前一个 phase）+ 写 state.phase + git add .alloy.yaml + commit。**不撤销原 phase commit**（hash 链保留，用户可重入阶段决定下一步），而是新增一个降级 commit（phase 字段改回前一个）。替代旧的手写 3 步（`alloy _state set` + `git checkout HEAD~1` + `git reset HEAD~1`）--`alloy _state` 无 `set` 子命令，且手写 git checkout/reset 违反 §3.5.1 git 自救禁令（`git reset` 在清单内）。

`<previous-phase>` 对应：
- apply 阶段降级 -> `planned`
- archive 阶段降级 -> `applied`
- finish 阶段降级 -> `archived`
- plan 阶段降级 -> `started`

## 禁令

- 禁止 agent 自动 `git reset --hard` / `git checkout .` 清场（详见 §3.5.1 git 自救禁令）
- 违反字面 = 违反精神：哪怕"清理一下让流程重启"，也算违反禁令--退出 skill 让用户决策是唯一合法路径

## 边界

- start 是 phase 推进起点（无前序 phase），phase=started 写入失败时降级路径只有"重跑 /alloy-start"--不存在 phase 回退场景。本阶段无 §5.2.3 适用空间。
