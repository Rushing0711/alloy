import { join } from "node:path";

export function getPackageRoot(): string {
  // 从 dist/utils/ 回到包根目录（2 级: utils → dist → root）
  return join(import.meta.dirname, "..", "..");
}
