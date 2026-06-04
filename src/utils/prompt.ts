import { select, checkbox, confirm } from "@inquirer/prompts";

export interface Choice {
  name: string;
  value: string;
}

export async function promptSelect(message: string, choices: Choice[]): Promise<string> {
  return select({ message, choices });
}

export async function promptMultiSelect(
  message: string,
  choices: Choice[],
  opts?: { validate?: (ids: string[]) => true | string }
): Promise<string[]> {
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

export async function promptConfirm(message: string, defaultValue?: boolean): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}
