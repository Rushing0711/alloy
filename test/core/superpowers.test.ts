// test/core/superpowers.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("../../src/core/health.js", () => ({
  checkSuperpowers: vi.fn(),
}));
vi.mock("../../src/core/compat.js", () => ({
  loadCompat: vi.fn(),
}));
vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));

import { execSync } from "node:child_process";
import { checkSuperpowers } from "../../src/core/health.js";
import { loadCompat } from "../../src/core/compat.js";
import { getPackageRoot } from "../../src/utils/fs.js";
import { installSuperpowers } from "../../src/core/superpowers.js";

const MOCK_CONFIG = {
  compatible: {
    node: ">=18.0.0",
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

describe("installSuperpowers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
  });

  it("已安装且兼容时跳过", async () => {
    vi.mocked(checkSuperpowers).mockResolvedValue({ installed: true, version: "5.1.0", compatible: true });

    const result = await installSuperpowers("project");
    expect(result).toBe("skipped");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("已安装但不兼容时重新安装", async () => {
    vi.mocked(checkSuperpowers).mockResolvedValue({ installed: true, version: "4.0.0", compatible: false });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project");
    expect(result).toBe("installed");
    expect(execSync).toHaveBeenCalled();
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("npx skills add obra/superpowers");
  });

  it("未安装时执行安装", async () => {
    vi.mocked(checkSuperpowers).mockResolvedValue({ installed: false, compatible: false });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project");
    expect(result).toBe("installed");
    expect(execSync).toHaveBeenCalled();
  });

  it("project scope 不含 -g flag", async () => {
    vi.mocked(checkSuperpowers).mockResolvedValue({ installed: false, compatible: false });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    await installSuperpowers("project");
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("-y");
    expect(cmd).not.toContain("-g");
    expect(cmd).toContain("--agent claude-code");
  });

  it("global scope 含 -g flag", async () => {
    vi.mocked(checkSuperpowers).mockResolvedValue({ installed: false, compatible: false });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    await installSuperpowers("global");
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("-g");
  });

  it("安装失败时返回 failed", async () => {
    vi.mocked(checkSuperpowers).mockResolvedValue({ installed: false, compatible: false });
    vi.mocked(execSync).mockImplementation(() => { throw new Error("network error"); });

    const result = await installSuperpowers("project");
    expect(result).toBe("failed");
  });
});
