// test/cli/internal/progress.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { progressCommand } from "../../../src/cli/commands/internal/progress.js";

describe("alloy _progress artifacts", () => {
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
    tmpDir = join(tmpdir(), `alloy-progress-test-${Date.now()}`);
    changeDir = join(tmpDir, "test-change");
    await mkdir(changeDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("空 change 全部 missing", async () => {
    await setupState();
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

    await progressCommand(["artifacts", changeDir]);

    expect(logs).toContain("draft:missing");
    expect(logs).toContain("proposal:missing");
    logSpy.mockRestore();
  });

  it("制品存在且 hash 匹配时输出 done", async () => {
    const { createHash } = await import("node:crypto");
    const content = "draft content";
    const hash = createHash("sha256").update(content).digest("hex").substring(0, 12);

    await writeFile(join(changeDir, "draft.md"), content, "utf-8");
    await setupState(`records:\n  - artifact: draft\n    hash: "${hash}"\n    committed_at: "2020-01-01T00:00:00"\n    approver: "test"`);

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

    await progressCommand(["artifacts", changeDir]);

    expect(logs).toContain(`draft:done:${hash}`);
    logSpy.mockRestore();
  });

  it("制品存在但无 record 时输出 pending", async () => {
    await writeFile(join(changeDir, "draft.md"), "some content", "utf-8");
    await setupState();

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

    await progressCommand(["artifacts", changeDir]);

    expect(logs).toContain("draft:pending");
    logSpy.mockRestore();
  });

  it("制品存在但 hash 不匹配时输出 hash-mismatch", async () => {
    await writeFile(join(changeDir, "draft.md"), "real content", "utf-8");
    await setupState(`records:\n  - artifact: draft\n    hash: "wronghash123"\n    committed_at: "2020-01-01T00:00:00"\n    approver: "test"`);

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));

    await progressCommand(["artifacts", changeDir]);

    expect(logs.some((l) => l.startsWith("draft:hash-mismatch:"))).toBe(true);
    logSpy.mockRestore();
  });

  it("缺少参数时 exit(1)", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await progressCommand(["artifacts"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
