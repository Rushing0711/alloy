import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { detectEnv } from "../../src/core/detect.js";

describe("detectEnv", () => {
  const mockedExecSync = vi.mocked(execSync);

  beforeEach(() => {
    mockedExecSync.mockReset();
  });

  it("返回 nodeVersion 和 gitInstalled，不再返回 claudeCodeInstalled", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("git --version")) return Buffer.from("");
      throw new Error("unexpected: " + cmd);
    });

    const result = detectEnv();

    expect(result.nodeVersion).toBe(process.version.slice(1));
    expect(result.gitInstalled).toBe(true);
    expect(result).not.toHaveProperty("claudeCodeInstalled");
  });

  it("git 未安装时 gitInstalled 为 false", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const result = detectEnv();

    expect(result.gitInstalled).toBe(false);
  });
});
