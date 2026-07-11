// test/core/superpowers.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  cpSync: vi.fn(),
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
import { existsSync, cpSync } from "node:fs";
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

const opencodeAgent: AgentInfo = {
  id: "opencode",
  label: "OpenCode",
  supportsColonCommands: false,
  commandsDir: ".opencode/commands/",
  globalBase: ".config/opencode",
};

describe("installSuperpowers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
  });

  it("未检测到已有安装时正常安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(detectSkill).toHaveBeenCalledWith("brainstorming", claudeAgent, "/test/project");
    expect(execSync).toHaveBeenCalled();
  });

  it("检测到已有安装(version=null)且用户拒绝重装时返回 skipped", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-skill", path: "/home/.claude/skills/brainstorming", version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");

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

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(execSync).toHaveBeenCalled();
  });

  it("检测到 v5 plugin 时问是否更新到 v6,选不更新返回 skipped", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "5.1.0",
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");

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

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");

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

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");

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

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");

    expect(result).toEqual({ status: "skipped", version: "6.1.1", location: "用户级 plugin" });
    expect(promptConfirm).toHaveBeenCalledWith("检测到 Superpowers v6.1.1,是否覆盖安装?", false);
  });

  it("project scope 不含 -g flag", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    await installSuperpowers("project", [claudeAgent], "/test/project");
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("-y");
    expect(cmd).not.toContain("-g");
    expect(cmd).not.toContain("--agent");
  });

  it("global scope 含 -g flag", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    await installSuperpowers("global", [claudeAgent], "/test/project");
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("-g");
  });

  it("安装失败时返回 failed", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockImplementation(() => { throw new Error("network error"); });

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");
    expect(result).toEqual({ status: "failed" });
  });
});

describe("installSuperpowers 多 agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
  });

  it("遍历 agents 数组,每个 agent 都被处理并装 Superpowers", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const agents = [claudeAgent, opencodeAgent];
    const result = await installSuperpowers("project", agents, "/fake/project");

    expect(result.status).toBe("installed");
    // 验证每个 agent 都走了一遍检测 + 安装
    expect(detectSkill).toHaveBeenCalledWith("brainstorming", claudeAgent, "/fake/project");
    expect(detectSkill).toHaveBeenCalledWith("brainstorming", opencodeAgent, "/fake/project");
    // claude-code 调 npx(不含 --agent),opencode 走 fallback 不调 npx
    expect(execSync).toHaveBeenCalledTimes(1);
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("npx skills add obra/superpowers"),
      expect.any(Object)
    );
  });

  it("agents 为空数组时返回 skipped,不调用 detectSkill/execSync", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", [], "/test/project");

    expect(result).toEqual({ status: "skipped" });
    expect(detectSkill).not.toHaveBeenCalled();
    expect(execSync).not.toHaveBeenCalled();
  });

  it("部分 agent skipped 部分 installed 时聚合为 installed", async () => {
    // claude: 已装 v6,用户拒覆盖 -> skipped
    // opencode: 未装 -> fallback 复制 vendor -> installed
    vi.mocked(detectSkill).mockReturnValueOnce({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "6.1.1",
    }).mockReturnValueOnce({ found: false, location: null, path: null, version: null });
    vi.mocked(promptConfirm).mockResolvedValue(false); // 拒绝覆盖
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    vi.mocked(existsSync).mockReturnValueOnce(true); // vendor 存在(opencode fallback 调一次)
    vi.mocked(cpSync).mockImplementationOnce(() => undefined);

    const result = await installSuperpowers("project", [claudeAgent, opencodeAgent], "/test/project");

    expect(result.status).toBe("installed");
  });

  it("所有 agent 都 skipped 时聚合为 skipped(带首个 skipped 的 version/location)", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "6.1.1",
    });
    vi.mocked(promptConfirm).mockResolvedValue(false); // 全部拒覆盖

    const result = await installSuperpowers("project", [claudeAgent, opencodeAgent], "/test/project");

    expect(result.status).toBe("skipped");
    expect(result.version).toBe("6.1.1");
    expect(result.location).toBe("用户级 plugin");
  });

  it("部分 agent installed 部分 failed 时聚合为 installed + partialFailures(含失败 agent label)", async () => {
    // claude: 未装 -> npx 成功 -> installed
    // opencode: 未装 -> npx 抛错 -> fallbackInstall 也失败(vendor 不存在) -> failed
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync)
      .mockReturnValueOnce(Buffer.from(""))  // claude npx 成功
      .mockImplementation(() => { throw new Error("network error"); }); // opencode npx 失败
    // vendor 不存在 -> fallbackInstall 返回 failed
    vi.mocked(getPackageRoot).mockReturnValue("/nonexistent/package");

    const result = await installSuperpowers("project", [claudeAgent, opencodeAgent], "/test/project");

    expect(result.status).toBe("installed");
    expect(result.partialFailures).toEqual(["OpenCode"]);
  });

  it("全部 failed(无 installed)时聚合为 failed,无 partialFailures", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(execSync).mockImplementation(() => { throw new Error("network error"); });
    vi.mocked(getPackageRoot).mockReturnValue("/nonexistent/package");

    const result = await installSuperpowers("project", [claudeAgent, opencodeAgent], "/test/project");

    expect(result.status).toBe("failed");
    expect(result.partialFailures).toBeUndefined();
  });
});

describe("installSuperpowers force", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
  });

  it("force=true 检测到 v6 plugin 时跳过覆盖确认直接安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "6.1.1",
    });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", [claudeAgent], "/test/project", true);

    expect(result).toEqual({ status: "installed" });
    // force 跳过覆盖确认,不调用 promptConfirm
    expect(promptConfirm).not.toHaveBeenCalled();
    expect(execSync).toHaveBeenCalled();
  });

  it("force=true 检测到 v5 plugin 时跳过更新确认直接安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "5.1.0",
    });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", [claudeAgent], "/test/project", true);

    expect(result).toEqual({ status: "installed" });
    expect(promptConfirm).not.toHaveBeenCalled();
  });

  it("force=true 检测到手动安装(version=null)时跳过重装确认直接安装", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-skill", path: "/home/.claude/skills/brainstorming", version: null,
    });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", [claudeAgent], "/test/project", true);

    expect(result).toEqual({ status: "installed" });
    expect(promptConfirm).not.toHaveBeenCalled();
  });

  it("force=true 多 agent 均跳过覆盖确认", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "6.1.1",
    });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", [claudeAgent, opencodeAgent], "/test/project", true);

    expect(result.status).toBe("installed");
    expect(promptConfirm).not.toHaveBeenCalled();
  });

  it("force=undefined 时保留原确认逻辑(回归测试)", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/home/.claude/plugins/.../brainstorming", version: "6.1.1",
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");

    expect(result).toEqual({ status: "skipped", version: "6.1.1", location: "用户级 plugin" });
    expect(promptConfirm).toHaveBeenCalledWith("检测到 Superpowers v6.1.1,是否覆盖安装?", false);
  });
});
