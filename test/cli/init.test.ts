// test/cli/init.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock 所有外部依赖 - 使用 vi.hoisted 确保在 vi.mock 之前可用
const { mockDetectEnv, mockRunHealthCheck, mockInstallOpenSpecCli, mockInitOpenSpecProject, mockInstallSuperpowers, mockDeployCommands, mockDeploySchema, mockInjectClaudeMd, mockPromptSelect, mockPromptMultiSelect, mockPromptConfirm, mockPromptInput, mockSpinnerInstance, mockSpinner, mockEnsureGitRepo, mockIsHeadUnborn, mockDetectMainBranch, mockReadProjectConfig, mockWriteProjectConfig, mockExecSync } = vi.hoisted(() => {
  const mockSpinnerInstance = {
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  };
  const mockSpinner = vi.fn(() => mockSpinnerInstance);
  return {
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
    mockPromptConfirm: vi.fn(),
    mockPromptInput: vi.fn(),
    mockSpinnerInstance,
    mockSpinner,
    mockEnsureGitRepo: vi.fn(),
    mockIsHeadUnborn: vi.fn(),
    mockDetectMainBranch: vi.fn(),
    mockReadProjectConfig: vi.fn(),
    mockWriteProjectConfig: vi.fn(),
    mockExecSync: vi.fn(),
  };
});

vi.mock("../../src/core/detect.js", () => ({
  detectEnv: mockDetectEnv,
}));
vi.mock("../../src/core/git.js", () => ({
  ensureGitRepo: mockEnsureGitRepo,
  isHeadUnborn: mockIsHeadUnborn,
  detectMainBranch: mockDetectMainBranch,
}));
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
  promptConfirm: mockPromptConfirm,
  promptInput: mockPromptInput,
}));
vi.mock("../../src/cli/utils/state.js", () => ({
  readProjectConfig: mockReadProjectConfig,
  writeProjectConfig: mockWriteProjectConfig,
}));
vi.mock("node:child_process", () => ({
  execSync: mockExecSync,
}));
vi.mock("../../src/utils/format.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../src/utils/format.js")>();
  return { ...orig, spinner: mockSpinner };
});

import { selectScope, selectTargetAgents, initCommand } from "../../src/cli/commands/init.js";
import { KNOWN_AGENTS } from "../../src/core/agents.js";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";

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
    });
    mockRunHealthCheck.mockResolvedValue([]);
    mockInstallOpenSpecCli.mockResolvedValue("installed");
    mockInitOpenSpecProject.mockResolvedValue("success");
    mockInstallSuperpowers.mockResolvedValue({ status: "installed" });
    mockDeployCommands.mockResolvedValue([]);
    mockDeploySchema.mockResolvedValue(join(tmpDir, "openspec/schemas/alloy"));
    mockInjectClaudeMd.mockResolvedValue(false);
    mockEnsureGitRepo.mockReturnValue("exists");
    // 新增 mock 默认值
    mockExecSync.mockImplementation((cmd: string) => {
      // git rev-parse --git-dir 默认成功（仓库存在）
      if (cmd.includes("rev-parse --git-dir")) return Buffer.from("");
      // git config user.name 默认已配置
      if (cmd === "git config user.name") return Buffer.from("test-user");
      // git commit 默认成功
      if (cmd.includes("git commit")) return Buffer.from("");
      // git add 默认成功
      if (cmd.includes("git add")) return Buffer.from("");
      return Buffer.from("");
    });
    mockIsHeadUnborn.mockReturnValue(false);  // 默认有 commit
    mockDetectMainBranch.mockReturnValue("main");
    mockReadProjectConfig.mockResolvedValue({ schema: "alloy", alloy: { main_branch: "main" } });
    mockWriteProjectConfig.mockResolvedValue(undefined);
    mockPromptSelect.mockResolvedValue("main");
    mockPromptConfirm.mockResolvedValue(true);  // 默认确认执行
    mockPromptInput.mockResolvedValue("main");
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
      expect(mockInitOpenSpecProject).toHaveBeenCalledWith(tmpDir, "project", []);
      expect(mockInstallSuperpowers).toHaveBeenCalledWith("project", undefined, tmpDir);
      expect(mockDeploySchema).toHaveBeenCalled();
      expect(mockInjectClaudeMd).toHaveBeenCalled();
      expect(mockRunHealthCheck).toHaveBeenCalled();
    });

    it("git 未安装时 exit 1", async () => {
      mockDetectEnv.mockReturnValue({
        nodeVersion: "v18.0.0",
        gitInstalled: false,
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

    it("选择 Claude Code 时写入 worktree.baseRef: head 到 settings.json", async () => {
      const opts = {
        ...defaultOpts,
        targetAgents: [{ id: "claude-code", label: "Claude Code", supportsColonCommands: true, commandsDir: ".claude/commands" }],
      };

      await initCommand(opts);

      const content = await readFile(join(tmpDir, ".claude", "settings.json"), "utf-8");
      const settings = JSON.parse(content);
      expect(settings.worktree.baseRef).toBe("head");
    });

    it("未选择 Claude Code 时不写 settings.json", async () => {
      const opts = {
        ...defaultOpts,
        targetAgents: [{ id: "cursor", label: "Cursor", supportsColonCommands: false, commandsDir: ".cursor/commands" }],
      };

      await initCommand(opts);

      const { existsSync } = await import("node:fs");
      expect(existsSync(join(tmpDir, ".claude", "settings.json"))).toBe(false);
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
      mockInstallSuperpowers.mockResolvedValue({ status: "failed" });

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
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("⚠ OpenSpec"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✗ Git"));
    });

    it("projectPath 等于 $HOME 时拒绝并 exit 1", async () => {
      const home = homedir();
      const opts = { ...defaultOpts, projectPath: home };

      await initCommand(opts);

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("拒绝在用户主目录初始化"));
      expect(mockEnsureGitRepo).not.toHaveBeenCalled();
      expect(mockInstallOpenSpecCli).not.toHaveBeenCalled();
    });

    it("projectPath 不是 $HOME 时正常继续", async () => {
      // tmpDir 由 beforeEach 创建，确保不是 $HOME 且可写（ensureGitignore 会真实 writeFile）
      // 模拟非 git 仓库（gitExists=false）→ ensureGitRepo 会被调用
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("rev-parse --git-dir")) throw new Error("not a repo");
        if (cmd === "git config user.name") return Buffer.from("test-user");
        if (cmd.includes("git commit")) return Buffer.from("");
        if (cmd.includes("git add")) return Buffer.from("");
        return Buffer.from("");
      });
      mockEnsureGitRepo.mockReturnValue("initialized");
      const opts = { ...defaultOpts, projectPath: tmpDir };

      await initCommand(opts);

      expect(processExitSpy).not.toHaveBeenCalled();
      // ensureGitRepo 现在接受 initialBranch 参数（默认 main）
      expect(mockEnsureGitRepo).toHaveBeenCalledWith(tmpDir, expect.any(String));
    });

    it("ensureGitRepo 返回 failed 时 exit 1", async () => {
      // 模拟非 git 仓库（gitExists=false）→ ensureGitRepo 被调用返回 failed
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("rev-parse --git-dir")) throw new Error("not a repo");
        return Buffer.from("");
      });
      mockEnsureGitRepo.mockReturnValue("failed");

      await initCommand(defaultOpts);

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("git init 失败"));
      expect(mockInstallOpenSpecCli).not.toHaveBeenCalled();
    });

    it("ensureGitRepo 返回 initialized 时继续后续步骤", async () => {
      mockEnsureGitRepo.mockReturnValue("initialized");

      await initCommand(defaultOpts);

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(mockInstallOpenSpecCli).toHaveBeenCalled();
    });

    it("ensureGitRepo 返回 exists 时输出已存在", async () => {
      mockEnsureGitRepo.mockReturnValue("exists");

      await initCommand(defaultOpts);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("git 仓库"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("已存在"));
    });

    it("banner 输出包含所有 targetAgents 的 label", async () => {
      const opts = {
        ...defaultOpts,
        targetAgents: [
          { id: "claude-code", label: "Claude Code", supportsColonCommands: true, commandsDir: ".claude/commands/" },
          { id: "cursor", label: "Cursor", supportsColonCommands: false, commandsDir: ".cursor/commands/" },
        ],
      };

      await initCommand(opts);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Claude Code"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Cursor"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Claude Code / Cursor"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("/alloy:start <topic>"));
    });
  });

  describe("ensureClaudeCodeWorktreeConfig", () => {
    let workDir: string;

    beforeEach(async () => {
      workDir = join(tmpdir(), `alloy-cc-worktree-test-${Date.now()}`);
      await mkdir(workDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(workDir, { recursive: true, force: true });
    });

    it("hasClaudeCode=false 时跳过（不写文件）", async () => {
      const { ensureClaudeCodeWorktreeConfig } = await import("../../src/cli/commands/init.js");
      await ensureClaudeCodeWorktreeConfig(workDir, false);

      const { existsSync } = await import("node:fs");
      expect(existsSync(join(workDir, ".claude", "settings.json"))).toBe(false);
    });

    it("hasClaudeCode=true 且无 settings.json 时创建并写入 worktree.baseRef: head", async () => {
      const { ensureClaudeCodeWorktreeConfig } = await import("../../src/cli/commands/init.js");
      await ensureClaudeCodeWorktreeConfig(workDir, true);

      const content = await readFile(join(workDir, ".claude", "settings.json"), "utf-8");
      const settings = JSON.parse(content);
      expect(settings.worktree.baseRef).toBe("head");
    });

    it("已有 settings.json 时合并写入 worktree.baseRef（保留其他字段）", async () => {
      await mkdir(join(workDir, ".claude"), { recursive: true });
      await writeFile(
        join(workDir, ".claude", "settings.json"),
        JSON.stringify({ someOther: "value" }) + "\n",
        "utf-8"
      );

      const { ensureClaudeCodeWorktreeConfig } = await import("../../src/cli/commands/init.js");
      await ensureClaudeCodeWorktreeConfig(workDir, true);

      const content = await readFile(join(workDir, ".claude", "settings.json"), "utf-8");
      const settings = JSON.parse(content);
      expect(settings.someOther).toBe("value");
      expect(settings.worktree.baseRef).toBe("head");
    });

    it("worktree.baseRef 已是 head 时幂等跳过（不重复写）", async () => {
      await mkdir(join(workDir, ".claude"), { recursive: true });
      const existing = JSON.stringify({ worktree: { baseRef: "head" } }) + "\n";
      await writeFile(join(workDir, ".claude", "settings.json"), existing, "utf-8");

      const { ensureClaudeCodeWorktreeConfig } = await import("../../src/cli/commands/init.js");
      await ensureClaudeCodeWorktreeConfig(workDir, true);

      // 文件内容不变
      const content = await readFile(join(workDir, ".claude", "settings.json"), "utf-8");
      expect(content).toBe(existing);
    });
  });

  describe("initCommand 两阶段确认机制", () => {
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

    it("config 已有 main_branch 时跳过主分支确认（幂等）", async () => {
      mockReadProjectConfig.mockResolvedValue({ schema: "alloy", alloy: { main_branch: "main" } });

      await initCommand(defaultOpts);

      // 不应调用 promptSelect（跳过主分支确认）
      expect(mockPromptSelect).not.toHaveBeenCalled();
      // 仍应调用 promptConfirm（执行清单确认）
      expect(mockPromptConfirm).toHaveBeenCalled();
    });

    it("config 无 main_branch 时触发主分支确认", async () => {
      mockReadProjectConfig.mockResolvedValue({ schema: "alloy", alloy: {} });
      mockPromptSelect.mockResolvedValue("main");
      mockDetectMainBranch.mockReturnValue("main");

      await initCommand(defaultOpts);

      expect(mockPromptSelect).toHaveBeenCalled();
    });

    it("用户在执行清单确认时拒绝 → exit 0，不部署任何文件", async () => {
      mockPromptConfirm.mockResolvedValue(false);

      await initCommand(defaultOpts);

      expect(processExitSpy).toHaveBeenCalledWith(0);
      // 不应执行部署步骤
      expect(mockInstallOpenSpecCli).not.toHaveBeenCalled();
      expect(mockInitOpenSpecProject).not.toHaveBeenCalled();
      expect(mockDeployCommands).not.toHaveBeenCalled();
      expect(mockEnsureGitRepo).not.toHaveBeenCalled();
    });

    it("HEAD unborn 时创建初始 commit（调用 git add + git commit）", async () => {
      mockIsHeadUnborn.mockReturnValue(true);
      let commitCalled = false;
      let addCalled = false;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("rev-parse --git-dir")) return Buffer.from("");
        if (cmd === "git config user.name") return Buffer.from("test-user");
        if (cmd.includes("git commit")) { commitCalled = true; return Buffer.from(""); }
        if (cmd.includes("git add")) { addCalled = true; return Buffer.from(""); }
        return Buffer.from("");
      });

      await initCommand(defaultOpts);

      expect(addCalled).toBe(true);
      expect(commitCalled).toBe(true);
    });

    it("HEAD 非 unborn 时不创建 commit，提示用户自行 commit", async () => {
      mockIsHeadUnborn.mockReturnValue(false);
      let commitCalled = false;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("rev-parse --git-dir")) return Buffer.from("");
        if (cmd === "git config user.name") return Buffer.from("test-user");
        if (cmd.includes("git commit")) { commitCalled = true; return Buffer.from(""); }
        if (cmd.includes("git add")) return Buffer.from("");
        return Buffer.from("");
      });

      await initCommand(defaultOpts);

      expect(commitCalled).toBe(false);
      // 应输出提示（consoleLogSpy 或 info）
      expect(consoleLogSpy.mock.calls.some(c => String(c[0]).includes("自行"))).toBe(true);
    });

    it("git add 某个文件不存在时不阻断 commit（逐个 add 容错）", async () => {
      mockIsHeadUnborn.mockReturnValue(true);
      let commitCalled = false;
      let addCallCount = 0;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("rev-parse --git-dir")) return Buffer.from("");
        if (cmd === "git config user.name") return Buffer.from("test-user");
        if (cmd.includes("git commit")) { commitCalled = true; return Buffer.from(""); }
        if (cmd.includes("git add")) {
          addCallCount++;
          // 模拟 CLAUDE.md 不存在：git add CLAUDE.md 抛错
          if (cmd.includes("CLAUDE.md")) throw new Error("fatal: pathspec 'CLAUDE.md' did not match any files");
          return Buffer.from("");
        }
        return Buffer.from("");
      });

      await initCommand(defaultOpts);

      // 应调用多次 git add（逐个文件）
      expect(addCallCount).toBeGreaterThanOrEqual(5);
      // commit 仍应执行（CLAUDE.md 不存在不阻断）
      expect(commitCalled).toBe(true);
    });

    it("HEAD unborn + gitExists=true（用户曾 git init 无 commit）+ 指定非默认分支时，调整 HEAD symbolic-ref", async () => {
      mockIsHeadUnborn.mockReturnValue(true);
      mockReadProjectConfig.mockResolvedValue({ schema: "alloy", alloy: {} });
      mockPromptSelect.mockResolvedValue("__custom__");
      mockPromptInput.mockResolvedValue("master");
      let symbolicRefCalled = false;
      mockExecSync.mockImplementation((cmd: string, opts?: { encoding?: string }) => {
        const isUtf8 = opts?.encoding === "utf-8";
        const ret = (s: string) => isUtf8 ? s : Buffer.from(s);
        if (cmd.includes("rev-parse --git-dir")) return Buffer.from("");
        if (cmd === "git config user.name") return ret("test-user");
        if (cmd.includes("git symbolic-ref --short HEAD")) return ret("main");
        if (cmd.includes("git symbolic-ref HEAD")) { symbolicRefCalled = true; return Buffer.from(""); }
        if (cmd.includes("git commit")) return Buffer.from("");
        if (cmd.includes("git add")) return Buffer.from("");
        return Buffer.from("");
      });

      await initCommand(defaultOpts);

      expect(symbolicRefCalled).toBe(true);
      const symbolicCall = mockExecSync.mock.calls.find(c => String(c[0]).includes("git symbolic-ref HEAD"));
      expect(String(symbolicCall?.[0])).toContain("refs/heads/master");
    });

    it("HEAD unborn + gitExists=false（alloy init 执行 git init -b）+ 指定非默认分支时，ensureGitRepo 传 -b 参数，不调 symbolic-ref", async () => {
      mockIsHeadUnborn.mockReturnValue(true);
      mockReadProjectConfig.mockResolvedValue({ schema: "alloy", alloy: {} });
      mockPromptSelect.mockResolvedValue("__custom__");
      mockPromptInput.mockResolvedValue("master");
      mockEnsureGitRepo.mockReturnValue("initialized");
      let symbolicRefCalled = false;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("rev-parse --git-dir")) throw new Error("not a repo");  // gitExists=false
        if (cmd === "git config user.name") return Buffer.from("test-user");
        if (cmd.includes("git symbolic-ref")) { symbolicRefCalled = true; return Buffer.from(""); }
        if (cmd.includes("git commit")) return Buffer.from("");
        if (cmd.includes("git add")) return Buffer.from("");
        return Buffer.from("");
      });

      await initCommand(defaultOpts);

      // ensureGitRepo 应传入 initialBranch="master"
      expect(mockEnsureGitRepo).toHaveBeenCalledWith(tmpDir, "master");
      // gitExists=false 时不应调用 symbolic-ref
      expect(symbolicRefCalled).toBe(false);
    });

    it("HEAD unborn 且用户指定默认分支时，不调整 HEAD", async () => {
      mockIsHeadUnborn.mockReturnValue(true);
      mockReadProjectConfig.mockResolvedValue({ schema: "alloy", alloy: {} });
      mockPromptSelect.mockResolvedValue("main");
      let symbolicRefCalled = false;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes("rev-parse --git-dir")) return Buffer.from("");
        if (cmd === "git config user.name") return Buffer.from("test-user");
        if (cmd.includes("git symbolic-ref --short HEAD")) return Buffer.from("main");
        if (cmd.includes("git symbolic-ref HEAD")) { symbolicRefCalled = true; return Buffer.from(""); }
        if (cmd.includes("git commit")) return Buffer.from("");
        if (cmd.includes("git add")) return Buffer.from("");
        return Buffer.from("");
      });

      await initCommand(defaultOpts);

      expect(symbolicRefCalled).toBe(false);
    });

    it("非 0 commit 项目指定不存在的分支时 exit 1", async () => {
      mockIsHeadUnborn.mockReturnValue(false);
      mockReadProjectConfig.mockResolvedValue({ schema: "alloy", alloy: {} });
      mockPromptSelect.mockResolvedValue("__custom__");
      mockPromptInput.mockResolvedValue("master");
      mockExecSync.mockImplementation((cmd: string, opts?: { encoding?: string }) => {
        const isUtf8 = opts?.encoding === "utf-8";
        const ret = (s: string) => isUtf8 ? s : Buffer.from(s);
        if (cmd.includes("rev-parse --git-dir")) return Buffer.from("");
        if (cmd.includes("git branch --list")) return ret("");
        if (cmd === "git branch") return ret("* main\n  dev");
        return Buffer.from("");
      });

      await initCommand(defaultOpts);

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("不存在"));
    });

    it("非 0 commit 项目指定已存在的分支时通过", async () => {
      mockIsHeadUnborn.mockReturnValue(false);
      mockReadProjectConfig.mockResolvedValue({ schema: "alloy", alloy: {} });
      mockPromptSelect.mockResolvedValue("__custom__");
      mockPromptInput.mockResolvedValue("dev");
      mockExecSync.mockImplementation((cmd: string, opts?: { encoding?: string }) => {
        const isUtf8 = opts?.encoding === "utf-8";
        const ret = (s: string) => isUtf8 ? s : Buffer.from(s);
        if (cmd.includes("rev-parse --git-dir")) return Buffer.from("");
        if (cmd.includes("git branch --list")) return ret("dev");
        return Buffer.from("");
      });

      await initCommand(defaultOpts);

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(mockWriteProjectConfig).toHaveBeenCalledWith(
        tmpDir,
        expect.objectContaining({
          alloy: expect.objectContaining({ main_branch: "dev" }),
        })
      );
    });

    it("主分支写入 config（writeProjectConfig 被调用，含 main_branch）", async () => {
      mockReadProjectConfig.mockResolvedValue({ schema: "alloy", alloy: {} });
      mockPromptSelect.mockResolvedValue("develop");

      await initCommand(defaultOpts);

      expect(mockWriteProjectConfig).toHaveBeenCalledWith(
        tmpDir,
        expect.objectContaining({
          alloy: expect.objectContaining({ main_branch: "develop" }),
        })
      );
    });

    it("用户自定义主分支名时调用 promptInput", async () => {
      mockReadProjectConfig.mockResolvedValue({ schema: "alloy", alloy: {} });
      mockPromptSelect.mockResolvedValue("__custom__");
      mockPromptInput.mockResolvedValue("develop");

      await initCommand(defaultOpts);

      expect(mockPromptInput).toHaveBeenCalled();
      expect(mockWriteProjectConfig).toHaveBeenCalledWith(
        tmpDir,
        expect.objectContaining({
          alloy: expect.objectContaining({ main_branch: "develop" }),
        })
      );
    });
  });
});
