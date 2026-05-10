import path from "node:path";
import {
  SkillSyncRepoConfig,
  SkillSyncRepoConfigSchema,
  defaultSkillSyncRepoConfig
} from "../schemas/skillsync.schema.js";
import { listDirs, pathExists, readJson, writeJson } from "../utils/fs.js";
import { SkillSyncError } from "../utils/errors.js";
import { ParsedSkill, parseSkill } from "./skill.js";

export interface RepositoryHandle {
  workspace: string;
  config: SkillSyncRepoConfig;
}

export async function loadRepository(
  workspace: string
): Promise<RepositoryHandle> {
  if (!(await pathExists(workspace))) {
    throw new SkillSyncError(
      "REPO_NOT_FOUND",
      `Workspace not found at ${workspace}`,
      "Run `skillsync repo connect <url>` first."
    );
  }
  const cfgPath = path.join(workspace, "skillsync.json");
  if (!(await pathExists(cfgPath))) {
    throw new SkillSyncError(
      "REPO_NOT_FOUND",
      `Missing skillsync.json in ${workspace}`,
      "Initialize the repo with `skillsync repo create` or add skillsync.json manually."
    );
  }
  const raw = await readJson<unknown>(cfgPath);
  const parsed = SkillSyncRepoConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    throw new SkillSyncError(
      "CONFIG_INVALID",
      `Invalid skillsync.json: ${issues}`
    );
  }
  return { workspace, config: parsed.data };
}

export async function writeRepoConfig(
  workspace: string,
  config: SkillSyncRepoConfig
): Promise<void> {
  await writeJson(path.join(workspace, "skillsync.json"), config);
}

export async function listSkillFolders(
  repo: RepositoryHandle
): Promise<string[]> {
  const skillsRoot = path.join(repo.workspace, repo.config.skillsPath);
  const dirs = await listDirs(skillsRoot);
  return dirs.map((d) => path.join(skillsRoot, d));
}

export async function listSkills(
  repo: RepositoryHandle
): Promise<ParsedSkill[]> {
  const folders = await listSkillFolders(repo);
  const skills: ParsedSkill[] = [];
  for (const folder of folders) {
    skills.push(await parseSkill(folder));
  }
  return skills;
}

export async function findSkill(
  repo: RepositoryHandle,
  name: string
): Promise<ParsedSkill> {
  const folders = await listSkillFolders(repo);
  for (const folder of folders) {
    if (path.basename(folder) === name) {
      return parseSkill(folder);
    }
  }
  throw new SkillSyncError(
    "SKILL_NOT_FOUND",
    `Skill "${name}" not found in repository.`,
    "Run `skillsync list` to see available skills."
  );
}

export function defaultRepoConfigFor(name: string): SkillSyncRepoConfig {
  return defaultSkillSyncRepoConfig(name);
}
