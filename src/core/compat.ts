import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import semver from "semver";
import type { CompatConfig, CompatResult } from "./types.js";

export async function loadCompat(packageDir: string): Promise<CompatConfig> {
  const content = await readFile(join(packageDir, "compat.yaml"), "utf-8");
  return parseYaml(content) as CompatConfig;
}

export function checkCompat(config: CompatConfig): CompatResult[] {
  const results: CompatResult[] = [];

  try {
    const openspecVersion = execSync("openspec --version", {
      stdio: "pipe",
    })
      .toString()
      .trim();
    const isCompat = semver.satisfies(
      openspecVersion,
      config.compatible.openspec
    );
    results.push({
      name: "OpenSpec",
      current: openspecVersion,
      required: config.compatible.openspec,
      compatible: isCompat,
    });
  } catch {
    results.push({
      name: "OpenSpec",
      current: "未安装",
      required: config.compatible.openspec,
      compatible: false,
    });
  }

  try {
    execSync("npx skills list", { stdio: "pipe" });
    results.push({
      name: "Superpowers",
      current: "已安装",
      required: config.compatible.superpowers,
      compatible: true,
    });
  } catch {
    results.push({
      name: "Superpowers",
      current: "未安装",
      required: config.compatible.superpowers,
      compatible: false,
    });
  }

  return results;
}
