import { execa, type ExecaError } from "execa";
import { SkillpipeError } from "./errors.js";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ShellOptions {
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
}

export async function run(
  cmd: string,
  args: string[] = [],
  opts: ShellOptions = {}
): Promise<ShellResult> {
  try {
    const result = await execa(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      input: opts.input,
      reject: false
    });
    return {
      stdout: result.stdout?.toString() ?? "",
      stderr: result.stderr?.toString() ?? "",
      exitCode: result.exitCode ?? 1
    };
  } catch (e) {
    const err = e as ExecaError;
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? err.message,
      exitCode: err.exitCode ?? 1
    };
  }
}

export async function which(cmd: string): Promise<boolean> {
  const probe = process.platform === "win32" ? "where" : "which";
  const r = await run(probe, [cmd]);
  return r.exitCode === 0 && r.stdout.trim().length > 0;
}

export async function requireBinary(
  cmd: string,
  code: "GH_NOT_AVAILABLE" | "GIT_NOT_AVAILABLE",
  hint: string
): Promise<void> {
  const ok = await which(cmd);
  if (!ok) {
    throw new SkillpipeError(code, `${cmd} is not installed or not in PATH`, hint);
  }
}
