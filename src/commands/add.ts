import path from "node:path";
import inquirer from "inquirer";
import { logger } from "../utils/logger.js";
import {
  ensureDir,
  pathExists,
  writeText
} from "../utils/fs.js";
import {
  renderSkillTemplate,
  renderSkillReadme
} from "../utils/template.js";
import {
  loadRepository,
  findSkill
} from "../core/repository.js";
import { getConnectedWorkspace } from "./repo-connect.js";
import {
  validateSkill,
  DEFAULT_VALIDATION_OPTIONS
} from "../core/validator.js";
import { SkillSyncError } from "../utils/errors.js";

export interface AddOptions {
  name: string;
  target?: string;
  description?: string;
  yes?: boolean;
}

export async function runAdd(opts: AddOptions): Promise<void> {
  const { workspace } = await getConnectedWorkspace();
  const repo = await loadRepository(workspace);

  if (!/^[a-z0-9][a-z0-9-_]*$/.test(opts.name)) {
    throw new SkillSyncError(
      "SKILL_INVALID",
      `Invalid skill name "${opts.name}".`,
      "Use lowercase letters, digits, '-' and '_' only."
    );
  }

  const folder = path.join(workspace, repo.config.skillsPath, opts.name);
  if (await pathExists(folder)) {
    throw new SkillSyncError(
      "SKILL_INVALID",
      `Skill folder already exists: ${folder}`
    );
  }

  let description = opts.description;
  if (!description && !opts.yes) {
    const a = await inquirer.prompt<{ description: string }>([
      {
        type: "input",
        name: "description",
        message: "Short description for the skill:",
        validate: (v: string) =>
          v.trim().length >= 10 ? true : "At least 10 characters"
      }
    ]);
    description = a.description;
  }

  await ensureDir(folder);
  await writeText(
    path.join(folder, "SKILL.md"),
    renderSkillTemplate({
      name: opts.name,
      description,
      target: opts.target ?? "claude-code"
    })
  );
  await writeText(
    path.join(folder, "README.md"),
    renderSkillReadme(opts.name)
  );

  logger.success(`Created skills/${opts.name}/SKILL.md`);
  logger.success(`Created skills/${opts.name}/README.md`);

  const skill = await findSkill(repo, opts.name);
  const report = await validateSkill(skill, {
    ...DEFAULT_VALIDATION_OPTIONS,
    scanSecrets: repo.config.security.scanForSecrets
  });
  if (report.issues.length > 0) {
    logger.warn(
      report.ok
        ? "Skill created with validation warnings:"
        : "Skill created but validation reported errors:"
    );
    for (const issue of report.issues) {
      logger.info(`  [${issue.code}] ${issue.message}`);
    }
  }

  logger.hint(
    `Edit ${folder} and run \`skillsync propose ${opts.name}\` to open a PR.`
  );
}
