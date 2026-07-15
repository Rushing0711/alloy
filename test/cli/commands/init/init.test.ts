// test/cli/commands/init/init.test.ts
// initCommand 编排层集成测试:mock collect/plan/display/execute 四阶段,
// 验证硬校验失败/用户拒绝/正常执行等编排行为。
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../src/cli/commands/init/collect.js", () => ({
  collect: vi.fn(),
}));
vi.mock("../../../../src/cli/commands/init/plan.js", () => ({
  plan: vi.fn(),
}));
vi.mock("../../../../src/cli/commands/init/display.js", () => ({
  displayAndConfirm: vi.fn(),
}));
vi.mock("../../../../src/cli/commands/init/execute.js", () => ({
  execute: vi.fn(),
}));
vi.mock("../../../../src/utils/prompt.js", () => ({
  promptSelect: vi.fn(),
  promptMultiSelect: vi.fn(),
  promptInput: vi.fn(),
  promptConfirm: vi.fn(),
}));
vi.mock("../../../../src/utils/output.js", () => ({
  section: vi.fn(),
  check: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  success: vi.fn(),
  banner: vi.fn(),
}));
vi.mock("../../../../src/core/git.js", () => ({ detectMainBranch: vi.fn() }));
vi.mock("../../../../src/core/agents.js", () => ({ KNOWN_AGENTS: [] }));

import { collect } from "../../../../src/cli/commands/init/collect.js";
import { plan } from "../../../../src/cli/commands/init/plan.js";
import { displayAndConfirm } from "../../../../src/cli/commands/init/display.js";
import { execute } from "../../../../src/cli/commands/init/execute.js";
import { initCommand } from "../../../../src/cli/commands/init/init.js";
import type { CollectResult } from "../../../../src/cli/commands/init/collect.js";
import type { ActionPlan } from "../../../../src/cli/commands/init/plan.js";

const baseCollectResult: CollectResult = {
  env: {
    nodeVersion: "20.0.0",
    nodeOk: true,
    gitVersion: "2.40.0",
    gitOk: true,
  },
  dirRejected: false,
  git: { exists: true, headUnborn: false, existingMainBranch: "main" },
  openSpecCli: { installed: true, version: "1.5.0", needsUpgrade: false },
};

const baseActionPlan: ActionPlan = {
  scope: "project",
  targetAgents: [],
  mainBranch: "main",
  openSpecCliAction: { install: false, reason: "" },
  agentActions: [],
  projectResources: [],
  hasBreaking: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(collect).mockResolvedValue(baseCollectResult);
  vi.mocked(plan).mockResolvedValue(baseActionPlan);
  vi.mocked(displayAndConfirm).mockResolvedValue(true);
  vi.mocked(execute).mockResolvedValue(undefined);
});

describe("initCommand", () => {
  it("硬校验失败(Node < 18)时 exit(1)", async () => {
    vi.mocked(collect).mockResolvedValue({
      ...baseCollectResult,
      env: {
        nodeVersion: "16.0.0",
        nodeOk: false,
        gitVersion: "2.40.0",
        gitOk: true,
      },
    });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: number) => {
        throw new Error(`exit:${code}`);
      });
    await expect(
      initCommand({ projectPath: "/test", scope: "project", targetAgents: [], force: false })
    ).rejects.toThrow("exit:1");
    expect(execute).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("硬校验失败(Git 未安装)时 exit(1)", async () => {
    vi.mocked(collect).mockResolvedValue({
      ...baseCollectResult,
      env: {
        nodeVersion: "20.0.0",
        nodeOk: true,
        gitVersion: "",
        gitOk: false,
      },
    });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: number) => {
        throw new Error(`exit:${code}`);
      });
    await expect(
      initCommand({ projectPath: "/test", scope: "project", targetAgents: [], force: false })
    ).rejects.toThrow("exit:1");
    expect(execute).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("dirRejected=true 时 exit(1)", async () => {
    vi.mocked(collect).mockResolvedValue({ ...baseCollectResult, dirRejected: true });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: number) => {
        throw new Error(`exit:${code}`);
      });
    await expect(
      initCommand({ projectPath: "/test", scope: "project", targetAgents: [], force: false })
    ).rejects.toThrow("exit:1");
    expect(execute).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("用户拒绝确认时 exit(0),不执行", async () => {
    vi.mocked(displayAndConfirm).mockResolvedValue(false);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: number) => {
        throw new Error(`exit:${code}`);
      });
    await expect(
      initCommand({ projectPath: "/test", scope: "project", targetAgents: [], force: false })
    ).rejects.toThrow("exit:0");
    expect(execute).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("确认后调用 execute(完整编排)", async () => {
    await initCommand({
      projectPath: "/test",
      scope: "project",
      targetAgents: [],
      force: false,
    });

    expect(collect).toHaveBeenCalledWith("/test");
    expect(plan).toHaveBeenCalled();
    expect(displayAndConfirm).toHaveBeenCalled();
    expect(execute).toHaveBeenCalled();
  });

  it("scope 来源统一:opts.scope 透传到 plan 和 execute", async () => {
    await initCommand({
      projectPath: "/test",
      scope: "global",
      targetAgents: [],
      force: false,
    });

    // plan 接收的 choices.scope 应为 opts.scope
    const planCall = vi.mocked(plan).mock.calls[0];
    expect(planCall?.[1].scope).toBe("global");
    // execute 接收的 opts.scope 应为同一值
    const executeCall = vi.mocked(execute).mock.calls[0];
    expect(executeCall?.[1].scope).toBe("global");
  });

  it("existingMainBranch 存在时跳过主分支确认(selectMainBranch 透传)", async () => {
    // baseCollectResult.git.existingMainBranch = "main",不触发 promptSelect
    await initCommand({
      projectPath: "/test",
      scope: "project",
      targetAgents: [],
      force: false,
    });

    const { promptSelect } = await import("../../../../src/utils/prompt.js");
    expect(promptSelect).not.toHaveBeenCalled();
    // plan 接收的 mainBranch 应为 existingMainBranch
    const planCall = vi.mocked(plan).mock.calls[0];
    expect(planCall?.[1].mainBranch).toBe("main");
  });

  it("force=true 透传到 displayAndConfirm", async () => {
    await initCommand({
      projectPath: "/test",
      scope: "project",
      targetAgents: [],
      force: true,
    });

    expect(displayAndConfirm).toHaveBeenCalledWith(expect.anything(), true);
  });
});
