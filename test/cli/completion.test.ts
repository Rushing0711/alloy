import { describe, it, expect } from "vitest";
import { generateCompletion } from "../../src/cli/commands/completion.js";

describe("generateCompletion", () => {
  it("bash 补全应包含所有公开命令", () => {
    const output = generateCompletion("bash");
    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("doctor");
    expect(output).toContain("update");
    expect(output).toContain("completion");
  });

  it("zsh 补全应包含 -v 短选项", () => {
    const output = generateCompletion("zsh");
    expect(output).toContain("{-v,--version}");
  });

  it("zsh 补全应用 compdef 注册而非顶层调用 _alloy", () => {
    const output = generateCompletion("zsh");
    expect(output).toContain("compdef _alloy alloy");
    expect(output).not.toMatch(/^_alloy$/m);
  });

  it("bash 补全应包含 -v 和 --version", () => {
    const output = generateCompletion("bash");
    expect(output).toContain("--version");
    expect(output).toContain("-v");
  });

  it("应生成 PowerShell 补全", () => {
    const output = generateCompletion("pwsh");
    expect(output).toContain("Register-ArgumentCompleter");
    expect(output).toContain("-CommandName alloy");
    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("doctor");
    expect(output).toContain("update");
    expect(output).toContain("completion");
  });

  it("PowerShell 补全应包含各命令选项", () => {
    const output = generateCompletion("powershell");
    expect(output).toContain("--scope");
    expect(output).toContain("--json");
    expect(output).toContain("--inject-claude-md");
    expect(output).toContain("--version");
    expect(output).toContain("--help");
  });

  it("不包含内部命令", () => {
    const pwsh = generateCompletion("pwsh");
    expect(pwsh).not.toContain("_state");
    expect(pwsh).not.toContain("_guard");
    expect(pwsh).not.toContain("_archive");

    const bash = generateCompletion("bash");
    expect(bash).not.toContain("_state");
    expect(bash).not.toContain("_guard");
    expect(bash).not.toContain("_archive");
  });
});
