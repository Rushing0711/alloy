// test/cli/internal/guard-parallel-phase.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { guardCommand } from "../../../src/cli/commands/internal/guard.js";

describe("alloy _guard parallel-phase", () => {
  let tmpDir: string;
  let changesDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-parallel-test-${Date.now()}`);
    changesDir = join(tmpDir, "openspec", "changes");
    await mkdir(changesDir, { recursive: true });
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function setupChange(name: string, phase: string, isArchived = false) {
    const dir = isArchived
      ? join(changesDir, "archive", `2026-07-19-${name}`)
      : join(changesDir, name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, ".alloy.yaml"),
      `phase: ${phase}\nschema_version: 1\nupdated_at: "2020-01-01T00:00:00"\n`,
      "utf-8");
  }

  it("缺参数 -> exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await guardCommand(["parallel-phase"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("0 个匹配 -> 输出 none", async () => {
    await setupChange("change-a", "started");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await guardCommand(["parallel-phase", "archived"]);
    expect(logSpy).toHaveBeenCalledWith("none");
    logSpy.mockRestore();
  });

  it("1 个匹配 -> 输出 single:<name>", async () => {
    await setupChange("change-a", "archived");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await guardCommand(["parallel-phase", "archived"]);
    expect(logSpy).toHaveBeenCalledWith("single:change-a");
    logSpy.mockRestore();
  });

  it("2 个匹配 -> 输出 parallel:2 + 列表", async () => {
    await setupChange("change-a", "archived");
    await setupChange("change-b", "archived");
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await guardCommand(["parallel-phase", "archived"]);
    expect(logs.some(l => l.includes("parallel:2"))).toBe(true);
    expect(logs.some(l => l.includes("change-a"))).toBe(true);
    expect(logs.some(l => l.includes("change-b"))).toBe(true);
    logSpy.mockRestore();
  });

  it("多 phase 逗号分隔(匹配 started+archived)", async () => {
    await setupChange("change-a", "started");
    await setupChange("change-b", "archived");
    await setupChange("change-c", "planned");
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await guardCommand(["parallel-phase", "started,archived"]);
    expect(logs.some(l => l.includes("parallel:2"))).toBe(true);
    expect(logs.some(l => l.includes("change-a"))).toBe(true);
    expect(logs.some(l => l.includes("change-b"))).toBe(true);
    // change-c 是 planned,不在 started/archived 列表,不应出现
    expect(logs.some(l => l.includes("change-c"))).toBe(false);
    logSpy.mockRestore();
  });

  it("--exclude 排除当前 change", async () => {
    await setupChange("change-a", "archived");
    await setupChange("change-b", "archived");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await guardCommand(["parallel-phase", "archived", "--exclude", "change-a"]);
    expect(logSpy).toHaveBeenCalledWith("single:change-b");
    logSpy.mockRestore();
  });

  it("归档 change(archive/)也被扫描", async () => {
    await setupChange("change-active", "archived");
    await setupChange("change-archived", "archived", true);
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await guardCommand(["parallel-phase", "archived"]);
    expect(logs.some(l => l.includes("parallel:2"))).toBe(true);
    // 归档 change 名剥离 YYYY-MM-DD- 前缀
    expect(logs.some(l => l.includes("change-archived"))).toBe(true);
    logSpy.mockRestore();
  });
});
