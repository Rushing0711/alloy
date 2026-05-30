import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createInitialState,
  writeState,
} from "../../src/cli/utils/state.js";
import { statusCommand } from "../../src/cli/commands/status.js";

describe("status command", () => {
  let tmpDir: string;
  let changesDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-status-test-${Date.now()}`);
    changesDir = join(tmpDir, "openspec", "changes");
    await mkdir(changesDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("总览模式 — 无活跃 change 时给出提示", async () => {
    const result = await statusCommand(tmpDir);
    expect(result).toContain("无活跃 change");
  });

  it("详情模式 — change 不存在时报错", async () => {
    const result = await statusCommand(tmpDir, "nonexistent");
    expect(result).toContain("未找到 change");
  });

  it("详情模式 — plans.md 存在时显示 plans ✓（非 plan ✓）", async () => {
    const changeDir = join(changesDir, "test-change");
    await mkdir(changeDir, { recursive: true });

    const state = createInitialState();
    state.phase = "planned";
    await writeState(changeDir, state);

    // 创建 plans.md（注意：是复数 "plans"）
    await writeFile(join(changeDir, "plans.md"), "# Plans", "utf-8");

    const result = await statusCommand(tmpDir, "test-change");
    expect(result).toContain("plans");
    expect(result).toContain("✓");
    // 确保不会出现 "plan ✓"（单数 bug）
    expect(result).not.toMatch(/plan\s+✓/);
  });

  it("详情模式 — plans.md 不存在时显示 plans ✗", async () => {
    const changeDir = join(changesDir, "test-change");
    await mkdir(changeDir, { recursive: true });

    const state = createInitialState();
    await writeState(changeDir, state);

    const result = await statusCommand(tmpDir, "test-change");
    expect(result).toContain("plans");
    expect(result).toContain("✗");
  });

  it("总览模式 — 活跃 change 显示正确制品信息", async () => {
    const changeDir = join(changesDir, "active-change");
    await mkdir(changeDir, { recursive: true });

    const state = createInitialState();
    state.phase = "started";
    await writeState(changeDir, state);

    // 创建 draft.md
    await writeFile(join(changeDir, "draft.md"), "# Draft", "utf-8");

    const result = await statusCommand(tmpDir);
    expect(result).toContain("active-change");
    expect(result).toContain("started");
    expect(result).toContain("draft ✓");
  });

  it("详情模式 — 缺少 .alloy.yaml 时报错", async () => {
    const changeDir = join(changesDir, "no-state");
    await mkdir(changeDir, { recursive: true });

    const result = await statusCommand(tmpDir, "no-state");
    expect(result).toContain("缺少 .alloy.yaml");
  });

  it("详情模式 — specs 目录存在时显示 specs ✓", async () => {
    const changeDir = join(changesDir, "specs-test");
    await mkdir(changeDir, { recursive: true });

    const state = createInitialState();
    await writeState(changeDir, state);

    // 创建 specs 目录（含文件）
    await mkdir(join(changeDir, "specs"), { recursive: true });
    await writeFile(join(changeDir, "specs", "auth.md"), "# Auth Spec", "utf-8");

    const result = await statusCommand(tmpDir, "specs-test");
    expect(result).toContain("specs");
    expect(result).toContain("✓");
  });
});
