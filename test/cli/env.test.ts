import { describe, it, expect } from "vitest";
import { detectEnv } from "../../src/cli/utils/env.js";

describe("env utils", () => {
  it("detectEnv 返回 Node.js 版本", () => {
    const env = detectEnv();
    expect(env.nodeVersion).toBeTruthy();
    // Node.js 版本号应包含数字
    expect(env.nodeVersion).toMatch(/^\d+\./);
  });

  it("detectEnv 返回 git 检测结果", () => {
    const env = detectEnv();
    expect(typeof env.gitInstalled).toBe("boolean");
  });

  it("detectEnv 返回 Claude Code 检测结果", () => {
    const env = detectEnv();
    expect(typeof env.claudeCodeInstalled).toBe("boolean");
  });
});
