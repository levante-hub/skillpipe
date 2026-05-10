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
  pushBranch
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
import { materializeSkill, plainCopySkill } from "../core/sync.js";
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
  fromInstalled?: boolean;
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
  } else if (opts.fromInstalled) {
    await syncFromInstalled(opts.name, skill.folder);
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
  if (opts.pr) {
    const branchName = opts.branch ?? generateBranchName(opts.name);
    logger.step(`Creating branch ${branchName}`);
    await checkoutBranch(workspace, branchName, true);

    commitSha = await addAndCommit(workspace, [relSkillPath], opts.message);
    logger.success(`Committed ${commitSha.slice(0, 7)}: ${opts.message}`);

    logger.step("Pushing branch");
    await pushBranch(workspace, branchName);

    const prUrl = await ghCreatePr({
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
    await pushBranch(workspace, branch);
    logger.success(`Pushed ${commitSha.slice(0, 7)} to ${branch}.`);
  }

  if (adoption) {
    await finalizeAdoption(adoption, skill.folder, skill.metadata.version, commitSha);
  }
}

interface AdoptionPlan {
  localSource: string;
  targetName: string;
  mode: "copy" | "symlink";
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
  const targetName = inferTargetFromPath(localSource) ?? config.defaultTarget;
  const targetCfg = config.targets[targetName];
  const mode = targetCfg?.mode ?? "symlink";

  const workspaceSkillFolder = path.join(
    repo.workspace,
    repo.config.skillsPath,
    name
  );
  logger.step(`Adopting skill from ${localSource}`);
  await plainCopySkill(localSource, workspaceSkillFolder);

  return { localSource, targetName, mode };
}

async function finalizeAdoption(
  plan: AdoptionPlan,
  workspaceSkillFolder: string,
  skillVersion: string,
  commitSha: string
): Promise<void> {
  logger.step(`Linking ${plan.localSource} → workspace (${plan.mode})`);
  const actualMode = await materializeSkill(
    workspaceSkillFolder,
    plan.localSource,
    plan.mode
  );

  const lock = await loadLockfile();
  recordInstalledSkill(lock, path.basename(plan.localSource), {
    version: skillVersion,
    commit: commitSha,
    target: plan.targetName,
    installPath: path.dirname(plan.localSource),
    path: plan.localSource,
    mode: actualMode,
    installedAt: new Date().toISOString()
  });
  await saveLockfile(lock);
  logger.success(
    `Registered "${path.basename(plan.localSource)}" in lockfile (${actualMode}).`
  );
}

async function findLocalSkillSource(
  name: string,
  config: LocalConfig
): Promise<string | null> {
  const cwd = process.cwd();
  const candidates: string[] = [
    path.join(cwd, ".claude", "skills", name),
    path.join(cwd, ".levante", "skills", name),
    path.join(cwd, "skills", name)
  ];
  const targetCfg = config.targets[config.defaultTarget];
  if (targetCfg?.installPath) {
    candidates.push(path.join(expandHome(targetCfg.installPath), name));
  }
  for (const c of candidates) {
    if ((await pathExists(c)) && !(await isSymlink(c))) {
      return c;
    }
  }
  return null;
}

function inferTargetFromPath(localSource: string): string | null {
  const parent = path.dirname(localSource);
  const cwd = process.cwd();
  if (parent === path.join(cwd, ".claude", "skills")) return "claude-code";
  if (parent === path.join(cwd, ".levante", "skills")) return "levante";
  return null;
}

async function syncFromInstalled(
  skillName: string,
  workspaceSkillFolder: string
): Promise<void> {
  const lock = await loadLockfile();
  const entry = lock.skills[skillName];
  if (!entry) {
    throw new SkillpipeError(
      "TARGET_NOT_INSTALLED",
      `Skill "${skillName}" is not in the lockfile.`,
      "Install it first with `skillpipe install <name>`."
    );
  }
  const installed = expandHome(entry.path);
  if (!(await pathExists(installed))) {
    throw new SkillpipeError(
      "TARGET_NOT_INSTALLED",
      `Installed copy not found at ${installed}.`,
      "Reinstall the skill or run without --from-installed."
    );
  }
  if (entry.mode === "symlink" || (await isSymlink(installed))) {
    logger.info(
      `Skill "${skillName}" is in symlink mode; edits are already in the workspace.`
    );
    return;
  }
  logger.step(`Syncing changes from ${installed} → workspace`);
  await plainCopySkill(installed, workspaceSkillFolder);
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
