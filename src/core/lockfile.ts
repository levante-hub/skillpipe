import { lockPath } from "./paths.js";
import {
  Lockfile,
  LockfileSchema,
  emptyLockfile,
  InstalledSkill
} from "../schemas/lockfile.schema.js";
import { pathExists, readJson, writeJson } from "../utils/fs.js";
import { SkillpipeError } from "../utils/errors.js";

export async function loadLockfile(): Promise<Lockfile> {
  if (!(await pathExists(lockPath()))) {
    return emptyLockfile();
  }
  try {
    const raw = await readJson<unknown>(lockPath());
    return LockfileSchema.parse(raw);
  } catch (e) {
    throw new SkillpipeError(
      "LOCKFILE_INVALID",
      `Invalid lockfile at ${lockPath()}: ${(e as Error).message}`
    );
  }
}

export async function saveLockfile(lock: Lockfile): Promise<void> {
  lock.updatedAt = new Date().toISOString();
  await writeJson(lockPath(), lock);
}

export function recordInstalledSkill(
  lock: Lockfile,
  name: string,
  installed: InstalledSkill
): void {
  lock.skills[name] = installed;
}

export function removeInstalledSkill(lock: Lockfile, name: string): void {
  delete lock.skills[name];
}
