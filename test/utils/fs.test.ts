// test/utils/fs.test.ts
import { describe, it, expect } from "vitest";
import { getPackageRoot } from "../../src/utils/fs.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("getPackageRoot", () => {
  it("返回有效的目录路径", () => {
    const root = getPackageRoot();
    expect(root).toBeTruthy();
    expect(typeof root).toBe("string");
  });

  it("返回的路径存在", () => {
    const root = getPackageRoot();
    expect(existsSync(root)).toBe(true);
  });

  it("返回的路径包含 package.json", () => {
    const root = getPackageRoot();
    const pkgPath = join(root, "package.json");
    expect(existsSync(pkgPath)).toBe(true);
  });

  it("返回的路径包含 src 目录", () => {
    const root = getPackageRoot();
    const srcPath = join(root, "src");
    expect(existsSync(srcPath)).toBe(true);
  });

  it("返回的路径是绝对路径", () => {
    const root = getPackageRoot();
    expect(root.startsWith("/")).toBe(true);
  });
});
