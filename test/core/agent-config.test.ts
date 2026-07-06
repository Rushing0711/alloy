// test/core/agent-config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { injectAgentConfigs, hasPermissionsConfig, writePermissionsConfig, ALLOY_PERMISSIONS, getPermissionSupportedAgents } from "../../src/core/agent-config.js";
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

describe("hasPermissionsConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-perms-check-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("文件不存在时返回 false", async () => {
    expect(await hasPermissionsConfig(tmpDir, "claude-code")).toBe(false);
  });

  it("有 permissions.allow 非空时返回 true", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(
      join(tmpDir, ".claude/settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash(alloy *)"] } }),
      "utf-8"
    );
    expect(await hasPermissionsConfig(tmpDir, "claude-code")).toBe(true);
  });

  it("permissions.allow 为空数组时返回 false", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(
      join(tmpDir, ".claude/settings.json"),
      JSON.stringify({ permissions: { allow: [] } }),
      "utf-8"
    );
    expect(await hasPermissionsConfig(tmpDir, "claude-code")).toBe(false);
  });

  it("不支持的 agent id 返回 false", async () => {
    expect(await hasPermissionsConfig(tmpDir, "unknown-agent")).toBe(false);
  });

  it("CodeBuddy 检测 .codebuddy/settings.json", async () => {
    await mkdir(join(tmpDir, ".codebuddy"), { recursive: true });
    await writeFile(
      join(tmpDir, ".codebuddy/settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash(alloy *)"] } }),
      "utf-8"
    );
    expect(await hasPermissionsConfig(tmpDir, "codebuddy")).toBe(true);
  });

  it("Pi 检测 .pi/permissions.json", async () => {
    await mkdir(join(tmpDir, ".pi"), { recursive: true });
    await writeFile(
      join(tmpDir, ".pi/permissions.json"),
      JSON.stringify({ permissions: { allow: ["Bash(alloy *)"] } }),
      "utf-8"
    );
    expect(await hasPermissionsConfig(tmpDir, "pi")).toBe(true);
  });
});

describe("writePermissionsConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-perms-write-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("Claude Code: 文件不存在时创建并写入", async () => {
    const written = await writePermissionsConfig(tmpDir, "claude-code");
    expect(written).toBe(true);

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    expect(settings.permissions.allow).toContain("Bash(alloy *)");
    expect(settings.permissions.deny).toContain("Bash(git push --force *)");
    expect(settings.permissions.allow.length).toBe(ALLOY_PERMISSIONS.allow.length);
    expect(settings.permissions.deny.length).toBe(ALLOY_PERMISSIONS.deny.length);
  });

  it("CodeBuddy: 写入 .codebuddy/settings.json", async () => {
    const written = await writePermissionsConfig(tmpDir, "codebuddy");
    expect(written).toBe(true);

    const settings = JSON.parse(await readFile(join(tmpDir, ".codebuddy/settings.json"), "utf-8"));
    expect(settings.permissions.allow).toContain("Bash(alloy *)");
    expect(settings.permissions.deny).toContain("Bash(git push --force *)");
  });

  it("Pi: 写入 .pi/permissions.json", async () => {
    const written = await writePermissionsConfig(tmpDir, "pi");
    expect(written).toBe(true);

    const settings = JSON.parse(await readFile(join(tmpDir, ".pi/permissions.json"), "utf-8"));
    expect(settings.permissions.allow).toContain("Bash(alloy *)");
    expect(settings.permissions.deny).toContain("Bash(git push --force *)");
  });

  it("不支持的 agent id 返回 false 不报错", async () => {
    const written = await writePermissionsConfig(tmpDir, "unknown-agent");
    expect(written).toBe(false);
  });

  it("已有 permissions 时合并去重,不覆盖用户自定义条目", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(
      join(tmpDir, ".claude/settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash(npm test *)"], deny: ["Bash(custom-danger *)"] } }),
      "utf-8"
    );

    await writePermissionsConfig(tmpDir, "claude-code");

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    expect(settings.permissions.allow).toContain("Bash(npm test *)");
    expect(settings.permissions.allow).toContain("Bash(alloy *)");
    expect(settings.permissions.deny).toContain("Bash(custom-danger *)");
    expect(settings.permissions.deny).toContain("Bash(git push --force *)");
  });

  it("幂等：二次写入不重复", async () => {
    await writePermissionsConfig(tmpDir, "claude-code");
    await writePermissionsConfig(tmpDir, "claude-code");

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    const allowCount = settings.permissions.allow.length;
    expect(allowCount).toBe(ALLOY_PERMISSIONS.allow.length);
  });

  it("已有非 permissions 配置时保留(如 worktree)", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(
      join(tmpDir, ".claude/settings.json"),
      JSON.stringify({ worktree: { baseRef: "head" } }),
      "utf-8"
    );

    await writePermissionsConfig(tmpDir, "claude-code");

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    expect(settings.worktree.baseRef).toBe("head");
    expect(settings.permissions.allow).toContain("Bash(alloy *)");
  });
});

describe("getPermissionSupportedAgents", () => {
  it("返回支持项目级 permissions 的 agent id 列表", () => {
    const agents = getPermissionSupportedAgents();
    expect(agents).toContain("claude-code");
    expect(agents).toContain("codebuddy");
    expect(agents).toContain("pi");
    expect(agents).not.toContain("codex");
    expect(agents).not.toContain("gemini-cli");
  });
});
