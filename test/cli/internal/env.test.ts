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
    // alloy commands（冒号版）
    await mkdir(join(tmpDir, ".claude", "commands", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "commands", "alloy", "start.md"), "# start", "utf-8");

    process.chdir(tmpDir);

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await envCheckCommand();
    spy.mockRestore();

    expect(logs.join("")).toContain("环境完整");
    expect(logs.join("")).toContain("git ✓");
    expect(logs.join("")).toContain("commands ✓");
  });

  it("缺 git 仓库时 exit(1)", async () => {
    // 不 git init
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");
    await mkdir(join(tmpDir, "openspec", "schemas", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "schemas", "alloy", "schema.yaml"), "name: alloy\n", "utf-8");
    await mkdir(join(tmpDir, ".claude", "commands", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "commands", "alloy", "start.md"), "# start", "utf-8");

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
    await mkdir(join(tmpDir, ".claude", "commands", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "commands", "alloy", "start.md"), "# start", "utf-8");

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
    await mkdir(join(tmpDir, ".claude", "commands", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, ".claude", "commands", "alloy", "start.md"), "# start", "utf-8");

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
    // 不部署 commands

    process.chdir(tmpDir);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    await envCheckCommand();
    spy.mockRestore();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logs.join("")).toContain("Alloy commands");
    exitSpy.mockRestore();
  });

  it("横线版 agent（alloy-start.md）也识别", async () => {
    execSync("git init", { cwd: tmpDir, stdio: "pipe" });
    await mkdir(join(tmpDir, "openspec"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "config.yaml"), "schema: alloy\n", "utf-8");
    await mkdir(join(tmpDir, "openspec", "schemas", "alloy"), { recursive: true });
    await writeFile(join(tmpDir, "openspec", "schemas", "alloy", "schema.yaml"), "name: alloy\n", "utf-8");
    // 横线版：.cursor/commands/alloy-start.md
    await mkdir(join(tmpDir, ".cursor", "commands"), { recursive: true });
    await writeFile(join(tmpDir, ".cursor", "commands", "alloy-start.md"), "# start", "utf-8");

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
    expect(out).toContain("Alloy commands");
    exitSpy.mockRestore();
  });
});
