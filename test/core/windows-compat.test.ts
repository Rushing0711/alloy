// test/core/windows-compat.test.ts
// Windows 兼容性回归测试:防止 src/ 重新引入 Unix-only shell 命令
// 历史背景:PowerShell/cmd.exe 不识别 cat / grep / command -v / 2>/dev/null 等命令,
// 导致 alloy 在 Windows 上 /alloy-start 报 PRECONDITION_FAIL(env.ts 用 cat 读 config.yaml)。
// 修复后用 readFileSync / Node API / 跨平台命令替代,本测试静态扫描源码,防止回归。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC_ROOT = join(process.cwd(), "src");

function readSrc(relPath: string): string {
  const raw = readFileSync(join(SRC_ROOT, relPath), "utf-8");
  // 过滤注释行(// 或 * 开头),避免注释中提及 `2>/dev/null` 等历史字符串误判
  return raw
    .split("\n")
    .filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*");
    })
    .join("\n");
}

describe("Windows 兼容性 - 禁止 Unix-only shell 命令回归", () => {
  it("env.ts 不含 cat 调用(改用 readFileSync)", () => {
    const src = readSrc("cli/commands/internal/env.ts");
    // 禁止 `cat "<path>"` 形式(PowerShell 无 cat)
    expect(src).not.toMatch(/\bcat\s+["'`]/);
  });

  it("precheck.ts 不含 `command -v`(改用 where/which)", () => {
    const src = readSrc("core/precheck.ts");
    // command 是 bash builtin,PowerShell/cmd 不识别
    expect(src).not.toMatch(/command\s+-v\s/);
  });

  it("precheck.ts 在 win32 用 where,其他平台用 which", () => {
    const src = readSrc("core/precheck.ts");
    expect(src).toContain('process.platform === "win32"');
    expect(src).toContain('"where openspec"');
    expect(src).toContain('"which openspec"');
  });

  it("git.ts 不含 `2>/dev/null` 重定向", () => {
    const src = readSrc("core/git.ts");
    // 2>/dev/null 在 PowerShell/cmd 不识别,gitExec 已 try/catch
    expect(src).not.toMatch(/2>\/dev\/null/);
  });

  it("worktree-create.ts 不含 `grep -q` / `2>/dev/null` / `&& ... ||` 链式调用", () => {
    const src = readSrc("cli/commands/internal/worktree-create.ts");
    // 禁止 grep(PowerShell 无 grep),改用 readFileSync + 正则
    expect(src).not.toMatch(/grep\s+-q\s/);
    // 禁止 2>/dev/null
    expect(src).not.toMatch(/2>\/dev\/null/);
    // 禁止 `git add ... && git diff ... || git commit` 链式(cmd.exe 解析受引号嵌套影响)
    expect(src).not.toMatch(/git\s+add\s+.*&&\s*git\s+diff.*\|\|\s*git\s+commit/);
  });

  it("worktree-cleanup.ts 不含 `2>/dev/null` / `&& ... ||` / `cd ... && git`", () => {
    const src = readSrc("cli/commands/internal/worktree-cleanup.ts");
    expect(src).not.toMatch(/2>\/dev\/null/);
    expect(src).not.toMatch(/git\s+add\s+.*&&\s*git\s+diff.*\|\|\s*git\s+commit/);
    // 禁止 `cd "<path>" && git ...`(cmd.exe 下 cd 路径含空格不稳定),改用 opts.cwd
    expect(src).not.toMatch(/cd\s+["'`][^"'`]+["'`]\s*&&\s*git\s/);
  });

  it("finish-cleanup.ts 不含 `2>/dev/null`", () => {
    const src = readSrc("cli/commands/internal/finish-cleanup.ts");
    expect(src).not.toMatch(/2>\/dev\/null/);
  });

  it("env.ts 用 readFileSync 读 config.yaml(替代 cat)", () => {
    const src = readSrc("cli/commands/internal/env.ts");
    expect(src).toMatch(/readFileSync\(configPath/);
  });

  it("worktree-create.ts 用 readFileSync + 正则检查 .gitignore(替代 grep -q)", () => {
    const src = readSrc("cli/commands/internal/worktree-create.ts");
    expect(src).toMatch(/readFileSync\(gitignorePath/);
    expect(src).toMatch(/\\\.worktrees\\\//);
  });
});
