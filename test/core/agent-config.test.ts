// test/core/agent-config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  injectAgentConfigs,
  buildInjectionContent,
  INJECTION_MARKER_START,
  INJECTION_MARKER_END,
} from "../../src/core/agent-config.js";
import type { AgentInfo, DeployOptions } from "../../src/core/types.js";

const claudeCode: AgentInfo = {
  id: "claude-code", label: "Claude Code", supportsColonCommands: true,
  commandsDir: ".claude/commands/", instructionFile: "CLAUDE.md",
  instructionFormat: "md", interactiveTool: "askuserquestion",
  settingsFile: ".claude/settings.json",
  settingsContent: { worktree: { baseRef: "head" } },
};

const cursor: AgentInfo = {
  id: "cursor", label: "Cursor", supportsColonCommands: false,
  commandsDir: ".cursor/commands/", instructionFile: ".cursor/rules/alloy.mdc",
  instructionFormat: "mdc", interactiveTool: "partial",
};

const opencode: AgentInfo = {
  id: "opencode", label: "OpenCode", supportsColonCommands: false,
  commandsDir: ".opencode/commands/", instructionFile: "AGENTS.md",
  instructionFormat: "md", interactiveTool: "question",
};

const codex: AgentInfo = {
  id: "codex", label: "Codex", supportsColonCommands: false,
  commandsDir: ".codex/prompts/", instructionFile: "AGENTS.md",
  instructionFormat: "md", interactiveTool: "none",
};

const codebuddy: AgentInfo = {
  id: "codebuddy", label: "CodeBuddy", supportsColonCommands: true,
  commandsDir: ".codebuddy/commands/", instructionFile: "AGENTS.md",
  instructionFormat: "md", interactiveTool: "none",
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("buildInjectionContent", () => {
  it("low 档只有 1 条 Iron Law（交互条款）", () => {
    const content = buildInjectionContent(claudeCode, "low", false);
    const lawLines = content.split("\n").filter(l => l.startsWith("- ") && !l.startsWith("- /"));
    expect(lawLines).toHaveLength(1);
    expect(content).toContain("AskUserQuestion");
    expect(content).not.toContain("阶段流转");
  });

  it("medium 档有 3 条 Iron Law，无阶段流转", () => {
    const content = buildInjectionContent(claudeCode, "medium", false);
    const lawLines = content.split("\n").filter(l => l.startsWith("- ") && !l.startsWith("- /"));
    expect(lawLines).toHaveLength(3);
    expect(content).toContain("_guard");
    expect(content).toContain("_artifact commit");
    expect(content).not.toContain("阶段流转");
  });

  it("high 档有 5 条 Iron Law + 阶段流转", () => {
    const content = buildInjectionContent(claudeCode, "high", false);
    const lawLines = content.split("\n").filter(l => l.startsWith("- ") && !l.startsWith("- /"));
    expect(lawLines).toHaveLength(5);
    expect(content).toContain("git reset --hard");
    expect(content).toContain("git add");
    expect(content).toContain("阶段流转");
  });

  it("冒号命令 agent 非共享时用 /alloy:start", () => {
    const content = buildInjectionContent(claudeCode, "medium", false);
    expect(content).toContain("/alloy:start");
    expect(content).not.toContain("/alloy-start");
  });

  it("横线命令 agent 非共享时用 /alloy-start", () => {
    const content = buildInjectionContent(cursor, "medium", false);
    expect(content).toContain("/alloy-start");
    expect(content).not.toContain("/alloy:start");
  });

  it("共享文件命令名双行并列（冒号版或横线版）", () => {
    const content = buildInjectionContent(opencode, "medium", true);
    expect(content).toContain("/alloy:start");
    expect(content).toContain("/alloy-start");
    expect(content).toContain("或");
  });

  it("共享文件取最宽松交互措辞（不提具体工具名）", () => {
    const content = buildInjectionContent(opencode, "low", true);
    expect(content).toContain("优先用交互选择工具");
    expect(content).not.toContain("question");
  });

  it("非共享文件按 agent 的 interactiveTool 适配", () => {
    const noneContent = buildInjectionContent(codex, "low", false);
    expect(noneContent).toContain("无专用交互选择工具");

    const askContent = buildInjectionContent(claudeCode, "low", false);
    expect(askContent).toContain("AskUserQuestion");

    const partialContent = buildInjectionContent(cursor, "low", false);
    expect(partialContent).toContain("提问");

    const questionContent = buildInjectionContent(opencode, "low", false);
    expect(questionContent).toContain("question");
  });
});

describe("injectAgentConfigs", () => {
  let tmpDir: string;
  let opts: DeployOptions;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-agent-config-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    opts = { scope: "project", injectDepth: "medium", projectPath: tmpDir, targetAgents: [] };
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("targetAgents 为空时不报错", async () => {
    await expect(injectAgentConfigs(opts, "medium")).resolves.not.toThrow();
  });

  it("Claude Code 注入 CLAUDE.md + .claude/settings.json", async () => {
    opts.targetAgents = [claudeCode];
    await injectAgentConfigs(opts, "medium");

    const md = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(md).toContain(INJECTION_MARKER_START);
    expect(md).toContain("/alloy:start");

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    expect(settings.worktree.baseRef).toBe("head");
  });

  it("Cursor 注入 .cursor/rules/alloy.mdc 且带 frontmatter", async () => {
    opts.targetAgents = [cursor];
    await injectAgentConfigs(opts, "medium");

    const mdc = await readFile(join(tmpDir, ".cursor/rules/alloy.mdc"), "utf-8");
    expect(mdc.startsWith("---")).toBe(true);
    expect(mdc).toContain("alwaysApply: true");
    expect(mdc).toContain(INJECTION_MARKER_START);
    expect(mdc).toContain("/alloy-start");
  });

  it("opencode + codex 共享 AGENTS.md 只写一次，取最宽松措辞 + 双行命令", async () => {
    opts.targetAgents = [opencode, codex];
    await injectAgentConfigs(opts, "low");

    const md = await readFile(join(tmpDir, "AGENTS.md"), "utf-8");
    const startMatches = md.match(new RegExp(escapeRegex(INJECTION_MARKER_START), "g"));
    expect(startMatches).toHaveLength(1);
    expect(md).toContain("优先用交互选择工具");
    expect(md).toContain("/alloy:start");
    expect(md).toContain("/alloy-start");
  });

  it("codebuddy + codex 共享 AGENTS.md 命令名双行（覆盖冒号+横线混合）", async () => {
    opts.targetAgents = [codebuddy, codex];
    await injectAgentConfigs(opts, "medium");

    const md = await readFile(join(tmpDir, "AGENTS.md"), "utf-8");
    expect(md).toContain("/alloy:start");
    expect(md).toContain("/alloy-start");
    expect(md).toContain("或");
  });

  it("已有用户内容的文件，注入追加且不破坏原内容", async () => {
    await writeFile(join(tmpDir, "CLAUDE.md"), "# My Project\n\n用户内容", "utf-8");
    opts.targetAgents = [claudeCode];
    await injectAgentConfigs(opts, "medium");

    const md = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(md).toContain("# My Project");
    expect(md).toContain("用户内容");
    expect(md).toContain(INJECTION_MARKER_START);
  });

  it("幂等：二次注入只替换标记区域，不重复", async () => {
    opts.targetAgents = [claudeCode];
    await injectAgentConfigs(opts, "medium");
    await injectAgentConfigs(opts, "medium");

    const md = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");
    const startMatches = md.match(new RegExp(escapeRegex(INJECTION_MARKER_START), "g"));
    expect(startMatches).toHaveLength(1);
  });

  it("深度变更时幂等替换", async () => {
    opts.targetAgents = [claudeCode];
    await injectAgentConfigs(opts, "low");
    await injectAgentConfigs(opts, "high");

    const md = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(md).toContain("阶段流转");
    expect(md).toContain("git reset --hard");
    const startMatches = md.match(new RegExp(escapeRegex(INJECTION_MARKER_START), "g"));
    expect(startMatches).toHaveLength(1);
  });

  it("Cursor mdc 已有 frontmatter 时保留用户 frontmatter", async () => {
    await mkdir(join(tmpDir, ".cursor/rules"), { recursive: true });
    await writeFile(
      join(tmpDir, ".cursor/rules/alloy.mdc"),
      "---\ndescription: 用户自定义\n---\n用户内容",
      "utf-8"
    );
    opts.targetAgents = [cursor];
    await injectAgentConfigs(opts, "medium");

    const mdc = await readFile(join(tmpDir, ".cursor/rules/alloy.mdc"), "utf-8");
    expect(mdc).toContain("用户自定义");
    expect(mdc).not.toContain("Alloy 开发工作流规则");
    expect(mdc).toContain(INJECTION_MARKER_START);
  });

  it("settings.json 已有配置时深合并不覆盖", async () => {
    await mkdir(join(tmpDir, ".claude"), { recursive: true });
    await writeFile(
      join(tmpDir, ".claude/settings.json"),
      JSON.stringify({ permissions: { allow: ["npm test"] }, worktree: { foo: "bar" } }),
      "utf-8"
    );
    opts.targetAgents = [claudeCode];
    await injectAgentConfigs(opts, "medium");

    const settings = JSON.parse(await readFile(join(tmpDir, ".claude/settings.json"), "utf-8"));
    expect(settings.permissions.allow).toContain("npm test");
    expect(settings.worktree.foo).toBe("bar");
    expect(settings.worktree.baseRef).toBe("head");
  });
});
