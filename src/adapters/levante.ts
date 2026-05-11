import path from "node:path";
import { delimiter } from "node:path";
import { access, constants } from "node:fs/promises";
import yaml from "js-yaml";
import { materializeSkill } from "../core/sync.js";
import { listDirs, pathExists, removePath, writeText } from "../utils/fs.js";
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

  supportedScopes(): ("global" | "project")[] {
    return ["global", "project"];
  }

  getDefaultInstallPath(scope: "global" | "project" = "global"): string {
    return scope === "project"
      ? defaultLevanteProjectSkillsPath()
      : defaultLevanteUserSkillsPath();
  }

  async installSkill(args: InstallSkillArgs): Promise<InstallSkillResult> {
    const dest = path.join(args.installPath, args.skillName);
    await materializeSkill(args.sourceDir, dest);
    await writeText(
      path.join(dest, "SKILL.md"),
      renderLevanteSkillFile(args)
    );
    return { destPath: dest };
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

function renderLevanteSkillFile(args: InstallSkillArgs): string {
  const frontmatter: Record<string, unknown> = {
    id: `custom/${args.skill.metadata.name}`,
    name: args.skill.metadata.name,
    description: args.skill.metadata.description,
    category: "custom",
    version: args.skill.metadata.version,
    "user-invocable": "true",
    "installed-at": args.installedAt
  };

  if (args.skill.rawFrontmatter.author !== undefined) {
    frontmatter.author = args.skill.rawFrontmatter.author;
  }
  if (args.skill.rawFrontmatter.tags !== undefined) {
    frontmatter.tags = args.skill.rawFrontmatter.tags;
  }
  if (args.skill.rawFrontmatter.targets !== undefined) {
    frontmatter.targets = args.skill.rawFrontmatter.targets;
  }

  const body = args.skill.body.replace(/^\n+/, "");
  return `---\n${yaml.dump(frontmatter, {
    lineWidth: -1,
    noRefs: true
  })}---\n\n${body}`;
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
