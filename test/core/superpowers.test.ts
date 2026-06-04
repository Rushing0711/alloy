// test/core/superpowers.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("../../src/core/compat.js", () => ({
  loadCompat: vi.fn(),
}));
vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));
vi.mock("../../src/core/detect-installations.js", () => ({
  detectSkill: vi.fn(),
}));
vi.mock("../../src/utils/prompt.js", () => ({
  promptConfirm: vi.fn(),
}));

import { execSync } from "node:child_process";
import { loadCompat } from "../../src/core/compat.js";
import { getPackageRoot } from "../../src/utils/fs.js";
import { detectSkill } from "../../src/core/detect-installations.js";
import { promptConfirm } from "../../src/utils/prompt.js";
import { installSuperpowers } from "../../src/core/superpowers.js";
import type { AgentInfo } from "../../src/core/types.js";

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

const claudeAgent: AgentInfo = {
  id: "claude-code",
  label: "Claude Code",
  supportsColonCommands: true,
  commandsDir: ".claude/commands/",
};

describe("installSuperpowers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
  });

  it("未传 agent/projectPath 时直接安装", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project");

    expect(result).toEqual({ status: "installed" });
    expect(detectSkill).not.toHaveBeenCalled();
    expect(execSync).toHaveBeenCalled();
  });

  it("未检测到已有安装时正常安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(detectSkill).toHaveBeenCalledWith("brainstorming", claudeAgent, "/test/project");
    expect(execSync).toHaveBeenCalled();
  });

  it("检测到已有安装且用户拒绝覆盖时返回 skipped", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-skill", path: "/home/.claude/skills/brainstorming", version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "skipped", location: "用户级 skill" });
    expect(promptConfirm).toHaveBeenCalledWith("     是否覆盖安装？", false);
    expect(execSync).not.toHaveBeenCalled();
  });

  it("检测到已有安装且用户接受覆盖时继续安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-skill", path: "/home/.claude/skills/brainstorming", version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(true);
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(execSync).toHaveBeenCalled();
  });

  it("检测到 plugin 版本满足要求时提示覆盖", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "5.1.0",
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "skipped", version: "5.1.0", location: "用户级 plugin" });
    expect(promptConfirm).toHaveBeenCalled();
  });

  it("检测到 plugin 版本不满足要求时直接继续安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "4.0.0",
    });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(promptConfirm).not.toHaveBeenCalled();
    expect(execSync).toHaveBeenCalled();
  });

  it("project scope 不含 -g flag", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    await installSuperpowers("project", claudeAgent, "/test/project");
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("-y");
    expect(cmd).not.toContain("-g");
    expect(cmd).toContain("--agent claude-code");
  });

  it("global scope 含 -g flag", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    await installSuperpowers("global", claudeAgent, "/test/project");
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("-g");
  });

  it("安装失败时返回 failed", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockImplementation(() => { throw new Error("network error"); });

    const result = await installSuperpowers("project", claudeAgent, "/test/project");
    expect(result).toEqual({ status: "failed" });
  });
});

describe("installSuperpowers — 检测逻辑", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
  });

  it("未传 agent/projectPath 时跳过检测", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project");

    expect(result).toEqual({ status: "installed" });
    expect(detectSkill).not.toHaveBeenCalled();
  });

  it("未检测到已有安装时正常安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(detectSkill).toHaveBeenCalledWith("brainstorming", claudeAgent, "/test/project");
  });

  it("检测到已有安装且用户拒绝覆盖时返回 skipped", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-skill", path: "/home/.claude/skills/brainstorming", version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "skipped", location: "用户级 skill" });
    expect(promptConfirm).toHaveBeenCalledWith("     是否覆盖安装？", false);
    expect(execSync).not.toHaveBeenCalled();
  });

  it("检测到已有安装且用户接受覆盖时继续安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-skill", path: "/home/.claude/skills/brainstorming", version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(true);
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(execSync).toHaveBeenCalled();
  });

  it("检测到 plugin 版本满足要求时提示覆盖", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "5.1.0",
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "skipped", version: "5.1.0", location: "用户级 plugin" });
    expect(promptConfirm).toHaveBeenCalled();
  });

  it("检测到 plugin 版本不满足要求时直接继续安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "4.0.0",
    });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(promptConfirm).not.toHaveBeenCalled();
    expect(execSync).toHaveBeenCalled();
  });
});
