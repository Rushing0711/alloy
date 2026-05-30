import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { detectEnv } from "../../src/core/detect.js";

describe("detectEnv", () => {
  it("detects Node.js version", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("") as any);
    const result = detectEnv();
    expect(result.nodeVersion).toBe(process.version.slice(1));
  });

  it("reports git installed when command succeeds", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("") as any);
    const result = detectEnv();
    expect(result.gitInstalled).toBe(true);
  });

  it("reports git not installed when command throws", () => {
    let callCount = 0;
    vi.mocked(execSync).mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error("not found");
      return Buffer.from("");
    });
    const result = detectEnv();
    expect(result.gitInstalled).toBe(false);
  });

  it("reports Claude Code installed when claude command succeeds", () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from("") as any);
    const result = detectEnv();
    expect(result.claudeCodeInstalled).toBe(true);
  });

  it("reports Claude Code not installed when claude command throws", () => {
    let callCount = 0;
    vi.mocked(execSync).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Buffer.from(""); // git succeeds
      if (callCount === 2) throw new Error("not found"); // claude fails
      return Buffer.from("");
    });
    const result = detectEnv();
    expect(result.gitInstalled).toBe(true);
    expect(result.claudeCodeInstalled).toBe(false);
  });

});
