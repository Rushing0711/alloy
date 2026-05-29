import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { CompatConfig } from "./types.js";

export async function loadCompat(packageDir: string): Promise<CompatConfig> {
  const content = await readFile(join(packageDir, "compat.yaml"), "utf-8");
  return parseYaml(content) as CompatConfig;
}
