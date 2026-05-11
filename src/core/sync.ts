import path from "node:path";
import { ParsedSkill } from "./skill.js";
import {
  copyDir,
  removePath,
  ensureDir,
  pathExists
} from "../utils/fs.js";
import { Lockfile } from "../schemas/lockfile.schema.js";
import { recordInstalledSkill, removeInstalledSkill } from "./lockfile.js";
import { lastCommitForPath, currentCommit } from "./git.js";
import { TargetAdapter } from "../adapters/index.js";

export interface InstallSkillArgs {
  skill: ParsedSkill;
  workspace: string;
  adapter: TargetAdapter;
  lock: Lockfile;
  installPath: string;
  branch: string;
}

export async function installSkill(args: InstallSkillArgs): Promise<string> {
  const { skill, workspace, adapter, lock, installPath, branch } = args;

  const relSkillPath = path.relative(workspace, skill.folder);
  const commit =
    (await lastCommitForPath(workspace, relSkillPath)) ??
    (await currentCommit(workspace));

  const { destPath } = await adapter.installSkill({
    sourceDir: skill.folder,
    skillName: skill.metadata.name,
    installPath
  });

  recordInstalledSkill(lock, skill.metadata.name, {
    version: skill.metadata.version,
    commit,
    target: adapter.name,
    installPath,
    path: destPath,
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
  destDir: string
): Promise<"copy"> {
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
