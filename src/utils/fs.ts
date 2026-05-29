import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function getPackageRoot(): string {
  // 从 dist/utils/ 回到包根目录（2 级: utils → dist → root）
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}
