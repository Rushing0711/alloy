import { execSync } from "node:child_process";

export async function installSuperpowers(
  scope: "global" | "project"
): Promise<"installed" | "skipped" | "failed"> {
  try {
    const output = execSync("npx skills list", { stdio: "pipe" }).toString();
    if (output.includes("brainstorming") && output.includes("using-git-worktrees")) {
      return "skipped";
    }
  } catch {
    // 未安装
  }

  const scopeFlag = scope === "global" ? "-g" : "";
  const flags = ["-y", scopeFlag, "--agent claude-code"].filter(Boolean).join(" ");

  try {
    execSync(`npx skills add obra/superpowers ${flags}`, {
      stdio: "pipe",
      cwd: process.cwd(),
    });
    return "installed";
  } catch {
    console.log("     ✗ Superpowers 安装失败，请检查网络连接后重试 alloy init");
    return "failed";
  }
}
