import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { existsSync } from "node:fs";
import {
  KNOWN_AGENTS,
  COMMAND_IDS,
  detectDeployedAgents,
  getSkillTargetDir,
  CLAUDE_CODE_AGENT,
  detectAgent,
} from "../../src/core/agents.js";

describe("KNOWN_AGENTS", () => {
  it("应包含 3 个 agent 定义", () => {
    expect(KNOWN_AGENTS).toHaveLength(3);
  });

  it("每个 agent 应有必需字段", () => {
    for (const agent of KNOWN_AGENTS) {
      expect(agent.id).toBeDefined();
      expect(agent.label).toBeDefined();
      expect(agent.supportsColonCommands).toBeDefined();
      expect(agent.commandsDir).toBeDefined();
    }
  });

  it("应包含 claude-code agent", () => {
    const claude = KNOWN_AGENTS.find((a) => a.id === "claude-code");
    expect(claude).toBeDefined();
    expect(claude?.supportsColonCommands).toBe(true);
    expect(claude?.commandsDir).toBe(".claude/commands/");
  });

  it("应包含 opencode agent（不支持冒号命令）", () => {
    const opencode = KNOWN_AGENTS.find((a) => a.id === "opencode");
    expect(opencode).toBeDefined();
    expect(opencode?.supportsColonCommands).toBe(false);
    expect(opencode?.commandsDir).toBe(".opencode/commands/");
  });
});

describe("COMMAND_IDS", () => {
  it("应包含 8 个命令 ID", () => {
    expect(COMMAND_IDS).toHaveLength(8);
  });

  it("应包含所有必需的命令", () => {
    const expected = ["start", "plan", "apply", "archive", "finish", "fix", "discard", "status"];
    expect(COMMAND_IDS).toEqual(expected);
  });
});

describe("detectDeployedAgents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("项目级：检测到支持冒号命令的 agent", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      const pathStr = path.toString();
      // 模拟 .claude/skills/alloy-start/SKILL.md 存在
      if (pathStr.endsWith(".claude/skills/alloy-start/SKILL.md")) return true;
      return false;
    });

    const agents = detectDeployedAgents("project", "/fake/project");
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("claude-code");
  });

  it("项目级：检测到不支持冒号命令的 agent", () => {
    vi.mocked(existsSync).mockImplementation((path) => {
      // 模拟 .opencode/skills/alloy-start/SKILL.md 存在
      if (path.toString().includes(".opencode/skills/alloy-start/SKILL.md")) return true;
      return false;
    });

    const agents = detectDeployedAgents("project", "/fake/project");
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("opencode");
  });

  it("项目级：未检测到任何 agent", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const agents = detectDeployedAgents("project", "/fake/project");
    expect(agents).toHaveLength(0);
  });

  it("全局级：应使用 HOME 路径", () => {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    vi.mocked(existsSync).mockImplementation((path) => {
      const pathStr = path.toString();
      // 检查是否使用了 HOME 路径
      if (pathStr.includes(home) && pathStr.endsWith(".claude/skills/alloy-start/SKILL.md")) return true;
      return false;
    });

    const agents = detectDeployedAgents("global", "/fake/project");
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe("claude-code");
  });
});

describe("getSkillTargetDir", () => {
  it("支持冒号命令的 agent：返回 skills 目录", () => {
    const agent = KNOWN_AGENTS.find((a) => a.id === "claude-code")!;
    const dir = getSkillTargetDir(agent, "project", "/fake/project");
    expect(dir).toBe("/fake/project/.claude/skills");
  });

  it("不支持冒号命令的 agent：也返回 skills 目录", () => {
    const agent = KNOWN_AGENTS.find((a) => a.id === "opencode")!;
    const dir = getSkillTargetDir(agent, "project", "/fake/project");
    expect(dir).toBe("/fake/project/.opencode/skills");
  });

  it("全局级：应使用 HOME 路径", () => {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    const agent = KNOWN_AGENTS.find((a) => a.id === "claude-code")!;
    const dir = getSkillTargetDir(agent, "global", "/fake/project");
    expect(dir).toBe(`${home}/.claude/skills`);
  });
});

describe("CLAUDE_CODE_AGENT", () => {
  it("应是 KNOWN_AGENTS 中 id=claude-code 的对象", () => {
    expect(CLAUDE_CODE_AGENT).toBeDefined();
    expect(CLAUDE_CODE_AGENT.id).toBe("claude-code");
    expect(CLAUDE_CODE_AGENT.commandsDir).toBe(".claude/commands/");
  });
});

describe("detectAgent(运行时 agent 检测,A+B 组合)", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // 恢复 env
    for (const k of ["AI_AGENT", "CLAUDECODE", "OPENCODE", "PI_CODING_AGENT"]) {
      if (k in originalEnv) process.env[k] = originalEnv[k];
      else delete process.env[k];
    }
  });

  // 0 层:AI_AGENT 通用规范(格式 <agent-id>_<version>_agent)
  it("AI_AGENT=claude-code_2-1-153_agent -> claude-code", () => {
    process.env.AI_AGENT = "claude-code_2-1-153_agent";
    delete process.env.CLAUDECODE;
    expect(detectAgent()).toBe("claude-code");
  });

  it("AI_AGENT=opencode_1-0-0_agent -> opencode", () => {
    process.env.AI_AGENT = "opencode_1-0-0_agent";
    delete process.env.CLAUDECODE;
    expect(detectAgent()).toBe("opencode");
  });

  it("AI_AGENT 是已知 3 个之外的值 -> null(走兜底)", () => {
    process.env.AI_AGENT = "some-unknown-agent_1-0-0_agent";
    delete process.env.CLAUDECODE;
    expect(detectAgent()).toBe(null);
  });

  // A 层:agent 运行时自注入 env
  it("A 层:CLAUDECODE=1 -> claude-code", () => {
    delete process.env.AI_AGENT;
    process.env.CLAUDECODE = "1";
    delete process.env.OPENCODE;
    delete process.env.PI_CODING_AGENT;
    expect(detectAgent()).toBe("claude-code");
  });

  it("A 层:OPENCODE=1 -> opencode", () => {
    delete process.env.AI_AGENT;
    delete process.env.CLAUDECODE;
    process.env.OPENCODE = "1";
    delete process.env.PI_CODING_AGENT;
    expect(detectAgent()).toBe("opencode");
  });

  it("A 层:PI_CODING_AGENT=true -> pi", () => {
    delete process.env.AI_AGENT;
    delete process.env.CLAUDECODE;
    delete process.env.OPENCODE;
    process.env.PI_CODING_AGENT = "true";
    expect(detectAgent()).toBe("pi");
  });

  // 兜底
  it("无任何标识 env -> null(走兜底,按工具参数名兼容取)", () => {
    delete process.env.AI_AGENT;
    delete process.env.CLAUDECODE;
    delete process.env.OPENCODE;
    delete process.env.PI_CODING_AGENT;
    expect(detectAgent()).toBe(null);
  });
});
