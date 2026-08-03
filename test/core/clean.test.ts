// test/core/clean.test.ts
// 用 tmpdir 真实文件系统验证 scanForClean + executeClean。
// mock execSync(npx skills remove),不 mock fs。
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// mock execSync(npx skills remove),控制成功/失败
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { scanForClean, executeClean } from "../../src/core/clean.js";
import { KNOWN_AGENTS, getSkillTargetDir } from "../../src/core/agents.js";
import { ALLOY_PERMISSIONS } from "../../src/core/agent-config.js";
import { getPackageRoot } from "../../src/utils/fs.js";

const mockedExecSync = vi.mocked(execSync);

// 模拟 `skills ls -g` 的输出(含 Superpowers skill + 非 Superpowers skill)
// Superpowers 的 skill 装到 ~/.agents/skills/(路径含 .agents/skills/)
// caveman/find-skills 在 ~/.claude/skills/(用户独立装的,不清)
// 模拟 `skills ls -g` 真实输出(含 ANSI 颜色码,行首无空格--与实际 execSync 捕获一致)
const SKILLS_LS_OUTPUT = `\x1b[1mGlobal Skills\x1b[0m

\x1b[1mMattpocock Skills\x1b[0m
\x1b[36mcaveman\x1b[0m \x1b[38;5;102m~/.claude/skills/caveman\x1b[0m \x1b[38;5;102mAgents:\x1b[0m Claude Code

\x1b[1mGeneral\x1b[0m
\x1b[36mbrainstorming                 \x1b[0m \x1b[38;5;102m~/.agents/skills/brainstorming                 \x1b[0m \x1b[38;5;102mAgents:\x1b[0m Claude Code, OpenClaw, Codex
\x1b[36mdispatching-parallel-agents   \x1b[0m \x1b[38;5;102m~/.agents/skills/dispatching-parallel-agents   \x1b[0m \x1b[38;5;102mAgents:\x1b[0m Claude Code, OpenClaw, Codex
\x1b[36mexecuting-plans               \x1b[0m \x1b[38;5;102m~/.agents/skills/executing-plans               \x1b[0m \x1b[38;5;102mAgents:\x1b[0m Claude Code, ...
\x1b[36mfind-skills                   \x1b[0m \x1b[38;5;102m~/.claude/skills/find-skills                   \x1b[0m \x1b[38;5;102mAgents:\x1b[0m Claude Code
`;

// 模拟 alloy CLI 绝对路径(与 agent-config.ts 的 getHookCommand 一致)
const alloyCliPath = join(getPackageRoot(), "dist", "cli", "index.js");
const HOOK_COMMAND = `node ${alloyCliPath} _hook-guard`;
const STOP_COMMAND = `node ${alloyCliPath} _stop-guard`;

// 4 个 agent 定义(与 KNOWN_AGENTS 一致,测试用)
const AGENTS = KNOWN_AGENTS;

// 保存原始 HOME,测试期间临时改写
let originalHome: string | undefined;
let homeDir: string;
let projectDir: string;

beforeEach(async () => {
  originalHome = process.env.HOME;
  // 每个测试用独立的 home 和 project 目录,避免污染
  homeDir = join(tmpdir(), `alloy-clean-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  projectDir = join(tmpdir(), `alloy-clean-proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(homeDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });
  process.env.HOME = homeDir;
  mockedExecSync.mockReset();
  // 默认返回空(skills ls 无输出 -> parseSuperpowersSkills 返回 [])
  // 避免默认 undefined 调 .toString() 抛异常(虽然源码有 catch,但显式返回更清晰)
  mockedExecSync.mockReturnValue(Buffer.from(""));
});

afterEach(async () => {
  process.env.HOME = originalHome;
  await rm(homeDir, { recursive: true, force: true });
  await rm(projectDir, { recursive: true, force: true });
});

// 辅助:在 home/project 下创建 alloy-* skills 目录
async function createAlloySkillsAt(base: string, agentId: string) {
  const agent = AGENTS.find((a) => a.id === agentId)!;
  // 用 getSkillTargetDir 推导路径(与 scanForClean 一致)
  const scope = base === homeDir ? "global" : "project";
  const targetDir = getSkillTargetDir(agent, scope, projectDir);
  await mkdir(join(targetDir, "alloy-start"), { recursive: true });
  await writeFile(join(targetDir, "alloy-start", "SKILL.md"), "# alloy-start", "utf-8");
  await mkdir(join(targetDir, "alloy-plan"), { recursive: true });
  await writeFile(join(targetDir, "alloy-plan", "SKILL.md"), "# alloy-plan", "utf-8");
}

describe("scanForClean - scope=global", () => {
  it("无产物时返回空清单", async () => {
    const plan = await scanForClean(projectDir, "global", AGENTS);
    expect(plan.alloySkillsPaths).toEqual([]);
    expect(plan.alloyVersionFiles).toEqual([]);
    expect(plan.opsxPaths).toEqual([]);
    expect(plan.opencodeCommandWrappers).toEqual([]);
    expect(plan.superpowersSkillNames).toEqual([]);
    expect(plan.hookConfigs).toEqual([]);
    expect(plan.permissionConfigs).toEqual([]);
    expect(plan.skillsLockFiles).toEqual([]);
    expect(plan.openspecSchemaDir).toBeNull();
    expect(plan.openspecConfigFile).toBeNull();
  });

  it("扫描 4 个 agent 的 alloy-* 目录", async () => {
    // 在 home 下创建 claude-code/opencode/pi 的 alloy skills
    for (const agent of AGENTS) {
      await createAlloySkillsAt(homeDir, agent.id);
    }
    const plan = await scanForClean(projectDir, "global", AGENTS);
    // 4 个 agent * 2 个 alloy-* 目录(alloy-start + alloy-plan)= 8 个路径
    expect(plan.alloySkillsPaths.length).toBe(8);
    // 每个路径都含 alloy- 前缀
    for (const p of plan.alloySkillsPaths) {
      expect(p).toMatch(/alloy-(start|plan)$/);
    }
  });

  it("扫描 claude-code 的 opsx 目录", async () => {
    await mkdir(join(homeDir, ".claude", "commands", "opsx"), { recursive: true });
    await writeFile(
      join(homeDir, ".claude", "commands", "opsx", "explore.md"),
      "# explore",
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "global", AGENTS);
    expect(plan.opsxPaths.some((p) => p.endsWith(join(".claude", "commands", "opsx")))).toBe(true);
  });

  it("扫描 Superpowers skill(skills ls 检测)", async () => {
    // scan 改用 `npx skills ls -g` 列出已装 skill,解析输出,用 vendor 列表精确识别 Superpowers 的 skill
    // mock execSync 返回模拟的 skills ls 输出(含 Superpowers skill + 非 Superpowers skill)
    mockedExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes("skills ls")) return Buffer.from(SKILLS_LS_OUTPUT);
      return Buffer.from("");
    }) as any);

    const plan = await scanForClean(projectDir, "global", AGENTS);
    // 只含 Superpowers 的 skill(在 vendor/superpowers/skills/ 列表里的)
    expect(plan.superpowersSkillNames).toContain("brainstorming");
    expect(plan.superpowersSkillNames).toContain("dispatching-parallel-agents");
    expect(plan.superpowersSkillNames).toContain("executing-plans");
    // 不含 caveman/find-skills(用户独立装的,在 ~/.claude/skills/ 下,不在 vendor 列表)
    expect(plan.superpowersSkillNames).not.toContain("caveman");
    expect(plan.superpowersSkillNames).not.toContain("find-skills");
  });

  it("扫描 Superpowers skill 时排除其他包装到 .agents/skills/ 的 skill(vendor 列表精确识别)", async () => {
    // 场景:用户用 `npx skills add vercel-labs/agent-skills` 装了其他包,skill 也在 ~/.agents/skills/ 下
    // 但不在 alloy 的 vendor/superpowers/skills/ 列表里,应被排除
    const outputWithOtherPackage = `\x1b[1mGlobal Skills\x1b[0m

\x1b[1mGeneral\x1b[0m
\x1b[36mbrainstorming                 \x1b[0m \x1b[38;5;102m~/.agents/skills/brainstorming                 \x1b[0m \x1b[38;5;102mAgents:\x1b[0m Claude Code
\x1b[36mvercel-skill                  \x1b[0m \x1b[38;5;102m~/.agents/skills/vercel-skill                  \x1b[0m \x1b[38;5;102mAgents:\x1b[0m Claude Code
`;
    mockedExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes("skills ls")) return Buffer.from(outputWithOtherPackage);
      return Buffer.from("");
    }) as any);

    const plan = await scanForClean(projectDir, "global", AGENTS);
    // 只含 Superpowers 的 brainstorming(vercel-skill 不在 vendor 列表,排除)
    expect(plan.superpowersSkillNames).toContain("brainstorming");
    expect(plan.superpowersSkillNames).not.toContain("vercel-skill");
  });

  it("扫描 .alloy-version 文件(deploySkills 写的版本标记)", async () => {
    // 每个 agent 的 skills 目录下创建 .alloy-version 文件
    for (const agent of AGENTS) {
      const skillsDir = getSkillTargetDir(agent, "global", projectDir);
      await mkdir(skillsDir, { recursive: true });
      await writeFile(join(skillsDir, ".alloy-version"), "0.4.0\n", "utf-8");
    }
    const plan = await scanForClean(projectDir, "global", AGENTS);
    // 4 个 agent 各一个 .alloy-version 文件
    expect(plan.alloyVersionFiles.length).toBe(4);
    for (const p of plan.alloyVersionFiles) {
      expect(p.endsWith(".alloy-version")).toBe(true);
    }
  });
});

describe("scanForClean - scope=project", () => {
  it("扫描项目级 alloy-* 目录", async () => {
    for (const agent of AGENTS) {
      await createAlloySkillsAt(projectDir, agent.id);
    }
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.alloySkillsPaths.length).toBe(8);
  });

  it("扫描项目级 opsx 文件", async () => {
    await mkdir(join(projectDir, ".claude", "commands"), { recursive: true });
    await writeFile(
      join(projectDir, ".claude", "commands", "opsx-explore.md"),
      "# explore",
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.opsxPaths.some((p) => p.endsWith("opsx-explore.md"))).toBe(true);
  });

  it("扫描 settings.json 的 alloy hook 条目", async () => {
    await mkdir(join(projectDir, ".claude"), { recursive: true });
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [{ type: "command", command: HOOK_COMMAND }],
          },
        ],
        Stop: [{ hooks: [{ type: "command", command: STOP_COMMAND }] }],
      },
    };
    await writeFile(
      join(projectDir, ".claude", "settings.json"),
      JSON.stringify(settings),
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.hookConfigs.some((h) => h.agentId === "claude-code")).toBe(true);
  });

  it("扫描 settings.json 的 alloy permissions", async () => {
    await mkdir(join(projectDir, ".claude"), { recursive: true });
    const settings = {
      permissions: { allow: [...ALLOY_PERMISSIONS.allow, "Bash(npm test)"], deny: ALLOY_PERMISSIONS.deny },
    };
    await writeFile(
      join(projectDir, ".claude", "settings.json"),
      JSON.stringify(settings),
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.permissionConfigs.some((p) => p.agentId === "claude-code")).toBe(true);
  });

  it("扫描 .pre-commit 含 _pre-commit-check", async () => {
    await mkdir(join(projectDir, ".git", "hooks"), { recursive: true });
    await writeFile(
      join(projectDir, ".git", "hooks", "pre-commit"),
      `#!/bin/sh\n# Alloy pre-commit hook\nnode ${alloyCliPath} _pre-commit-check\n`,
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.preCommitFile).toBe(join(projectDir, ".git", "hooks", "pre-commit"));
  });

  it("扫描 openspec/schemas/alloy 目录 + config.yaml", async () => {
    await mkdir(join(projectDir, "openspec", "schemas", "alloy"), { recursive: true });
    await writeFile(
      join(projectDir, "openspec", "schemas", "alloy", "change.md"),
      "# alloy schema",
      "utf-8"
    );
    await mkdir(join(projectDir, "openspec"), { recursive: true });
    await writeFile(
      join(projectDir, "openspec", "config.yaml"),
      "schema: alloy\nalloy:\n  main_branch: main\n  install_scope: project\n  target_agents:\n    - claude-code\n",
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.openspecSchemaDir).toBe(
      join(projectDir, "openspec", "schemas", "alloy")
    );
    expect(plan.openspecConfigFile).toBe(join(projectDir, "openspec", "config.yaml"));
  });

  it("扫描 skills-lock.json(npx skills add 创建的锁文件)", async () => {
    await writeFile(
      join(projectDir, "skills-lock.json"),
      '{"version":"1.0","skills":[]}',
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.skillsLockFiles).toEqual([join(projectDir, "skills-lock.json")]);
  });

  it("扫描 OpenCode command wrapper(alloy init 装的 /alloy-* 触发器)", async () => {
    await mkdir(join(projectDir, ".opencode", "commands"), { recursive: true });
    // 写 2 个 alloy wrapper(内容含 skill 调用指示)
    await writeFile(
      join(projectDir, ".opencode", "commands", "alloy-start.md"),
      `---\ndescription: test\n---\n调用 skill({ name: "alloy-start" }) 工具加载 SKILL.md`,
      "utf-8"
    );
    await writeFile(
      join(projectDir, ".opencode", "commands", "alloy-plan.md"),
      `---\ndescription: test\n---\n调用 skill({ name: "alloy-plan" }) 工具加载 SKILL.md`,
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.opencodeCommandWrappers.length).toBe(2);
    expect(plan.opencodeCommandWrappers).toContain(join(projectDir, ".opencode", "commands", "alloy-start.md"));
    expect(plan.opencodeCommandWrappers).toContain(join(projectDir, ".opencode", "commands", "alloy-plan.md"));
  });

  it("OpenCode command wrapper 精确识别:不含 skill 调用指示的 alloy-*.md 不清理", async () => {
    await mkdir(join(projectDir, ".opencode", "commands"), { recursive: true });
    // 用户自定义的 alloy-custom.md(不是 alloy wrapper,不清理)
    await writeFile(
      join(projectDir, ".opencode", "commands", "alloy-custom.md"),
      `---\ndescription: 用户自定义\n---\n这是用户自己写的 command,不是 alloy wrapper`,
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.opencodeCommandWrappers).toEqual([]);
  });
});

describe("executeClean - scope=global", () => {
  it("删 alloy-* 目录", async () => {
    for (const agent of AGENTS) {
      await createAlloySkillsAt(homeDir, agent.id);
    }
    const plan = await scanForClean(projectDir, "global", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from("")); // npx 成功

    const result = await executeClean(projectDir, "global", plan);

    expect(result.removed.length).toBe(8);
    for (const p of plan.alloySkillsPaths) {
      expect(existsSync(p)).toBe(false);
    }
  });

  it("删 opsx 文件", async () => {
    await mkdir(join(homeDir, ".claude", "commands"), { recursive: true });
    await writeFile(join(homeDir, ".claude", "commands", "opsx-explore.md"), "", "utf-8");
    const plan = await scanForClean(projectDir, "global", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    const result = await executeClean(projectDir, "global", plan);

    expect(result.removed.some((p) => p.endsWith("opsx-explore.md"))).toBe(true);
    expect(existsSync(join(homeDir, ".claude", "commands", "opsx-explore.md"))).toBe(false);
  });

  it("删 .alloy-version 文件", async () => {
    // 每个 agent 的 skills 目录下创建 .alloy-version 文件
    for (const agent of AGENTS) {
      const skillsDir = getSkillTargetDir(agent, "global", projectDir);
      await mkdir(skillsDir, { recursive: true });
      await writeFile(join(skillsDir, ".alloy-version"), "0.4.0\n", "utf-8");
    }
    const plan = await scanForClean(projectDir, "global", AGENTS);
    expect(plan.alloyVersionFiles.length).toBe(4);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    const result = await executeClean(projectDir, "global", plan);

    // 3 个 .alloy-version 文件都被删
    expect(result.removed.filter((p) => p.endsWith(".alloy-version")).length).toBe(4);
    for (const p of plan.alloyVersionFiles) {
      expect(existsSync(p)).toBe(false);
    }
  });

  it("Superpowers npx 成功时不删文件", async () => {
    // mock execSync:skills ls 返回含 Superpowers skill 的输出;skills remove 返回成功
    mockedExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes("skills ls")) return Buffer.from(SKILLS_LS_OUTPUT);
      if (cmd.includes("skills remove")) return Buffer.from("");
      return Buffer.from("");
    }) as any);

    const plan = await scanForClean(projectDir, "global", AGENTS);
    expect(plan.superpowersSkillNames.length).toBeGreaterThan(0);

    const result = await executeClean(projectDir, "global", plan);

    // execSync 被调用了 2 次(scan 的 skills ls + execute 的 skills remove)
    expect(mockedExecSync).toHaveBeenCalledTimes(2);
    // skills remove 命令含所有 skill 名(空格分隔)
    const removeCall = mockedExecSync.mock.calls.find(
      (call) => typeof call[0] === "string" && (call[0] as string).includes("skills remove")
    );
    expect(removeCall).toBeDefined();
    const removeCmd = removeCall![0] as string;
    expect(removeCmd).toContain("brainstorming");
    expect(removeCmd).toContain("dispatching-parallel-agents");
    expect(removeCmd).toContain("executing-plans");
    expect(removeCmd).toContain("-g");
    expect(removeCmd).toContain("-y");
    // superpowersNpxSuccess 为 true
    expect(result.superpowersNpxSuccess).toBe(true);
    // removed 不含 superpowers 路径(npx 删的,不是 rm 删的)
    expect(result.removed.some((p) => p.includes("brainstorming"))).toBe(false);
    expect(result.removed.some((p) => p.includes(".agents/skills/"))).toBe(false);
  });

  it("Superpowers npx 失败时不删文件,提示用户手动", async () => {
    // mock execSync:skills ls 返回含 Superpowers skill;skills remove 抛错
    mockedExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes("skills ls")) return Buffer.from(SKILLS_LS_OUTPUT);
      if (cmd.includes("skills remove")) throw new Error("network error");
      return Buffer.from("");
    }) as any);

    const plan = await scanForClean(projectDir, "global", AGENTS);
    expect(plan.superpowersSkillNames.length).toBeGreaterThan(0);

    const result = await executeClean(projectDir, "global", plan);

    // npx 失败,superpowersNpxSuccess 为 false
    expect(result.superpowersNpxSuccess).toBe(false);
    // errors 含提示信息(含 skill 名 + npx skills remove)
    expect(result.errors.some((e) => e.includes("Superpowers npx remove 失败"))).toBe(true);
    expect(result.errors.some((e) => e.includes("brainstorming"))).toBe(true);
    expect(result.errors.some((e) => e.includes("npx skills remove"))).toBe(true);
    // removed 不含 superpowers 路径(不 fallback 删文件)
    expect(result.removed.some((p) => p.includes("brainstorming"))).toBe(false);
    expect(result.removed.some((p) => p.includes(".agents/skills/"))).toBe(false);
  });

  it("superpowersSkillNames 为空时跳过 npx 调用", async () => {
    // mock execSync 返回空(skills ls 无 Superpowers skill)
    mockedExecSync.mockImplementation(((cmd: string) => {
      if (cmd.includes("skills ls")) return Buffer.from("");
      return Buffer.from("");
    }) as any);

    // 只装 alloy skills,不装 superpowers(模拟用户只清 alloy skills 的场景)
    for (const agent of AGENTS) {
      await createAlloySkillsAt(homeDir, agent.id);
    }
    const plan = await scanForClean(projectDir, "global", AGENTS);
    expect(plan.superpowersSkillNames).toEqual([]);

    // 清除 scan 阶段的调用记录,只看 executeClean 的调用
    mockedExecSync.mockClear();

    const result = await executeClean(projectDir, "global", plan);

    // executeClean 不调 skills remove(superpowersSkillNames 为空)
    expect(mockedExecSync).not.toHaveBeenCalled();
    // superpowersNpxSuccess 保持初始值 false
    expect(result.superpowersNpxSuccess).toBe(false);
  });
});

describe("executeClean - scope=project", () => {
  it("删项目级 alloy-* 目录 + opsx", async () => {
    for (const agent of AGENTS) {
      await createAlloySkillsAt(projectDir, agent.id);
    }
    await mkdir(join(projectDir, ".claude", "commands"), { recursive: true });
    await writeFile(join(projectDir, ".claude", "commands", "opsx-explore.md"), "", "utf-8");
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    const result = await executeClean(projectDir, "project", plan);

    expect(result.removed.length).toBeGreaterThanOrEqual(7); // 6 skills + 1 opsx
    for (const p of plan.alloySkillsPaths) {
      expect(existsSync(p)).toBe(false);
    }
    expect(existsSync(join(projectDir, ".claude", "commands", "opsx-explore.md"))).toBe(false);
  });

  it("删 OpenCode command wrapper 文件", async () => {
    await mkdir(join(projectDir, ".opencode", "commands"), { recursive: true });
    await writeFile(
      join(projectDir, ".opencode", "commands", "alloy-start.md"),
      `---\ndescription: test\n---\n调用 skill({ name: "alloy-start" }) 工具`,
      "utf-8"
    );
    await writeFile(
      join(projectDir, ".opencode", "commands", "alloy-plan.md"),
      `---\ndescription: test\n---\n调用 skill({ name: "alloy-plan" }) 工具`,
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.opencodeCommandWrappers.length).toBe(2);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    const result = await executeClean(projectDir, "project", plan);

    expect(result.removed).toContain(join(projectDir, ".opencode", "commands", "alloy-start.md"));
    expect(result.removed).toContain(join(projectDir, ".opencode", "commands", "alloy-plan.md"));
    expect(existsSync(join(projectDir, ".opencode", "commands", "alloy-start.md"))).toBe(false);
    expect(existsSync(join(projectDir, ".opencode", "commands", "alloy-plan.md"))).toBe(false);
  });

  it("改 settings.json 移除 alloy hook + permissions(保留用户配置)", async () => {
    await mkdir(join(projectDir, ".claude"), { recursive: true });
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [{ type: "command", command: HOOK_COMMAND }],
          },
        ],
        Stop: [{ hooks: [{ type: "command", command: STOP_COMMAND }] }],
      },
      permissions: {
        allow: [...ALLOY_PERMISSIONS.allow, "Bash(npm test)", "Bash(user-script)"],
        deny: [...ALLOY_PERMISSIONS.deny],
      },
      worktree: { baseRef: "head", userKey: "userValue" },
    };
    await writeFile(
      join(projectDir, ".claude", "settings.json"),
      JSON.stringify(settings),
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    const newSettings = JSON.parse(
      await readFile(join(projectDir, ".claude", "settings.json"), "utf-8")
    );
    // hooks 全部移除(alloy 写的)
    expect(newSettings.hooks).toBeUndefined();
    // permissions 保留用户条目
    expect(newSettings.permissions.allow).toEqual(["Bash(npm test)", "Bash(user-script)"]);
    expect(newSettings.permissions.deny).toBeUndefined();
    // worktree 保留用户 key,移除 alloy 的 baseRef
    expect(newSettings.worktree).toEqual({ userKey: "userValue" });
  });

  it("settings.json 保留用户自己的 hook(非 alloy)", async () => {
    await mkdir(join(projectDir, ".claude"), { recursive: true });
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [
              { type: "command", command: HOOK_COMMAND },
              { type: "command", command: "user-script --check" }, // 用户 hook
            ],
          },
        ],
      },
    };
    await writeFile(
      join(projectDir, ".claude", "settings.json"),
      JSON.stringify(settings),
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    const newSettings = JSON.parse(
      await readFile(join(projectDir, ".claude", "settings.json"), "utf-8")
    );
    // 保留用户的 hook,移除 alloy 的
    expect(newSettings.hooks.PreToolUse[0].hooks).toEqual([
      { type: "command", command: "user-script --check" },
    ]);
  });

  it("删 .pre-commit(文件只有 alloy 内容时)", async () => {
    await mkdir(join(projectDir, ".git", "hooks"), { recursive: true });
    await writeFile(
      join(projectDir, ".git", "hooks", "pre-commit"),
      `#!/bin/sh\n# Alloy pre-commit hook\nnode ${alloyCliPath} _pre-commit-check\n`,
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    expect(existsSync(join(projectDir, ".git", "hooks", "pre-commit"))).toBe(false);
  });

  it("改 .pre-commit(文件有用户 hook 时,只移除 alloy 行)", async () => {
    await mkdir(join(projectDir, ".git", "hooks"), { recursive: true });
    await writeFile(
      join(projectDir, ".git", "hooks", "pre-commit"),
      `#!/bin/sh\n# user hook\necho "user check"\n\n# Alloy pre-commit check\nnode ${alloyCliPath} _pre-commit-check\n`,
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    const newContent = await readFile(
      join(projectDir, ".git", "hooks", "pre-commit"),
      "utf-8"
    );
    expect(newContent).not.toContain("_pre-commit-check");
    expect(newContent).not.toContain("# Alloy pre-commit check");
    expect(newContent).toContain("# user hook");
    expect(newContent).toContain('echo "user check"');
  });

  it("删 openspec/schemas/alloy 目录", async () => {
    await mkdir(join(projectDir, "openspec", "schemas", "alloy"), { recursive: true });
    await writeFile(
      join(projectDir, "openspec", "schemas", "alloy", "change.md"),
      "# schema",
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    expect(existsSync(join(projectDir, "openspec", "schemas", "alloy"))).toBe(false);
  });

  it("openspec/config.yaml 只有 alloy 配置时清理后删文件(不留空文件)", async () => {
    await mkdir(join(projectDir, "openspec"), { recursive: true });
    await writeFile(
      join(projectDir, "openspec", "config.yaml"),
      "schema: alloy\nalloy:\n  main_branch: main\n  install_scope: project\n  target_agents:\n    - claude-code\n",
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    // 清理后内容为空,文件应被删(不留空文件)
    await expect(
      readFile(join(projectDir, "openspec", "config.yaml"), "utf-8")
    ).rejects.toThrow();
  });

  it("openspec/config.yaml 保留用户其他 schema 配置", async () => {
    await mkdir(join(projectDir, "openspec"), { recursive: true });
    await writeFile(
      join(projectDir, "openspec", "config.yaml"),
      "schema: alloy\nalloy:\n  main_branch: main\n\n# user other config\nspec_dir: specs\n",
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    const newContent = await readFile(
      join(projectDir, "openspec", "config.yaml"),
      "utf-8"
    );
    expect(newContent).not.toContain("schema: alloy");
    expect(newContent).not.toContain("alloy:");
    expect(newContent).toContain("spec_dir: specs");
  });

  it("删 skills-lock.json", async () => {
    await writeFile(
      join(projectDir, "skills-lock.json"),
      '{"version":"1.0","skills":[]}',
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    const result = await executeClean(projectDir, "project", plan);

    expect(existsSync(join(projectDir, "skills-lock.json"))).toBe(false);
    expect(result.removed).toContain(join(projectDir, "skills-lock.json"));
  });

  it("opencode.json 清理后空则删文件(不留空 {})", async () => {
    // 只含 alloy permission 的 opencode.json(alloy * 来自 Bash(alloy *),在 ALLOY_PERMISSIONS.allow 里)
    await writeFile(
      join(projectDir, "opencode.json"),
      JSON.stringify({ permission: { bash: { "alloy *": "allow" } } }),
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.permissionConfigs.some((p) => p.agentId === "opencode")).toBe(true);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    // 清理后 settings 为空,文件应被删(不留空 {})
    expect(existsSync(join(projectDir, "opencode.json"))).toBe(false);
  });

  it(".claude/settings.json 清理后空则删文件(不留空 {})", async () => {
    await mkdir(join(projectDir, ".claude"), { recursive: true });
    // 只含 alloy hook 的 settings.json(清理后 hooks 全部移除,settings 变空 -> 删文件)
    const settings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [{ type: "command", command: HOOK_COMMAND }],
          },
        ],
        Stop: [{ hooks: [{ type: "command", command: STOP_COMMAND }] }],
      },
    };
    await writeFile(
      join(projectDir, ".claude", "settings.json"),
      JSON.stringify(settings),
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    expect(plan.hookConfigs.some((h) => h.agentId === "claude-code")).toBe(true);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    // 清理后 settings 为空(只有 alloy hook),文件应被删(不留空 {})
    expect(existsSync(join(projectDir, ".claude", "settings.json"))).toBe(false);
  });
});

describe("executeClean - pi/opencode hook 文件", () => {
  it("删 pi 的 .pi/extensions/alloy-guard.ts", async () => {
    await mkdir(join(projectDir, ".pi", "extensions"), { recursive: true });
    await writeFile(
      join(projectDir, ".pi", "extensions", "alloy-guard.ts"),
      `// Alloy hook-guard 扩展\nimport { execSync } from "node:child_process";\nexecSync("node ${alloyCliPath} _hook-guard");\n`,
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    expect(existsSync(join(projectDir, ".pi", "extensions", "alloy-guard.ts"))).toBe(false);
  });

  it("删 opencode 的 .opencode/tools/write.ts + edit.ts", async () => {
    await mkdir(join(projectDir, ".opencode", "tools"), { recursive: true });
    await writeFile(
      join(projectDir, ".opencode", "tools", "write.ts"),
      `// Alloy hook-guard write\nexecSync("node ${alloyCliPath} _hook-guard");\n`,
      "utf-8"
    );
    await writeFile(
      join(projectDir, ".opencode", "tools", "edit.ts"),
      `// Alloy hook-guard edit\nexecSync("node ${alloyCliPath} _hook-guard");\n`,
      "utf-8"
    );
    const plan = await scanForClean(projectDir, "project", AGENTS);
    mockedExecSync.mockReturnValue(Buffer.from(""));

    await executeClean(projectDir, "project", plan);

    expect(existsSync(join(projectDir, ".opencode", "tools", "write.ts"))).toBe(false);
    expect(existsSync(join(projectDir, ".opencode", "tools", "edit.ts"))).toBe(false);
  });
});
