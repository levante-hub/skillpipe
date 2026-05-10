import { logger } from "../utils/logger.js";
import { loadLocalConfig } from "../core/config.js";
import { loadLockfile } from "../core/lockfile.js";
import { loadRepository, listSkills } from "../core/repository.js";
import {
  fetchRepo,
  pullBranch,
  remoteCommit,
  lastCommitForPath,
  checkoutTrackingBranch
} from "../core/git.js";
import path from "node:path";
import { getConnectedWorkspace } from "./repo-connect.js";

export async function runStatus(): Promise<void> {
  const config = await loadLocalConfig();
  const { workspace, repoFullName } = await getConnectedWorkspace();
  const lock = await loadLockfile();
  const branch = config.defaultBranch;

  await fetchRepo(workspace);
  await checkoutTrackingBranch(workspace, branch);
  await pullBranch(workspace, branch);
  const repo = await loadRepository(workspace);
  const remote = await remoteCommit(workspace, branch);

  logger.info(`Repository:   github.com/${repoFullName}`);
  logger.info(`Branch:       ${branch}`);
  logger.info(`Default target: ${config.defaultTarget}`);
  const defaultInstallPath = config.targets[config.defaultTarget]?.installPath;
  if (defaultInstallPath) logger.info(`Default path:   ${defaultInstallPath}`);
  logger.info(`Remote HEAD:  ${remote.slice(0, 7)}`);
  logger.newline();

  const skills = await listSkills(repo);
  if (skills.length === 0) {
    logger.info("No skills found in the repository.");
    return;
  }

  logger.info("Skills:");
  logger.newline();

  const rows: Array<Record<string, string>> = [];
  for (const s of skills) {
    const installed = lock.skills[s.metadata.name];
    const rel = path.relative(workspace, s.folder);
    const remoteSkillCommit =
      (await lastCommitForPath(workspace, rel)) ?? remote;
    let state = "not installed";
    if (installed) {
      state =
        installed.commit === remoteSkillCommit
          ? "up to date"
          : "update available";
    }
    rows.push({
      name: s.metadata.name,
      local: installed?.version ?? "—",
      remote: s.metadata.version,
      target: installed?.target ?? "—",
      mode: installed?.mode ?? "—",
      path: installed?.path ?? "—",
      state
    });
  }
  logger.table(rows);
}
