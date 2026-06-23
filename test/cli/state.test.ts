import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import {
  createInitialState,
  readState,
  writeState,
  findActiveChanges,
  readProjectConfig,
  writeProjectConfig,
} from "../../src/cli/utils/state.js";

describe("state utils", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("createInitialState 返回 started phase 的状态", () => {
    const state = createInitialState();
    expect(state.phase).toBe("started");
    expect(state.worktree).toBeNull();
    expect(state.schema_version).toBe(1);
    // 格式: YYYY-MM-DD HH:MM:SS（本地时间，人类可读）
    expect(state.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(state.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("writeState 和 readState 往返一致", async () => {
    const changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    const original = createInitialState();
    await writeState(changeDir, original);
    const loaded = await readState(changeDir);
    expect(loaded.phase).toBe(original.phase);
    expect(loaded.worktree).toBe(original.worktree);
    expect(loaded.schema_version).toBe(original.schema_version);
  });

  it("writeState 自动更新 updated_at（含时间）", async () => {
    const changeDir = join(tmpDir, "test-change-2");
    await mkdir(changeDir, { recursive: true });
    const state = createInitialState();
    state.updated_at = "2020-01-01T00:00:00";
    await writeState(changeDir, state);
    const loaded = await readState(changeDir);
    expect(loaded.updated_at).not.toBe("2020-01-01T00:00:00");
    expect(loaded.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("findActiveChanges 过滤 finished change，保留 archived", async () => {
    const changesDir = join(tmpDir, "openspec", "changes");
    const activeDir = join(changesDir, "active-change");
    const archivedDir = join(changesDir, "archived-change");
    const finishedDir = join(changesDir, "finished-change");
    await mkdir(activeDir, { recursive: true });
    await mkdir(archivedDir, { recursive: true });
    await mkdir(finishedDir, { recursive: true });

    const active = createInitialState();
    await writeState(activeDir, active);

    const archived = createInitialState();
    archived.phase = "archived";
    await writeState(archivedDir, archived);

    const finished = createInitialState();
    finished.phase = "finished";
    await writeState(finishedDir, finished);

    const changes = await findActiveChanges(changesDir);
    expect(changes.has("active-change")).toBe(true);
    expect(changes.has("archived-change")).toBe(true);
    expect(changes.has("finished-change")).toBe(false);
  });

  it("findActiveChanges 忽略无 .alloy.yaml 的目录", async () => {
    const changesDir = join(tmpDir, "openspec", "changes");
    await mkdir(join(changesDir, "no-state-dir"), { recursive: true });

    const changes = await findActiveChanges(changesDir);
    expect(changes.size).toBe(0);
  });

  it("writeState 和 readState records 往返一致", async () => {
    const changeDir = join(tmpDir, "test-change-records");
    await mkdir(changeDir, { recursive: true });
    const original = createInitialState();
    original.records = [
      {
        artifact: "proposal.md",
        hash: "abc123",
        committed_at: "2025-01-15T10:30:00",
        approver: "human",
      },
      {
        artifact: "design.md",
        hash: "def456",
        committed_at: "2025-01-15T11:00:00",
        approver: "human",
      },
    ];
    original.skill_usage = [
      { skill: "brainstorming", phase: "start", used_at: "2025-01-15T10:30:00" },
      { skill: "writing-plans", phase: "plan", used_at: "2025-01-15T11:00:00" },
    ];
    await writeState(changeDir, original);
    const loaded = await readState(changeDir);
    expect(loaded.records).toEqual(original.records);
    expect(loaded.skill_usage).toEqual(original.skill_usage);
  });

  it("createInitialState 默认 records 为空数组", () => {
    const state = createInitialState();
    expect(state.records).toEqual([]);
  });

  it("createInitialState 默认 skill_usage 为空数组", () => {
    const state = createInitialState();
    expect(state.skill_usage).toEqual([]);
  });

  it("findActiveChanges 忽略非目录条目", async () => {
    const changesDir = join(tmpDir, "openspec", "changes");
    await mkdir(changesDir, { recursive: true });
    await writeFile(join(changesDir, "some-file.txt"), "not a directory", "utf-8");

    const changes = await findActiveChanges(changesDir);
    expect(changes.size).toBe(0);
  });

  it("feature_branch 默认不存在", () => {
    const state = createInitialState();
    expect(state.feature_branch).toBeNull();
  });

  it("writeState 和 readState feature_branch 往返一致", async () => {
    const changeDir = join(tmpDir, "test-feature-branch");
    await mkdir(changeDir, { recursive: true });
    const state = createInitialState();
    state.feature_branch = "feat/login";
    await writeState(changeDir, state);
    const loaded = await readState(changeDir);
    expect(loaded.feature_branch).toBe("feat/login");
  });

  it("readState 无 feature_branch 时返回 undefined", async () => {
    const changeDir = join(tmpDir, "test-no-branch");
    await mkdir(changeDir, { recursive: true });
    // 写入不含 feature_branch 的旧格式 yaml
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: started",
      'created_at: "2020-01-01 00:00:00"',
      'updated_at: "2020-01-01 00:00:00"',
      "records: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    const loaded = await readState(changeDir);
    expect(loaded.feature_branch).toBeUndefined();
  });

  it("worktree_branch 默认不存在", () => {
    const state = createInitialState();
    expect(state.worktree_branch).toBeNull();
  });

  it("writeState 和 readState worktree_branch 往返一致", async () => {
    const changeDir = join(tmpDir, "test-wt-branch");
    await mkdir(changeDir, { recursive: true });
    const state = createInitialState();
    state.worktree_branch = "worktree-test-feat";
    await writeState(changeDir, state);
    const loaded = await readState(changeDir);
    expect(loaded.worktree_branch).toBe("worktree-test-feat");
  });

  // 注：原 _state merge phase_timings 的 4 个测试已移除——phase_timings 现为受管字段
  // （N2 修复），merge 入口被拦截。deepMerge 嵌套合并行为改由 _phase start/complete 内部
  // 通过 writeState 直接写入覆盖，不再经 _state merge 暴露。受管字段拦截见 internal/state.test.ts
});

describe("project config", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-config-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("readProjectConfig 无文件时返回默认空配置", async () => {
    const config = await readProjectConfig(tmpDir);
    expect(config.schema).toBe("alloy");
    expect(config.alloy.main_branch).toBeUndefined();
  });

  it("writeProjectConfig 和 readProjectConfig 往返一致", async () => {
    const config = { schema: "alloy" as const, alloy: { main_branch: "main" } };
    await writeProjectConfig(tmpDir, config);
    const loaded = await readProjectConfig(tmpDir);
    expect(loaded.schema).toBe("alloy");
    expect(loaded.alloy.main_branch).toBe("main");
  });

  it("writeProjectConfig 自动创建 openspec 目录", async () => {
    const config = { schema: "alloy" as const, alloy: { main_branch: "master" } };
    await writeProjectConfig(tmpDir, config);
    const loaded = await readProjectConfig(tmpDir);
    expect(loaded.alloy.main_branch).toBe("master");
  });

  it("readProjectConfig 兼容无 alloy 字段的旧格式", async () => {
    const configPath = join(tmpDir, "openspec", "config.yaml");
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, "schema: alloy\n", "utf-8");
    const config = await readProjectConfig(tmpDir);
    expect(config.schema).toBe("alloy");
    expect(config.alloy).toEqual({});
  });
});
