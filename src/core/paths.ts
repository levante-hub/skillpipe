import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLSYNC_HOME = path.join(os.homedir(), ".skillsync");
export const CONFIG_PATH = path.join(SKILLSYNC_HOME, "config.json");
export const LOCK_PATH = path.join(SKILLSYNC_HOME, "lock.json");
export const REPOS_DIR = path.join(SKILLSYNC_HOME, "repos");

export function workspaceForRepo(repoName: string): string {
  return path.join(REPOS_DIR, sanitizeRepoName(repoName));
}

export function defaultClaudeUserSkillsPath(): string {
  return path.join(os.homedir(), ".claude", "skills");
}

export function defaultClaudeProjectSkillsPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".claude", "skills");
}

export const BUNDLED_SKILL_NAME = "skillsync-cli";

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
