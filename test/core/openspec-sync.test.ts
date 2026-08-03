// test/core/openspec-sync.test.ts
// syncCodexOpenSpecSkills:openspec CLI 把 codex skills 装到 .codex/skills/(过时路径),
// 需同步到 codex 实际加载的 .agents/skills/(learn.chatgpt.com/docs/build-skills 官方路径)。
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncCodexOpenSpecSkills } from "../../src/core/openspec.js";

describe("syncCodexOpenSpecSkills", () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "alloy-sync-test-"));
    // 模拟 openspec CLI 产物:.codex/skills/openspec-explore/SKILL.md
    mkdirSync(join(base, ".codex", "skills", "openspec-explore"), { recursive: true });
    writeFileSync(join(base, ".codex", "skills", "openspec-explore", "SKILL.md"), "# explore\n", "utf-8");
    // 非 openspec 目录不应同步
    mkdirSync(join(base, ".codex", "skills", "other-skill"), { recursive: true });
    writeFileSync(join(base, ".codex", "skills", "other-skill", "SKILL.md"), "# other\n", "utf-8");
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it("把 .codex/skills/ 的 openspec-* 复制到 .agents/skills/(codex 实际加载路径)", () => {
    syncCodexOpenSpecSkills(base);
    expect(existsSync(join(base, ".agents", "skills", "openspec-explore", "SKILL.md"))).toBe(true);
    // 非 openspec- 前缀不复制
    expect(existsSync(join(base, ".agents", "skills", "other-skill"))).toBe(false);
  });

  it("幂等:已存在的 openspec-* 目录被覆盖更新", () => {
    syncCodexOpenSpecSkills(base);
    // 更新源内容
    writeFileSync(join(base, ".codex", "skills", "openspec-explore", "SKILL.md"), "# explore v2\n", "utf-8");
    syncCodexOpenSpecSkills(base);
    expect(readdirSync(join(base, ".agents", "skills", "openspec-explore")).length).toBeGreaterThan(0);
  });

  it(".codex/skills/ 不存在时无副作用", () => {
    const emptyBase = mkdtempSync(join(tmpdir(), "alloy-sync-empty-"));
    syncCodexOpenSpecSkills(emptyBase);
    expect(existsSync(join(emptyBase, ".agents"))).toBe(false);
    rmSync(emptyBase, { recursive: true, force: true });
  });
});
