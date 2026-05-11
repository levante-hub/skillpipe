import path from "node:path";
import inquirer from "inquirer";
import { logger } from "../utils/logger.js";
import { loadLocalConfig } from "../core/config.js";
import { loadLockfile, saveLockfile } from "../core/lockfile.js";
import { Lockfile } from "../schemas/lockfile.schema.js";
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
import fs from "node:fs/promises";
import { expandHome, isSymlink, pathExists } from "../utils/fs.js";
import { SkillpipeError } from "../utils/errors.js";
import {
  resolveInstallPathForCommand,
  supportsGlobalAndProjectScopes
} from "../core/target-resolution.js";
import { TargetScope } from "../adapters/index.js";

export interface InstallOptions {
  name: string;
  target?: string;
  installPath?: string;
  scope?: TargetScope;
  force?: boolean;
  keepLocal?: boolean;
}

type ConflictPolicy = "ask" | "replace" | "keep";

export async function runInstall(opts: InstallOptions): Promise<void> {
  const config = await loadLocalConfig();
  const { workspace } = await getConnectedWorkspace();
  const targetName = opts.target ?? config.defaultTarget;
  const branch = config.defaultBranch;

  const targetCfg = config.targets[targetName];
  const adapter = getAdapter(targetName);
  const installPath = resolveInstallPathForCommand({
    adapter,
    targetName,
    configuredInstallPath: targetCfg?.installPath,
    overrideInstallPath: opts.installPath,
    scope: opts.scope,
    commandExample: `skillpipe install ${opts.name} --target ${targetName} --scope project`
  });

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

  if (opts.force && opts.keepLocal) {
    throw new SkillpipeError(
      "TARGET_UNKNOWN",
      "`--force` and `--keep-local` are mutually exclusive."
    );
  }
  let policy: ConflictPolicy = opts.force
    ? "replace"
    : opts.keepLocal
      ? "keep"
      : "ask";

  let installed = 0;
  let skipped = 0;

  for (const skill of skills) {
    const dest = path.join(installPath, skill.metadata.name);
    const conflict = await detectLocalConflict(
      skill.metadata.name,
      dest,
      lock
    );

    if (conflict) {
      const context = await describeConflict(skill, dest);
      printConflictContext(context, policy, all);

      const decision = await resolveConflict({
        skillName: skill.metadata.name,
        dest,
        policy,
        hasMore: all,
        context
      });
      if (decision.policy) policy = decision.policy;
      if (decision.action === "keep") {
        logger.info(
          `Kept local "${skill.metadata.name}" at ${dest}; skipping.`
        );
        skipped++;
        continue;
      }
      logger.warn(
        `Overwriting local "${skill.metadata.name}" at ${dest}.`
      );
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
        logger.error(`Validation failed for ${skill.metadata.name}:`);
        for (const issue of report.issues) {
          logger.error(`  [${issue.code}] ${issue.message}`);
        }
        throw new SkillpipeError(
          "VALIDATION_FAILED",
          `Skill "${skill.metadata.name}" failed validation.`
        );
      }
    }

    const destPath = await installSkill({
      skill,
      workspace,
      adapter,
      lock,
      installPath,
      branch
    });
    logger.success(`Installed ${skill.metadata.name} → ${destPath}`);
    installed++;
  }

  lock.remoteCommit = await remoteCommit(workspace, branch);
  await saveLockfile(lock);

  if (all && skipped > 0) {
    logger.info(`Installed ${installed}, skipped ${skipped}.`);
  }
}

async function detectLocalConflict(
  skillName: string,
  dest: string,
  lock: Lockfile
): Promise<boolean> {
  if (!(await pathExists(dest))) return false;
  const entry = lock.skills[skillName];
  if (entry && path.normalize(entry.path) === path.normalize(dest)) {
    return false;
  }
  return true;
}

interface ConflictContext {
  skillName: string;
  remoteVersion: string;
  dest: string;
  kind: "file" | "directory" | "symlink" | "other";
  symlinkTarget?: string;
  hasSkillFile: boolean;
  modifiedAt?: string;
}

async function describeConflict(
  skill: ParsedSkill,
  dest: string
): Promise<ConflictContext> {
  const ctx: ConflictContext = {
    skillName: skill.metadata.name,
    remoteVersion: skill.metadata.version,
    dest,
    kind: "other",
    hasSkillFile: false
  };
  try {
    const lstat = await fs.lstat(dest);
    ctx.modifiedAt = lstat.mtime.toISOString();
    if (lstat.isSymbolicLink()) {
      ctx.kind = "symlink";
      try {
        ctx.symlinkTarget = await fs.readlink(dest);
      } catch {
        // ignore
      }
    } else if (lstat.isDirectory()) {
      ctx.kind = "directory";
    } else if (lstat.isFile()) {
      ctx.kind = "file";
    }
  } catch {
    // ignore — the existence check already passed; race conditions only
  }
  ctx.hasSkillFile = await pathExists(path.join(dest, "SKILL.md"));
  // resolve real symlink target so the caller sees an absolute path
  if (ctx.kind === "symlink" && (await isSymlink(dest))) {
    try {
      ctx.symlinkTarget = await fs.realpath(dest);
    } catch {
      // keep readlink value
    }
  }
  return ctx;
}

function printConflictContext(
  ctx: ConflictContext,
  currentPolicy: ConflictPolicy,
  hasMore: boolean
): void {
  logger.warn(`Local-folder conflict detected for "${ctx.skillName}".`);
  logger.info(`  destination     : ${ctx.dest}`);
  logger.info(`  kind            : ${ctx.kind}`);
  if (ctx.symlinkTarget) {
    logger.info(`  symlink target  : ${ctx.symlinkTarget}`);
  }
  logger.info(`  has SKILL.md    : ${ctx.hasSkillFile ? "yes" : "no"}`);
  if (ctx.modifiedAt) {
    logger.info(`  last modified   : ${ctx.modifiedAt}`);
  }
  logger.info(`  remote version  : ${ctx.remoteVersion}`);
  logger.info(`  not tracked by skillpipe (or tracked at a different path).`);
  if (currentPolicy === "ask") {
    logger.hint(
      "Surface this to the user verbatim, then resolve: " +
        "re-run with `--force` to overwrite the local folder with the remote version, " +
        "or `--keep-local` to skip and leave the local folder untouched" +
        (hasMore ? " (applies to every remaining conflict in this run)." : ".")
    );
  }
}

interface ConflictResolution {
  action: "replace" | "keep";
  policy?: ConflictPolicy;
}

async function resolveConflict(args: {
  skillName: string;
  dest: string;
  policy: ConflictPolicy;
  hasMore: boolean;
  context: ConflictContext;
}): Promise<ConflictResolution> {
  if (args.policy === "replace") return { action: "replace" };
  if (args.policy === "keep") return { action: "keep" };

  if (!process.stdin.isTTY) {
    throw new SkillpipeError(
      "USER_ABORTED",
      buildAgentConflictMessage(args.context, args.hasMore),
      "Ask the user which to do, then re-run `skillpipe install` with `--force` (overwrite) or `--keep-local` (skip)."
    );
  }

  const detail = args.context.symlinkTarget
    ? `${args.dest} (symlink → ${args.context.symlinkTarget})`
    : args.dest;
  const choices = [
    {
      name: `Replace with remote v${args.context.remoteVersion}`,
      value: "replace"
    },
    { name: "Keep local (skip this skill)", value: "keep" }
  ];
  if (args.hasMore) {
    choices.push(
      { name: "Replace all remaining conflicts", value: "replaceAll" },
      { name: "Keep all remaining (skip)", value: "keepAll" }
    );
  }

  const { choice } = await inquirer.prompt<{
    choice: "replace" | "keep" | "replaceAll" | "keepAll";
  }>([
    {
      type: "list",
      name: "choice",
      message: `"${args.skillName}" already exists at ${detail}. What now?`,
      choices
    }
  ]);

  switch (choice) {
    case "replace":
      return { action: "replace" };
    case "keep":
      return { action: "keep" };
    case "replaceAll":
      return { action: "replace", policy: "replace" };
    case "keepAll":
      return { action: "keep", policy: "keep" };
  }
}

function buildAgentConflictMessage(
  ctx: ConflictContext,
  hasMore: boolean
): string {
  const lines: string[] = [
    `Install would overwrite a local folder that skillpipe does not track.`,
    `  skill           : ${ctx.skillName}`,
    `  destination     : ${ctx.dest}`,
    `  kind            : ${ctx.kind}`
  ];
  if (ctx.symlinkTarget) lines.push(`  symlink target  : ${ctx.symlinkTarget}`);
  lines.push(`  has SKILL.md    : ${ctx.hasSkillFile ? "yes" : "no"}`);
  if (ctx.modifiedAt) lines.push(`  last modified   : ${ctx.modifiedAt}`);
  lines.push(`  remote version  : ${ctx.remoteVersion}`);
  lines.push("");
  lines.push("Options:");
  lines.push(
    `  - overwrite (replace the local folder with the remote skill v${ctx.remoteVersion})`
  );
  lines.push(`  - keep local (skip this skill, leave the folder untouched)`);
  if (hasMore) {
    lines.push(
      `The chosen flag applies to every remaining conflict in this run.`
    );
  }
  return lines.join("\n");
}
