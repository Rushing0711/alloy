# Skill 预检脚本

所有 alloy 阶段命令共享的技能/命令可用性检测脚本。各命令传入自己的技能列表即可。

## 使用方式

在命令中按以下格式声明所需依赖，然后执行下方预检脚本：

```
Skill 预检——确认以下可用：
  cmd: opsx/explore opsx/new
  skill: brainstorming
```

## 预检脚本

将上面声明的 cmd 和 skill 列表填入脚本中的对应位置：

```bash
MISSING=0

# 检测 command（project → user）
for cmd in <cmd列表>; do
  if test -f ".claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（项目级 command）"
  elif test -f "$HOME/.claude/commands/$cmd.md"; then echo "  ✓ ${cmd//\//:}（用户级 command）"
  else echo "  ✗ ${cmd//\//:} — 未找到"; MISSING=$((MISSING+1)); fi
done

# 检测 skill（project skill → user skill → user plugin）
for skill in <skill列表>; do
  if test -d ".claude/skills/$skill"; then echo "  ✓ superpowers:$skill（项目级 skill）"
  elif test -d "$HOME/.claude/skills/$skill"; then echo "  ✓ superpowers:$skill（用户级 skill）"
  elif for d in "$HOME/.claude/plugins/cache/superpowers-marketplace/superpowers/"*"/skills/$skill"; do test -d "$d" && break; done 2>/dev/null; then echo "  ✓ superpowers:$skill（用户级 plugin）"
  else echo "  ✗ superpowers:$skill — 未找到"; MISSING=$((MISSING+1)); fi
done

if [ "$MISSING" -gt 0 ]; then echo ""; echo "  需要先完成环境初始化。请运行: alloy init"; exit 1; fi
```

## 检测优先级

项目级 command → 项目级 skill → 用户级 command → 用户级 skill → 用户级 plugin

任一不可用 → 引导 `alloy init` → STOP。

**如果某命令只有 command 或只有 skill 依赖，省略对应的 for 循环即可。**
