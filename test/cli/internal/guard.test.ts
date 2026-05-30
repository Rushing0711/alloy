// test/cli/internal/guard.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { guardCommand } from "../../../src/cli/commands/internal/guard.js";
import { readState } from "../../../src/cli/utils/state.js";

describe("alloy _guard", () => {
  let tmpDir: string;
  let changeDir: string;

  async function setupState(phase: string) {
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      `phase: ${phase}`,
      'updated_at: "2020-01-01T00:00:00"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  }

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-guard-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
    await setupState("started");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // valid transitions
  it("started→planned 所有制品齐全时通过", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));
    await guardCommand([changeDir, "planned", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("planned");
  });

  it("planned→applied plans.md 存在时通过", async () => {
    await setupState("planned");
    await writeFile(join(changeDir, "plans.md"), "");
    await guardCommand([changeDir, "applied", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("applied");
  });

  it("applied→archived verify.md 存在时通过", async () => {
    await setupState("applied");
    await writeFile(join(changeDir, "verify.md"), "");
    await guardCommand([changeDir, "archived", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("archived");
  });

  it("archived→finished 无条件通过", async () => {
    await setupState("archived");
    await guardCommand([changeDir, "finished", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("finished");
  });

  // invalid transitions
  it("started→applied 越级转换被拒绝", async () => {
    await expect(
      guardCommand([changeDir, "applied"])
    ).rejects.toThrow();
  });

  it("started→archived 跳多级被拒绝", async () => {
    await expect(
      guardCommand([changeDir, "archived"])
    ).rejects.toThrow();
  });

  it("planned→finished 被拒绝", async () => {
    await setupState("planned");
    await expect(
      guardCommand([changeDir, "finished"])
    ).rejects.toThrow();
  });

  // missing artifacts
  it("started→planned proposal.md 缺失被阻断", async () => {
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));
    await expect(
      guardCommand([changeDir, "planned"])
    ).rejects.toThrow();
  });

  it("started→planned specs/ 缺失被阻断", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await expect(
      guardCommand([changeDir, "planned"])
    ).rejects.toThrow();
  });

  it("started→planned hash 不匹配时被阻断", async () => {
    await writeFile(join(changeDir, "proposal.md"), "real proposal", "utf-8");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: started",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      "  - artifact: proposal",
      '    hash: "wronghash123"',
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await expect(
      guardCommand([changeDir, "planned"])
    ).rejects.toThrow();
  });

  it("planned→applied plans.md 缺失被阻断", async () => {
    await setupState("planned");
    await expect(
      guardCommand([changeDir, "applied"])
    ).rejects.toThrow();
  });

  it("planned→applied hash 不匹配时被阻断", async () => {
    await writeFile(join(changeDir, "plans.md"), "real content here");
    // 直接写入带错误 hash 的 .alloy.yaml，绕过 setupState
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      "  - artifact: plans",
      '    hash: "wronghash123"',
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await expect(
      guardCommand([changeDir, "applied"])
    ).rejects.toThrow();
  });

  it("applied→archived verify.md 缺失被阻断", async () => {
    await setupState("applied");
    await expect(
      guardCommand([changeDir, "archived"])
    ).rejects.toThrow();
  });

  it("applied→archived hash 不匹配时被阻断", async () => {
    await writeFile(join(changeDir, "verify.md"), "verify content");
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: applied",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      "  - artifact: verify",
      '    hash: "wronghash999"',
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await expect(
      guardCommand([changeDir, "archived"])
    ).rejects.toThrow();
  });

  it("planned→applied hash 匹配时 --apply 成功", async () => {
    const { createHash } = await import("node:crypto");
    const content = "real plans content";
    await writeFile(join(changeDir, "plans.md"), content, "utf-8");
    const hash = createHash("sha256").update(content).digest("hex").substring(0, 12);
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      `  - artifact: plans`,
      `    hash: "${hash}"`,
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    await guardCommand([changeDir, "applied", "--apply"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("applied");
  });

  it("缺少参数时 exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await guardCommand([changeDir]); // targetPhase 缺失
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("record 指向不存在的文件时 hash 校验失败", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await writeFile(join(changeDir, "plans.md"), "content", "utf-8");
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
      "records:",
      "  - artifact: tasks",
      '    hash: "def456"',
      '    committed_at: "2020-01-01T00:00:00"',
      '    approver: "test"',
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
    // tasks.md 不存在 → computeArtifactHash 返回 null → mismatches → exit 1
    await guardCommand([changeDir, "applied"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  // --apply flag behavior
  it("无 --apply 时不修改 phase", async () => {
    await writeFile(join(changeDir, "proposal.md"), "");
    await writeFile(join(changeDir, "design.md"), "");
    await writeFile(join(changeDir, "tasks.md"), "");
    await writeFile(join(changeDir, "plans.md"), "");
    await mkdir(join(changeDir, "specs"));
    await guardCommand([changeDir, "planned"]);
    const state = await readState(changeDir);
    expect(state.phase).toBe("started"); // unchanged
  });
});
