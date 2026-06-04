// test/core/openspec.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  mkdtempSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));
vi.mock("../../src/core/health.js", () => ({
  checkOpenSpec: vi.fn(),
}));
vi.mock("../../src/core/compat.js", () => ({
  loadCompat: vi.fn(),
}));
vi.mock("../../src/utils/fs.js", () => ({
  getPackageRoot: vi.fn(),
}));
vi.mock("../../src/core/detect-installations.js", () => ({
  detectCommand: vi.fn(),
  detectSkill: vi.fn(),
}));
vi.mock("../../src/utils/prompt.js", () => ({
  promptConfirm: vi.fn(),
}));

import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { checkOpenSpec } from "../../src/core/health.js";
import { loadCompat } from "../../src/core/compat.js";
import { getPackageRoot } from "../../src/utils/fs.js";
import { detectCommand, detectSkill } from "../../src/core/detect-installations.js";
import { promptConfirm } from "../../src/utils/prompt.js";
import { installOpenSpecCli, initOpenSpecProject } from "../../src/core/openspec.js";
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

describe("installOpenSpecCli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPackageRoot).mockReturnValue("/fake/package");
    vi.mocked(loadCompat).mockResolvedValue(MOCK_CONFIG);
  });

  it("已安装且兼容时跳过", async () => {
    vi.mocked(checkOpenSpec).mockReturnValue({ installed: true, version: "1.5.0", compatible: true });

    const result = await installOpenSpecCli();
    expect(result).toBe("skipped");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("已安装但不兼容时重新安装", async () => {
    vi.mocked(checkOpenSpec).mockReturnValue({ installed: true, version: "1.2.0", compatible: false });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installOpenSpecCli();
    expect(result).toBe("installed");
    expect(execSync).toHaveBeenCalled();
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("npm install -g @fission-ai/openspec@1");
  });

  it("未安装时执行安装", async () => {
    vi.mocked(checkOpenSpec).mockReturnValue({ installed: false, compatible: false });
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));

    const result = await installOpenSpecCli();
    expect(result).toBe("installed");
  });

  it("安装失败时返回 failed", async () => {
    vi.mocked(checkOpenSpec).mockReturnValue({ installed: false, compatible: false });
    vi.mocked(execSync).mockImplementation(() => { throw new Error("network error"); });

    const result = await installOpenSpecCli();
    expect(result).toBe("failed");
  });
});

describe("initOpenSpecProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    vi.mocked(mkdtempSync).mockReturnValue("/tmp/alloy-openspec-profile-XXXXX");
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
  });

  it("project scope — 无 agents 时直接执行初始化", async () => {
    const result = await initOpenSpecProject("/fake/project", "project");
    expect(result).toBe("initialized");
    expect(execSync).toHaveBeenCalled();
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    expect(cmd).toContain("openspec init");
    expect(cmd).toContain("--tools claude");
    expect(cmd).toContain("--profile custom");
  });

  it("global scope 使用 HOME 路径", async () => {
    const result = await initOpenSpecProject("/fake/project", "global");
    expect(result).toBe("initialized");
    const cmd = vi.mocked(execSync).mock.calls[0][0] as string;
    // global scope 用 HOME 而非 projectPath
    expect(cmd).toContain("openspec init");
  });

  it("初始化失败时返回 failed", async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error("openspec error"); });

    const result = await initOpenSpecProject("/fake/project", "project");
    expect(result).toBe("failed");
  });
});

const claudeAgent: AgentInfo = {
  id: "claude-code",
  label: "Claude Code",
  supportsColonCommands: true,
  commandsDir: ".claude/commands/",
};

describe("initOpenSpecProject — 检测逻辑", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execSync).mockReturnValue(Buffer.from(""));
    vi.mocked(mkdtempSync).mockReturnValue("/tmp/alloy-openspec-profile-XXXXX");
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(detectCommand).mockReturnValue({ found: false, location: null, path: null, version: null });
    vi.mocked(detectSkill).mockReturnValue({ found: false, location: null, path: null, version: null });
  });

  it("未传 agents 时跳过检测", async () => {
    const result = await initOpenSpecProject("/fake/project", "project");

    expect(result).toBe("initialized");
    expect(detectCommand).not.toHaveBeenCalled();
    expect(detectSkill).not.toHaveBeenCalled();
  });

  it("agents 为空数组时跳过检测", async () => {
    const result = await initOpenSpecProject("/fake/project", "project", []);

    expect(result).toBe("initialized");
    expect(detectCommand).not.toHaveBeenCalled();
  });

  it("未检测到已有安装时正常初始化", async () => {
    const result = await initOpenSpecProject("/fake/project", "project", [claudeAgent]);

    expect(result).toBe("initialized");
    expect(detectCommand).toHaveBeenCalledWith("opsx/continue", claudeAgent, "/fake/project");
    expect(detectSkill).toHaveBeenCalledWith("openspec-explore", claudeAgent, "/fake/project");
    expect(promptConfirm).not.toHaveBeenCalled();
  });

  it("检测到已有安装且用户拒绝覆盖时返回 skipped", async () => {
    vi.mocked(detectCommand).mockReturnValue({
      found: true, location: "project-command", path: "/fake/project/.claude/commands/opsx/continue.md", version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await initOpenSpecProject("/fake/project", "project", [claudeAgent]);

    expect(result).toBe("skipped");
    expect(promptConfirm).toHaveBeenCalledWith("     openspec init 可能覆盖现有文件，继续？", false);
    expect(execSync).not.toHaveBeenCalled();
  });

  it("检测到已有安装且用户确认覆盖时继续初始化", async () => {
    vi.mocked(detectSkill).mockReturnValue({
      found: true, location: "user-skill", path: "/home/.claude/skills/openspec-explore", version: null,
    });
    vi.mocked(promptConfirm).mockResolvedValue(true);

    const result = await initOpenSpecProject("/fake/project", "project", [claudeAgent]);

    expect(result).toBe("initialized");
    expect(execSync).toHaveBeenCalled();
  });

  it("多 agent 时遍历所有 agent 检测", async () => {
    const cursorAgent: AgentInfo = {
      id: "cursor", label: "Cursor", supportsColonCommands: false, commandsDir: ".cursor/commands/",
    };
    vi.mocked(detectCommand).mockImplementation((_name, agent) => {
      if (agent.id === "cursor") {
        return { found: true, location: "project-command", path: "/fake/project/.cursor/commands/opsx/continue.md", version: null };
      }
      return { found: false, location: null, path: null, version: null };
    });
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const result = await initOpenSpecProject("/fake/project", "project", [claudeAgent, cursorAgent]);

    expect(result).toBe("skipped");
    expect(detectCommand).toHaveBeenCalledTimes(2);
  });
});
