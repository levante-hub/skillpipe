import { logger } from "../utils/logger.js";
import { loadLocalConfig } from "../core/config.js";
import { loadLockfile, saveLockfile } from "../core/lockfile.js";
import { loadRepository, listSkills } from "../core/repository.js";
import {
  fetchRepo,
  pullBranch,
  remoteCommit,
  lastCommitForPath,
  checkoutTrackingBranch
} from "../core/git.js";
import { getAdapter } from "../adapters/index.js";
import { installSkill } from "../core/sync.js";
import {
  validateSkill,
  DEFAULT_VALIDATION_OPTIONS
} from "../core/validator.js";
import path from "node:path";
import { getConnectedWorkspace } from "./repo-connect.js";
import { expandHome } from "../utils/fs.js";
import { SkillpipeError } from "../utils/errors.js";
import {
  resolveInstallPathForCommand,
  supportsGlobalAndProjectScopes
} from "../core/target-resolution.js";
import { TargetScope } from "../adapters/index.js";

export interface UpdateOptions {
  name?: string;
  all?: boolean;
  dryRun?: boolean;
  scope?: TargetScope;
}

export async function runUpdate(opts: UpdateOptions = {}): Promise<void> {
  const config = await loadLocalConfig();
  const { workspace } = await getConnectedWorkspace();
  const lock = await loadLockfile();
  const branch = config.defaultBranch;

  const defaultTargetName = config.defaultTarget;
  const defaultInstallPath = expandHome(
    config.targets[defaultTargetName]?.installPath ?? ""
  );

  logger.step("Fetching remote changes");
  await fetchRepo(workspace);
  await checkoutTrackingBranch(workspace, branch);
  await pullBranch(workspace, branch);

  const repo = await loadRepository(workspace);
  const remote = await remoteCommit(workspace, branch);
  const allSkills = await listSkills(repo);

  const candidates = allSkills.filter((s) => {
    if (opts.name) return s.metadata.name === opts.name;
    if (opts.all) return true;
    return Boolean(lock.skills[s.metadata.name]);
  });

  if (candidates.length === 0) {
    logger.info("Nothing to update.");
    return;
  }

  const defaultAdapter = getAdapter(defaultTargetName);
  if (
    candidates.some((skill) => !lock.skills[skill.metadata.name]) &&
    supportsGlobalAndProjectScopes(defaultAdapter) &&
    !opts.scope
  ) {
    throw new SkillpipeError(
      "TARGET_SCOPE_REQUIRED",
      `Target "${defaultTargetName}" supports both global and project scopes. Re-run with --scope global or --scope project.`,
      `Example: skillpipe update${opts.all ? " --all" : opts.name ? ` ${opts.name}` : ""} --scope project`
    );
  }

  let updates = 0;
  for (const skill of candidates) {
    const installed = lock.skills[skill.metadata.name];
    const targetName = installed?.target ?? defaultTargetName;
    const adapter = getAdapter(targetName);
    const installPath = installed
      ? expandHome(installed.installPath)
      : resolveInstallPathForCommand({
          adapter,
          targetName,
          configuredInstallPath: defaultInstallPath,
          scope: opts.scope,
          commandExample: `skillpipe update${opts.all ? " --all" : ` ${skill.metadata.name}`} --scope project`
        });
    const rel = path.relative(workspace, skill.folder);
    const newCommit =
      (await lastCommitForPath(workspace, rel)) ?? remote;

    const isNew = !installed;
    const changed = installed && installed.commit !== newCommit;

    if (!isNew && !changed) {
      logger.info(
        `${skill.metadata.name.padEnd(24)} ${installed!.version} → ${
          skill.metadata.version
        }   up to date`
      );
      continue;
    }

    if (opts.dryRun) {
      logger.info(
        `${skill.metadata.name.padEnd(24)} ${
          installed?.version ?? "—"
        } → ${skill.metadata.version}   would update`
      );
      continue;
    }

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
        logger.error(`Skipping ${skill.metadata.name}: validation failed`);
        for (const issue of report.issues) {
          logger.error(`  [${issue.code}] ${issue.message}`);
        }
        continue;
      }
    }

    await installSkill({
      skill,
      workspace,
      adapter,
      lock,
      installPath,
      branch
    });
    updates += 1;
    logger.success(
      `${skill.metadata.name.padEnd(24)} ${
        installed?.version ?? "—"
      } → ${skill.metadata.version}   updated`
    );
  }

  if (!opts.dryRun) {
    lock.remoteCommit = remote;
    await saveLockfile(lock);
  }

  logger.newline();
  logger.success(
    opts.dryRun
      ? `Dry run complete.`
      : `Done. ${updates} skill${updates === 1 ? "" : "s"} updated.`
  );
}
