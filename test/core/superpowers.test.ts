// test/core/superpowers.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
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
import { getPackageRoot } from "../../src/utils/fs.js";
import { detectSkill } from "../../src/core/detect-installations.js";
import { promptConfirm } from "../../src/utils/prompt.js";
import { installSuperpowers } from "../../src/core/superpowers.js";
import type { AgentInfo } from "../../src/core/types.js";

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

  it("检测到已有安装(version=null)且用户拒绝重装时返回 skipped", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-skill", path: "/home/.claude/skills/brainstorming", version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "skipped", location: "用户级 skill" });
    expect(promptConfirm).toHaveBeenCalledWith(
      expect.stringContaining("覆盖现有 skill 文件"),
      false
    );
    expect(execSync).not.toHaveBeenCalled();
  });

  it("检测到已有安装(version=null)且用户接受重装时继续安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-skill", path: "/home/.claude/skills/brainstorming", version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(true);
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(execSync).toHaveBeenCalled();
  });

  it("检测到 v5 plugin 时问是否更新到 v6,选不更新返回 skipped", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "5.1.0",
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "skipped", version: "5.1.0", location: "用户级 plugin" });
    expect(promptConfirm).toHaveBeenCalledWith(
      expect.stringContaining("检测到 Superpowers v5.1.0"),
      false
    );
    expect(promptConfirm).toHaveBeenCalledWith(
      expect.stringContaining("是否更新到 v6"),
      false
    );
  });

  it("检测到 v5 plugin 时选更新继续安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "5.1.0",
    });
    vi.mocked(promptConfirm).mockResolvedValue(true);
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("npx skills add obra/superpowers"),
      expect.any(Object)
    );
  });

  it("检测到 v4 plugin 时按 v5 分支问更新(major<6 通用)", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "4.0.0",
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "skipped", version: "4.0.0", location: "用户级 plugin" });
    expect(promptConfirm).toHaveBeenCalledWith(
      expect.stringContaining("是否更新到 v6"),
      false
    );
  });

  it("检测到 v6 plugin 时走现有是否覆盖逻辑,选不覆盖返回 skipped", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "6.1.1",
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", claudeAgent, "/test/project");

    expect(result).toEqual({ status: "skipped", version: "6.1.1", location: "用户级 plugin" });
    expect(promptConfirm).toHaveBeenCalledWith("检测到 Superpowers v6.1.1,是否覆盖安装?", false);
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
