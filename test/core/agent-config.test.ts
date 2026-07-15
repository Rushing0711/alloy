// test/core/agent-config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { injectAgentConfigs, hasPermissionsConfig, writePermissionsConfig, ALLOY_PERMISSIONS, getPermissionSupportedAgents, hasHookConfig, writeHookConfig, getHookSupportedAgents, writePiHookExtension, hasPiHookExtension, writeOpenCodeHookTools, hasOpenCodeHookTools } from "../../src/core/agent-config.js";
import { getPackageRoot } from "../../src/utils/fs.js";

const expectedHookCommand = `node ${getPackageRoot()}/dist/cli/index.js _hook-guard`;
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

  it("OpenCode: 文件不存在时创建,含 $schema 在第一行", async () => {
    await writePermissionsConfig(tmpDir, "opencode");

    const raw = await readFile(join(tmpDir, "opencode.json"), "utf-8");
    const settings = JSON.parse(raw);
    expect(settings.$schema).toBe("https://opencode.ai/config.json");
    expect(settings.permission.bash["alloy *"]).toBe("allow");
    // $schema 应在第一行(OpenCode 惯例,IDE 优先识别)
    expect(raw.indexOf('"$schema"')).toBeLessThan(raw.indexOf('"permission"'));
  });

  it("OpenCode: 已有 $schema 时不覆盖(尊重用户自定义 URL)", async () => {
    const customSchema = "https://example.com/custom-schema.json";
    await writeFile(
      join(tmpDir, "opencode.json"),
      JSON.stringify({ $schema: customSchema, permission: { bash: { "existing *": "allow" } } }),
      "utf-8"
    );

    await writePermissionsConfig(tmpDir, "opencode");

    const settings = JSON.parse(await readFile(join(tmpDir, "opencode.json"), "utf-8"));
    expect(settings.$schema).toBe(customSchema);
    expect(settings.permission.bash["existing *"]).toBe("allow");
    expect(settings.permission.bash["alloy *"]).toBe("allow");
  });

  it("OpenCode: 已有 opencode.json 但无 $schema 时补上", async () => {
    await writeFile(
      join(tmpDir, "opencode.json"),
      JSON.stringify({ permission: { bash: { "existing *": "allow" } } }),
      "utf-8"
    );

    await writePermissionsConfig(tmpDir, "opencode");

    const settings = JSON.parse(await readFile(join(tmpDir, "opencode.json"), "utf-8"));
    expect(settings.$schema).toBe("https://opencode.ai/config.json");
    expect(settings.permission.bash["existing *"]).toBe("allow");
    expect(settings.permission.bash["alloy *"]).toBe("allow");
  });
});

describe("getPermissionSupportedAgents", () => {
  it("返回支持项目级 permissions 的 agent id 列表", () => {
    const agents = getPermissionSupportedAgents();
    expect(agents).toContain("claude-code");
    expect(agents).toContain("pi");
    expect(agents).not.toContain("codex");
    expect(agents).not.toContain("gemini-cli");
  });
});

describe("hasHookConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-hook-check-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("文件不存在时返回 false", async () => {
    expect(await hasHookConfig(tmpDir, "claude-code")).toBe(false);
  });

  it("有 alloy _hook-guard 时返回 true", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(
      join(tmpDir, ".claude/settings.json"),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: expectedHookCommand }] }] } }),
      "utf-8"
    );
    expect(await hasHookConfig(tmpDir, "claude-code")).toBe(true);
  });

  it("有其他 hook 但无 alloy -> false", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(
      join(tmpDir, ".claude/settings.json"),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: "other-hook" }] }] } }),
      "utf-8"
    );
    expect(await hasHookConfig(tmpDir, "claude-code")).toBe(false);
  });

  it("不支持的 agent id 返回 false", async () => {
    expect(await hasHookConfig(tmpDir, "unknown-agent")).toBe(false);
  });
});

describe("writeHookConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-hook-write-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("Claude Code: 文件不存在时创建并写入 PreToolUse hook", async () => {
    const written = await writeHookConfig(tmpDir, "claude-code");
    expect(written).toBe(true);

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    const preToolUse = settings.hooks.PreToolUse;
    expect(Array.isArray(preToolUse)).toBe(true);
    const alloyEntry = preToolUse.find((e: { matcher: string }) => e.matcher === "Write|Edit|AskUserQuestion");
    expect(alloyEntry).toBeTruthy();
    expect(alloyEntry.hooks.some((h: { command: string }) => h.command === expectedHookCommand)).toBe(true);
  });

  it("不支持的 agent id 返回 false", async () => {
    const written = await writeHookConfig(tmpDir, "unknown-agent");
    expect(written).toBe(false);
  });

  it("幂等：二次写入不重复", async () => {
    await writeHookConfig(tmpDir, "claude-code");
    await writeHookConfig(tmpDir, "claude-code");

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    const preToolUse = settings.hooks.PreToolUse;
    const alloyEntries = preToolUse.filter((e: { matcher: string; hooks: { command: string }[] }) =>
      e.matcher === "Write|Edit|AskUserQuestion" && e.hooks.some((h) => h.command === expectedHookCommand)
    );
    expect(alloyEntries).toHaveLength(1);
  });

  it("保留现有配置(permissions/worktree)", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(
      join(tmpDir, ".claude/settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash(npm test *)"] }, worktree: { baseRef: "head" } }),
      "utf-8"
    );

    await writeHookConfig(tmpDir, "claude-code");

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    expect(settings.permissions.allow).toContain("Bash(npm test *)");
    expect(settings.worktree.baseRef).toBe("head");
    expect(settings.hooks.PreToolUse).toBeTruthy();
  });

  it("已有其他 PreToolUse hook -> 合并到同 matcher 的 hooks 数组", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(
      join(tmpDir, ".claude/settings.json"),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command: "other-hook" }] }] } }),
      "utf-8"
    );

    await writeHookConfig(tmpDir, "claude-code");

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    const entry = settings.hooks.PreToolUse.find((e: { matcher: string }) => e.matcher === "Write|Edit|AskUserQuestion");
    expect(entry.hooks).toHaveLength(2);
    expect(entry.hooks.some((h: { command: string }) => h.command === "other-hook")).toBe(true);
    expect(entry.hooks.some((h: { command: string }) => h.command === expectedHookCommand)).toBe(true);
  });
});

describe("getHookSupportedAgents", () => {
  it("返回支持 hook 闸门的 agent id 列表(3 个)", () => {
    const agents = getHookSupportedAgents();
    expect(agents).toContain("claude-code");
    expect(agents).toContain("pi");
    expect(agents).toContain("opencode");
    expect(agents).toHaveLength(3);
  });
});

describe("writePiHookExtension / hasPiHookExtension", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-pi-hook-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("未装时 hasPiHookExtension -> false", async () => {
    expect(await hasPiHookExtension(tmpDir)).toBe(false);
  });

  it("writePiHookExtension -> 写 .pi/extensions/alloy-guard.ts + hasPiHookExtension -> true", async () => {
    await writePiHookExtension(tmpDir);
    expect(await hasPiHookExtension(tmpDir)).toBe(true);
    const content = await readFile(join(tmpDir, ".pi", "extensions", "alloy-guard.ts"), "utf-8");
    expect(content).toContain("_hook-guard");
    expect(content).toContain("tool_call");
  });

  it("writePiHookExtension 幂等(重复写不报错)", async () => {
    await writePiHookExtension(tmpDir);
    await writePiHookExtension(tmpDir);
    expect(await hasPiHookExtension(tmpDir)).toBe(true);
  });
});

describe("writeOpenCodeHookTools / hasOpenCodeHookTools", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-opencode-hook-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("未装时 hasOpenCodeHookTools -> false", async () => {
    expect(await hasOpenCodeHookTools(tmpDir)).toBe(false);
  });

  it("writeOpenCodeHookTools -> 写 alloy-guard.ts plugin + hasOpenCodeHookTools -> true", async () => {
    await writeOpenCodeHookTools(tmpDir);
    expect(await hasOpenCodeHookTools(tmpDir)).toBe(true);
    const pluginContent = await readFile(join(tmpDir, ".opencode", "plugins", "alloy-guard.ts"), "utf-8");
    expect(pluginContent).toContain("_hook-guard");
    expect(pluginContent).toContain("tool.execute.before");
    expect(pluginContent).toContain("session.idle");
    expect(pluginContent).toContain("Write");
    expect(pluginContent).toContain("Edit");
    // OpenCode write/edit 工具参数名是 filePath(驼峰),plugin 必须取这个字段才能拦截
    expect(pluginContent).toContain("args?.filePath");
  });

  it("writeOpenCodeHookTools 幂等", async () => {
    await writeOpenCodeHookTools(tmpDir);
    await writeOpenCodeHookTools(tmpDir);
    expect(await hasOpenCodeHookTools(tmpDir)).toBe(true);
  });
});

describe("hasHookConfig/writeHookConfig 分派(pi/opencode)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-hook-dispatch-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("hasHookConfig(pi) 调 hasPiHookExtension", async () => {
    expect(await hasHookConfig(tmpDir, "pi")).toBe(false);
    await writeHookConfig(tmpDir, "pi");
    expect(await hasHookConfig(tmpDir, "pi")).toBe(true);
  });

  it("hasHookConfig(opencode) 调 hasOpenCodeHookTools", async () => {
    expect(await hasHookConfig(tmpDir, "opencode")).toBe(false);
    await writeHookConfig(tmpDir, "opencode");
    expect(await hasHookConfig(tmpDir, "opencode")).toBe(true);
  });
});
