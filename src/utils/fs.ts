import fse from "fs-extra";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import fg from "fast-glob";

export function expandHome(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export async function pathExists(p: string): Promise<boolean> {
  return fse.pathExists(expandHome(p));
}

export async function ensureDir(p: string): Promise<void> {
  await fse.ensureDir(expandHome(p));
}

export async function readJson<T>(p: string): Promise<T> {
  return fse.readJson(expandHome(p)) as Promise<T>;
}

export async function writeJson(p: string, data: unknown): Promise<void> {
  const real = expandHome(p);
  await fse.ensureDir(path.dirname(real));
  await fse.writeJson(real, data, { spaces: 2 });
}

export async function readText(p: string): Promise<string> {
  return fse.readFile(expandHome(p), "utf8");
}

export async function writeText(p: string, content: string): Promise<void> {
  const real = expandHome(p);
  await fse.ensureDir(path.dirname(real));
  await fse.writeFile(real, content, "utf8");
}

export async function copyDir(src: string, dest: string): Promise<void> {
  await fse.copy(expandHome(src), expandHome(dest), {
    overwrite: true,
    errorOnExist: false,
    dereference: false
  });
}

export async function symlinkDir(src: string, dest: string): Promise<void> {
  const absSource = path.resolve(expandHome(src));
  const absDest = expandHome(dest);
  await fse.ensureDir(path.dirname(absDest));
  if (await fse.pathExists(absDest)) {
    await fse.remove(absDest);
  }
  await fs.symlink(absSource, absDest, "dir");
}

export async function isSymlink(p: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(expandHome(p));
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function removePath(p: string): Promise<void> {
  await fse.remove(expandHome(p));
}

export async function listDirs(parent: string): Promise<string[]> {
  const real = expandHome(parent);
  if (!(await fse.pathExists(real))) return [];
  const entries = await fse.readdir(real, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function findFiles(
  patterns: string | string[],
  cwd: string
): Promise<string[]> {
  return fg(patterns, { cwd: expandHome(cwd), dot: true, onlyFiles: true });
}

export async function fileSize(p: string): Promise<number> {
  const stat = await fse.stat(expandHome(p));
  return stat.size;
}
