# Spec-Sync：Spec/Skill 对账工作流

所有 alloy 阶段命令共享的 spec-skill 对账工作流。修改 `commands/alloy/*.md` 或 `src/` 后触发。

## 1. 自动检测

```bash
alloy _spec-audit
```

输出差异报告：
- `✓ <name>: spec 与 skill 一致` — 无需操作
- `✗ <name>: spec 与 skill 不一致` — 需要同步
- `⚠ <name>: 未声明 spec 锚点，跳过对账` — 缺少 `spec` frontmatter
- `✗ <name>: 对应 spec 文件 <path> 不存在` — spec 路径有误

## 2. 定位变更源

确认哪个 skill 文件修改了 behaviors：
- 新增/删除了 🔴 STOP → `stops` 或 `hard_stops` 变化
- 变更了外部调用 → `external_calls` 变化
- 产物列表更新 → `artifacts` 变化
- 阶段目标变更 → `transitions_to` 变化

## 3. 更新 spec 正文

确保 spec 正文描述与 skill 一致。例如：
- skill 新增了 🔴 STOP → spec 正文应有对应的确认点描述
- skill 新增了 external_call → spec 正文应有该技能的调用说明
- skill 修改了 transitions_to → spec 正文的目标阶段描述应更新

## 4. 更新 spec frontmatter

方式一：手动修改 spec 文件的 `behaviors` frontmatter

方式二：自动更新（仅修改 frontmatter，不修改正文）
```bash
alloy _spec-audit --fix
```

## 5. 验证

```bash
alloy _spec-audit
```

确认所有字段输出 `✓`。

## 6. 提交

skill 变更和 spec 变更在同一 commit 中：
```bash
git add commands/alloy/<skill>.md docs/specification/01-product-spec/<spec>.md
git commit -m "docs(<name>): 同步 spec 与 skill behaviors"
```

## 注意事项

- **对账方向是 skill → spec**（skill 是真相源）
- 只改 spec 匹配 skill，不反向修改 skill
- 正文同步是人工判断，frontmatter 同步可自动化
- `--fix` 只修改 frontmatter，不修改 spec 正文——正文必须手动同步
