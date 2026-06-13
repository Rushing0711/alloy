# branch-validation.md

`alloy _guard branch-position` 返回异常时的修复选项。

**交互规则：** 所有选项确认点均为 🔴 STOP——必须用 AskUserQuestion 等用户选择，不可自行决定。

## 异常结果与修复路径

### feature-missing

`.alloy.yaml` 未记录 feature_branch。这通常是 start 阶段数据写入失败——null 是状态异常，不是设计的容错。

🔴 STOP: 选择修复方式——(a) 手动指定分支名 (b) 使用当前分支作为 feature_branch (c) 放弃，回退 start 阶段修复

用户选择后：`alloy _state write openspec/changes/<name> feature_branch <用户确认的分支>`

**不允许静默回退**——回退值可能与实际分支不一致。

### on-other:\<current\>

当前分支与 feature_branch 记录不一致：

🔴 STOP: 选择处理方式——(a) 切换到 feature_branch（推荐） (b) 使用当前分支（更新 feature_branch 记录）

选 (a)：`git checkout <feature_branch>` → 重新运行 `alloy _guard branch-position`
选 (b)：`alloy _state write openspec/changes/<name> feature_branch <current_branch>` → 继续

### feature-lost:\<feature\>

feature_branch 记录在 .alloy.yaml 但本地不存在：

🔴 STOP: 选择修复方式——(a) 从远程拉取 (b) 手动指定其他分支 (c) 放弃，回退 start 阶段修复

## 跨文件复用

此文件供 apply.md 和 start.md 的分支验证步骤引用。start.md 的分支选择逻辑更复杂（包含新建分支选项），此文件只处理 apply 阶段的修复场景。
