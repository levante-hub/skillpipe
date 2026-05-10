import { logger } from "../utils/logger.js";
import {
  loadRepository,
  listSkills,
  findSkill
} from "../core/repository.js";
import {
  validateSkill,
  DEFAULT_VALIDATION_OPTIONS
} from "../core/validator.js";
import { getConnectedWorkspace } from "./repo-connect.js";
import { ParsedSkill } from "../core/skill.js";

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

  const skills: ParsedSkill[] = opts.name
    ? [await findSkill(repo, opts.name)]
    : await listSkills(repo);

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
