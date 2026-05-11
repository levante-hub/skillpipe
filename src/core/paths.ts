import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILLPIPE_DIR_NAME = ".skillpipe";

export function skillpipeHome(): string {
  const env = process.env.SKILLPIPE_HOME?.trim();
  if (env) return env;
  const found = findSkillpipeDirUpward(process.cwd());
  if (found) return found;
  return projectSkillpipeHome();
}

export function configPath(): string {
  return path.join(skillpipeHome(), "config.json");
}

export function lockPath(): string {
  return path.join(skillpipeHome(), "lock.json");
}

export function reposDir(): string {
  return path.join(skillpipeHome(), "repos");
}

export function projectSkillpipeHome(cwd: string = process.cwd()): string {
  return path.join(cwd, SKILLPIPE_DIR_NAME);
}

function findSkillpipeDirUpward(start: string): string | null {
  let dir = path.resolve(start);
  while (true) {
    const candidate = path.join(dir, SKILLPIPE_DIR_NAME);
    if (isDirectory(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function workspaceForRepo(repoName: string): string {
  return path.join(reposDir(), sanitizeRepoName(repoName));
}

export function defaultClaudeUserSkillsPath(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

export function defaultClaudeProjectSkillsPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".claude", "skills");
}

export function defaultHermesUserSkillsPath(): string {
  const hermesHome = process.env.HERMES_HOME?.trim();
  const home = hermesHome && hermesHome.length > 0
    ? hermesHome
    : path.join(os.homedir(), ".hermes");
  return path.join(home, "skills");
}

export function defaultOpenclawUserSkillsPath(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim();
  const home = stateDir && stateDir.length > 0
    ? stateDir
    : path.join(os.homedir(), ".openclaw");
  return path.join(home, "skills");
}

export function defaultOpenclawProjectSkillsPath(cwd: string = process.cwd()): string {
  return path.join(cwd, "skills");
}

export function defaultLevanteUserSkillsPath(): string {
  return path.join(os.homedir(), "levante", "skills");
}

export function defaultLevanteProjectSkillsPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".levante", "skills");
}

export const BUNDLED_SKILL_NAME = "skillpipe-cli";

export function bundledSkillPath(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "skills", name);
}

export function sanitizeRepoName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export interface ParsedRepoUrl {
  owner: string;
  name: string;
  protocol: "https" | "ssh";
  url: string;
}

export function parseGithubUrl(input: string): ParsedRepoUrl {
  const trimmed = input.trim().replace(/\.git$/, "");
  const sshMatch = /^git@github\.com:([^/]+)\/([^/]+)$/.exec(trimmed);
  if (sshMatch) {
    return {
      owner: sshMatch[1]!,
      name: sshMatch[2]!,
      protocol: "ssh",
      url: `git@github.com:${sshMatch[1]}/${sshMatch[2]}.git`
    };
  }
  const httpsMatch =
    /^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/.exec(trimmed);
  if (httpsMatch) {
    return {
      owner: httpsMatch[1]!,
      name: httpsMatch[2]!,
      protocol: "https",
      url: `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}.git`
    };
  }
  const shortMatch = /^([^/]+)\/([^/]+)$/.exec(trimmed);
  if (shortMatch) {
    return {
      owner: shortMatch[1]!,
      name: shortMatch[2]!,
      protocol: "https",
      url: `https://github.com/${shortMatch[1]}/${shortMatch[2]}.git`
    };
  }
  throw new Error(`Cannot parse GitHub URL: ${input}`);
}
