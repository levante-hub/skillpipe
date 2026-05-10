import path from "node:path";
import { ParsedSkill } from "./skill.js";
import {
  copyDir,
  removePath,
  ensureDir,
  pathExists,
  symlinkDir
} from "../utils/fs.js";
import { logger } from "../utils/logger.js";
import { Lockfile } from "../schemas/lockfile.schema.js";
import { recordInstalledSkill, removeInstalledSkill } from "./lockfile.js";
import { lastCommitForPath, currentCommit } from "./git.js";
import { TargetAdapter } from "../adapters/index.js";

export type InstallMode = "copy" | "symlink";

export interface InstallSkillArgs {
  skill: ParsedSkill;
  workspace: string;
  adapter: TargetAdapter;
  lock: Lockfile;
  installPath: string;
  branch: string;
  mode: InstallMode;
}

export async function installSkill(args: InstallSkillArgs): Promise<string> {
  const { skill, workspace, adapter, lock, installPath, branch, mode } = args;

  const relSkillPath = path.relative(workspace, skill.folder);
  const commit =
    (await lastCommitForPath(workspace, relSkillPath)) ??
    (await currentCommit(workspace));

  const { destPath, mode: actualMode } = await adapter.installSkill({
    sourceDir: skill.folder,
    skillName: skill.metadata.name,
    installPath,
    mode
  });

  recordInstalledSkill(lock, skill.metadata.name, {
    version: skill.metadata.version,
    commit,
    target: adapter.name,
    installPath,
    path: destPath,
    mode: actualMode,
    installedAt: new Date().toISOString()
  });

  lock.branch = branch;
  return destPath;
}

export async function uninstallSkill(
  name: string,
  adapter: TargetAdapter,
  lock: Lockfile,
  installPath: string
): Promise<void> {
  await adapter.removeSkill({ skillName: name, installPath });
  removeInstalledSkill(lock, name);
}

export async function materializeSkill(
  sourceDir: string,
  destDir: string,
  mode: InstallMode
): Promise<InstallMode> {
  if (mode === "symlink") {
    try {
      await symlinkDir(sourceDir, destDir);
      return "symlink";
    } catch (err) {
      logger.warn(
        `Symlink failed for ${destDir} (${(err as Error).message}); falling back to copy.`
      );
      await plainCopySkill(sourceDir, destDir);
      return "copy";
    }
  }
  await plainCopySkill(sourceDir, destDir);
  return "copy";
}

export async function plainCopySkill(
  sourceDir: string,
  destDir: string
): Promise<void> {
  if (await pathExists(destDir)) {
    await removePath(destDir);
  }
  await ensureDir(path.dirname(destDir));
  await copyDir(sourceDir, destDir);
}
