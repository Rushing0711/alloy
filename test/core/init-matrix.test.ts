// test/core/init-matrix.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock 依赖模块
vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));

vi.mock("../../src/core/skills.js", () => ({
  detectAlloySkillsVersion: vi.fn(),
}));

vi.mock("../../src/core/detect-installations.js", () => ({
  detectSkill: vi.fn(),
}));

// 部分模拟 agent-config:保留 getHookSupportedAgents/getPermissionSupportedAgents 真实实现,
// 仅 mock hasHookConfig/hasPermissionsConfig(避免触碰真实文件系统)
vi.mock("../../src/core/agent-config.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/core/agent-config.js")>(
    "../../src/core/agent-config.js"
  );
  return {
    ...actual,
    hasHookConfig: vi.fn(),
    hasPermissionsConfig: vi.fn(),
  };
});

import { getPackageRoot } from "../../src/utils/fs.js";
import { detectAlloySkillsVersion } from "../../src/core/skills.js";
import { detectSkill } from "../../src/core/detect-installations.js";
import { hasHookConfig, hasPermissionsConfig } from "../../src/core/agent-config.js";
import { detectInitMatrix, isBreakingChange, getBreakingChangeMessage, formatInitMatrix } from "../../src/core/init-matrix.js";
import type { AgentInfo } from "../../src/core/types.js";
import type { InitMatrix } from "../../src/core/init-matrix.js";

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

const unknownAgent: AgentInfo = {
  id: "unknown-agent",
  label: "Unknown",
  supportsColonCommands: false,
  commandsDir: ".unknown/commands/",
};

let tmpDir: string;
let projectPath: string;
let fakePackageDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpDir = join(tmpdir(), `alloy-init-matrix-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  projectPath = join(tmpDir, "project");
  fakePackageDir = join(tmpDir, "package");
  await mkdir(projectPath, { recursive: true });
  await mkdir(fakePackageDir, { recursive: true });
  // 写假 package.json,版本 0.4.0(供 readPackageVersion 读取)
  await writeFile(
    join(fakePackageDir, "package.json"),
    JSON.stringify({ name: "@flyin-ai/alloy", version: "0.4.0" }),
    "utf-8"
  );
  vi.mocked(getPackageRoot).mockReturnValue(fakePackageDir);
  // 默认 mock:所有检测返回未装
  vi.mocked(detectAlloySkillsVersion).mockResolvedValue(null);
  vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
  vi.mocked(hasHookConfig).mockResolvedValue(false);
  vi.mocked(hasPermissionsConfig).mockResolvedValue(false);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 基础结构
// ---------------------------------------------------------------------------
describe("detectInitMatrix - 基础结构", () => {
  it("返回 InitMatrix 结构,agents 数组长度与输入一致", async () => {
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix).toHaveProperty("agents");
    expect(matrix.agents).toHaveLength(1);
    expect(matrix.agents[0].agentId).toBe("claude-code");
    expect(matrix.agents[0].agentLabel).toBe("Claude Code");
  });

  it("多 agent 输入返回多行状态", async () => {
    const matrix = await detectInitMatrix(projectPath, [claudeAgent, opencodeAgent], "project");
    expect(matrix.agents).toHaveLength(2);
    expect(matrix.agents[0].agentId).toBe("claude-code");
    expect(matrix.agents[1].agentId).toBe("opencode");
  });

  it("空 agent 列表返回空 agents 数组", async () => {
    const matrix = await detectInitMatrix(projectPath, [], "project");
    expect(matrix.agents).toHaveLength(0);
  });

  it("包含全部 5 类产物字段", async () => {
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const status = matrix.agents[0];
    expect(status).toHaveProperty("alloySkills");
    expect(status).toHaveProperty("opsxCommands");
    expect(status).toHaveProperty("hook");
    expect(status).toHaveProperty("permissions");
    expect(status).toHaveProperty("superpowers");
    // alloySkills 子字段
    expect(status.alloySkills).toHaveProperty("installed");
    expect(status.alloySkills).toHaveProperty("version");
    expect(status.alloySkills).toHaveProperty("canUpgrade");
    expect(status.alloySkills).toHaveProperty("breaking");
    // superpowers 子字段
    expect(status.superpowers).toHaveProperty("installed");
    expect(status.superpowers).toHaveProperty("version");
    expect(status.superpowers).toHaveProperty("canUpgrade");
    expect(status.superpowers).toHaveProperty("breaking");
  });
});

// ---------------------------------------------------------------------------
// alloy skills 检测
// ---------------------------------------------------------------------------
describe("detectInitMatrix - alloy skills", () => {
  it("所有产物未装时返回全 false", async () => {
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].alloySkills;
    expect(s.installed).toBe(false);
    expect(s.version).toBe(null);
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("alloy skills 已装版本低时 canUpgrade=true, breaking=true(0.x breaking)", async () => {
    vi.mocked(detectAlloySkillsVersion).mockResolvedValue("0.3.0");
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].alloySkills;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("0.3.0");
    expect(s.canUpgrade).toBe(true);
    expect(s.breaking).toBe(true);
  });

  it("alloy skills 已装当前版本时 canUpgrade=false, breaking=false", async () => {
    vi.mocked(detectAlloySkillsVersion).mockResolvedValue("0.4.0");
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].alloySkills;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("0.4.0");
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("alloy skills 已装高版本时 canUpgrade=false", async () => {
    vi.mocked(detectAlloySkillsVersion).mockResolvedValue("0.5.0");
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].alloySkills;
    expect(s.installed).toBe(true);
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("detectAlloySkillsVersion 接收正确的 scope 参数", async () => {
    await detectInitMatrix(projectPath, [claudeAgent], "global");
    expect(detectAlloySkillsVersion).toHaveBeenCalledWith(projectPath, claudeAgent, "global");
  });

  it("多 agent 各自独立检测 alloy skills 版本", async () => {
    vi.mocked(detectAlloySkillsVersion).mockImplementation(async (_p, agent) => {
      if (agent.id === "claude-code") return "0.3.0";
      if (agent.id === "opencode") return "0.4.0";
      return null;
    });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent, opencodeAgent], "project");
    expect(matrix.agents[0].alloySkills.version).toBe("0.3.0");
    expect(matrix.agents[1].alloySkills.version).toBe("0.4.0");
    expect(matrix.agents[0].alloySkills.canUpgrade).toBe(true);
    expect(matrix.agents[1].alloySkills.canUpgrade).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// superpowers 检测
// ---------------------------------------------------------------------------
describe("detectInitMatrix - superpowers", () => {
  it("superpowers 未装时 installed=false", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].superpowers;
    expect(s.installed).toBe(false);
    expect(s.version).toBe(null);
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("superpowers 已装 v5 时 canUpgrade=true, breaking=true(5->6 breaking)", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/fake/skills/brainstorming", version: "5.2.0",
    });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].superpowers;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("5.2.0");
    expect(s.canUpgrade).toBe(true);
    expect(s.breaking).toBe(true);
  });

  it("superpowers 已装 v6 时 canUpgrade=false, breaking=false", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-plugin", path: "/fake/skills/brainstorming", version: "6.1.0",
    });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].superpowers;
    expect(s.installed).toBe(true);
    expect(s.version).toBe("6.1.0");
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("superpowers 已装但无版本号(手动安装)时 canUpgrade=false", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "project-skill", path: "/fake/skills/brainstorming", version: null,
    });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    const s = matrix.agents[0].superpowers;
    expect(s.installed).toBe(true);
    expect(s.version).toBe(null);
    expect(s.canUpgrade).toBe(false);
    expect(s.breaking).toBe(false);
  });

  it("非 claude-code agent superpowers 始终未装(detectSkill 内部过滤)", async () => {
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
    const matrix = await detectInitMatrix(projectPath, [opencodeAgent], "project");
    expect(matrix.agents[0].superpowers.installed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hook / permissions / opsx 检测
// ---------------------------------------------------------------------------
describe("detectInitMatrix - hook / permissions / opsx", () => {
  it("hook 已装时 installed=true", async () => {
    vi.mocked(hasHookConfig).mockResolvedValue(true);
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.agents[0].hook.installed).toBe(true);
  });

  it("hook 未装时 installed=false", async () => {
    vi.mocked(hasHookConfig).mockResolvedValue(false);
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.agents[0].hook.installed).toBe(false);
  });

  it("hook 不支持的 agent 返回 false 且不调用 hasHookConfig", async () => {
    const matrix = await detectInitMatrix(projectPath, [unknownAgent], "project");
    expect(matrix.agents[0].hook.installed).toBe(false);
    expect(hasHookConfig).not.toHaveBeenCalled();
  });

  it("permissions 已装时 installed=true", async () => {
    vi.mocked(hasPermissionsConfig).mockResolvedValue(true);
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.agents[0].permissions.installed).toBe(true);
  });

  it("permissions 未装时 installed=false", async () => {
    vi.mocked(hasPermissionsConfig).mockResolvedValue(false);
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.agents[0].permissions.installed).toBe(false);
  });

  it("permissions 不支持的 agent 返回 null 且不调用 hasPermissionsConfig", async () => {
    const matrix = await detectInitMatrix(projectPath, [unknownAgent], "project");
    expect(matrix.agents[0].permissions.installed).toBe(null);
    expect(hasPermissionsConfig).not.toHaveBeenCalled();
  });

  it("opsxCommands 未装时 installed=false", async () => {
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.agents[0].opsxCommands.installed).toBe(false);
  });

  it("opsxCommands 已装时 installed=true(project scope, claude-code)", async () => {
    await mkdir(join(projectPath, ".claude", "commands", "opsx"), { recursive: true });
    const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
    expect(matrix.agents[0].opsxCommands.installed).toBe(true);
  });

  it("opsxCommands 已装时 installed=true(project scope, opencode)", async () => {
    await mkdir(join(projectPath, ".opencode", "commands", "opsx"), { recursive: true });
    const matrix = await detectInitMatrix(projectPath, [opencodeAgent], "project");
    expect(matrix.agents[0].opsxCommands.installed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scope 行为
// ---------------------------------------------------------------------------
describe("detectInitMatrix - scope 行为", () => {
  it("global scope 用 HOME 作为 base 检测 opsx(claude-code 无 globalBase)", async () => {
    const fakeHome = join(tmpDir, "home-cc");
    await mkdir(join(fakeHome, ".claude", "commands", "opsx"), { recursive: true });
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const matrix = await detectInitMatrix(projectPath, [claudeAgent], "global");
      expect(matrix.agents[0].opsxCommands.installed).toBe(true);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  it("global scope 用 globalBase 作为 agentBase(opencode)", async () => {
    const fakeHome = join(tmpDir, "home-oc");
    // opencode 的 globalBase = ".config/opencode"
    await mkdir(join(fakeHome, ".config", "opencode", "commands", "opsx"), { recursive: true });
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const matrix = await detectInitMatrix(projectPath, [opencodeAgent], "global");
      expect(matrix.agents[0].opsxCommands.installed).toBe(true);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });

  it("project scope 不读 HOME 下的 opsx", async () => {
    const fakeHome = join(tmpDir, "home-not-used");
    await mkdir(join(fakeHome, ".claude", "commands", "opsx"), { recursive: true });
    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const matrix = await detectInitMatrix(projectPath, [claudeAgent], "project");
      expect(matrix.agents[0].opsxCommands.installed).toBe(false);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    }
  });
});

// ---------------------------------------------------------------------------
// isBreakingChange
// ---------------------------------------------------------------------------
describe("isBreakingChange", () => {
  it("major 变更视为 breaking", () => {
    expect(isBreakingChange("5.1.0", "6.0.0")).toBe(true);
  });

  it("0.x 之间视为 breaking", () => {
    expect(isBreakingChange("0.3.0", "0.4.0")).toBe(true);
  });

  it("minor/patch 兼容", () => {
    expect(isBreakingChange("6.1.0", "6.2.0")).toBe(false);
    expect(isBreakingChange("6.1.0", "6.1.1")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getBreakingChangeMessage
// ---------------------------------------------------------------------------
describe("getBreakingChangeMessage", () => {
  it("0.x breaking 含 semver 0.x 约定提示", () => {
    const msg = getBreakingChangeMessage("0.3.0", "0.4.0");
    expect(msg).toContain("breaking");
    expect(msg).toContain("0.3.0");
    expect(msg).toContain("0.4.0");
  });

  it("major 变更提示 major 版本变更", () => {
    const msg = getBreakingChangeMessage("5.1.0", "6.0.0");
    expect(msg).toContain("breaking");
    expect(msg).toContain("5.1.0");
    expect(msg).toContain("6.0.0");
  });
});

// ---------------------------------------------------------------------------
// formatInitMatrix
// ---------------------------------------------------------------------------
describe("formatInitMatrix", () => {
  it("格式化矩阵为多行", () => {
    const matrix: InitMatrix = {
      agents: [{
        agentId: "opencode",
        agentLabel: "OpenCode",
        alloySkills: { installed: true, version: "0.3.0", canUpgrade: true, breaking: true },
        opsxCommands: { installed: true },
        hook: { installed: true },
        permissions: { installed: false },
        superpowers: { installed: true, version: "5.1.0", canUpgrade: true, breaking: true },
      }],
    };
    const lines = formatInitMatrix(matrix);
    expect(lines.join("\n")).toContain("OpenCode");
    expect(lines.join("\n")).toContain("⚠️");
    expect(lines.join("\n")).toContain("0.3.0");
  });

  it("表头包含全部 6 列", () => {
    const matrix: InitMatrix = { agents: [] };
    const lines = formatInitMatrix(matrix);
    // 第二行为表头(第一行为标题),含 agent + 5 类产物列
    expect(lines[1]).toContain("agent");
    expect(lines[1]).toContain("alloy skills");
    expect(lines[1]).toContain("opsx commands");
    expect(lines[1]).toContain("hook");
    expect(lines[1]).toContain("permissions");
    expect(lines[1]).toContain("Superpowers");
  });

  it("空 agent 列表仅返回标题+表头+分隔行", () => {
    const matrix: InitMatrix = { agents: [] };
    const lines = formatInitMatrix(matrix);
    expect(lines).toHaveLength(3);
  });

  it("未安装产物显示 ✗", () => {
    const matrix: InitMatrix = {
      agents: [{
        agentId: "claude-code",
        agentLabel: "Claude Code",
        alloySkills: { installed: false, version: null, canUpgrade: false, breaking: false },
        opsxCommands: { installed: false },
        hook: { installed: false },
        permissions: { installed: false },
        superpowers: { installed: false, version: null, canUpgrade: false, breaking: false },
      }],
    };
    const lines = formatInitMatrix(matrix);
    const row = lines[3];
    expect(row).toContain("✗"); // ✗
    expect(row).not.toContain("⚠️"); // 不含 ⚠️
  });

  it("已装当前版本显示 ✓ 和版本号", () => {
    const matrix: InitMatrix = {
      agents: [{
        agentId: "claude-code",
        agentLabel: "Claude Code",
        alloySkills: { installed: true, version: "0.4.0", canUpgrade: false, breaking: false },
        opsxCommands: { installed: true },
        hook: { installed: true },
        permissions: { installed: true },
        superpowers: { installed: true, version: "6.1.0", canUpgrade: false, breaking: false },
      }],
    };
    const lines = formatInitMatrix(matrix);
    const row = lines[3];
    expect(row).toContain("✓"); // ✓
    expect(row).toContain("0.4.0");
    expect(row).toContain("6.1.0");
    expect(row).not.toContain("⚠️"); // 不含 ⚠️
  });

  it("可升级非 breaking 显示 (可升级) 标签", () => {
    const matrix: InitMatrix = {
      agents: [{
        agentId: "claude-code",
        agentLabel: "Claude Code",
        alloySkills: { installed: true, version: "6.1.0", canUpgrade: true, breaking: false },
        opsxCommands: { installed: false },
        hook: { installed: false },
        permissions: { installed: false },
        superpowers: { installed: false, version: null, canUpgrade: false, breaking: false },
      }],
    };
    const lines = formatInitMatrix(matrix);
    const row = lines[3];
    expect(row).toContain("⚠️");
    expect(row).toContain("(可升级)");
    expect(row).not.toContain("(breaking)");
  });

  it("可升级且 breaking 显示 (breaking) 标签", () => {
    const matrix: InitMatrix = {
      agents: [{
        agentId: "opencode",
        agentLabel: "OpenCode",
        alloySkills: { installed: true, version: "0.3.0", canUpgrade: true, breaking: true },
        opsxCommands: { installed: false },
        hook: { installed: false },
        permissions: { installed: false },
        superpowers: { installed: true, version: "5.1.0", canUpgrade: true, breaking: true },
      }],
    };
    const lines = formatInitMatrix(matrix);
    const row = lines[3];
    expect(row).toContain("⚠️");
    expect(row).toContain("(breaking)");
    expect(row).toContain("0.3.0");
    expect(row).toContain("5.1.0");
  });

  it("已装但无版本号显示 ✓ 不带版本", () => {
    const matrix: InitMatrix = {
      agents: [{
        agentId: "claude-code",
        agentLabel: "Claude Code",
        alloySkills: { installed: true, version: null, canUpgrade: false, breaking: false },
        opsxCommands: { installed: false },
        hook: { installed: false },
        permissions: { installed: false },
        superpowers: { installed: false, version: null, canUpgrade: false, breaking: false },
      }],
    };
    const lines = formatInitMatrix(matrix);
    const row = lines[3];
    expect(row).toContain("✓");
    // ✓ 后跟空格,无版本号内容
    expect(row).toMatch(/✓\s*\|/);
  });

  it("多 agent 输出多行数据行", () => {
    const matrix: InitMatrix = {
      agents: [
        {
          agentId: "claude-code",
          agentLabel: "Claude Code",
          alloySkills: { installed: true, version: "0.4.0", canUpgrade: false, breaking: false },
          opsxCommands: { installed: true },
          hook: { installed: true },
          permissions: { installed: true },
          superpowers: { installed: true, version: "6.1.0", canUpgrade: false, breaking: false },
        },
        {
          agentId: "opencode",
          agentLabel: "OpenCode",
          alloySkills: { installed: false, version: null, canUpgrade: false, breaking: false },
          opsxCommands: { installed: false },
          hook: { installed: false },
          permissions: { installed: false },
          superpowers: { installed: false, version: null, canUpgrade: false, breaking: false },
        },
      ],
    };
    const lines = formatInitMatrix(matrix);
    // 标题 + 表头 + 分隔 + 2 行数据
    expect(lines).toHaveLength(5);
    expect(lines[3]).toContain("Claude Code");
    expect(lines[4]).toContain("OpenCode");
  });
});
