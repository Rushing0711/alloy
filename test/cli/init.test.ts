// test/cli/init.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock 所有外部依赖 - 使用 vi.hoisted 确保在 vi.mock 之前可用
const { mockDetectEnv, mockRunHealthCheck, mockInstallOpenSpecCli, mockInitOpenSpecProject, mockInstallSuperpowers, mockDeployCommands, mockDeploySchema, mockInjectClaudeMd, mockPromptSelect, mockPromptMultiSelect } = vi.hoisted(() => ({
  mockDetectEnv: vi.fn(),
  mockRunHealthCheck: vi.fn(),
  mockInstallOpenSpecCli: vi.fn(),
  mockInitOpenSpecProject: vi.fn(),
  mockInstallSuperpowers: vi.fn(),
  mockDeployCommands: vi.fn(),
  mockDeploySchema: vi.fn(),
  mockInjectClaudeMd: vi.fn(),
  mockPromptSelect: vi.fn(),
  mockPromptMultiSelect: vi.fn(),
}));

vi.mock("../../src/core/detect.js", () => ({ detectEnv: mockDetectEnv }));
vi.mock("../../src/core/health.js", () => ({ runHealthCheck: mockRunHealthCheck }));
vi.mock("../../src/core/openspec.js", () => ({
  installOpenSpecCli: mockInstallOpenSpecCli,
  initOpenSpecProject: mockInitOpenSpecProject,
}));
vi.mock("../../src/core/superpowers.js", () => ({ installSuperpowers: mockInstallSuperpowers }));
vi.mock("../../src/core/skills.js", () => ({
  deployCommands: mockDeployCommands,
  deploySchema: mockDeploySchema,
}));
vi.mock("../../src/core/claude-md.js", () => ({ injectClaudeMd: mockInjectClaudeMd }));
vi.mock("../../src/utils/prompt.js", () => ({
  promptSelect: mockPromptSelect,
  promptMultiSelect: mockPromptMultiSelect,
}));

import { selectScope, selectTargetAgents, initCommand } from "../../src/cli/commands/init.js";
import { KNOWN_AGENTS } from "../../src/core/agents.js";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("init", () => {
  let tmpDir: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-init-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    // 设置默认 mock 返回值
    mockDetectEnv.mockReturnValue({
      nodeVersion: "v18.0.0",
      gitInstalled: true,
      claudeCodeInstalled: true,
    });
    mockRunHealthCheck.mockResolvedValue([]);
    mockInstallOpenSpecCli.mockResolvedValue("installed");
    mockInitOpenSpecProject.mockResolvedValue("success");
    mockInstallSuperpowers.mockResolvedValue("installed");
    mockDeployCommands.mockResolvedValue([]);
    mockDeploySchema.mockResolvedValue(join(tmpDir, "openspec/schemas/alloy"));
    mockInjectClaudeMd.mockResolvedValue(false);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe("selectScope", () => {
    it("传入 scope 时直接返回", async () => {
      const result = await selectScope("global");
      expect(result).toBe("global");
    });

    it("传入 project scope 时返回 project", async () => {
      const result = await selectScope("project");
      expect(result).toBe("project");
    });

    it("未传入 scope 时调用 promptSelect", async () => {
      mockPromptSelect.mockResolvedValue("project");
      const result = await selectScope();
      expect(result).toBe("project");
      expect(mockPromptSelect).toHaveBeenCalledWith("Install scope:", [
        { name: "Project (current directory)", value: "project" },
        { name: "Global (home directory)", value: "global" },
      ]);
    });
  });

  describe("selectTargetAgents", () => {
    it("返回选中的 agents", async () => {
      const selectedIds = ["claude-code", "cursor"];
      mockPromptMultiSelect.mockResolvedValue(selectedIds);

      const result = await selectTargetAgents();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("claude-code");
      expect(result[1].id).toBe("cursor");
      expect(mockPromptMultiSelect).toHaveBeenCalledWith(
        "请选择要安装的 AI 工具（可多选，至少选一项）：",
        expect.any(Array),
        expect.objectContaining({
          validate: expect.any(Function),
        })
      );
    });

    it("验证函数要求至少选择一项", async () => {
      mockPromptMultiSelect.mockResolvedValue([]);
      await selectTargetAgents();

      // 获取验证函数并测试
      const validateFn = mockPromptMultiSelect.mock.calls[0][2].validate;
      expect(validateFn([])).toBe("请至少选择一个 AI 工具");
      expect(validateFn(["claude-code"])).toBe(true);
    });
  });

  describe("initCommand", () => {
    let defaultOpts: {
      scope: "project";
      injectClaudeMd: boolean;
      projectPath: string;
      targetAgents: never[];
    };

    beforeEach(() => {
      defaultOpts = {
        scope: "project" as const,
        injectClaudeMd: false,
        projectPath: tmpDir,
        targetAgents: [],
      };
    });

    it("成功执行完整初始化流程", async () => {
      await initCommand(defaultOpts);

      expect(mockDetectEnv).toHaveBeenCalled();
      expect(mockInstallOpenSpecCli).toHaveBeenCalled();
      expect(mockInitOpenSpecProject).toHaveBeenCalledWith(tmpDir, "project");
      expect(mockInstallSuperpowers).toHaveBeenCalledWith("project");
      expect(mockDeploySchema).toHaveBeenCalled();
      expect(mockInjectClaudeMd).toHaveBeenCalled();
      expect(mockRunHealthCheck).toHaveBeenCalled();
    });

    it("git 未安装时 exit 1", async () => {
      mockDetectEnv.mockReturnValue({
        nodeVersion: "v18.0.0",
        gitInstalled: false,
        claudeCodeInstalled: false,
      });

      await initCommand(defaultOpts);

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("缺少必要依赖"));
    });

    it("OpenSpec CLI 安装失败时 exit 1", async () => {
      mockInstallOpenSpecCli.mockResolvedValue("failed");

      await initCommand(defaultOpts);

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("OpenSpec CLI 安装失败"));
    });

    it("OpenSpec 项目初始化失败时 exit 1", async () => {
      mockInitOpenSpecProject.mockResolvedValue("failed");

      await initCommand(defaultOpts);

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("OpenSpec 项目初始化失败"));
    });

    it("未选择 target agents 时跳过 command 部署", async () => {
      await initCommand(defaultOpts);

      expect(mockDeployCommands).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("未选择任何 AI 工具"));
    });

    it("选择 target agents 时部署 commands", async () => {
      const opts = {
        ...defaultOpts,
        targetAgents: [{ id: "claude-code", label: "Claude Code", supportsColonCommands: true, commandsDir: ".claude/commands" }],
      };
      mockDeployCommands.mockResolvedValue(["/path/to/command.md"]);

      await initCommand(opts);

      expect(mockDeployCommands).toHaveBeenCalledWith(opts);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("/path/to/command.md"));
    });

    it("command 部署失败时 exit 1", async () => {
      const opts = {
        ...defaultOpts,
        targetAgents: [{ id: "claude-code", label: "Claude Code", supportsColonCommands: true, commandsDir: ".claude/commands" }],
      };
      mockDeployCommands.mockRejectedValue(new Error("部署失败"));

      await initCommand(opts);

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("command 部署失败"));
    });

    it("Superpowers 安装失败时不 exit", async () => {
      mockInstallSuperpowers.mockResolvedValue("failed");

      await initCommand(defaultOpts);

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Superpowers 安装失败"));
    });

    it("injectClaudeMd 为 true 时输出提示", async () => {
      mockInjectClaudeMd.mockResolvedValue(true);

      await initCommand(defaultOpts);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("CLAUDE.md → 已追加"));
    });

    it("健康检查结果正确输出", async () => {
      mockRunHealthCheck.mockResolvedValue([
        { name: "Node.js", status: "pass", current: "v18.0.0", required: ">=18.0.0" },
        { name: "OpenSpec", status: "warn", current: "v1.2.0", required: ">=1.3.0" },
        { name: "Git", status: "fail", current: "未安装", required: "已安装" },
      ]);

      await initCommand(defaultOpts);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✓ Node.js"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("⚠️ OpenSpec"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✗ Git"));
    });
  });
});
