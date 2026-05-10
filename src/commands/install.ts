import path from "node:path";
import { logger } from "../utils/logger.js";
import { loadLocalConfig } from "../core/config.js";
import { loadLockfile, saveLockfile } from "../core/lockfile.js";
import {
  loadRepository,
  findSkill,
  listSkills
} from "../core/repository.js";
import {
  fetchRepo,
  pullBranch,
  remoteCommit,
  checkoutTrackingBranch
} from "../core/git.js";
import { getAdapter } from "../adapters/index.js";
import { installSkill } from "../core/sync.js";
import {
  validateSkill,
  DEFAULT_VALIDATION_OPTIONS
} from "../core/validator.js";
import { ParsedSkill } from "../core/skill.js";
import { getConnectedWorkspace } from "./repo-connect.js";
import { expandHome } from "../utils/fs.js";
import { SkillSyncError } from "../utils/errors.js";

export interface InstallOptions {
  name: string;
  target?: string;
  installPath?: string;
}

export async function runInstall(opts: InstallOptions): Promise<void> {
  const config = await loadLocalConfig();
  const { workspace } = await getConnectedWorkspace();
  const targetName = opts.target ?? config.defaultTarget;
  const branch = config.defaultBranch;

  const targetCfg = config.targets[targetName];
  const installPath = expandHome(
    opts.installPath ?? targetCfg?.installPath ?? ""
  );
  if (!installPath) {
    throw new SkillSyncError(
      "TARGET_NOT_INSTALLED",
      `No install path configured for target "${targetName}".`,
      "Run `skillsync init` or pass --path."
    );
  }

  const adapter = getAdapter(targetName);

  logger.step(`Fetching latest from ${branch}`);
  await fetchRepo(workspace);
  await checkoutTrackingBranch(workspace, branch);
  await pullBranch(workspace, branch);
  const repo = await loadRepository(workspace);

  const all = opts.name === "all";
  const skills: ParsedSkill[] = all
    ? await listSkills(repo)
    : [await findSkill(repo, opts.name)];

  const lock = await loadLockfile();

  for (const skill of skills) {
    if (
      repo.config.security.validateBeforeInstall ||
      config.security.requireValidation
    ) {
      const report = await validateSkill(skill, {
        ...DEFAULT_VALIDATION_OPTIONS,
        scanSecrets:
          repo.config.security.scanForSecrets || config.security.scanSecrets
      });
      if (!report.ok) {
        logger.error(`Validation failed for ${skill.metadata.name}:`);
        for (const issue of report.issues) {
          logger.error(`  [${issue.code}] ${issue.message}`);
        }
        throw new SkillSyncError(
          "VALIDATION_FAILED",
          `Skill "${skill.metadata.name}" failed validation.`
        );
      }
    }

    const dest = await installSkill({
      skill,
      workspace,
      adapter,
      lock,
      installPath,
      branch
    });
    logger.success(`Installed ${skill.metadata.name} → ${dest}`);
  }

  lock.remoteCommit = await remoteCommit(workspace, branch);
  await saveLockfile(lock);
}
