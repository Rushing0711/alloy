import { createHash } from "node:crypto";
import { readFile, stat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export const ARTIFACT_FILES: Record<string, string> = {
  draft: "draft.md",
  proposal: "proposal.md",
  design: "design.md",
  specs: "specs",
  tasks: "tasks.md",
  plans: "plans.md",
  verify: "verify.md",
  retrospective: "retrospective.md",
};

export function computeHash(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex").substring(0, 12);
}

/** 递归收集目录下所有文件的相对路径（已排序），保证 hash 稳定 */
async function collectFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const childPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFiles(childPath);
      result.push(...nested);
    } else if (entry.isFile()) {
      result.push(childPath);
    }
  }
  return result;
}

export async function computeArtifactHash(
  changeDir: string,
  artifactId: string
): Promise<string | null> {
  const fileName = ARTIFACT_FILES[artifactId];
  if (!fileName) return null;

  const fullPath = join(changeDir, fileName);
  try {
    const st = await stat(fullPath);
    if (st.isDirectory()) {
      // 递归收集所有文件（含子目录），按相对路径排序保证稳定
      const files = await collectFiles(fullPath);
      files.sort();
      const contents: Buffer[] = [];
      for (const f of files) {
        contents.push(await readFile(f));
      }
      return computeHash(Buffer.concat(contents));
    } else {
      const content = await readFile(fullPath, "utf-8");
      // 排除动态时间戳行(> 生成时间: ...),避免 hash 随时间戳变化触发重锁
      // 原因:_retro scaffold / agent 生成制品时写 "> 生成时间: <ts>" 行,
      // agent 后续修改 checkbox 等内容时可能更新时间戳,导致 hash 变化 -> 重锁
      const filtered = content
        .split("\n")
        .filter(line => !line.startsWith("> 生成时间:"))
        .join("\n");
      return computeHash(filtered);
    }
  } catch {
    return null;
  }
}
