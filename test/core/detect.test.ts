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

  it("返回 nodeVersion/gitVersion/gitInstalled", () => {
    mockedExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("git --version")) return "git version 2.39.0";
      throw new Error("unexpected: " + cmd);
    });

    const result = detectEnv();

    expect(result.nodeVersion).toBe(process.version.slice(1));
    expect(result.gitVersion).toBe("2.39.0");
    expect(result.gitInstalled).toBe(true);
  });

  it("git 未安装时 gitInstalled 为 false,gitVersion 为空", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const result = detectEnv();

    expect(result.gitInstalled).toBe(false);
    expect(result.gitVersion).toBe("");
  });
});
