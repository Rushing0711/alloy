// test/cli/commands/clean.test.ts
// cleanCommand 编排层测试:mock scanForClean/executeClean/prompt,
// 验证 scope 解析、空清单退出、--force 跳过确认、拒绝确认不执行、确认后执行。
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock 所有外部依赖(参考 init.test.ts 模式)
vi.mock("../../../src/core/clean.js", () => ({
  scanForClean: vi.fn(),
  executeClean: vi.fn(),
}));
vi.mock("../../../src/core/agents.js", () => ({ KNOWN_AGENTS: [] }));
vi.mock("../../../src/utils/prompt.js", () => ({
  promptSelect: vi.fn(),
  promptConfirm: vi.fn(),
}));
vi.mock("../../../src/utils/output.js", () => ({
  section: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  check: vi.fn(),
  banner: vi.fn(),
}));

import { scanForClean, executeClean } from "../../../src/core/clean.js";
import { promptSelect, promptConfirm } from "../../../src/utils/prompt.js";
import { info, success, warn, error } from "../../../src/utils/output.js";
import {
  cleanCommand,
  selectScope,
  isPlanEmpty,
  displayCleanPlan,
} from "../../../src/cli/commands/clean.js";
import type { CleanPlan, CleanResult } from "../../../src/core/clean.js";

// 构造空 CleanPlan(scope=project)
function makeEmptyPlan(
  scope: "global" | "project" = "project"
): CleanPlan {
  return {
    scope,
    alloySkillsPaths: [],
    alloyVersionFiles: [],
    opsxPaths: [],
    opencodeCommandWrappers: [],
    superpowersSkillNames: [],
    skillsLockFiles: [],
    hookConfigs: [],
    permissionConfigs: [],
    preCommitFile: null,
    openspecSchemaDir: null,
    openspecConfigFile: null,
    emptyConfigFiles: [],
  };
}

// 构造有产物的 CleanPlan(project scope,覆盖所有类别)
function makeFullPlan(): CleanPlan {
  return {
    scope: "project",
    alloySkillsPaths: ["/proj/.claude/skills/alloy-start", "/proj/.claude/skills/alloy-plan"],
    alloyVersionFiles: ["/proj/.claude/skills/.alloy-version"],
    opsxPaths: ["/proj/.claude/commands/opsx"],
    opencodeCommandWrappers: ["/proj/.opencode/commands/alloy-start.md"],
    superpowersSkillNames: ["brainstorming", "systematic-debugging"],
    skillsLockFiles: ["/proj/skills-lock.json"],
    hookConfigs: [{ file: "/proj/.claude/settings.json", agentId: "claude-code" }],
    permissionConfigs: [{ file: "/proj/.claude/settings.json", agentId: "claude-code" }],
    preCommitFile: "/proj/.git/hooks/pre-commit",
    openspecSchemaDir: "/proj/openspec/schemas/alloy",
    openspecConfigFile: "/proj/openspec/config.yaml",
    emptyConfigFiles: ["/proj/.pi/permissions.json"],
  };
}

// 构造 global scope 的 CleanPlan(含 .alloy-version)
function makeGlobalPlan(): CleanPlan {
  return {
    scope: "global",
    alloySkillsPaths: ["/home/.claude/skills/alloy-start"],
    alloyVersionFiles: ["/home/.claude/skills/.alloy-version"],
    opsxPaths: ["/home/.claude/commands/opsx"],
    opencodeCommandWrappers: ["/home/.config/opencode/commands/alloy-start.md"],
    superpowersSkillNames: ["brainstorming"],
    skillsLockFiles: [],
    hookConfigs: [],
    permissionConfigs: [],
    preCommitFile: null,
    openspecSchemaDir: null,
    openspecConfigFile: null,
    emptyConfigFiles: [],
  };
}

// 构造 CleanResult
function makeResult(overrides: Partial<CleanResult> = {}): CleanResult {
  return {
    removed: ["/proj/.claude/skills/alloy-start"],
    modified: ["/proj/.gitignore"],
    superpowersNpxSuccess: true,
    errors: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(scanForClean).mockResolvedValue(makeEmptyPlan());
  vi.mocked(executeClean).mockResolvedValue(makeResult());
  vi.mocked(promptSelect).mockResolvedValue("project");
  vi.mocked(promptConfirm).mockResolvedValue(true);
});

describe("cleanCommand", () => {
  it("--scope 传参跳过交互(promptSelect 不被调用)", async () => {
    await cleanCommand({ projectPath: "/proj", scope: "project", force: true });

    expect(promptSelect).not.toHaveBeenCalled();
    // scanForClean 用传入的 scope 调用
    expect(scanForClean).toHaveBeenCalledWith("/proj", "project", expect.any(Array));
  });

  it("scope 未传参时交互式选择", async () => {
    vi.mocked(promptSelect).mockResolvedValue("global");
    vi.mocked(scanForClean).mockResolvedValue(makeEmptyPlan("global"));

    await cleanCommand({ projectPath: "/proj", force: true });

    expect(promptSelect).toHaveBeenCalledTimes(1);
    expect(scanForClean).toHaveBeenCalledWith("/proj", "global", expect.any(Array));
  });

  it("无产物时仍调 executeClean 清理空残留,无清理则提示无产物", async () => {
    vi.mocked(scanForClean).mockResolvedValue(makeEmptyPlan());
    // executeClean 无清理动作(空 plan 没有空残留/空目录可清)
    vi.mocked(executeClean).mockResolvedValue(
      makeResult({ removed: [], modified: [] })
    );

    await cleanCommand({ projectPath: "/proj", scope: "project", force: true });

    // isPlanEmpty 时仍调 executeClean(清理可能的空残留/空目录)
    expect(executeClean).toHaveBeenCalledWith(
      "/proj",
      "project",
      expect.objectContaining({ scope: "project" })
    );
    // executeClean 无清理动作时输出"无产物"提示
    expect(vi.mocked(info)).toHaveBeenCalledWith(
      expect.stringContaining("无 alloy 产物可清理")
    );
  });

  it("无产物但有空残留时调 executeClean 清理 + 输出摘要", async () => {
    // plan 整体为空(无 alloy skills/hooks 等),但 emptyConfigFiles 含空残留文件
    const planWithEmpty = makeEmptyPlan();
    planWithEmpty.emptyConfigFiles = ["/proj/.pi/permissions.json"];
    vi.mocked(scanForClean).mockResolvedValue(planWithEmpty);
    vi.mocked(executeClean).mockResolvedValue(
      makeResult({ removed: ["/proj/.pi/permissions.json"], modified: [] })
    );

    await cleanCommand({ projectPath: "/proj", scope: "project", force: true });

    // 调 executeClean 清理空残留
    expect(executeClean).toHaveBeenCalledWith(
      "/proj",
      "project",
      expect.objectContaining({ scope: "project" })
    );
    // 输出删除摘要(不输出"无产物"提示)
    expect(vi.mocked(success)).toHaveBeenCalledWith("删除 1 个路径");
    expect(vi.mocked(info)).not.toHaveBeenCalledWith(
      expect.stringContaining("无 alloy 产物可清理")
    );
  });

  it("--force 跳过确认(promptConfirm 不被调用)", async () => {
    vi.mocked(scanForClean).mockResolvedValue(makeFullPlan());

    await cleanCommand({ projectPath: "/proj", scope: "project", force: true });

    expect(promptConfirm).not.toHaveBeenCalled();
    expect(executeClean).toHaveBeenCalledWith(
      "/proj",
      "project",
      expect.objectContaining({ scope: "project" })
    );
  });

  it("用户拒绝确认时不执行 executeClean,exit(0)", async () => {
    vi.mocked(scanForClean).mockResolvedValue(makeFullPlan());
    vi.mocked(promptConfirm).mockResolvedValue(false);

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: number) => {
        throw new Error(`exit:${code}`);
      });

    await expect(
      cleanCommand({ projectPath: "/proj", scope: "project", force: false })
    ).rejects.toThrow("exit:0");

    expect(executeClean).not.toHaveBeenCalled();
    expect(promptConfirm).toHaveBeenCalledWith("确认清理以上产物?", false);
    exitSpy.mockRestore();
  });

  it("用户确认后执行 executeClean + 输出结果摘要", async () => {
    vi.mocked(scanForClean).mockResolvedValue(makeFullPlan());
    vi.mocked(executeClean).mockResolvedValue(
      makeResult({
        removed: ["/proj/.claude/skills/alloy-start", "/proj/.git/hooks/pre-commit"],
        modified: ["/proj/.gitignore", "/proj/.claude/settings.json"],
        superpowersNpxSuccess: true,
        errors: [],
      })
    );

    await cleanCommand({ projectPath: "/proj", scope: "project", force: false });

    expect(promptConfirm).toHaveBeenCalledTimes(1);
    expect(executeClean).toHaveBeenCalledWith(
      "/proj",
      "project",
      expect.objectContaining({ scope: "project" })
    );
    // 输出摘要:删除 2 个路径、修改 2 个文件、Superpowers npx 成功
    expect(vi.mocked(success)).toHaveBeenCalledWith("删除 2 个路径");
    expect(vi.mocked(success)).toHaveBeenCalledWith("修改 2 个文件");
    expect(vi.mocked(success)).toHaveBeenCalledWith(
      expect.stringContaining("Superpowers npx skills remove 成功")
    );
  });

  it("executeClean 返回错误时输出错误信息", async () => {
    vi.mocked(scanForClean).mockResolvedValue(makeFullPlan());
    vi.mocked(executeClean).mockResolvedValue(
      makeResult({
        removed: [],
        modified: [],
        superpowersNpxSuccess: false,
        errors: ["删除失败 /proj/.gitignore: EACCES", "清理 settings.json 失败: 解析错误"],
      })
    );

    await cleanCommand({ projectPath: "/proj", scope: "project", force: true });

    // 输出错误信息
    expect(vi.mocked(error)).toHaveBeenCalledWith("发生 2 个错误:");
    expect(vi.mocked(error)).toHaveBeenCalledWith(
      "  - 删除失败 /proj/.gitignore: EACCES"
    );
    // Superpowers npx 失败时输出 warn(提示用户手动清理,不 fallback 删文件)
    expect(vi.mocked(warn)).toHaveBeenCalledWith(
      "Superpowers npx 失败,请手动运行 npx skills remove"
    );
  });

  it("scope 透传到 scanForClean 和 executeClean(来源统一)", async () => {
    vi.mocked(scanForClean).mockResolvedValue(makeGlobalPlan());

    await cleanCommand({ projectPath: "/proj", scope: "global", force: true });

    // scan 用 global
    expect(scanForClean).toHaveBeenCalledWith("/proj", "global", expect.any(Array));
    // execute 也用同一个 global
    expect(executeClean).toHaveBeenCalledWith(
      "/proj",
      "global",
      expect.objectContaining({ scope: "global" })
    );
  });

  it("Superpowers npx 失败时输出手动清理提示", async () => {
    vi.mocked(scanForClean).mockResolvedValue(makeFullPlan());
    vi.mocked(executeClean).mockResolvedValue(
      makeResult({
        removed: [],
        modified: [],
        superpowersNpxSuccess: false,
        errors: [],
      })
    );

    await cleanCommand({ projectPath: "/proj", scope: "project", force: true });

    expect(vi.mocked(warn)).toHaveBeenCalledWith(
      "Superpowers npx 失败,请手动运行 npx skills remove"
    );
  });

  it("无 superpowers 产物时不输出 Superpowers 状态", async () => {
    const planNoSuperpowers = makeFullPlan();
    planNoSuperpowers.superpowersSkillNames = [];
    vi.mocked(scanForClean).mockResolvedValue(planNoSuperpowers);
    vi.mocked(executeClean).mockResolvedValue(
      makeResult({
        removed: ["/proj/.claude/skills/alloy-start"],
        modified: [],
        superpowersNpxSuccess: false, // 无 superpowers,npx 状态不报告
        errors: [],
      })
    );

    await cleanCommand({ projectPath: "/proj", scope: "project", force: true });

    // 不应输出 Superpowers 相关信息
    expect(vi.mocked(success)).not.toHaveBeenCalledWith(
      expect.stringContaining("Superpowers npx skills remove 成功")
    );
    expect(vi.mocked(warn)).not.toHaveBeenCalledWith(
      "Superpowers npx 失败,请手动运行 npx skills remove"
    );
  });
});

describe("selectScope", () => {
  it("传入 'project' 直接返回,不调 promptSelect", async () => {
    const result = await selectScope("project");
    expect(result).toBe("project");
    expect(promptSelect).not.toHaveBeenCalled();
  });

  it("传入 'global' 直接返回,不调 promptSelect", async () => {
    const result = await selectScope("global");
    expect(result).toBe("global");
    expect(promptSelect).not.toHaveBeenCalled();
  });

  it("传入 undefined 时交互式选择,默认 project", async () => {
    vi.mocked(promptSelect).mockResolvedValue("project");
    const result = await selectScope(undefined);
    expect(result).toBe("project");
    expect(promptSelect).toHaveBeenCalledWith(
      "Clean scope:",
      expect.arrayContaining([
        expect.objectContaining({ value: "project" }),
        expect.objectContaining({ value: "global" }),
      ]),
      { default: "project" }
    );
  });

  it("传入非法值时 fallback 到交互式选择", async () => {
    vi.mocked(promptSelect).mockResolvedValue("global");
    const result = await selectScope("invalid");
    expect(result).toBe("global");
    expect(promptSelect).toHaveBeenCalled();
  });
});

describe("isPlanEmpty", () => {
  it("所有字段为空/null 时返回 true", () => {
    expect(isPlanEmpty(makeEmptyPlan())).toBe(true);
    expect(isPlanEmpty(makeEmptyPlan("global"))).toBe(true);
  });

  it("有 alloySkillsPaths 时返回 false", () => {
    const plan = makeEmptyPlan();
    plan.alloySkillsPaths = ["/some/path"];
    expect(isPlanEmpty(plan)).toBe(false);
  });

  it("只有 alloyVersionFiles 时返回 false", () => {
    const plan = makeEmptyPlan("global");
    plan.alloyVersionFiles = ["/home/.claude/skills/.alloy-version"];
    expect(isPlanEmpty(plan)).toBe(false);
  });

  it("只有 openspecConfigFile 时返回 false", () => {
    const plan = makeEmptyPlan();
    plan.openspecConfigFile = "/proj/openspec/config.yaml";
    expect(isPlanEmpty(plan)).toBe(false);
  });

  it("只有 skillsLockFiles 时返回 false", () => {
    const plan = makeEmptyPlan();
    plan.skillsLockFiles = ["/proj/skills-lock.json"];
    expect(isPlanEmpty(plan)).toBe(false);
  });
});

describe("displayCleanPlan", () => {
  it("project scope 完整清单分组展示所有类别", () => {
    const plan = makeFullPlan();
    const lines = displayCleanPlan(plan);

    // 每个类别都出现
    expect(lines.some((l) => l.includes("Alloy skills"))).toBe(true);
    expect(lines.some((l) => l.includes(".alloy-version"))).toBe(true);
    expect(lines.some((l) => l.includes("OpenSpec Commands"))).toBe(true);
    expect(lines.some((l) => l.includes("Superpowers"))).toBe(true);
    expect(lines.some((l) => l.includes("Hook/permissions"))).toBe(true);
    expect(lines.some((l) => l.includes("项目配置文件"))).toBe(true);
    expect(lines.some((l) => l.includes("skills-lock.json"))).toBe(true);
    expect(lines.some((l) => l.includes("openspec"))).toBe(true);
  });

  it("global scope 展示 .alloy-version,无项目配置", () => {
    const plan = makeGlobalPlan();
    const lines = displayCleanPlan(plan);

    expect(lines.some((l) => l.includes(".alloy-version"))).toBe(true);
    expect(lines.some((l) => l.includes("/home/.claude/skills/.alloy-version"))).toBe(true);
    // global 无项目配置文件
    expect(lines.some((l) => l.includes("项目配置文件"))).toBe(false);
    expect(lines.some((l) => l.includes("openspec"))).toBe(false);
  });

  it("同一文件被 hookConfigs 和 permissionConfigs 引用时去重展示", () => {
    const plan = makeFullPlan();
    // makeFullPlan 中 hookConfigs 和 permissionConfigs 都指向同一文件
    const lines = displayCleanPlan(plan);
    const hookSection = lines.filter((l) => l.includes("Hook/permissions"));
    // 标题显示 1 个文件(去重后)
    expect(hookSection[0]).toContain("1 个配置文件");
    // 只列一行文件路径
    const fileList = lines.filter((l) => l.startsWith("  - /proj/.claude/settings.json"));
    expect(fileList.length).toBe(1);
  });

  it("显示路径数和路径列表", () => {
    const plan = makeFullPlan();
    const lines = displayCleanPlan(plan);
    // Alloy skills 有 2 个目录
    const alloyLine = lines.find((l) => l.includes("Alloy skills"));
    expect(alloyLine).toContain("2 个目录");
    // 路径列表含 alloy-start 和 alloy-plan
    expect(lines.some((l) => l.includes("alloy-start"))).toBe(true);
    expect(lines.some((l) => l.includes("alloy-plan"))).toBe(true);
  });

  it("清理范围标注 project/global", () => {
    const projectPlan = makeFullPlan();
    const globalPlan = makeGlobalPlan();
    expect(displayCleanPlan(projectPlan)[0]).toContain("Project");
    expect(displayCleanPlan(globalPlan)[0]).toContain("Global");
  });
});
