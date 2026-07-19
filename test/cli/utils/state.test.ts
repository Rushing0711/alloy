// test/cli/utils/state.test.ts
// 验证 setPendingGate 函数的"精准替换 pending_gate 行"行为。
//
// 背景:setPendingGate 用 regex 替换 + 防御性追加。
// 旧实现在 value 与当前 pending_gate 值相同时(典型场景 null->null),
// 误判为"行不存在",在文件末尾追加新行,产生 YAML 重复键,
// 后续 readState/parseYaml 抛 YAMLParseError 阻断流程。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setPendingGate } from "../../../src/cli/utils/state.js";
import { parse as parseYaml } from "yaml";

describe("setPendingGate", () => {
  let tmpDir: string;
  let changeDir: string;
  let yamlPath: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-setpg-test-${Date.now()}`);
    changeDir = join(tmpDir, "openspec", "changes", "test-change");
    await mkdir(changeDir, { recursive: true });
    yamlPath = join(changeDir, ".alloy.yaml");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeYaml(pendingGateLine: string): Promise<void> {
    const yaml = [
      "phase: applying",
      'worktree: "/tmp/fake-wt"',
      "worktree_branch: worktree-test",
      "schema_version: 1",
      'started_at: "2026-07-19 07:10:03"',
      'created_at: "2026-07-19 07:14:51"',
      'updated_at: "2026-07-19 07:21:53"',
      "records: []",
      "skill_usage: []",
      pendingGateLine,
      "gate_history:",
      "  - plan:phase-complete",
      "phase_timings:",
      "  apply:",
      "    started_at: 2026-07-19 07:21:40",
      "    completed_at: null",
    ].join("\n");
    await writeFile(yamlPath, yaml, "utf-8");
  }

  async function countPendingGateLines(): Promise<number> {
    const content = await readFile(yamlPath, "utf-8");
    const matches = content.match(/^pending_gate:.*$/gm);
    return matches ? matches.length : 0;
  }

  it("null->null:pending_gate 已是 null 时不追加重复行", async () => {
    await writeYaml("pending_gate: null");
    await setPendingGate(changeDir, null);
    const count = await countPendingGateLines();
    expect(count).toBe(1);
    // 验证 parseYaml 能正常解析(无重复键)
    const content = await readFile(yamlPath, "utf-8");
    expect(() => parseYaml(content)).not.toThrow();
  });

  it("同 value:value 与当前 pending_gate 相同时不追加重复行", async () => {
    await writeYaml("pending_gate: apply:worktree-choice");
    await setPendingGate(changeDir, "apply:worktree-choice");
    const count = await countPendingGateLines();
    expect(count).toBe(1);
    const content = await readFile(yamlPath, "utf-8");
    expect(() => parseYaml(content)).not.toThrow();
  });

  it("不同 value:替换为新的 gate 值", async () => {
    await writeYaml("pending_gate: apply:worktree-choice");
    await setPendingGate(changeDir, "apply:sdd-ep-choice");
    const content = await readFile(yamlPath, "utf-8");
    const matches = content.match(/^pending_gate:.*$/gm);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
    expect(matches![0]).toBe("pending_gate: apply:sdd-ep-choice");
  });

  it("null->gate:从 null 设置为具体 gate", async () => {
    await writeYaml("pending_gate: null");
    await setPendingGate(changeDir, "apply:worktree-choice");
    const content = await readFile(yamlPath, "utf-8");
    const matches = content.match(/^pending_gate:.*$/gm);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
    expect(matches![0]).toBe("pending_gate: apply:worktree-choice");
  });

  it("gate->null:从具体 gate 清空为 null", async () => {
    await writeYaml("pending_gate: apply:sdd-ep-choice");
    await setPendingGate(changeDir, null);
    const content = await readFile(yamlPath, "utf-8");
    const matches = content.match(/^pending_gate:.*$/gm);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
    expect(matches![0]).toBe("pending_gate: null");
  });

  it("防御性追加:文件无 pending_gate 行时正确追加", async () => {
    // 故意写一个没有 pending_gate 字段的 yaml
    const yaml = [
      "phase: applying",
      "schema_version: 1",
      "records: []",
      "skill_usage: []",
      "gate_history: []",
    ].join("\n");
    await writeFile(yamlPath, yaml, "utf-8");

    await setPendingGate(changeDir, "apply:worktree-choice");
    const content = await readFile(yamlPath, "utf-8");
    const matches = content.match(/^pending_gate:.*$/gm);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
    expect(matches![0]).toBe("pending_gate: apply:worktree-choice");
  });
});
