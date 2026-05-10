import path from "node:path";
import os from "node:os";
import { plainCopySkill } from "../core/sync.js";
import { listDirs, pathExists, removePath } from "../utils/fs.js";
import {
  defaultClaudeUserSkillsPath,
  defaultClaudeProjectSkillsPath
} from "../core/paths.js";
import {
  TargetAdapter,
  InstallSkillArgs,
  RemoveSkillArgs,
  InstalledSkillSummary
} from "./index.js";

export class ClaudeCodeAdapter implements TargetAdapter {
  readonly name = "claude-code";

  async detect(): Promise<boolean> {
    return pathExists(path.join(os.homedir(), ".claude"));
  }

  getDefaultInstallPath(scope: "user" | "project" = "user"): string {
    return scope === "project"
      ? defaultClaudeProjectSkillsPath()
      : defaultClaudeUserSkillsPath();
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
