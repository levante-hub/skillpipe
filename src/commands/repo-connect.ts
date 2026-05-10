import path from "node:path";
import { logger } from "../utils/logger.js";
import {
  loadOrInitLocalConfig,
  saveLocalConfig
} from "../core/config.js";
import { loadLockfile, saveLockfile } from "../core/lockfile.js";
import {
  parseGithubUrl,
  workspaceForRepo
} from "../core/paths.js";
import {
  cloneRepo,
  fetchRepo,
  remoteCommit,
  ensureGitAvailable,
  getRemoteUrl,
  hasLocalChanges,
  checkoutTrackingBranch,
  pullBranch
} from "../core/git.js";
import {
  loadRepository,
  writeRepoConfig,
  defaultRepoConfigFor
} from "../core/repository.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import { SkillpipeError } from "../utils/errors.js";

export interface RepoConnectOptions {
  url: string;
  branch?: string;
  initSkillpipe?: boolean;
}

export async function runRepoConnect(opts: RepoConnectOptions): Promise<void> {
  await ensureGitAvailable();

  const parsed = parseGithubUrl(opts.url);
  const workspace = workspaceForRepo(parsed.name);
  const workspaceExists = await pathExists(workspace);

  if (!workspaceExists) {
    logger.step(`Cloning ${parsed.url} into ${workspace}`);
    await cloneRepo(parsed.url, workspace, opts.branch);
  } else {
    logger.step(`Reusing existing workspace ${workspace}`);
    const existingRemote = await getRemoteUrl(workspace);
    if (!existingRemote) {
      throw new SkillpipeError(
        "REPO_NOT_FOUND",
        `Workspace at ${workspace} is not a Git repository with origin remote.`,
        "Remove the workspace manually or point Skillpipe at a different repository."
      );
    }
    const normalizedRemote = parseGithubUrl(existingRemote);
    if (
      normalizedRemote.owner !== parsed.owner ||
      normalizedRemote.name !== parsed.name
    ) {
      throw new SkillpipeError(
        "REPO_REMOTE_MISMATCH",
        `Workspace ${workspace} points to ${normalizedRemote.owner}/${normalizedRemote.name}, not ${parsed.owner}/${parsed.name}.`,
        "Use a different repo name or remove the existing workspace manually."
      );
    }
    if (await hasLocalChanges(workspace)) {
      throw new SkillpipeError(
        "WORKSPACE_DIRTY",
        `Workspace ${workspace} has local changes.`,
        "Commit, stash or discard the changes before reconnecting the repository."
      );
    }
  }

  const skillpipeJson = path.join(workspace, "skillpipe.json");
  if (!(await pathExists(skillpipeJson))) {
    if (opts.initSkillpipe) {
      logger.warn("skillpipe.json not found. Creating a default one (commit it manually).");
      await ensureDir(path.join(workspace, "skills"));
      await writeRepoConfig(workspace, defaultRepoConfigFor(parsed.name));
    } else {
      throw new SkillpipeError(
        "REPO_NOT_FOUND",
        `Repository at ${parsed.url} has no skillpipe.json.`,
        "Pass --init to scaffold one, or run `skillpipe repo create` for a fresh repo."
      );
    }
  }

  const repo = await loadRepository(workspace);
  const trackedBranch = opts.branch ?? repo.config.defaultBranch;
  await fetchRepo(workspace);
  await checkoutTrackingBranch(workspace, trackedBranch);
  await pullBranch(workspace, trackedBranch);
  const commit = await remoteCommit(workspace, trackedBranch);

  const config = await loadOrInitLocalConfig();
  config.defaultRepo = `${parsed.owner}/${parsed.name}`;
  config.defaultBranch = trackedBranch;
  await saveLocalConfig(config);

  const lock = await loadLockfile();
  lock.repo = config.defaultRepo;
  lock.branch = trackedBranch;
  lock.remoteCommit = commit;
  await saveLockfile(lock);

  logger.success(
    `Connected to ${config.defaultRepo} (branch ${trackedBranch}, ${commit.slice(
      0,
      7
    )}).`
  );
  logger.hint("Run `skillpipe list` to see available skills.");
}

export async function getConnectedWorkspace(): Promise<{
  workspace: string;
  repoFullName: string;
}> {
  const config = await loadOrInitLocalConfig();
  if (!config.defaultRepo) {
    throw new SkillpipeError(
      "REPO_NOT_CONNECTED",
      "No repository is connected.",
      "Run `skillpipe repo connect <url>` first."
    );
  }
  const [, name] = config.defaultRepo.split("/");
  if (!name) {
    throw new SkillpipeError(
      "REPO_NOT_CONNECTED",
      `Stored repo "${config.defaultRepo}" is malformed.`
    );
  }
  return {
    workspace: workspaceForRepo(name),
    repoFullName: config.defaultRepo
  };
}
