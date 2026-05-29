import { describe, it, expect } from "vitest";
import { generateCompletion } from "../../src/cli/commands/completion.js";

describe("generateCompletion", () => {
  it("bash completion 包含 alloy 子命令", () => {
    const output = generateCompletion("bash");
    expect(output).toContain("complete -F _alloy_completion alloy");
    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("doctor");
    expect(output).toContain("update");
    expect(output).toContain("completion");
  });

  it("zsh completion 包含 alloy 子命令", () => {
    const output = generateCompletion("zsh");
    expect(output).toContain("#compdef alloy");
    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("doctor");
    expect(output).toContain("update");
    expect(output).toContain("completion");
  });

  it("默认使用 bash", () => {
    const output = generateCompletion("");
    expect(output).toContain("complete -F _alloy_completion alloy");
  });
});
