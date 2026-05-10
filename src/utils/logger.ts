import chalk from "chalk";

let verbose = false;

export const logger = {
  setVerbose(v: boolean) {
    verbose = v;
  },
  info(msg: string): void {
    console.log(msg);
  },
  success(msg: string): void {
    console.log(chalk.green(msg));
  },
  warn(msg: string): void {
    console.log(chalk.yellow(`warning: ${msg}`));
  },
  error(msg: string): void {
    console.error(chalk.red(`error: ${msg}`));
  },
  step(msg: string): void {
    console.log(chalk.cyan(`→ ${msg}`));
  },
  hint(msg: string): void {
    console.log(chalk.dim(msg));
  },
  debug(msg: string): void {
    if (verbose) console.log(chalk.dim(`[debug] ${msg}`));
  },
  newline(): void {
    console.log("");
  },
  table(rows: Array<Record<string, string>>): void {
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]!);
    const widths = cols.map((c) =>
      Math.max(c.length, ...rows.map((r) => (r[c] ?? "").length))
    );
    const fmt = (vals: string[]) =>
      vals.map((v, i) => v.padEnd(widths[i]!)).join("   ");
    console.log(chalk.bold(fmt(cols)));
    rows.forEach((r) => console.log(fmt(cols.map((c) => r[c] ?? ""))));
  }
};
