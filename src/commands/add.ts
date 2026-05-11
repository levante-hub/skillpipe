import path from "node:path";
import inquirer from "inquirer";
import { logger } from "../utils/logger.js";
import {
  ensureDir,
  expandHome,
  pathExists,
  writeText
} from "../utils/fs.js";
import {
  renderSkillTemplate,
  renderSkillReadme
} from "../utils/template.js";
import { loadLocalConfig } from "../core/config.js";
import { parseSkill } from "../core/skill.js";
import {
  validateSkill,
  DEFAULT_VALIDATION_OPTIONS
} from "../core/validator.js";
import { SkillpipeError } from "../utils/errors.js";

export interface AddOptions {
  name: string;
  target?: string;
  description?: string;
  yes?: boolean;
}

export async function runAdd(opts: AddOptions): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(opts.name)) {
    throw new SkillpipeError(
      "SKILL_INVALID",
      `Invalid skill name "${opts.name}".`,
      "Use lowercase letters, digits, '-' and '_' only."
    );
  }

  const config = await loadLocalConfig();
  const targetName = opts.target ?? config.defaultTarget;
  const targetCfg = config.targets[targetName];
  if (!targetCfg?.installPath) {
    throw new SkillpipeError(
      "TARGET_NOT_INSTALLED",
      `No install path configured for target "${targetName}".`,
      "Run `skillpipe init` to configure a target."
    );
  }
  const installPath = expandHome(targetCfg.installPath);
  const folder = path.join(installPath, opts.name);
  if (await pathExists(folder)) {
    throw new SkillpipeError(
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
      target: targetName
    })
  );
  await writeText(
    path.join(folder, "README.md"),
    renderSkillReadme(opts.name)
  );

  logger.success(`Created ${folder}/SKILL.md`);
  logger.success(`Created ${folder}/README.md`);

  const skill = await parseSkill(folder);
  const report = await validateSkill(skill, {
    ...DEFAULT_VALIDATION_OPTIONS,
    scanSecrets: config.security.scanSecrets
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
    `Edit ${folder} and run \`skillpipe propose ${opts.name}\` to publish it.`
  );
}
