import { LOCK_PATH } from "./paths.js";
import {
  Lockfile,
  LockfileSchema,
  emptyLockfile,
  InstalledSkill
} from "../schemas/lockfile.schema.js";
import { pathExists, readJson, writeJson } from "../utils/fs.js";
import { SkillSyncError } from "../utils/errors.js";

export async function loadLockfile(): Promise<Lockfile> {
  if (!(await pathExists(LOCK_PATH))) {
    return emptyLockfile();
  }
  try {
    const raw = await readJson<unknown>(LOCK_PATH);
    return LockfileSchema.parse(raw);
  } catch (e) {
    throw new SkillSyncError(
      "LOCKFILE_INVALID",
      `Invalid lockfile at ${LOCK_PATH}: ${(e as Error).message}`
    );
  }
}

export async function saveLockfile(lock: Lockfile): Promise<void> {
  lock.updatedAt = new Date().toISOString();
  await writeJson(LOCK_PATH, lock);
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
