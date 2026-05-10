import { logger } from "../utils/logger.js";
import { loadLocalConfig } from "../core/config.js";
import { loadRepository, listSkills } from "../core/repository.js";
import {
  fetchRepo,
  checkoutTrackingBranch,
  pullBranch
} from "../core/git.js";
import { getConnectedWorkspace } from "./repo-connect.js";

export async function runList(): Promise<void> {
  const config = await loadLocalConfig();
  const { workspace } = await getConnectedWorkspace();
  logger.step(`Refreshing ${config.defaultBranch}`);
  await fetchRepo(workspace);
  await checkoutTrackingBranch(workspace, config.defaultBranch);
  await pullBranch(workspace, config.defaultBranch);
  const repo = await loadRepository(workspace);
  const skills = await listSkills(repo);

  if (skills.length === 0) {
    logger.info("No skills found in the connected repository.");
    return;
  }

  logger.info("Available skills:");
  logger.newline();
  logger.table(
    skills.map((s) => ({
      name: s.metadata.name,
      version: s.metadata.version,
      description: truncate(s.metadata.description, 60)
    }))
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
