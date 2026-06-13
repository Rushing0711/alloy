// test/cli/internal/artifact.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { artifactCommand } from "../../../src/cli/commands/internal/artifact.js";
import { readState } from "../../../src/cli/utils/state.js";

describe("alloy _artifact reset", () => {
  let tmpDir: string;
  let changeDir: string;

  async function setupState(records?: string) {
    const yaml = [
      "worktree: null",
      "schema_version: 1",
      "phase: planned",
      'updated_at: "2020-01-01T00:00:00"',
      records || "records: []",
    ].join("\n");
    await writeFile(join(changeDir, ".alloy.yaml"), yaml, "utf-8");
  }

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-artifact-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("制品存在且有 record 时清除成功", async () => {
    await writeFile(join(changeDir, "proposal.md"), "proposal content", "utf-8");
    await setupState(`records:\n  - artifact: proposal\n    hash: "abc123"\n    committed_at: "2020-01-01T00:00:00"\n    approver: "test"`);

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

    await artifactCommand(["reset", changeDir, "proposal"]);

    // record 已清除
    const state = await readState(changeDir);
    expect(state.records).toHaveLength(0);

    // 文件已删除
    expect(existsSync(join(changeDir, "proposal.md"))).toBe(false);

    expect(logs.some((l) => l.includes("hash record cleared"))).toBe(true);
    expect(logs.some((l) => l.includes("file deleted"))).toBe(true);
    logSpy.mockRestore();
  });

  it("specs（目录）重置时递归删除", async () => {
    const specsDir = join(changeDir, "specs");
    await mkdir(specsDir, { recursive: true });
    await writeFile(join(specsDir, "spec1.md"), "spec content", "utf-8");
    await setupState(`records:\n  - artifact: specs\n    hash: "def456"\n    committed_at: "2020-01-01T00:00:00"\n    approver: "test"`);

    await artifactCommand(["reset", changeDir, "specs"]);

    expect(existsSync(specsDir)).toBe(false);

    const state = await readState(changeDir);
    expect(state.records).toHaveLength(0);
  });

  it("制品文件不存在时仍清除 record", async () => {
    await setupState(`records:\n  - artifact: proposal\n    hash: "abc123"\n    committed_at: "2020-01-01T00:00:00"\n    approver: "test"`);

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

    await artifactCommand(["reset", changeDir, "proposal"]);

    const state = await readState(changeDir);
    expect(state.records).toHaveLength(0);

    expect(logs.some((l) => l.includes("hash record cleared"))).toBe(true);
    expect(logs.some((l) => l.includes("file not found"))).toBe(true);
    logSpy.mockRestore();
  });

  it("无 record 时跳过 record 清除", async () => {
    await writeFile(join(changeDir, "proposal.md"), "content", "utf-8");
    await setupState();

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

    await artifactCommand(["reset", changeDir, "proposal"]);

    expect(logs.some((l) => l.includes("no hash record found"))).toBe(true);
    logSpy.mockRestore();
  });

  it("未知制品名时 exit(1)", async () => {
    await setupState();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await artifactCommand(["reset", changeDir, "bogus"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("缺少参数时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await artifactCommand(["reset", changeDir]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
