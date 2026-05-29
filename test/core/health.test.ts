import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock 必须在 import 之前声明（ESM hoisting）
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));
vi.mock("../../src/core/compat.js", () => ({
  loadCompat: vi.fn(),
}));
vi.mock("../../src/core/detect.js", () => ({
  detectEnv: vi.fn(),
}));

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { loadCompat } from "../../src/core/compat.js";
import { detectEnv } from "../../src/core/detect.js";
import { runHealthCheck } from "../../src/core/health.js";

const MOCK_CONFIG = {
  compatible: {
    node: ">=18.0.0 <22.0.0",
    openspec: ">=1.3.0 <2.0.0",
    superpowers: ">=5.0.0 <6.0.0",
    alloy: ">=0.1.0",
    schema: 1,
  },
  install: {
    openspec: "@fission-ai/openspec@1",
    superpowers: "obra/superpowers@5",
  },
};

describe("runHealthCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回 7 项检查结果", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    expect(results).toHaveLength(7);
  });

  it("Node.js 版本不满足约束时应返回 fail", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "16.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const nodeResult = results.find((r) => r.name === "Node.js");
    expect(nodeResult).toBeDefined();
    expect(nodeResult!.status).toBe("fail");
  });

  it("Node.js 版本满足约束时应返回 pass", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const nodeResult = results.find((r) => r.name === "Node.js");
    expect(nodeResult!.status).toBe("pass");
  });

  it("OpenSpec 未安装时应返回 fail", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd === "openspec --version") throw new Error("not found");
      return Buffer.from("");
    });
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const osResult = results.find((r) => r.name === "OpenSpec");
    expect(osResult).toBeDefined();
    expect(osResult!.status).toBe("fail");
    expect(osResult!.current).toBe("未安装");
  });

  it("应检查环境（git + Claude Code）", async () => {
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
    vi.mocked(execSync).mockReturnValue(Buffer.from("1.3.1\n") as any);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ version: "0.1.0" })
    );
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitInstalled: false,
      claudeCodeInstalled: true,
    });
    vi.mocked(existsSync).mockReturnValue(true);

    const results = await runHealthCheck("/fake/packagedir", "/fake/project");
    const envResult = results.find((r) => r.name === "Environment");
    expect(envResult).toBeDefined();
    expect(envResult!.status).toBe("warn");
  });
});
