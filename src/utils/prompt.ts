import { createInterface } from "node:readline";

// 一次判断，启动时确定
export const supportsInquirer = (() => {
  const [major] = process.versions.node.split(".").map(Number);
  return major >= 20;
})();

// —— 底层 stdin helpers ——

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}

// —— 对外统一 API ——

export interface Choice {
  name: string;
  value: string;
}

export async function promptSelect(message: string, choices: Choice[]): Promise<string> {
  if (supportsInquirer) {
    const { select } = await import("@inquirer/prompts");
    return select({ message, choices });
  }

  // stdin fallback
  console.log(message);
  choices.forEach((c, i) => console.log(`  [${i + 1}] ${c.name}`));
  const answer = await ask(`输入数字 (1-${choices.length}): `);
  const idx = parseInt(answer.trim(), 10) - 1;
  if (idx >= 0 && idx < choices.length) return choices[idx].value;
  return choices[0].value;
}

export async function promptMultiSelect(
  message: string,
  choices: Choice[],
  opts?: { validate?: (ids: string[]) => true | string }
): Promise<string[]> {
  if (supportsInquirer) {
    const { checkbox } = await import("@inquirer/prompts");
    // @inquirer checkbox 的 validate 传入 NormalizedChoice[]，适配为 string[]
    const rawValidate = opts?.validate;
    return checkbox({
      message,
      choices: choices.map((c) => ({ name: c.name, value: c.value })),
      validate: rawValidate
        ? (vals: readonly { name: string; value: string }[]) =>
            rawValidate(vals.map((v) => v.value))
        : undefined,
    }) as Promise<string[]>;
  }

  // stdin fallback: 编号多选
  while (true) {
    console.log(message);
    choices.forEach((c, i) => console.log(`  [${i + 1}] ${c.name}`));
    const answer = await ask("输入编号，逗号分隔: ");
    const trimmed = answer.trim();
    if (!trimmed) {
      if (opts?.validate) {
        const err = opts.validate([]);
        if (err !== true) { console.log(`  ⚠ ${err}`); continue; }
      }
      return [];
    }
    const ids: string[] = [];
    const parts = trimmed.split(/[,，\s]+/);
    for (const p of parts) {
      const idx = parseInt(p, 10) - 1;
      if (idx >= 0 && idx < choices.length) {
        ids.push(choices[idx].value);
      }
    }
    if (opts?.validate) {
      const err = opts.validate(ids);
      if (err !== true) { console.log(`  ⚠ ${err}`); continue; }
    }
    return ids;
  }
}

export async function promptConfirm(message: string, defaultValue?: boolean): Promise<boolean> {
  if (supportsInquirer) {
    const { confirm } = await import("@inquirer/prompts");
    return confirm({ message, default: defaultValue });
  }

  const suffix = defaultValue === true ? " [Y/n] " : defaultValue === false ? " [y/N] " : " [y/N] ";
  const answer = await ask(message + suffix);
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === "") return defaultValue ?? false;
  return trimmed === "y" || trimmed === "yes";
}
