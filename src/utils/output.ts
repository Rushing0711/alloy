import { color, boxPanel, borderedTable } from "./format.js";

/** 分区标题——粗体，前面空行 */
export function section(title: string): void {
  console.log(`\n  ${color.bold(title)}`);
}

/** 检查项——带状态图标 */
export function check(label: string, value: string, status: "pass" | "fail" | "warn"): void {
  const icon =
    status === "pass" ? color.green("✓") :
    status === "fail" ? color.red("✗") :
    color.yellow("⚠");
  console.log(`     ${icon} ${label} ${color.cyan(value)}`);
}

/** 成功消息 */
export function success(msg: string): void {
  console.log(`     ${color.green("✓")} ${msg}`);
}

/** 错误消息（输出到 stderr） */
export function error(msg: string): void {
  console.error(`     ${color.red("✗")} ${msg}`);
}

/** 警告消息 */
export function warn(msg: string): void {
  console.log(`     ${color.yellow("⚠")} ${msg}`);
}

/** 结束横幅 */
export function banner(msg: string): void {
  console.log(`\n  ${color.green(msg)}`);
}

/** 详情表——boxPanel 包裹的 borderedTable */
export function detailTable(headers: string[], rows: string[][]): void {
  const table = borderedTable(headers, rows);
  console.log(boxPanel(table, { title: "" }));
}

/** 信息行——缩进普通文本 */
export function info(msg: string): void {
  console.log(`   ${msg}`);
}
