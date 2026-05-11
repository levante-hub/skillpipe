import path from "node:path";
import { logger } from "../utils/logger.js";
import { loadLocalConfig } from "../core/config.js";
import {
  loadRepository,
  findSkill,
  tryFindSkill,
  RepositoryHandle
} from "../core/repository.js";
import {
  fetchRepo,
  pullBranch,
  hasLocalChanges,
  checkoutBranch,
  addAndCommit,
  pushBranch,
  resetHardToRemote
} from "../core/git.js";
import { ghCreatePr, requireGhAuth } from "../core/github.js";
import {
  validateSkill,
  DEFAULT_VALIDATION_OPTIONS
} from "../core/validator.js";
import { getConnectedWorkspace } from "./repo-connect.js";
import {
  loadLockfile,
  saveLockfile,
  recordInstalledSkill
} from "../core/lockfile.js";
import { findLocalSkillSource } from "../core/local-skill-source.js";
import { plainCopySkill } from "../core/sync.js";
import { expandHome, isSymlink, pathExists } from "../utils/fs.js";
import { SkillpipeError } from "../utils/errors.js";
import { LocalConfig } from "../schemas/config.schema.js";

export interface ProposeOptions {
  name: string;
  message: string;
  pr?: boolean;
  draft?: boolean;
  branch?: string;
  allowSecretRisk?: boolean;
}

export async function runPropose(opts: ProposeOptions): Promise<void> {
  if (opts.pr) {
    await requireGhAuth();
  } else if (opts.draft || opts.branch) {
    throw new SkillpipeError(
      "GIT_OPERATION_FAILED",
      "`--draft` and `--branch` require `--pr`.",
      "Add `--pr` to open a Pull Request, or drop those flags to push directly."
    );
  }

  const config = await loadLocalConfig();
  const { workspace } = await getConnectedWorkspace();
  const repo = await loadRepository(workspace);
  const branch = config.defaultBranch || repo.config.defaultBranch;

  logger.step("Fetching latest from origin");
  await fetchRepo(workspace);
  await checkoutBranch(workspace, branch);
  await pullBranch(workspace, branch);

  let skill = await tryFindSkill(repo, opts.name);
  let adoption: AdoptionPlan | null = null;

  if (!skill) {
    adoption = await prepareAdoption(opts.name, config, repo);
    skill = await findSkill(repo, opts.name);
  } else {
    await autoSyncFromInstalled(opts.name, skill.folder);
  }

  const report = await validateSkill(skill, {
    ...DEFAULT_VALIDATION_OPTIONS,
    scanSecrets:
      repo.config.security.scanForSecrets && !opts.allowSecretRisk
  });
  if (!report.ok) {
    logger.error(`Validation failed for ${skill.metadata.name}:`);
    for (const issue of report.issues) {
      logger.error(`  [${issue.code}] ${issue.message}`);
    }
    throw new SkillpipeError(
      "VALIDATION_FAILED",
      `Skill "${opts.name}" failed validation. Fix the issues or pass --allow-secret-risk for secret findings only.`
    );
  }

  if (!(await hasLocalChanges(workspace))) {
    throw new SkillpipeError(
      "GIT_OPERATION_FAILED",
      "No local changes to propose. Edit the skill files first."
    );
  }

  const relSkillPath = path.relative(workspace, skill.folder);

  let commitSha: string;
  let prUrl: string | null = null;
  if (opts.pr) {
    const branchName = opts.branch ?? generateBranchName(opts.name);
    logger.step(`Creating branch ${branchName}`);
    await checkoutBranch(workspace, branchName, true);

    commitSha = await addAndCommit(workspace, [relSkillPath], opts.message);
    logger.success(`Committed ${commitSha.slice(0, 7)}: ${opts.message}`);

    logger.step("Pushing branch");
    await pushBranch(workspace, branchName);

    prUrl = await ghCreatePr({
      cwd: workspace,
      title: opts.message,
      body: buildPrBody(opts, skill.metadata.name, commitSha),
      base: branch,
      head: branchName,
      draft: opts.draft
    });
    logger.success(`Pull Request created: ${prUrl}`);
  } else {
    commitSha = await addAndCommit(workspace, [relSkillPath], opts.message);
    logger.success(`Committed ${commitSha.slice(0, 7)}: ${opts.message}`);

    logger.step(`Pushing to ${branch}`);
    try {
      await pushBranch(workspace, branch);
      logger.success(`Pushed ${commitSha.slice(0, 7)} to ${branch}.`);
    } catch (err) {
      const conflict = isPushConflict(err as Error);
      if (!conflict.isConflict) throw err;

      const branchName = generateBranchName(opts.name);
      logger.warn(
        `Direct push to "${branch}" was rejected (${conflict.reason}).`
      );
      logger.info("Falling back to Pull Request mode automatically.");

      await checkoutBranch(workspace, branchName, true);
      await pushBranch(workspace, branchName);

      try {
        prUrl = await ghCreatePr({
          cwd: workspace,
          title: opts.message,
          body: buildPrBody(opts, skill.metadata.name, commitSha),
          base: branch,
          head: branchName,
          draft: opts.draft
        });
      } finally {
        await checkoutBranch(workspace, branch);
        await resetHardToRemote(workspace, branch);
      }

      logger.success(`Created branch ${branchName} from your commit.`);
      logger.success(`Pull Request created: ${prUrl}`);
      logger.hint(
        `A maintainer must merge this PR before the change lands on ${branch}.`
      );
    }
  }

  if (adoption) {
    await finalizeAdoption(adoption, skill.folder, skill.metadata.version, commitSha);
  }
}

interface AdoptionPlan {
  localSource: string;
  targetName: string;
}

async function prepareAdoption(
  name: string,
  config: LocalConfig,
  repo: RepositoryHandle
): Promise<AdoptionPlan> {
  const localSource = await findLocalSkillSource(name, config);
  if (!localSource) {
    throw new SkillpipeError(
      "SKILL_NOT_FOUND",
      `Skill "${name}" not found in repository or in any local skills folder.`,
      "Create it under <cwd>/.claude/skills/<name>/ (or another target's project folder) before running propose."
    );
  }
  const targetName = localSource.targetName ?? config.defaultTarget;

  const workspaceSkillFolder = path.join(
    repo.workspace,
    repo.config.skillsPath,
    name
  );
  logger.step(`Adopting skill from ${localSource.path}`);
  await plainCopySkill(localSource.path, workspaceSkillFolder);

  return { localSource: localSource.path, targetName };
}

async function finalizeAdoption(
  plan: AdoptionPlan,
  workspaceSkillFolder: string,
  skillVersion: string,
  commitSha: string
): Promise<void> {
  logger.step(`Syncing workspace → ${plan.localSource}`);
  await plainCopySkill(workspaceSkillFolder, plan.localSource);

  const lock = await loadLockfile();
  recordInstalledSkill(lock, path.basename(plan.localSource), {
    version: skillVersion,
    commit: commitSha,
    target: plan.targetName,
    installPath: path.dirname(plan.localSource),
    path: plan.localSource,
    installedAt: new Date().toISOString()
  });
  await saveLockfile(lock);
  logger.success(
    `Registered "${path.basename(plan.localSource)}" in lockfile.`
  );
}

export async function autoSyncFromInstalled(
  skillName: string,
  workspaceSkillFolder: string
): Promise<void> {
  const lock = await loadLockfile();
  const entry = lock.skills[skillName];
  if (!entry) return;

  const installed = expandHome(entry.path);
  if (!(await pathExists(installed))) return;
  if (await isSymlink(installed)) return;
  if (path.resolve(installed) === path.resolve(workspaceSkillFolder)) return;

  logger.step(`Syncing edits from ${installed} → workspace`);
  await plainCopySkill(installed, workspaceSkillFolder);
}

export function isPushConflict(err: Error): {
  isConflict: boolean;
  reason: string;
} {
  const text = `${err.message ?? ""}`.toLowerCase();
  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /non-fast-forward/i, label: "non-fast-forward" },
    { re: /updates were rejected/i, label: "updates were rejected" },
    {
      re: /tip of your current branch is behind/i,
      label: "branch behind remote"
    },
    { re: /protected branch/i, label: "protected branch" },
    { re: /gh006/i, label: "GH006 protected branch" },
    { re: /refusing to allow/i, label: "refusing to allow" }
  ];
  for (const { re, label } of patterns) {
    if (re.test(text)) {
      return { isConflict: true, reason: label };
    }
  }
  return { isConflict: false, reason: "" };
}

function generateBranchName(skillName: string): string {
  const ts = new Date().toISOString().slice(0, 10);
  return `skillpipe/${skillName}-${ts}`;
}

function buildPrBody(
  opts: ProposeOptions,
  skillName: string,
  commitSha: string
): string {
  return [
    `Proposed via Skillpipe.`,
    ``,
    `**Skill:** \`${skillName}\``,
    `**Commit:** \`${commitSha.slice(0, 7)}\``,
    ``,
    `### Change summary`,
    ``,
    opts.message,
    ``,
    `---`,
    `_Auto-generated by skillpipe propose._`
  ].join("\n");
}
