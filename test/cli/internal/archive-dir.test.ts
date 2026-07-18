// test/cli/internal/archive-dir.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { archiveDirCommand } from "../../../src/cli/commands/internal/archive-dir.js";

describe("alloy _archive-dir", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "alloy-archive-dir-test-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("无参数 -> 用法 + exit 1", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveDirCommand([]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("用法: alloy _archive-dir"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("归档目录不存在 -> PRECONDITION_FAIL", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveDirCommand(["test-change"]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("归档目录不存在"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("找到归档目录 -> 输出相对路径", async () => {
    await mkdir("openspec/changes/archive/2026-07-18-test-change", { recursive: true });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await archiveDirCommand(["test-change"]);

    expect(logSpy).toHaveBeenCalledWith("openspec/changes/archive/2026-07-18-test-change");

    logSpy.mockRestore();
  });

  it("多个同名归档(不同日期)-> 取最新(日期最大)", async () => {
    await mkdir("openspec/changes/archive/2026-07-15-test-change", { recursive: true });
    await mkdir("openspec/changes/archive/2026-07-18-test-change", { recursive: true });
    await mkdir("openspec/changes/archive/2026-07-10-test-change", { recursive: true });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await archiveDirCommand(["test-change"]);

    expect(logSpy).toHaveBeenCalledWith("openspec/changes/archive/2026-07-18-test-change");

    logSpy.mockRestore();
  });

  it("change name 不匹配 -> PRECONDITION_FAIL", async () => {
    await mkdir("openspec/changes/archive/2026-07-18-other-change", { recursive: true });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveDirCommand(["test-change"]);

    expect(errSpy.mock.calls.some(c => String(c[0]).includes("归档目录不存在"))).toBe(true);
    expect(errSpy.mock.calls.some(c => String(c[0]).includes("*-test-change"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("change name 是另一个归档名的前缀 -> 不误匹配(endsWith 精确匹配)", async () => {
    // test-change 不应匹配 test-change-v2
    await mkdir("openspec/changes/archive/2026-07-18-test-change-v2", { recursive: true });

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await archiveDirCommand(["test-change"]);

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    errSpy.mockRestore();
  });
});
