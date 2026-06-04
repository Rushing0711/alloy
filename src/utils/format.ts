import pc from "picocolors";
import cliTable from "cli-table3";
import boxen, { type Options as BoxenOptions } from "boxen";
import ora, { type Ora } from "ora";

// ── 颜色 ──
export const color = pc;

// ── 字符宽度 ──
export { default as stringWidth } from "string-width";

// ── Box 面板 ──
function isUnicodeSupported(): boolean {
  if ("CI" in process.env) return false;
  if (process.platform === "win32") return false;
  const term = process.env.TERM;
  if (term && term.includes("256color")) return true;
  const lang = process.env.LANG || "";
  if (lang.includes("UTF-8") || lang.includes("utf8")) return true;
  return true;
}

export interface BoxOptions extends BoxenOptions {}

export function box(text: string, opts?: BoxOptions): string {
  return boxen(text, {
    padding: 1,
    borderStyle: isUnicodeSupported() ? "round" : "single",
    ...opts,
  });
}

// ── 无边框表格 ──
export function table(headers: string[], rows: string[][]): string {
  const t = new cliTable({
    head: headers,
    style: { head: ["cyan"] },
    chars: {
      top: "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      bottom: "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      left: "  ",
      "left-mid": "",
      mid: "",
      "mid-mid": "",
      right: "",
      "right-mid": "",
      middle: "  ",
    },
  });
  for (const r of rows) {
    t.push(r);
  }
  return t.toString();
}

// ── 带边框表格 ──
export function borderedTable(headers: string[], rows: string[][]): string {
  const t = new cliTable({
    head: headers,
    style: { head: ["cyan"] },
  });
  for (const r of rows) {
    t.push(r);
  }
  return t.toString();
}

// ── Spinner ──
export function spinner(text: string): Ora {
  return ora({ text, isEnabled: process.stdout.isTTY ?? false }).start();
}

// ── 工具函数 ──
export { default as stripAnsi } from "strip-ansi";
