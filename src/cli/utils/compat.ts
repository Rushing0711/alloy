import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import semver from "semver";

export interface CompatConfig {
  compatible: { openspec: string; superpowers: string };
  install: { openspec: string; superpowers: string };
}

export async function loadCompat(packageDir: string): Promise<CompatConfig> {
  const content = await readFile(join(packageDir, "compat.yaml"), "utf-8");
  return parseYaml(content) as CompatConfig;
}

export interface CompatResult {
  name: string;
  current: string;
  required: string;
  compatible: boolean;
}

export function checkCompat(config: CompatConfig): CompatResult[] {
  const results: CompatResult[] = [];

  // 检查 OpenSpec
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

  // Superpowers 版本检查依赖 npx skills 的命令行输出
  // v1 采用宽松策略：检测到即可用，不做严格版本校验
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
