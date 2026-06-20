// test/core/git.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { ensureGitRepo } from "../../src/core/git.js";

describe("ensureGitRepo", () => {
  let tmpDir: string;
  const mockedExecSync = vi.mocked(execSync);

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-git-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    mockedExecSync.mockReset();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("已在 git 仓库中返回 exists，不调用 git init", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse")) return Buffer.from("");
      throw new Error("unexpected");
    });

    const result = ensureGitRepo(tmpDir);

    expect(result).toBe("exists");
    expect(mockedExecSync).toHaveBeenCalledTimes(1);
    expect(mockedExecSync.mock.calls[0][0]).toContain("rev-parse");
  });

  it("不在 git 仓库时调用 git init 返回 initialized", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse")) throw new Error("not a repo");
      if (cmd.includes("git init")) return Buffer.from("");
      throw new Error("unexpected");
    });

    const result = ensureGitRepo(tmpDir);

    expect(result).toBe("initialized");
    expect(mockedExecSync.mock.calls[0][0]).toContain("rev-parse");
    expect(mockedExecSync.mock.calls[1][0]).toContain("git init");
  });

  it("git init 失败时返回 failed", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse")) throw new Error("not a repo");
      if (cmd.includes("git init")) throw new Error("permission denied");
      throw new Error("unexpected");
    });

    const result = ensureGitRepo(tmpDir);

    expect(result).toBe("failed");
  });

  it("rev-parse 和 git init 都传入 projectPath 作为 cwd", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse")) throw new Error("not a repo");
      if (cmd.includes("git init")) return Buffer.from("");
      throw new Error("unexpected");
    });

    ensureGitRepo(tmpDir);

    expect(mockedExecSync.mock.calls[0][1]).toMatchObject({ cwd: tmpDir });
    expect(mockedExecSync.mock.calls[1][1]).toMatchObject({ cwd: tmpDir });
  });
});
