import { simpleGit, type SimpleGit } from "simple-git";
import { run, requireBinary } from "../utils/shell.js";
import { SkillSyncError } from "../utils/errors.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import path from "node:path";

export async function ensureGitAvailable(): Promise<void> {
  await requireBinary(
    "git",
    "GIT_NOT_AVAILABLE",
    "Install git from https://git-scm.com/downloads"
  );
}

export function gitClient(cwd: string): SimpleGit {
  return simpleGit({ baseDir: cwd });
}

export async function cloneRepo(
  repoUrl: string,
  destination: string,
  branch?: string
): Promise<void> {
  await ensureGitAvailable();
  if (await pathExists(destination)) {
    throw new SkillSyncError(
      "REPO_CLONE_FAILED",
      `Destination already exists: ${destination}`,
      "Reuse the existing workspace or remove it manually before cloning again."
    );
  }
  await ensureDir(path.dirname(destination));
  const args = ["clone", "--depth", "50"];
  if (branch) args.push("--branch", branch);
  args.push(repoUrl, destination);
  const r = await run("git", args);
  if (r.exitCode !== 0) {
    throw new SkillSyncError(
      "REPO_CLONE_FAILED",
      `Failed to clone ${repoUrl}: ${r.stderr.trim()}`,
      "Check the repo URL and your network/auth setup."
    );
  }
}

export async function fetchRepo(cwd: string): Promise<void> {
  await ensureGitAvailable();
  const r = await run("git", ["fetch", "--all", "--prune"], { cwd });
  if (r.exitCode !== 0) {
    throw new SkillSyncError(
      "GIT_OPERATION_FAILED",
      `git fetch failed: ${r.stderr.trim()}`
    );
  }
}

export async function checkoutBranch(
  cwd: string,
  branch: string,
  create = false
): Promise<void> {
  const args = create ? ["checkout", "-B", branch] : ["checkout", branch];
  const r = await run("git", args, { cwd });
  if (r.exitCode !== 0) {
    throw new SkillSyncError(
      "GIT_OPERATION_FAILED",
      `git checkout failed: ${r.stderr.trim()}`
    );
  }
}

export async function checkoutTrackingBranch(
  cwd: string,
  branch: string
): Promise<void> {
  const r = await run(
    "git",
    ["checkout", "-B", branch, `origin/${branch}`],
    { cwd }
  );
  if (r.exitCode !== 0) {
    throw new SkillSyncError(
      "GIT_OPERATION_FAILED",
      `Cannot switch to tracking branch ${branch}: ${r.stderr.trim() || r.stdout.trim()}`,
      "Commit or stash local changes and confirm that the branch exists on origin."
    );
  }
}

export async function pullBranch(cwd: string, branch: string): Promise<void> {
  const r = await run("git", ["pull", "origin", branch, "--ff-only"], { cwd });
  if (r.exitCode !== 0) {
    throw new SkillSyncError(
      "GIT_OPERATION_FAILED",
      `git pull failed: ${r.stderr.trim()}`,
      "Resolve the conflict manually in the workspace, then retry."
    );
  }
}

export async function currentCommit(cwd: string): Promise<string> {
  const r = await run("git", ["rev-parse", "HEAD"], { cwd });
  if (r.exitCode !== 0) {
    throw new SkillSyncError(
      "GIT_OPERATION_FAILED",
      `Cannot read HEAD commit: ${r.stderr.trim()}`
    );
  }
  return r.stdout.trim();
}

export async function remoteCommit(
  cwd: string,
  branch: string
): Promise<string> {
  const r = await run("git", ["rev-parse", `origin/${branch}`], { cwd });
  if (r.exitCode !== 0) {
    throw new SkillSyncError(
      "GIT_OPERATION_FAILED",
      `Cannot read origin/${branch}: ${r.stderr.trim()}`
    );
  }
  return r.stdout.trim();
}

export async function lastCommitForPath(
  cwd: string,
  relPath: string
): Promise<string | null> {
  const r = await run("git", ["log", "-n", "1", "--pretty=%H", "--", relPath], {
    cwd
  });
  if (r.exitCode !== 0) return null;
  const trimmed = r.stdout.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function hasLocalChanges(cwd: string): Promise<boolean> {
  const r = await run("git", ["status", "--porcelain"], { cwd });
  return r.stdout.trim().length > 0;
}

export async function addAndCommit(
  cwd: string,
  paths: string[],
  message: string
): Promise<string> {
  const add = await run("git", ["add", "--", ...paths], { cwd });
  if (add.exitCode !== 0) {
    throw new SkillSyncError(
      "GIT_OPERATION_FAILED",
      `git add failed: ${add.stderr.trim()}`
    );
  }
  const commit = await run("git", ["commit", "-m", message], { cwd });
  if (commit.exitCode !== 0) {
    throw new SkillSyncError(
      "GIT_OPERATION_FAILED",
      `git commit failed: ${commit.stderr.trim() || commit.stdout.trim()}`
    );
  }
  return currentCommit(cwd);
}

export async function pushBranch(
  cwd: string,
  branch: string
): Promise<void> {
  const r = await run("git", ["push", "-u", "origin", branch], { cwd });
  if (r.exitCode !== 0) {
    throw new SkillSyncError(
      "GIT_OPERATION_FAILED",
      `git push failed: ${r.stderr.trim()}`,
      "Check write permissions on the repository."
    );
  }
}

export async function getRemoteUrl(cwd: string): Promise<string | null> {
  const r = await run("git", ["remote", "get-url", "origin"], { cwd });
  if (r.exitCode !== 0) return null;
  return r.stdout.trim() || null;
}
