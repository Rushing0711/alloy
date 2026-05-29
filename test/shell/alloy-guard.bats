#!/usr/bin/env bats
# alloy-guard.sh tests — phase transition validation

setup() {
  TEST_DIR="$(mktemp -d)"
  CHANGE_DIR="$TEST_DIR/web-tetris"
  mkdir -p "$CHANGE_DIR"
  ALLOY_YAML="$CHANGE_DIR/.alloy.yaml"

  cat > "$ALLOY_YAML" << 'EOF'
worktree: null
schema_version: 1
phase: started
updated_at: "2026-05-29"
EOF

  SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)/skills/alloy/scripts/alloy-guard.sh"
}

teardown() {
  rm -rf "$TEST_DIR"
}

# ─── valid transitions ───

@test "started->planned passes with all artifacts" {
  touch "$CHANGE_DIR/proposal.md" "$CHANGE_DIR/design.md" \
       "$CHANGE_DIR/tasks.md" "$CHANGE_DIR/plan.md"
  mkdir "$CHANGE_DIR/specs"
  run bash "$SCRIPT" "$CHANGE_DIR" planned --apply
  [ "$status" -eq 0 ]
  [[ "$output" == *"phase: started"*"planned"* ]]
  grep -q '^phase: planned' "$ALLOY_YAML"
}

@test "planned->applied passes with plan.md" {
  sed -i '' 's/^phase: started/phase: planned/' "$ALLOY_YAML"
  touch "$CHANGE_DIR/plan.md"
  run bash "$SCRIPT" "$CHANGE_DIR" applied --apply
  [ "$status" -eq 0 ]
  grep -q '^phase: applied' "$ALLOY_YAML"
}

@test "applied->archived passes with verify.md" {
  sed -i '' 's/^phase: started/phase: applied/' "$ALLOY_YAML"
  touch "$CHANGE_DIR/verify.md"
  run bash "$SCRIPT" "$CHANGE_DIR" archived --apply
  [ "$status" -eq 0 ]
  grep -q '^phase: archived' "$ALLOY_YAML"
}

@test "archived->finished passes unconditionally" {
  sed -i '' 's/^phase: started/phase: archived/' "$ALLOY_YAML"
  run bash "$SCRIPT" "$CHANGE_DIR" finished --apply
  [ "$status" -eq 0 ]
  grep -q '^phase: finished' "$ALLOY_YAML"
}

# ─── invalid transitions ───

@test "started->applied is rejected (skip planned)" {
  run bash "$SCRIPT" "$CHANGE_DIR" applied
  [ "$status" -eq 1 ]
  [[ "$output" == *"HARD STOP"* ]]
  [[ "$output" == *"not allowed"* || "$output" == *"不允许"* ]]
}

@test "started->archived is rejected (multi skip)" {
  run bash "$SCRIPT" "$CHANGE_DIR" archived
  [ "$status" -eq 1 ]
}

@test "planned->finished is rejected (skip applied+archived)" {
  sed -i '' 's/^phase: started/phase: planned/' "$ALLOY_YAML"
  run bash "$SCRIPT" "$CHANGE_DIR" finished
  [ "$status" -eq 1 ]
}

# ─── started->planned missing artifacts ───

@test "started->planned blocks when proposal.md missing" {
  touch "$CHANGE_DIR/design.md" "$CHANGE_DIR/tasks.md" "$CHANGE_DIR/plan.md"
  mkdir "$CHANGE_DIR/specs"
  run bash "$SCRIPT" "$CHANGE_DIR" planned
  [ "$status" -eq 1 ]
  [[ "$output" == *"HARD STOP"* ]]
  [[ "$output" == *"proposal.md"* ]]
}

@test "started->planned blocks when specs/ missing" {
  touch "$CHANGE_DIR/proposal.md" "$CHANGE_DIR/design.md" \
       "$CHANGE_DIR/tasks.md" "$CHANGE_DIR/plan.md"
  run bash "$SCRIPT" "$CHANGE_DIR" planned
  [ "$status" -eq 1 ]
  [[ "$output" == *"specs/"* ]]
}

@test "started->planned blocks when plan.md missing" {
  touch "$CHANGE_DIR/proposal.md" "$CHANGE_DIR/design.md" "$CHANGE_DIR/tasks.md"
  mkdir "$CHANGE_DIR/specs"
  run bash "$SCRIPT" "$CHANGE_DIR" planned
  [ "$status" -eq 1 ]
  [[ "$output" == *"plan.md"* ]]
}

# ─── planned->applied missing plan.md ───

@test "planned->applied blocks when plan.md missing" {
  sed -i '' 's/^phase: started/phase: planned/' "$ALLOY_YAML"
  run bash "$SCRIPT" "$CHANGE_DIR" applied
  [ "$status" -eq 1 ]
  [[ "$output" == *"plan.md"* ]]
}

# ─── applied->archived missing verify.md ───

@test "applied->archived blocks when verify.md missing" {
  sed -i '' 's/^phase: started/phase: applied/' "$ALLOY_YAML"
  run bash "$SCRIPT" "$CHANGE_DIR" archived
  [ "$status" -eq 1 ]
  [[ "$output" == *"verify.md"* ]]
}

# ─── --apply flag ───

@test "without --apply phase file is unchanged" {
  touch "$CHANGE_DIR/proposal.md" "$CHANGE_DIR/design.md" \
       "$CHANGE_DIR/tasks.md" "$CHANGE_DIR/plan.md"
  mkdir "$CHANGE_DIR/specs"
  run bash "$SCRIPT" "$CHANGE_DIR" planned
  [ "$status" -eq 0 ]
  grep -q '^phase: started' "$ALLOY_YAML"
}
