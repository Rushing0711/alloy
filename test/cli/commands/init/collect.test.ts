import { describe, it, expect, vi, beforeEach } from "vitest";
import { join } from "node:path";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:os", async () => {
  const actual = await vi.importActual("node:os");
  return { ...actual, homedir: vi.fn() };
});
vi.mock("../../../../src/core/detect.js", () => ({
  detectEnv: vi.fn(),
}));
vi.mock("../../../../src/core/compat.js", () => ({
  loadCompat: vi.fn(),
}));
vi.mock("../../../../src/core/health.js", () => ({
  checkOpenSpec: vi.fn(),
}));
vi.mock("../../../../src/cli/utils/state.js", () => ({
  readProjectConfig: vi.fn(),
}));
vi.mock("../../../../src/core/git.js", () => ({
  isHeadUnborn: vi.fn(),
}));
vi.mock("../../../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));

import { homedir } from "node:os";
import { detectEnv } from "../../../../src/core/detect.js";
import { loadCompat } from "../../../../src/core/compat.js";
import { checkOpenSpec } from "../../../../src/core/health.js";
import { readProjectConfig } from "../../../../src/cli/utils/state.js";
import { isHeadUnborn } from "../../../../src/core/git.js";
import { collect, collectForUpdate } from "../../../../src/cli/commands/init/collect.js";

const HOME = "/home/user";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(homedir).mockReturnValue(HOME);
  vi.mocked(detectEnv).mockReturnValue({
    nodeVersion: "20.0.0",
    gitVersion: "2.40.0",
    gitInstalled: true,
  });
  vi.mocked(loadCompat).mockResolvedValue({
    compatible: {
      node: ">=18.0.0",
      git: ">=2.20.0",
      openspec: ">=1.3.0 <2.0.0",
      superpowers: ">=5.0.0 <7.0.0",
      alloy: ">=0.3.0",
      schema: 1,
    },
    install: { openspec: "@fission-ai/openspec@1", superpowers: "obra/superpowers@6" },
  });
  vi.mocked(checkOpenSpec).mockReturnValue({
    installed: true,
    version: "1.5.0",
    compatible: true,
  });
  vi.mocked(readProjectConfig).mockResolvedValue({ alloy: {} });
  vi.mocked(isHeadUnborn).mockReturnValue(false);
});

describe("collect", () => {
  it("Node 满足 18+ 时 nodeOk=true", async () => {
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitVersion: "2.40.0",
      gitInstalled: true,
    });
    const result = await collect("/test/project");
    expect(result.env.nodeOk).toBe(true);
  });

  it("Node < 18 时 nodeOk=false", async () => {
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "16.0.0",
      gitVersion: "2.40.0",
      gitInstalled: true,
    });
    const result = await collect("/test/project");
    expect(result.env.nodeOk).toBe(false);
  });

  it("Git 满足 2.20+ 时 gitOk=true", async () => {
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitVersion: "2.40.0",
      gitInstalled: true,
    });
    const result = await collect("/test/project");
    expect(result.env.gitOk).toBe(true);
  });

  it("Git < 2.20 时 gitOk=false", async () => {
    vi.mocked(detectEnv).mockReturnValue({
      nodeVersion: "20.0.0",
      gitVersion: "2.10.0",
      gitInstalled: true,
    });
    const result = await collect("/test/project");
    expect(result.env.gitOk).toBe(false);
  });

  it("当前目录是 $HOME 时 dirRejected=true", async () => {
    const result = await collect(HOME);
    expect(result.dirRejected).toBe(true);
  });

  it("当前目录是 $HOME 下隐藏目录时 dirRejected=true", async () => {
    const result = await collect(join(HOME, ".claude"));
    expect(result.dirRejected).toBe(true);
  });

  it("当前目录是正常项目目录时 dirRejected=false", async () => {
    const result = await collect("/test/project");
    expect(result.dirRejected).toBe(false);
  });

  it("OpenSpec CLI 版本不满足 compat 时 needsUpgrade=true", async () => {
    vi.mocked(checkOpenSpec).mockReturnValue({
      installed: true,
      version: "1.0.0",
      compatible: false,
    });
    const result = await collect("/test/project");
    expect(result.openSpecCli.needsUpgrade).toBe(true);
  });

  it("已有 main_branch 时 existingMainBranch 有值", async () => {
    vi.mocked(readProjectConfig).mockResolvedValue({
      alloy: { main_branch: "master" },
    });
    const result = await collect("/test/project");
    expect(result.git.existingMainBranch).toBe("master");
  });
});

describe("collectForUpdate", () => {
  it("返回 CollectResult,只采集 openSpecCli + git 状态", async () => {
    // mock detectEnv 不应被调用
    vi.mocked(detectEnv).mockReturnValue({ nodeVersion: "20.0.0", gitInstalled: true, gitVersion: "2.40.0" });
    vi.mocked(checkOpenSpec).mockReturnValue({ installed: true, version: "1.5.0", compatible: true });
    vi.mocked(isHeadUnborn).mockReturnValue(false);

    const result = await collectForUpdate("/test/project");

    expect(result.openSpecCli.installed).toBe(true);
    expect(result.git.exists).toBe(true);
    expect(result.git.headUnborn).toBe(false);
    // env 字段用默认值(update 不关心)
    expect(result.env.nodeVersion).toBe("");
    expect(result.dirRejected).toBe(false);
  });
});
