import { createHash } from "node:crypto";
import { readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";

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
      const entries = await readdir(fullPath, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .sort();
      const contents: Buffer[] = [];
      for (const f of files) {
        contents.push(await readFile(join(fullPath, f)));
      }
      return computeHash(Buffer.concat(contents));
    } else {
      const content = await readFile(fullPath);
      return computeHash(content);
    }
  } catch {
    return null;
  }
}
