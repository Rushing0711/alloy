import pc from "picocolors";
import cliTable from "cli-table3";
import boxen, { type Options as BoxenOptions } from "boxen";
import ora, { type Ora } from "ora";

// ── 颜色 ──
export const color = pc;

// ── 字符宽度 ──
export { default as stringWidth } from "string-width";

// ── Box 面板 ──
export function box(text: string, opts?: BoxenOptions): string {
  return boxen(text, { padding: 1, ...opts });
}

// ── Box Panel（带标题的面板） ──
interface BoxOptions {
  padding?: number;
  margin?: number;
  width?: number;
  title?: string;
  titleAlignment?: "left" | "center" | "right";
}

export function boxPanel(content: string, opts?: BoxOptions): string {
  const boxenOpts: BoxenOptions = {
    padding: opts?.padding ?? 1,
    margin: opts?.margin ?? 0,
    width: opts?.width,
    title: opts?.title,
    titleAlignment: opts?.titleAlignment ?? "left",
  };
  return boxen(content, boxenOpts);
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

// ── 带边框表格（扩展版） ──
interface TableOptions {
  width?: number;
  headerStyle?: string;
  borderStyle?: string;
}

export function tableWithBorder(headers: string[], rows: string[][], opts?: TableOptions): string {
  const t = new cliTable({
    head: headers,
    style: { head: [opts?.headerStyle ?? "cyan"] },
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

// ── 状态行 ──
interface StatusOptions {
  icon?: string;
  width?: number;
}

export function statusLine(label: string, value: string, status: "success" | "warning" | "error", opts?: StatusOptions): string {
  const icons = {
    success: "✓",
    warning: "⚠",
    error: "✗",
  };

  const icon = opts?.icon ?? icons[status];
  const coloredIcon = status === "success" ? pc.green(icon) : status === "warning" ? pc.yellow(icon) : pc.red(icon);

  return `     ${coloredIcon} ${label} ${pc.cyan(value)}`;
}

// ── 工具函数 ──
export { default as stripAnsi } from "strip-ansi";
