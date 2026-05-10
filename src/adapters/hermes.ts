import path from "node:path";
import os from "node:os";
import { plainCopySkill } from "../core/sync.js";
import { listDirs, pathExists, removePath } from "../utils/fs.js";
import { defaultHermesUserSkillsPath } from "../core/paths.js";
import {
  TargetAdapter,
  InstallSkillArgs,
  RemoveSkillArgs,
  InstalledSkillSummary
} from "./index.js";

export class HermesAdapter implements TargetAdapter {
  readonly name = "hermes";

  async detect(): Promise<boolean> {
    const hermesHome = process.env.HERMES_HOME?.trim();
    const home = hermesHome && hermesHome.length > 0
      ? hermesHome
      : path.join(os.homedir(), ".hermes");
    return pathExists(home);
  }

  getDefaultInstallPath(): string {
    return defaultHermesUserSkillsPath();
  }

  async installSkill(args: InstallSkillArgs): Promise<string> {
    const dest = path.join(args.installPath, args.skillName);
    await plainCopySkill(args.sourceDir, dest);
    return dest;
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
