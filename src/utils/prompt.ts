// Node 18 兼容的简单 stdin 交互 prompt
// @inquirer/prompts 依赖 @inquirer/core ≥ 11，需要 Node ≥ 20 的 styleText API
// 当 @inquirer 加载失败时，用这些函数作为 fallback

import { createInterface } from "node:readline";

function ask(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function askStdin(prompt: string): Promise<string> {
  return ask(prompt);
}

export async function confirmStdin(prompt: string): Promise<boolean> {
  const answer = await ask(prompt + " [y/N] ");
  const trimmed = answer.trim().toLowerCase();
  return trimmed === "y" || trimmed === "yes";
}
