import path from "node:path";
import {
  SkillpipeRepoConfig,
  SkillpipeRepoConfigSchema,
  defaultSkillpipeRepoConfig
} from "../schemas/skillpipe.schema.js";
import { listDirs, pathExists, readJson, writeJson } from "../utils/fs.js";
import { SkillpipeError } from "../utils/errors.js";
import { ParsedSkill, parseSkill } from "./skill.js";

export interface RepositoryHandle {
  workspace: string;
  config: SkillpipeRepoConfig;
}

export async function loadRepository(
  workspace: string
): Promise<RepositoryHandle> {
  if (!(await pathExists(workspace))) {
    throw new SkillpipeError(
      "REPO_NOT_FOUND",
      `Workspace not found at ${workspace}`,
      "Run `skillpipe repo connect <url>` first."
    );
  }
  const cfgPath = path.join(workspace, "skillpipe.json");
  if (!(await pathExists(cfgPath))) {
    throw new SkillpipeError(
      "REPO_NOT_FOUND",
      `Missing skillpipe.json in ${workspace}`,
      "Initialize the repo with `skillpipe repo create` or add skillpipe.json manually."
    );
  }
  const raw = await readJson<unknown>(cfgPath);
  const parsed = SkillpipeRepoConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    throw new SkillpipeError(
      "CONFIG_INVALID",
      `Invalid skillpipe.json: ${issues}`
    );
  }
  return { workspace, config: parsed.data };
}

export async function writeRepoConfig(
  workspace: string,
  config: SkillpipeRepoConfig
): Promise<void> {
  await writeJson(path.join(workspace, "skillpipe.json"), config);
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
  throw new SkillpipeError(
    "SKILL_NOT_FOUND",
    `Skill "${name}" not found in repository.`,
    "Run `skillpipe list` to see available skills."
  );
}

export function defaultRepoConfigFor(name: string): SkillpipeRepoConfig {
  return defaultSkillpipeRepoConfig(name);
}
