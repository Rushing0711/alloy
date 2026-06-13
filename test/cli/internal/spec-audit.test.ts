// test/cli/internal/spec-audit.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  scanSkills,
  compareBehaviors,
  audit,
  formatResult,
  specAuditCommand,
  type Behaviors,
  type FieldDiff,
} from "../../../src/cli/commands/internal/spec-audit.js";

// ─── 辅助函数 ─────────────────────────────────────────────

function captureOutput(fn: () => Promise<void> | void): Promise<string> {
  return new Promise((resolve, reject) => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      const result = fn();
      if (result instanceof Promise) {
        result
          .then(() => {
            spy.mockRestore();
            resolve(logs.join("\n"));
          })
          .catch((err: unknown) => {
            spy.mockRestore();
            reject(err);
          });
      } else {
        spy.mockRestore();
        resolve(logs.join("\n"));
      }
    } catch (err) {
      spy.mockRestore();
      reject(err);
    }
  });
}

/** 创建临时 skill 文件 */
async function writeSkill(
  tmpDir: string,
  fileName: string,
  opts: {
    spec?: string;
    behaviors?: Behaviors;
  }
): Promise<void> {
  const dir = join(tmpDir, "commands", "alloy");
  await mkdir(dir, { recursive: true });

  const frontmatter: Record<string, unknown> = {
    name: `Alloy: ${fileName.replace(/\.md$/, "")}`,
  };
  if (opts.spec !== undefined) {
    frontmatter.spec = opts.spec;
  }
  if (opts.behaviors !== undefined) {
    frontmatter.behaviors = opts.behaviors;
  }

  // 手动构建 frontmatter 字符串，确保 YAML 格式正确
  const lines: string[] = ["---"];
  lines.push(`name: "Alloy: ${fileName.replace(/\.md$/, "")}"`);
  if (opts.spec !== undefined) {
    lines.push(`spec: ${opts.spec}`);
  }
  if (opts.behaviors !== undefined) {
    lines.push("behaviors:");
    appendBehaviorsYaml(lines, opts.behaviors);
  }
  lines.push("---");
  lines.push("");
  lines.push(`# ${fileName.replace(/\.md$/, "")}`);

  await writeFile(join(dir, fileName), lines.join("\n"), "utf-8");
}

/** 将 Behaviors 对象按"仅写出已定义字段"的方式输出为 YAML 缩进行 */
function appendBehaviorsYaml(lines: string[], b: Behaviors): void {
  if (b.stops !== undefined) lines.push(`  stops: ${b.stops}`);
  if (b.preconditions !== undefined)
    lines.push(`  preconditions: ${b.preconditions}`);
  if (b.hard_stops !== undefined) lines.push(`  hard_stops: ${b.hard_stops}`);
  if (b.user_gates !== undefined) lines.push(`  user_gates: ${b.user_gates}`);
  if (b.warns !== undefined) lines.push(`  warns: ${b.warns}`);
  lines.push(`  artifacts: [${b.artifacts.join(", ")}]`);
  lines.push(`  transitions_to: ${b.transitions_to}`);
  lines.push(`  external_calls: [${b.external_calls.join(", ")}]`);
}

/** 创建临时 spec 文件 */
async function writeSpec(
  tmpDir: string,
  specPath: string,
  opts: {
    behaviors?: Behaviors;
    noFrontmatter?: boolean;
  }
): Promise<void> {
  const dir = join(tmpDir, "docs", "specification");
  const specDir = join(dir, specPath.split("/").slice(0, -1).join("/"));
  await mkdir(specDir, { recursive: true });

  if (opts.noFrontmatter) {
    await writeFile(
      join(dir, specPath),
      "# 无 frontmatter 的 spec\n",
      "utf-8"
    );
    return;
  }

  const lines: string[] = ["---"];
  if (opts.behaviors !== undefined) {
    lines.push("behaviors:");
    appendBehaviorsYaml(lines, opts.behaviors);
  }
  lines.push("---");
  lines.push("");
  lines.push(`# spec 行为规格`);

  await writeFile(join(dir, specPath), lines.join("\n"), "utf-8");
}

/** 默认 behaviors，方便复用 */
const defaultBehaviors: Behaviors = {
  stops: 15,
  hard_stops: 5,
  artifacts: ["draft"],
  transitions_to: "started",
  external_calls: ["opsx:explore", "opsx:new", "superpowers:brainstorming"],
};

// ─── scanSkills ──────────────────────────────────────────

describe("scanSkills", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-spec-audit-test-${Date.now()}`);
    await mkdir(join(tmpDir, "commands", "alloy"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("扫描 commands/alloy/*.md 并提取 frontmatter（含 spec 路径和 behaviors）", async () => {
    await writeSkill(tmpDir, "start.md", {
      spec: "01-product-spec/01-start-spec.md",
      behaviors: defaultBehaviors,
    });
    await writeSkill(tmpDir, "plan.md", {
      spec: "01-product-spec/02-plan-spec.md",
      behaviors: { ...defaultBehaviors, stops: 10, transitions_to: "planned" },
    });

    const skills = await scanSkills(tmpDir);

    expect(skills).toHaveLength(2);
    expect(skills[0].skillName).toBe("plan");
    expect(skills[0].spec).toBe("01-product-spec/02-plan-spec.md");
    expect(skills[0].behaviors?.stops).toBe(10);
    expect(skills[1].skillName).toBe("start");
    expect(skills[1].spec).toBe("01-product-spec/01-start-spec.md");
    expect(skills[1].behaviors?.stops).toBe(15);
  });

  it("目录中无 .md 文件时返回空数组", async () => {
    const skills = await scanSkills(tmpDir);
    expect(skills).toEqual([]);
  });
});

// ─── compareBehaviors ────────────────────────────────────

describe("compareBehaviors", () => {
  it("一致时返回空数组", () => {
    const diffs = compareBehaviors(defaultBehaviors, defaultBehaviors);
    expect(diffs).toEqual([]);
  });

  it("检测数字字段差异（stops、hard_stops）——含方向（spec 落后/多出）", () => {
    const spec: Behaviors = { ...defaultBehaviors, stops: 10, hard_stops: 3 };

    const diffs = compareBehaviors(defaultBehaviors, spec);

    const stopsDiff = diffs.find((d) => d.field === "stops")!;
    expect(stopsDiff.type).toBe("number");
    expect(stopsDiff.skillValue).toBe(15);
    expect(stopsDiff.specValue).toBe(10);

    const hardStopsDiff = diffs.find((d) => d.field === "hard_stops")!;
    expect(hardStopsDiff.type).toBe("number");
    expect(hardStopsDiff.skillValue).toBe(5);
    expect(hardStopsDiff.specValue).toBe(3);
  });

  it("检测 transitions_to 差异", () => {
    const spec: Behaviors = { ...defaultBehaviors, transitions_to: "planned" };

    const diffs = compareBehaviors(defaultBehaviors, spec);

    const diff = diffs.find((d) => d.field === "transitions_to")!;
    expect(diff.type).toBe("string");
    expect(diff.skillValue).toBe("started");
    expect(diff.specValue).toBe("planned");
  });

  it("检测数组字段差异（artifacts、external_calls）——含 skillExtra/specExtra", () => {
    const spec: Behaviors = {
      ...defaultBehaviors,
      artifacts: ["draft", "review"], // spec 多出 review
      external_calls: ["opsx:explore"], // spec 缺少 opsx:new, superpowers:brainstorming
    };

    const diffs = compareBehaviors(defaultBehaviors, spec);

    const artifactsDiff = diffs.find((d) => d.field === "artifacts")!;
    expect(artifactsDiff.type).toBe("array");
    expect(artifactsDiff.specExtra).toContain("review");
    expect(artifactsDiff.skillExtra).toEqual([]);

    const callsDiff = diffs.find((d) => d.field === "external_calls")!;
    expect(callsDiff.type).toBe("array");
    expect(callsDiff.skillExtra).toContain("opsx:new");
    expect(callsDiff.skillExtra).toContain("superpowers:brainstorming");
    expect(callsDiff.specExtra).toEqual([]);
  });

  it("数组字段完全一致时无差异", () => {
    const spec: Behaviors = { ...defaultBehaviors };
    const diffs = compareBehaviors(defaultBehaviors, spec);
    const arrayDiffs = diffs.filter((d) => d.type === "array");
    expect(arrayDiffs).toHaveLength(0);
  });

  // 新四字段（preconditions / hard_stops / user_gates / warns）

  it("新四字段全部一致时返回空数组（archive 真实场景）", () => {
    const skill: Behaviors = {
      preconditions: 5,
      hard_stops: 7,
      user_gates: 3,
      warns: 1,
      artifacts: ["delta-spec", "archive"],
      transitions_to: "archived",
      external_calls: ["opsx:archive"],
    };
    const spec: Behaviors = { ...skill };
    const diffs = compareBehaviors(skill, spec);
    expect(diffs).toEqual([]);
  });

  it("新四字段差异时按 number 类型上报，preconditions 字段独立可识别", () => {
    const skill: Behaviors = {
      preconditions: 5,
      hard_stops: 7,
      user_gates: 3,
      warns: 1,
      artifacts: ["delta-spec", "archive"],
      transitions_to: "archived",
      external_calls: ["opsx:archive"],
    };
    const spec: Behaviors = { ...skill, preconditions: 4 };

    const diffs = compareBehaviors(skill, spec);

    const pre = diffs.find((d) => d.field === "preconditions")!;
    expect(pre).toBeDefined();
    expect(pre.type).toBe("number");
    expect(pre.skillValue).toBe(5);
    expect(pre.specValue).toBe(4);

    // formatDiff 输出应包含 PRECONDITION_FAIL 文本
    const result = formatResult({
      skillName: "archive",
      status: "diff",
      diffs: [pre],
      specPath: "01-product-spec/04-archive-spec.md",
    });
    expect(result.join("\n")).toContain("PRECONDITION_FAIL");
  });

  it("跨 schema：skill 用新四字段而 spec 仍为旧 stops 字段（archive 当前真实场景）", () => {
    const skill: Behaviors = {
      preconditions: 5,
      hard_stops: 7,
      user_gates: 3,
      warns: 1,
      artifacts: ["delta-spec", "archive"],
      transitions_to: "archived",
      external_calls: ["opsx:archive"],
    };
    const spec: Behaviors = {
      stops: 3,
      hard_stops: 2,
      artifacts: ["delta-spec", "archive"],
      transitions_to: "archived",
      external_calls: ["opsx:archive"],
    };

    const diffs = compareBehaviors(skill, spec);

    // stops 仅 spec 有
    const stopsDiff = diffs.find((d) => d.field === "stops")!;
    expect(stopsDiff).toBeDefined();
    expect(stopsDiff.skillValue).toBeUndefined();
    expect(stopsDiff.specValue).toBe(3);

    // preconditions 仅 skill 有
    const preDiff = diffs.find((d) => d.field === "preconditions")!;
    expect(preDiff).toBeDefined();
    expect(preDiff.skillValue).toBe(5);
    expect(preDiff.specValue).toBeUndefined();

    // user_gates / warns 同样仅 skill 有
    const ugDiff = diffs.find((d) => d.field === "user_gates")!;
    expect(ugDiff.specValue).toBeUndefined();
    expect(ugDiff.skillValue).toBe(3);

    const warnDiff = diffs.find((d) => d.field === "warns")!;
    expect(warnDiff.specValue).toBeUndefined();
    expect(warnDiff.skillValue).toBe(1);

    // hard_stops 双方都有但数字不同
    const hsDiff = diffs.find((d) => d.field === "hard_stops")!;
    expect(hsDiff.skillValue).toBe(7);
    expect(hsDiff.specValue).toBe(2);

    // 输出文本应同时含 spec=（缺失）和 skill=（缺失），且 NaN 不应出现
    const lines = formatResult({
      skillName: "archive",
      status: "diff",
      diffs,
      specPath: "01-product-spec/04-archive-spec.md",
    }).join("\n");
    expect(lines).toContain("spec=（缺失）");
    expect(lines).toContain("skill=（缺失）");
    expect(lines).not.toContain("NaN");
    expect(lines).toContain("PRECONDITION_FAIL");
    expect(lines).toContain("USER_GATE");
    expect(lines).toContain("WARN");
  });
});

// ─── audit ───────────────────────────────────────────────

describe("audit", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-spec-audit-test-${Date.now()}`);
    await mkdir(join(tmpDir, "commands", "alloy"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("spec 与 skill 一致 → status='ok'", async () => {
    await writeSkill(tmpDir, "start.md", {
      spec: "01-product-spec/01-start-spec.md",
      behaviors: defaultBehaviors,
    });
    await writeSpec(tmpDir, "01-product-spec/01-start-spec.md", {
      behaviors: defaultBehaviors,
    });

    const results = await audit(tmpDir);

    expect(results).toHaveLength(1);
    expect(results[0].skillName).toBe("start");
    expect(results[0].status).toBe("ok");
    expect(results[0].diffs).toEqual([]);
  });

  it("数字字段差异 → status='diff'，diffs 有内容", async () => {
    await writeSkill(tmpDir, "start.md", {
      spec: "01-product-spec/01-start-spec.md",
      behaviors: defaultBehaviors,
    });
    await writeSpec(tmpDir, "01-product-spec/01-start-spec.md", {
      behaviors: { ...defaultBehaviors, stops: 10 },
    });

    const results = await audit(tmpDir);

    expect(results[0].status).toBe("diff");
    expect(results[0].diffs.length).toBeGreaterThan(0);
    const stopsDiff = results[0].diffs.find((d) => d.field === "stops");
    expect(stopsDiff).toBeDefined();
    expect(stopsDiff!.type).toBe("number");
  });

  it("无 spec 锚点 → status='no-spec-field'", async () => {
    await writeSkill(tmpDir, "start.md", {
      behaviors: defaultBehaviors,
      // 不传 spec
    });

    const results = await audit(tmpDir);

    expect(results[0].status).toBe("no-spec-field");
    expect(results[0].diffs).toEqual([]);
  });

  it("spec 文件不存在 → status='spec-not-found'，specPath 有值", async () => {
    await writeSkill(tmpDir, "start.md", {
      spec: "01-product-spec/01-start-spec.md",
      behaviors: defaultBehaviors,
    });
    // 不创建对应的 spec 文件

    const results = await audit(tmpDir);

    expect(results[0].status).toBe("spec-not-found");
    expect(results[0].specPath).toBe("01-product-spec/01-start-spec.md");
  });

  it("spec 无 behaviors frontmatter → status='diff'，type='missing-block'", async () => {
    await writeSkill(tmpDir, "start.md", {
      spec: "01-product-spec/01-start-spec.md",
      behaviors: defaultBehaviors,
    });
    await writeSpec(tmpDir, "01-product-spec/01-start-spec.md", {
      noFrontmatter: true,
    });

    const results = await audit(tmpDir);

    expect(results[0].status).toBe("diff");
    expect(results[0].diffs).toHaveLength(1);
    expect(results[0].diffs[0].type).toBe("missing-block");
    expect(results[0].diffs[0].field).toBe("behaviors");
  });
});

// ─── formatResult ────────────────────────────────────────

describe("formatResult", () => {
  it("'ok' → 包含 ✓", () => {
    const lines = formatResult({
      skillName: "start",
      status: "ok",
      diffs: [],
      specPath: "01-product-spec/01-start-spec.md",
    });
    expect(lines.join("\n")).toContain("✓");
  });

  it("'diff' → 包含 ✗ + 差异详情", () => {
    const diff: FieldDiff = {
      field: "stops",
      type: "number",
      skillValue: 15,
      specValue: 10,
    };
    const lines = formatResult({
      skillName: "start",
      status: "diff",
      diffs: [diff],
      specPath: "01-product-spec/01-start-spec.md",
    });
    const output = lines.join("\n");
    expect(output).toContain("✗");
    expect(output).toContain("stops");
  });

  it("'no-spec-field' → 包含 ⚠", () => {
    const lines = formatResult({
      skillName: "start",
      status: "no-spec-field",
      diffs: [],
    });
    expect(lines.join("\n")).toContain("⚠");
  });

  it("'spec-not-found' → 包含 ✗ + spec 路径", () => {
    const lines = formatResult({
      skillName: "start",
      status: "spec-not-found",
      diffs: [],
      specPath: "01-product-spec/01-start-spec.md",
    });
    const output = lines.join("\n");
    expect(output).toContain("✗");
    expect(output).toContain("01-product-spec/01-start-spec.md");
  });
});

// ─── specAuditCommand ────────────────────────────────────

describe("specAuditCommand", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `alloy-spec-audit-test-${Date.now()}`);
    await mkdir(join(tmpDir, "commands", "alloy"), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("全部一致时退出码 0", async () => {
    await writeSkill(tmpDir, "start.md", {
      spec: "01-product-spec/01-start-spec.md",
      behaviors: defaultBehaviors,
    });
    await writeSpec(tmpDir, "01-product-spec/01-start-spec.md", {
      behaviors: defaultBehaviors,
    });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await specAuditCommand([]);

    expect(exitSpy).not.toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("有差异时退出码 1", async () => {
    await writeSkill(tmpDir, "start.md", {
      spec: "01-product-spec/01-start-spec.md",
      behaviors: defaultBehaviors,
    });
    await writeSpec(tmpDir, "01-product-spec/01-start-spec.md", {
      behaviors: { ...defaultBehaviors, stops: 10 },
    });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await specAuditCommand([]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
