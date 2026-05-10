import path from "node:path";
import { delimiter } from "node:path";
import { access, constants } from "node:fs/promises";
import { materializeSkill } from "../core/sync.js";
import { listDirs, pathExists, removePath } from "../utils/fs.js";
import {
  defaultLevanteUserSkillsPath,
  defaultLevanteProjectSkillsPath
} from "../core/paths.js";
import {
  TargetAdapter,
  InstallSkillArgs,
  InstallSkillResult,
  RemoveSkillArgs,
  InstalledSkillSummary
} from "./index.js";

export class LevanteAdapter implements TargetAdapter {
  readonly name = "levante";

  async detect(): Promise<boolean> {
    return isCommandAvailable("levante");
  }

  getDefaultInstallPath(scope: "user" | "project" = "user"): string {
    return scope === "project"
      ? defaultLevanteProjectSkillsPath()
      : defaultLevanteUserSkillsPath();
  }

  async installSkill(args: InstallSkillArgs): Promise<InstallSkillResult> {
    const dest = path.join(args.installPath, args.skillName);
    const mode = await materializeSkill(args.sourceDir, dest, args.mode ?? "copy");
    return { destPath: dest, mode };
  }

  async removeSkill(args: RemoveSkillArgs): Promise<void> {
    const target = path.join(args.installPath, args.skillName);
    if (await pathExists(target)) {
      await removePath(target);
    }
  }

  async listInstalledSkills(
    installPath: string
  ): Promise<InstalledSkillSummary[]> {
    const dirs = await listDirs(installPath);
    return dirs.map((name) => ({
      name,
      path: path.join(installPath, name)
    }));
  }
}

async function isCommandAvailable(name: string): Promise<boolean> {
  const pathDirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const exts =
    process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of pathDirs) {
    for (const ext of exts) {
      try {
        await access(path.join(dir, name + ext), constants.X_OK);
        return true;
      } catch {
        continue;
      }
    }
  }
  return false;
}
