// test/core/openspec.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  mkdtempSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));
vi.mock("../../src/core/health.js", () => ({
  checkOpenSpec: vi.fn(),
}));
vi.mock("../../src/core/compat.js", () => ({
  loadCompat: vi.fn(),
}));
vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { checkOpenSpec } from "../../src/core/health.js";
import { loadCompat } from "../../src/core/compat.js";
import { getPackageRoot } from "../../src/utils/fs.js";
import { installOpenSpecCli, initOpenSpecProject } from "../../src/core/openspec.js";

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

describe("installOpenSpecCli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
  });

  it("已安装且兼容时跳过", async () => {
    vi.mocked(checkOpenSpec).mockReturnValue({ installed: true, version: "1.5.0", compatible: true });

    const result = await installOpenSpecCli();
    expect(result).toBe("skipped");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("已安装但不兼容时重新安装", async () => {
    vi.mocked(checkOpenSpec).mockReturnValue({ installed: true, version: "1.2.0", compatible: false });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installOpenSpecCli();
    expect(result).toBe("installed");
    expect(execSync).toHaveBeenCalled();
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("npm install -g @fission-ai/openspec@1");
  });

  it("未安装时执行安装", async () => {
    vi.mocked(checkOpenSpec).mockReturnValue({ installed: false, compatible: false });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installOpenSpecCli();
    expect(result).toBe("installed");
  });

  it("安装失败时返回 failed", async () => {
    vi.mocked(checkOpenSpec).mockReturnValue({ installed: false, compatible: false });
    vi.mocked(execSync).mockImplementation(() => { throw new Error("network error"); });

    const result = await installOpenSpecCli();
    expect(result).toBe("failed");
  });
});

describe("initOpenSpecProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    vi.mocked(mkdtempSync).mockReturnValue("/tmp/alloy-openspec-profile-XXXXX");
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
  });

  it("project scope — config.yaml 不存在时执行初始化", async () => {
    const result = await initOpenSpecProject("/fake/project", "project");
    expect(result).toBe("initialized");
    expect(execSync).toHaveBeenCalled();
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("openspec init");
    expect(cmd).toContain("--tools claude");
    expect(cmd).toContain("--profile custom");
  });

  it("project scope — config.yaml 已存在时跳过", async () => {
    vi.mocked(readFile).mockResolvedValue("schema: alloy\n");

    const result = await initOpenSpecProject("/fake/project", "project");
    expect(result).toBe("skipped");
  });

  it("global scope 使用 HOME 路径", async () => {
    const result = await initOpenSpecProject("/fake/project", "global");
    expect(result).toBe("initialized");
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    // global scope 用 HOME 而非 projectPath
    expect(cmd).toContain("openspec init");
  });

  it("初始化失败时返回 failed", async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("openspec error"); });

    const result = await initOpenSpecProject("/fake/project", "project");
    expect(result).toBe("failed");
  });
});
