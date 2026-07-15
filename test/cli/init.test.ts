// test/cli/init.test.ts
// selectScope / selectTargetAgents 现位于 src/cli/commands/init/init.ts;
// ensureGitattributes 现位于 src/cli/commands/init/execute.ts。
// initCommand 的编排行为由 test/cli/commands/init/init.test.ts 覆盖,
// collect/plan/display/execute 各自有独立测试文件。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// 仅 mock prompt--selectScope/selectTargetAgents 唯一外部依赖
vi.mock("../../src/utils/prompt.js", () => ({
  promptSelect: vi.fn(),
  promptMultiSelect: vi.fn(),
  promptConfirm: vi.fn(),
  promptInput: vi.fn(),
}));

import { promptSelect, promptMultiSelect } from "../../src/utils/prompt.js";
import {
  selectScope,
  selectTargetAgents,
} from "../../src/cli/commands/init/init.js";
import { ensureGitattributes } from "../../src/cli/commands/init/execute.js";
import { KNOWN_AGENTS } from "../../src/core/agents.js";

describe("selectScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("传入 scope 时直接返回", async () => {
    const result = await selectScope("global");
    expect(result).toBe("global");
  });

  it("传入 project scope 时返回 project", async () => {
    const result = await selectScope("project");
    expect(result).toBe("project");
  });

  it("未传入 scope 时调用 promptSelect", async () => {
    vi.mocked(promptSelect).mockResolvedValue("project");
    const result = await selectScope();
    expect(result).toBe("project");
    expect(promptSelect).toHaveBeenCalledWith("Install scope:", [
      { name: "Project (current directory)", value: "project" },
      { name: "Global (home directory)", value: "global" },
    ], { default: "project" });
  });
});

describe("selectTargetAgents 单级多选", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("多选返回选中的 agent", async () => {
    vi.mocked(promptMultiSelect).mockResolvedValue(["claude-code", "opencode"]);

    const result = await selectTargetAgents();

    expect(result.map((a) => a.id)).toEqual(["claude-code", "opencode"]);
    // 单级多选不再调用 promptSelect / promptConfirm
    expect(promptSelect).not.toHaveBeenCalled();
  });

  it("选任意 agent 无需额外确认", async () => {
    vi.mocked(promptMultiSelect).mockResolvedValue(["opencode"]);

    const result = await selectTargetAgents();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("opencode");
  });

  it("validate 要求至少选一项", async () => {
    vi.mocked(promptMultiSelect).mockResolvedValue(["claude-code"]);

    await selectTargetAgents();

    const validateFn = vi.mocked(promptMultiSelect).mock.calls[0][2]
      .validate as (ids: string[]) => true | string;
    expect(validateFn([])).toBe("请至少选择一个 AI 工具");
    expect(validateFn(["claude-code"])).toBe(true);
  });

  it("一屏展示全部 agent(无分级翻页,pageSize=10)", async () => {
    vi.mocked(promptMultiSelect).mockResolvedValue(["claude-code"]);

    await selectTargetAgents();

    const opts = vi.mocked(promptMultiSelect).mock.calls[0][2] as {
      pageSize?: number;
    };
    expect(opts.pageSize).toBe(10);
    const choices = vi.mocked(promptMultiSelect).mock.calls[0][1] as Array<{
      value: string;
    }>;
    expect(choices).toHaveLength(KNOWN_AGENTS.length);
  });
});

describe("ensureGitattributes", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-gitattributes-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("文件不存在时创建并写入 LF 规则", async () => {
    await ensureGitattributes(tmpDir);

    const content = await readFile(join(tmpDir, ".gitattributes"), "utf-8");
    expect(content).toContain("* text=auto eol=lf");
  });

  it("已有 LF 规则时跳过(幂等)", async () => {
    await writeFile(join(tmpDir, ".gitattributes"), "* text=auto eol=lf\n", "utf-8");

    await ensureGitattributes(tmpDir);

    const content = await readFile(join(tmpDir, ".gitattributes"), "utf-8");
    expect(content).toBe("* text=auto eol=lf\n");
  });

  it("已有其他规则但无 LF 规则时追加", async () => {
    await writeFile(join(tmpDir, ".gitattributes"), "*.txt text\n", "utf-8");

    await ensureGitattributes(tmpDir);

    const content = await readFile(join(tmpDir, ".gitattributes"), "utf-8");
    expect(content).toContain("*.txt text");
    expect(content).toContain("* text=auto eol=lf");
  });
});
