---
name: "Alloy: Finish"
description: Alloy 收尾阶段 - archive 完成后进入
category: Workflow
tags: [alloy, workflow]
spec: 01-product-spec/05-finish-spec.md
behaviors:
  preconditions: 5
  hard_stops:    8
  user_gates:    5
  warns:         2
  artifacts: []
  transitions_to: finished
  external_calls: [superpowers:finishing-a-development-branch]
---

# alloy-finish

你是 Alloy 的收尾命令。spec 已归档（phase=archived）前提下，完成代码合入与现场清理，推进 phase 到 `finished`。

```
[HARD_STOP] NO MERGE WITHOUT EXACT CONFIRMATION
phase != archived / 分支不存在 / merge 精确确认未通过 / spec 已归档需修改 / merge 冲突自动 abort 任一存在 = 拒绝执行
违反字面 = 违反精神：哪怕"用户口头同意了"、"用户说'可以，合吧'"、"merge 冲突很简单 abort 一下"，也算违反 Iron Law。精确字符串确认不可被任何形式的口头同意替代——用户说"合"不算确认，必须亲手输入 merge 指令。
```

**核心原则：只做代码合入，不碰 spec。** spec 已归档封存，任何 spec 级变更应走新 change（[HARD_STOP]）。

**交互规则：** `🔴 STOP` 等价 `USER_GATE`，必须用 `AskUserQuestion`（`commands/alloy/references/interaction-style.md`，含"沉默 ≠ 授权"通用禁令——禁批量打包、禁基于内容跳过、禁 agent 回填精确字符串）。跳过任何 USER_GATE = 违反 Iron Law。

**状态符号：** `⛔` = HARD_STOP / PRECONDITION_FAIL，`🔴` = USER_GATE，`⚠️` = WARN（视觉规范 §七）。

**输出规则：** 阶段入口/出口必须按 `docs/specification/02-visual-spec.md` 输出 Phase 框（`┌─┐` Unicode 单线框，38 字符宽）、Step 标题（`[Step N/M]` + 38 字符 `─` 下划线）、`>` 块引用、`→` 引导行。**skill md 中的 Phase 框代码块是必须输出到终端的格式，不是文档示例。**

**调用外部命令或技能前，先输出标题和状态描述，再执行操作。**

**捕获阶段启动时间 + 独立"阶段开始"commit**（幂等，重入时 started_at 不覆盖）。

> 先解析 archive 路径再调用 `_phase start`——archive 阶段已将 change 移入 `archive/`，
> `openspec/changes/<name>/` 为空目录，直接调用会误创建残留 `.alloy.yaml`。

```bash
ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | sort -r | head -1)
CHANGE_DIR="${ARCHIVE_DIR:-openspec/changes/<name>}"
alloy _phase start "$CHANGE_DIR" finish
```
> `alloy _phase start` 原子完成：幂等写 `phase_timings.finish.started_at` + git add 限路径 + commit。

---

### Red Flags（第三层防御——任一借口出现即 STOP）

| 借口 | 现实 |
|------|------|
| "phase 不是 archived，但代码都写好了，直接合吧" | archive 不可跳过——spec 归档和代码合入是两件事，顺序不可颠倒。 |
| "分支已经删了，finish 白跑了" | 分支不存在 = 无需再次 finish，直接告知用户。 |
| "PR 审查说要改 spec，顺手改了吧" | spec 已归档封存。任何 spec 变更 = 新 change。 |
| "选'保持分支'等于没做完，直接 merge 吧" | 保持分支是合法选项——用户可能有后续计划。替用户选 merge 是越权。 |
| "用户说了 'y'，应该等于 merge 确认吧" | 精确字符串确认不可被口头同意替代。"y"/"好"/"可以"/"合吧"全部不算（§Iron Law）。即使用户说"我同意了，直接合"，也不算确认——必须亲手输入 merge 指令。 |
| "git pull 失败一次，重试一下静默继续" | pull 失败 = 远端状态未知，silent 继续 = 基于过期 main 做 squash，污染主分支历史。必须 USER_GATE。 |
| "merge --squash 冲突了，git merge --abort 让流程重启" | abort = 撕毁现场，用户的 in-progress 工作消失。退出 skill 让用户处理是唯一合法路径（§3.5.1）。 |
| "feature_branch 看起来像 main，应该没事" | branch -D 变量未替换或与主分支同名 = 强删主分支引用，灾难性。必须 PRECONDITION_FAIL（task #25）。 |
| "另一个 change 也在 finish，并行做完更快" | 多 change 并行 finish = squash 顺序与 archive 顺序错配，主分支提交历史错乱。必须串行（task #14）。 |
| "phase 已经推进到 finished 了，merge 失败让用户自己回退太麻烦" | 推进早于不可逆操作 + 失败 → 用户手动按 §5.2.3 路径 B 回退 phase。agent 不得自动 reset --hard 清场（§3.5.1）。 |

---

## 前置检查

**进入阶段时，必须输出以下 Phase 框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [5/5] · Phase: Finish          │
│ 启动时间: phase_timings.finish.started_at
└──────────────────────────────────────┘
```

### [Step 1/3] 前置检查

> finish 仅操作 `feature_branch`。worktree-branch 已在 archive 阶段合入 feature_branch 并清理；finish 看不到 worktree-branch，也不应再去找它（task #26 注释）。

**0. Skill 预检（PRECONDITION_FAIL）：** skill: finishing-a-development-branch

读取 `commands/alloy/references/skill-precheck.md` 检测。不可用 → 输出 `⛔ PRECONDITION_FAIL: skill 缺失`，引导 `alloy init` 后退出。**不存在降级处理**——agent 不得自行模拟 finishing-a-development-branch 行为。

**1. phase 检查（PRECONDITION_FAIL）：**
```bash
alloy _guard precheck openspec/changes/<name> archived
```
不匹配时读取 `commands/alloy/references/phase-routing.md` 自动跳转。phase 必须 = archived，否则 `⛔ PRECONDITION_FAIL`。

**2. 分支存在检查（PRECONDITION_FAIL）：**
```bash
git branch --list <feature_branch>
```
返回空 → 输出 `⛔ PRECONDITION_FAIL: 分支已 merge 或删除，无需再次 finish。` 然后退出 skill。**禁止 agent 自动从 reflog 恢复或猜测分支名**（§3.5.1）。

**3. 主分支读取（USER_GATE）：** `alloy _config read . main_branch`，未配置时读取 `commands/alloy/references/main-branch-detection.md` 检测后 🔴 USER_GATE 确认主分支后写入。

**4. 多 change 并行检查（WARN，task #14）：**
```bash
alloy status --json 2>/dev/null | grep -c '"phase":"archived"' || true
```

返回 > 1 → 输出：
> ⚠️ WARN: 检测到多个 change 处于 phase=archived 状态。多个 change 并行 finish 会导致 squash merge 顺序与 archive 顺序错配，建议串行处理。当前 change：`<name>`，其他 archived change 列表见 `alloy status`。继续？

WARN 不阻断流程，但提醒用户人工确认顺序后再继续。

**5. Retrospective 离场审查（🔴 USER_GATE，task L7）：** merge 前最后一道审查窗口——retrospective 中的 §5 意外发现可能包含"应开新 change 的技术债"或"边界 case 发现"等影响合入决策的信息。

读取 retrospective.md（路径与 phase 推进取 CHANGE_DIR 一致）：

```bash
ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | sort -r | head -1)
CHANGE_DIR="${ARCHIVE_DIR:-openspec/changes/<name>}"
RETRO_FILE="${CHANGE_DIR}/retrospective.md"
```

`$RETRO_FILE` 存在 → 🔴 USER_GATE（必须 AskUserQuestion）：

> 离场审查：retrospective 关键发现
>
> [展示 retrospective.md §5 意外发现全文，以及 §4 技能跳过模式（如有）]
>
> §6 Promote Candidates 已在 archive 阶段处理（写入 memory / 跳过记录）。
>
> 以上发现是否影响合入决策？
> (a) 不影响——确认合入，进入 Step 2
> (b) 有影响——记录待处理项后继续（不影响本次合入，但标注后续 new change）
> (c) 需要讨论——退出 finish，先处理 retrospective 发现再决定

**[HARD_STOP]** agent 不得基于 "retrospective 已在 archive 审过" 跳过此 USER_GATE——archive 审查的是"是否写入 memory"，finish 审查的是"是否影响合入决策"，两件事不同。

`$RETRO_FILE` 不存在 → 跳过本步骤（无 retrospective = 无离场审查内容）。

**6. Checkpoint tag 清理（change 封存）：** finish 是 change 终态（merge/PR/保持分支都意味着封存），此时清理 checkpoint tag 时机最合适。archive 阶段不清理是因为 `/opsx:archive` 已把 change 目录移到 `openspec/changes/archive/`，原路径 `openspec/changes/<name>` 不存在导致 `_checkpoint clean` 失败。finish 阶段已有 `$CHANGE_DIR` 解析 archive 路径，直接复用：

```bash
ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | sort -r | head -1)
CHANGE_DIR="${ARCHIVE_DIR:-openspec/changes/<name>}"
alloy _checkpoint clean "$CHANGE_DIR"
```

`_checkpoint clean` 内部用 `basename(changeDir)` 推导 change name，传 archive 路径即可正确匹配 `alloy-checkpoint-<name>-*` tag。change 封存后 checkpoint tag 无恢复价值，清理避免 tag 堆积，不影响其他 change。

---

## 执行

### [Step 2/3] superpowers:finishing-a-development-branch

```
选择处理方式：
1. 本地 merge —— 合入基础分支
2. 创建 PR    —— 提交代码审查
3. 保持分支   —— 暂不处理
```

加载 `superpowers:finishing-a-development-branch` 技能，传入：
```
Change: <name>
状态：phase=archived（spec 已归档，代码待合入）
当前分支：<feature_branch>
基础分支：<main_branch>
```

```bash
# 必须用 $CHANGE_DIR（archive 路径），禁用原路径 openspec/changes/<name>
# archive 后原路径不存在，_skill log 会重新创建 .alloy.yaml 残留
alloy _skill log "$CHANGE_DIR" finish superpowers:finishing-a-development-branch
```

### 选项 1：本地合并（squash）

> [HARD_STOP] 选项 1 的不可逆操作链：phase 推进 → git checkout main → git pull → squash merge → branch -D。
> 任一步失败时严禁 agent 自动 reset --hard / checkout . / stash drop 清场。
> 违反字面 = 违反精神：哪怕"先回到干净状态再重试"，也算违反 §3.5.1 禁令——必须 USER_GATE 让用户决策。

**合并确认（USER_GATE，精确字符串）：**

**[HARD_STOP] 即使用户说"我同意了"、"可以，合吧"、"口头确认过"，也不算确认。** 精确字符串不可被任何形式的口头同意替代——用户必须亲手输入 `merge <branch> into <branch>`。

> 🔴 USER_GATE: 确认合并：源 `<feature_branch>` → 目标 `<main_branch>`
> 即将合入的提交：
> ```
> <git log main_branch..feature_branch --oneline>
> ```
> 合并后 worktree 清理，分支删除。
> 输入 `merge <feature_branch> into <main_branch>` 确认，其他输入取消。
>
> 违反字面 = 违反精神："y" / "好" / "可以" / "ok" 全部不算确认（§Iron Law）。

确认后执行：
```bash
ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | sort -r | head -1)
CHANGE_DIR="${ARCHIVE_DIR:-openspec/changes/<name>}"

# 记录完成时间 + 推进 phase（在 squash merge 之前——§5.2.3 路径 B）
# [HARD_STOP] phase 推进早于不可逆操作（squash merge / branch -D），失败时必须有降级路径：
#   - 若 squash merge 后续步骤失败 → 用户须手动回滚 phase：
#       alloy _state set "$CHANGE_DIR" phase archived
#       git checkout HEAD~1 -- "$CHANGE_DIR/.alloy.yaml"  # 撤销 phase commit 中的状态变更
#       git reset HEAD~1                                  # 退回 phase commit
#   - 禁止 agent 自动运行 git reset --hard / git checkout . 清场（详见 §3.5.1）。
# 详见 docs/reference/alloy-skill-writing-guide.md §5.2.3 路径 B
alloy _phase complete "$CHANGE_DIR" finish

git checkout <main_branch>

# [HARD_STOP] git pull 失败时禁止自动忽略——基于过期 main 做 squash 会污染主分支历史。
# 禁止 agent 在 pull 失败时运行 git reset --hard / git checkout . / git stash 任何一个。
# 详见 docs/reference/skill-writing-guide.md §3.5.1
if ! git pull --ff-only; then
  echo "[PRECONDITION_FAIL] git pull 失败——squash merge 不能基于过期 main"
  echo ""
  echo "  失败原因可能：远端无法访问 / 本地 main 偏离 / 凭证过期"
  echo ""
  echo "  🔴 USER_GATE: 选择处理方式"
  echo "    (a) 重试——用户手动修复后再次运行 /alloy:finish"
  echo "    (b) 跳过 pull 直接 squash（仅当用户确认 main 已是最新——风险自负）"
  echo "    (c) 中止 finish——保持当前分支，回退 phase："
  echo "        alloy _state set \"$CHANGE_DIR\" phase archived"
  echo ""
  echo "  禁止：agent 自动运行 git reset --hard origin/<main_branch> 强制对齐。"
  exit 1
fi

# [HARD_STOP] git merge --squash 冲突时禁止 agent 自动运行：
#   - git merge --abort（撕毁现场，用户 in-progress 修改消失）
#   - git reset --hard <main_branch>（撕毁本地未推送 commit）
#   - git checkout . / git restore .（撕毁工作目录改动）
# 详见 docs/reference/skill-writing-guide.md §3.5.1
# 冲突时必须：列出冲突文件 → 退出 skill → 让用户解决 → 用户重新运行 /alloy:finish
git merge --squash <feature_branch>
COMMIT_LOG=$(git log <main_branch>..<feature_branch> --format="* %s")
git commit -m "$(cat <<EOF
chore(<name>): 合入 main（squash merge）

${COMMIT_LOG}
EOF
)"

# [task #13 备注] squash merge 产生新 commit hash，但 retrospective.md / verify.md / plans.md 等
# 制品 hash 已在 archive 阶段被 alloy _record 锁定到 records——records 记录的是制品文件 SHA-256，
# 而非 git commit hash。git 历史变化（squash / rebase）不影响已归档制品的不可篡改性。
# 因此 squash 后无需重录任何 hash；finish 阶段不再调 alloy _record write。

# [PRECONDITION_FAIL] git branch -D 前必须校验变量——
# <feature_branch> 是模板占位符，agent 在执行前必须替换为实际分支名。
# 如果替换缺失或意外指向 main_branch，强删会丢失主分支引用。
if [ -z "<feature_branch>" ] || [ "<feature_branch>" = "<main_branch>" ] || [ "<feature_branch>" = "main" ] || [ "<feature_branch>" = "master" ]; then
  echo "[PRECONDITION_FAIL] feature_branch 变量未替换或与主分支同名，拒绝执行 git branch -D"
  echo "  feature_branch=<feature_branch>"
  echo "  main_branch=<main_branch>"
  echo "  禁止：agent 自动猜测分支名继续执行。退出 skill 让用户检查 .alloy.yaml。"
  exit 1
fi
git branch -D <feature_branch>
```

`git pull` 失败按上述 USER_GATE 三选项（重试 / 跳过 pull / 中止）处理；agent 不得自动绕过。`git merge --squash` 冲突时列出冲突文件让用户手动解决，禁止 `git merge --abort`（详见 §3.5.1）。

### 选项 2：创建 PR

先记录完成时间并推进 phase（原子命令）：
```bash
ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | sort -r | head -1)
CHANGE_DIR="${ARCHIVE_DIR:-openspec/changes/<name>}"
# [§5.2.3 路径 B] phase 推进发生在 PR 创建之前。PR 后续被 close / 不合入时，
# 用户须手动按以下 3 步回退（与选项 1 同款手动回退路径）：
#   alloy _state set "$CHANGE_DIR" phase archived
#   git checkout HEAD~1 -- "$CHANGE_DIR/.alloy.yaml"  # 撤销 phase commit 中的状态变更
#   git reset HEAD~1                                  # 退回 phase commit
# 禁止 agent 自动 git reset --hard / git checkout . 清场（§3.5.1）。
alloy _phase complete "$CHANGE_DIR" finish
```

PR 审查反馈的处理规范：
- **验证优先** —— 不盲从审查意见，先验证问题是否真实
- **技术推理** —— 有技术理由时解释而非被动接受
- **不表演性认同** —— 不理解的追问清楚
- **每条独立回应** —— 不批量处理
- **spec 变更 = 新 change（HARD_STOP）** —— 当前 spec 已归档封存。当代码修改可能影响 spec 行为时，必须 🔴 USER_GATE：

  > AskUserQuestion: PR 审查反馈是否需要 spec 级修改？
  > (a) 不需要——仅代码调整不影响行为
  > (b) 需要——退出 finish，运行 /alloy:start <new-name> 开新 change
  > (c) 暂不决定——保持 PR 不合入，等待澄清
  >
  > 选 (b)：[HARD_STOP] 禁止 agent 直接修改已归档 spec。退出 skill。

### 选项 3：保持分支

记录延期时间戳供后续 `alloy status` 统计：
```bash
ARCHIVE_DIR=$(ls -d openspec/changes/archive/*-<name> 2>/dev/null | sort -r | head -1)
CHANGE_DIR="${ARCHIVE_DIR:-openspec/changes/<name>}"
DEFERRED_AT=$(date "+%Y-%m-%d %H:%M:%S")
alloy _state merge "$CHANGE_DIR" phase_timings "{\"finish\":{\"deferred_at\":\"${DEFERRED_AT}\"}}"
git add "$CHANGE_DIR/.alloy.yaml"
git commit -m "chore(<name>): finish 延期，分支已保留"
```

> ⚠️ WARN（task #27）：finish 延期已记录 deferred_at=${DEFERRED_AT}。
> 后续 `alloy status` 会基于此提示分支堆积；建议在合适时机重新运行 /alloy:finish 完成合入。

提示："分支已保留。后续需要时再次运行 `/alloy:finish <name>`。" phase 保持 archived，不推进——此选项不破坏不变式：`deferred_at` 仅是观测信号，phase 字段保持 archived 由 `alloy _guard` 校验（task #27）。

---

### [Step 3/3] 完成

**阶段完成时，必须输出以下 Phase 完成框到终端**:
```
┌──────────────────────────────────────┐
│ Alloy [5/5] · Phase: Finish — DONE   │
│ 启动时间: phase_timings.finish.started_at
│ 完成时间: phase_timings.finish.completed_at
│ 耗时: completed_at - started_at
└──────────────────────────────────────┘

→ Change: <name>  Phase: finished
→ 处理方式: <本地 merge / PR / 保留分支>  分支: <merged / 已删除 / 保留>
```

finish 不产生额外 commit——合入 commit 或 PR 本身就是终端动作。

**git add 路径化（§5.2.1）：** 仅用精确路径（`"$CHANGE_DIR" openspec/config.yaml`），禁用 `-A` / `-a` / `.`。违反字面 = 违反精神：哪怕"反正只有一个文件改动"，也禁止 `-A`——agent 看不到的副作用文件可能被一并提交。

