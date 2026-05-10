import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLPIPE_HOME = path.join(os.homedir(), ".skillpipe");
export const CONFIG_PATH = path.join(SKILLPIPE_HOME, "config.json");
export const LOCK_PATH = path.join(SKILLPIPE_HOME, "lock.json");
export const REPOS_DIR = path.join(SKILLPIPE_HOME, "repos");

export function workspaceForRepo(repoName: string): string {
  return path.join(REPOS_DIR, sanitizeRepoName(repoName));
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
