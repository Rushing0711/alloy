#!/usr/bin/env bash
# alloy-state.sh — 统一状态管理（Agent 操作 .alloy.yaml 的独占接口）
# 用法:
#   alloy-state.sh read <change-dir> <field>        — 读取字段
#   alloy-state.sh write <change-dir> <field> <value> — 写入字段
#   alloy-state.sh check <change-dir> <phase>        — 检查 phase 是否匹配

set -euo pipefail

ACTION="$1"
CHANGE_DIR="$2"
FIELD="${3:-}"
VALUE="${4:-}"

ALLOY_YAML="$CHANGE_DIR/.alloy.yaml"

case "$ACTION" in
  read)
    grep -E "^${FIELD}:" "$ALLOY_YAML" | sed 's/^[^:]*: *//'
    ;;
  write)
    if grep -qE "^${FIELD}:" "$ALLOY_YAML"; then
      if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "s#^${FIELD}:.*#${FIELD}: ${VALUE}#" "$ALLOY_YAML"
      else
        sed -i "s/^${FIELD}:.*/${FIELD}: ${VALUE}/" "$ALLOY_YAML"
      fi
    else
      echo "${FIELD}: ${VALUE}" >> "$ALLOY_YAML"
    fi
    today=$(date +%Y-%m-%dT%H:%M:%S)
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"
    else
      sed -i "s/^updated_at:.*/updated_at: \"$today\"/" "$ALLOY_YAML"
    fi
    ;;
  check)
    current=$(grep -E '^phase:' "$ALLOY_YAML" | awk '{print $2}')
    expected="$FIELD"
    if [[ "$current" != "$expected" ]]; then
      echo "phase 不匹配: 当前=$current, 期望=$expected"
      exit 1
    fi
    ;;
  *)
    echo "未知操作: $ACTION (支持: read, write, check)"
    exit 1
    ;;
esac
