// test/cli/internal/env.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { envCheckCommand } from "../../../src/cli/commands/internal/env.js";

describe("alloy _env check", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-env-check-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("4 项齐全时输出 ✓ 环境完整", async () => {
    // git 仓库
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    // openspec/config.yaml
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");
    // schema.yaml
    await mkdir(join(tmpDir, "openspec", "schemas", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "schemas", "alloy", "schema.yaml"), "name: alloy\n", "utf-8");
    // alloy skills（冒号版 agent）
    await mkdir(join(tmpDir, ".claude", "skills", "alloy-start"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "skills", "alloy-start", "SKILL.md"), "# start", "utf-8");

    process.chdir(tmpDir);

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await envCheckCommand();
    spy.mockRestore();

    expect(logs.join("")).toContain("环境完整");
    expect(logs.join("")).toContain("git ✓");
    expect(logs.join("")).toContain("skills ✓");
  });

  it("缺 git 仓库时 exit(1)", async () => {
    // 不 git init
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");
    await mkdir(join(tmpDir, "openspec", "schemas", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "schemas", "alloy", "schema.yaml"), "name: alloy\n", "utf-8");
    await mkdir(join(tmpDir, ".claude", "skills", "alloy-start"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "skills", "alloy-start", "SKILL.md"), "# start", "utf-8");

    process.chdir(tmpDir);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await envCheckCommand();
    spy.mockRestore();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logs.join("")).toContain("git 仓库");
    exitSpy.mockRestore();
  });

  it("缺 openspec/config.yaml 时 exit(1)", async () => {
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    // 不写 config.yaml
    await mkdir(join(tmpDir, "openspec", "schemas", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "schemas", "alloy", "schema.yaml"), "name: alloy\n", "utf-8");
    await mkdir(join(tmpDir, ".claude", "skills", "alloy-start"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "skills", "alloy-start", "SKILL.md"), "# start", "utf-8");

    process.chdir(tmpDir);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await envCheckCommand();
    spy.mockRestore();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logs.join("")).toContain("config.yaml");
    exitSpy.mockRestore();
  });

  it("config.yaml 不含 schema: alloy 时 exit(1)", async () => {
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: other\n", "utf-8");
    await mkdir(join(tmpDir, "openspec", "schemas", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "schemas", "alloy", "schema.yaml"), "name: alloy\n", "utf-8");
    await mkdir(join(tmpDir, ".claude", "skills", "alloy-start"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "skills", "alloy-start", "SKILL.md"), "# start", "utf-8");

    process.chdir(tmpDir);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await envCheckCommand();
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("缺 alloy commands 时 exit(1)", async () => {
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");
    await mkdir(join(tmpDir, "openspec", "schemas", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "schemas", "alloy", "schema.yaml"), "name: alloy\n", "utf-8");
    // 不部署 skills

    process.chdir(tmpDir);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await envCheckCommand();
    spy.mockRestore();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logs.join("")).toContain("Alloy skills");
    exitSpy.mockRestore();
  });

  it("非冒号版 agent（cursor）也识别", async () => {
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");
    await mkdir(join(tmpDir, "openspec", "schemas", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "schemas", "alloy", "schema.yaml"), "name: alloy\n", "utf-8");
    // 非冒号版 agent：.cursor/skills/alloy-start/SKILL.md
    await mkdir(join(tmpDir, ".cursor", "skills", "alloy-start"), { recursive: true });
    await writeFile(join(tmpDir, ".cursor", "skills", "alloy-start", "SKILL.md"), "# start", "utf-8");

    process.chdir(tmpDir);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await envCheckCommand();
    spy.mockRestore();

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    expect(logs.join("")).toContain("环境完整");
    exitSpy.mockRestore();
  });

  it("多项缺失时全部列出", async () => {
    // 只 git init，其余全缺
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });

    process.chdir(tmpDir);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await envCheckCommand();
    spy.mockRestore();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const out = logs.join("");
    expect(out).toContain("config.yaml");
    expect(out).toContain("schema.yaml");
    expect(out).toContain("Alloy skills");
    exitSpy.mockRestore();
  });
});
