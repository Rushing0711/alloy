#!/usr/bin/env bash
# alloy-guard.sh — 阶段转换闸门校验
# 用法: alloy-guard.sh <change-dir> <target-phase> [--apply]
# 退出码: 0=通过, 1=阻断

set -euo pipefail

CHANGE_DIR="$1"
TARGET_PHASE="$2"
APPLY=false
[[ "${3:-}" == "--apply" ]] && APPLY=true

ALLOY_YAML="$CHANGE_DIR/.alloy.yaml"

# 提取当前 phase
current_phase=$(grep -E '^phase:' "$ALLOY_YAML" | awk '{print $2}')

# 合法转换定义
declare -A VALID_TRANSITIONS
VALID_TRANSITIONS["started->planned"]=1
VALID_TRANSITIONS["planned->applied"]=1
VALID_TRANSITIONS["applied->archived"]=1
VALID_TRANSITIONS["archived->finished"]=1

transition="${current_phase}->${TARGET_PHASE}"

if [[ -z "${VALID_TRANSITIONS[$transition]:-}" ]]; then
  echo "[HARD STOP] 不允许的 phase 转换: $current_phase → $TARGET_PHASE"
  echo "  允许的转换: started→planned, planned→applied, applied→archived, archived→finished"
  exit 1
fi

# 针对特定转换的额外检查
case "$transition" in
  "planned->applied")
    if [[ ! -f "$CHANGE_DIR/plan.md" ]]; then
      echo "[HARD STOP] plan.md 不存在，无法进入 apply 阶段"
      exit 1
    fi
    ;;
  "applied->archived")
    if [[ ! -f "$CHANGE_DIR/verify.md" ]]; then
      echo "[HARD STOP] verify.md 不存在，无法进入 archive 阶段"
      exit 1
    fi
    ;;
esac

if $APPLY; then
  # 更新 phase
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/^phase:.*/phase: $TARGET_PHASE/" "$ALLOY_YAML"
  else
    sed -i "s/^phase:.*/phase: $TARGET_PHASE/" "$ALLOY_YAML"
  fi
  # 更新 updated_at
  today=$(date +%Y-%m-%d)
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"
  else
    sed -i "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"
  fi
  echo "✓ phase: $current_phase → $TARGET_PHASE"
fi

exit 0
