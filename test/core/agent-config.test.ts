// test/core/agent-config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { injectAgentConfigs } from "../../src/core/agent-config.js";
import type { AgentInfo, DeployOptions } from "../../src/core/types.js";

const claudeCode: AgentInfo = {
  id: "claude-code", label: "Claude Code", supportsColonCommands: true,
  commandsDir: ".claude/commands/",
  interactiveTool: "askuserquestion",
  settingsFile: ".claude/settings.json",
  settingsContent: { worktree: { baseRef: "head" } },
};

describe("injectAgentConfigs", () => {
  let tmpDir: string;
  let opts: DeployOptions;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-agent-config-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    opts = { scope: "project", projectPath: tmpDir, targetAgents: [] };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("targetAgents 为空时不报错", async () => {
    await expect(injectAgentConfigs(opts)).resolves.not.toThrow();
  });

  it("Claude Code 注入 .claude/settings.json 的 worktree.baseRef", async () => {
    opts.targetAgents = [claudeCode];
    await injectAgentConfigs(opts);

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    expect(settings.worktree.baseRef).toBe("head");
  });

  it("settings.json 已有配置时深合并不覆盖", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(
      join(tmpDir, ".claude/settings.json"),
      JSON.stringify({ permissions: { allow: ["npm test"] }, worktree: { foo: "bar" } }),
      "utf-8"
    );
    opts.targetAgents = [claudeCode];
    await injectAgentConfigs(opts);

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    expect(settings.permissions.allow).toContain("npm test");
    expect(settings.worktree.foo).toBe("bar");
    expect(settings.worktree.baseRef).toBe("head");
  });

  it("幂等：二次注入不重复写入", async () => {
    opts.targetAgents = [claudeCode];
    await injectAgentConfigs(opts);
    await injectAgentConfigs(opts);

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    expect(settings.worktree.baseRef).toBe("head");
  });
});
