// test/core/superpowers.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  cpSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: vi.fn() };
});
vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));
vi.mock("../../src/core/agents.js", () => ({
  getSkillTargetDir: vi.fn(),
}));

import { execSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { getPackageRoot } from "../../src/utils/fs.js";
import { getSkillTargetDir } from "../../src/core/agents.js";
import { installSuperpowers } from "../../src/core/superpowers.js";
import type { AgentInfo } from "../../src/core/types.js";

const claudeAgent: AgentInfo = {
  id: "claude-code", label: "Claude Code", supportsColonCommands: true, commandsDir: ".claude/commands/"};
const opencodeAgent: AgentInfo = {
  id: "opencode", label: "OpenCode", supportsColonCommands: false, commandsDir: ".opencode/commands/", globalBase: ".config/opencode"};
const piAgent: AgentInfo = {
  id: "pi", label: "Pi", supportsColonCommands: false, commandsDir: ".pi/prompts/", globalBase: ".pi/agent"};

describe("installSuperpowers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(homedir).mockReturnValue("/fake/home");
    vi.mocked(getSkillTargetDir).mockImplementation((agent, _scope, _projectPath) => {
      const base = agent.commandsDir.split("/")[0];
      return `/test/project/${base}/skills`;
    });
  });

  it("npx 成功时返回 installed", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("npx skills add obra/superpowers"),
      expect.any(Object)
    );
  });

  it("npx 成功时所有 agent 都装(只调一次 npx,不按 agent 分派)", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const agents = [claudeAgent, opencodeAgent, piAgent];
    const result = await installSuperpowers("project", agents, "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(execSync).toHaveBeenCalledTimes(1);
  });

  it("agents 为空时返回 skipped,不调 npx", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installSuperpowers("project", [], "/test/project");

    expect(result).toEqual({ status: "skipped" });
    expect(execSync).not.toHaveBeenCalled();
  });

  it("npx 失败时走 fallbackInstallAll,复制到 .agents/skills/ + claude-code/pi 各自目录", async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("network error"); });
    vi.mocked(cpSync).mockImplementation(() => undefined);

    const agents = [claudeAgent, opencodeAgent, piAgent];
    const result = await installSuperpowers("project", agents, "/test/project");

    expect(result).toEqual({ status: "installed" });
    expect(cpSync).toHaveBeenCalledWith(
      "/fake/package/vendor/superpowers/skills",
      "/test/project/.agents/skills",
      { recursive: true }
    );
    expect(cpSync).toHaveBeenCalledWith(
      "/fake/package/vendor/superpowers/skills",
      "/test/project/.claude/skills",
      { recursive: true }
    );
    expect(cpSync).toHaveBeenCalledWith(
      "/fake/package/vendor/superpowers/skills",
      "/test/project/.pi/skills",
      { recursive: true }
    );
    // opencode 不复制(读 .agents/skills/);cpSync 调用次数:.agents/ + claude-code + pi = 3 次
    expect(cpSync).toHaveBeenCalledTimes(3);
  });

  it("npx 失败 + scope=global 时,.agents/skills/ 装到 ~/.agents/skills/(不是 projectPath)", async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("network error"); });
    vi.mocked(cpSync).mockImplementation(() => undefined);
    vi.mocked(homedir).mockReturnValue("/fake/home");

    const agents = [claudeAgent, opencodeAgent, piAgent];
    const result = await installSuperpowers("global", agents, "/test/project");

    expect(result).toEqual({ status: "installed" });
    // .agents/skills/ 装到 home(scope=global),不是 projectPath
    expect(cpSync).toHaveBeenCalledWith(
      "/fake/package/vendor/superpowers/skills",
      "/fake/home/.agents/skills",
      { recursive: true }
    );
    // 不应装到 projectPath/.agents/skills/
    expect(cpSync).not.toHaveBeenCalledWith(
      "/fake/package/vendor/superpowers/skills",
      "/test/project/.agents/skills",
      { recursive: true }
    );
  });

  it("npx 失败且 vendor 不存在时返回 failed", async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("network error"); });
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await installSuperpowers("project", [claudeAgent], "/test/project");

    expect(result).toEqual({ status: "failed" });
  });

  it("npx 失败且 claude-code 复制失败时返回 partialFailures", async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("network error"); });
    vi.mocked(cpSync).mockImplementation((_src, dest) => {
      if (dest === "/test/project/.claude/skills") throw new Error("permission denied");
    });

    const result = await installSuperpowers("project", [claudeAgent, piAgent], "/test/project");

    expect(result.status).toBe("installed");
    expect(result.partialFailures).toEqual(["Claude Code"]);
  });

  it("project scope 不含 -g flag", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    await installSuperpowers("project", [claudeAgent], "/test/project");

    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("-y");
    expect(cmd).not.toContain("-g");
  });

  it("global scope 含 -g flag", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    await installSuperpowers("global", [claudeAgent], "/test/project");

    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("-g");
  });

  it("npx 命令不含 --agent(npx 一次装所有 agent)", async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    await installSuperpowers("project", [claudeAgent, opencodeAgent], "/test/project");

    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).not.toContain("--agent");
  });
});
