import { logger } from "../utils/logger.js";
import {
  loadRepository,
  listSkills,
  tryFindSkill
} from "../core/repository.js";
import {
  validateSkill,
  DEFAULT_VALIDATION_OPTIONS
} from "../core/validator.js";
import { getConnectedWorkspace } from "./repo-connect.js";
import { ParsedSkill, parseSkill } from "../core/skill.js";
import { findLocalSkillSource } from "../core/local-skill-source.js";
import { loadLocalConfig } from "../core/config.js";
import { LocalConfig } from "../schemas/config.schema.js";
import { SkillpipeError } from "../utils/errors.js";

export interface ValidateOptions {
  name?: string;
  scanSecrets?: boolean;
  repoPath?: string;
}

export async function runValidate(
  opts: ValidateOptions = {}
): Promise<{ failed: number }> {
  const workspace = opts.repoPath
    ? opts.repoPath
    : (await getConnectedWorkspace()).workspace;
  const repo = await loadRepository(workspace);

  let skills: ParsedSkill[];
  if (opts.name) {
    const found = await tryFindSkill(repo, opts.name);
    if (found) {
      skills = [found];
    } else {
      const local = await findLocalSkillFolder(opts.name);
      if (!local) {
        throw new SkillpipeError(
          "SKILL_NOT_FOUND",
          `Skill "${opts.name}" not found in repository or any local install path.`,
          "Run `skillpipe list` to see available skills, or scaffold one with `skillpipe add`."
        );
      }
      logger.info(`Validating local-only skill at ${local.path}`);
      skills = [await parseSkill(local.path)];
    }
  } else {
    skills = await listSkills(repo);
  }

  let failed = 0;
  for (const skill of skills) {
    const report = await validateSkill(skill, {
      ...DEFAULT_VALIDATION_OPTIONS,
      scanSecrets: opts.scanSecrets ?? repo.config.security.scanForSecrets
    });
    if (report.ok && report.issues.length === 0) {
      logger.success(`${report.skill}: ok`);
      continue;
    }
    if (report.ok) {
      logger.warn(`${report.skill}: ok with ${report.issues.length} warning(s)`);
    } else {
      failed += 1;
      logger.error(`${report.skill}: failed`);
    }
    for (const issue of report.issues) {
      const where =
        issue.file && issue.line
          ? `${issue.file}:${issue.line}`
          : issue.file ?? "";
      const tag = issue.level === "error" ? "error" : "warn ";
      logger.info(`  [${tag}] ${issue.code} ${issue.message} ${where}`);
    }
  }

  if (failed > 0) {
    logger.error(`${failed} skill(s) failed validation.`);
  }
  return { failed };
}

async function findLocalSkillFolder(
  name: string
): Promise<Awaited<ReturnType<typeof findLocalSkillSource>>> {
  let config: LocalConfig | null = null;
  try {
    config = await loadLocalConfig();
  } catch {
    // config may not exist when validating outside an initialized workspace
  }
  return findLocalSkillSource(name, config);
}
