import inquirer from "inquirer";
import path from "node:path";
import { logger } from "../utils/logger.js";
import {
  defaultLocalConfig,
  LocalConfig
} from "../schemas/config.schema.js";
import {
  loadOrInitLocalConfig,
  saveLocalConfig
} from "../core/config.js";
import { loadLockfile, saveLockfile } from "../core/lockfile.js";
import {
  ghAuthStatus,
  ghAvailable
} from "../core/github.js";
import {
  defaultClaudeUserSkillsPath,
  defaultClaudeProjectSkillsPath,
  defaultHermesUserSkillsPath,
  defaultOpenclawUserSkillsPath,
  defaultOpenclawProjectSkillsPath,
  defaultLevanteUserSkillsPath,
  defaultLevanteProjectSkillsPath,
  bundledSkillPath,
  BUNDLED_SKILL_NAME,
  projectSkillpipeHome,
  reposDir,
  skillpipeHome
} from "../core/paths.js";
import { runRepoConnect } from "./repo-connect.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import { availableAdapters, getAdapter } from "../adapters/index.js";
import { SkillpipeError } from "../utils/errors.js";

export interface InitOptions {
  yes?: boolean;
  target?: string;
}

export async function runInit(opts: InitOptions = {}): Promise<void> {
  logger.step("Initializing Skillpipe");

  // Force per-workspace scope: every init writes to <cwd>/.skillpipe/.
  // Subsequent path resolution in this process picks this up via the env var,
  // and future commands run from this workspace find it via upward search.
  const home = projectSkillpipeHome();
  process.env.SKILLPIPE_HOME = home;
  logger.info(`Using workspace-scoped config at ${home}`);

  await ensureDir(skillpipeHome());
  await ensureDir(reposDir());

  const config: LocalConfig = await loadOrInitLocalConfig();
  const lock = await loadLockfile();
  await saveLockfile(lock);

  const ghAvail = await ghAvailable();
  const auth = ghAvail ? await ghAuthStatus() : null;

  if (!ghAvail) {
    logger.warn("GitHub CLI (gh) is not installed. Skillpipe uses it for auth.");
    logger.hint("Install it from https://cli.github.com/ and run `gh auth login`.");
  } else if (!auth?.authenticated) {
    logger.warn("GitHub CLI is installed but not authenticated.");
    logger.hint("Run `gh auth login` before connecting a repository.");
  }

  const available = availableAdapters();

  if (opts.yes) {
    if (!opts.target) {
      throw new SkillpipeError(
        "TARGET_UNKNOWN",
        `--yes requires --target <name>. Available: ${available.join(", ")}.`,
        "Example: `skillpipe init --yes --target hermes`."
      );
    }
    if (!available.includes(opts.target)) {
      throw new SkillpipeError(
        "TARGET_UNKNOWN",
        `Unknown target "${opts.target}". Available: ${available.join(", ")}.`
      );
    }
    const installPath = userScopeInstallPath(opts.target);
    config.targets[opts.target] = { installPath };
    config.defaultTarget = opts.target;
    await saveLocalConfig(config);
    await installBundledSkill(opts.target);
    logger.success(`Initialized with target "${opts.target}".`);
    logger.hint("Connect a repo with `skillpipe repo connect <url>`.");
    return;
  }

  if (!process.stdin.isTTY) {
    throw new SkillpipeError(
      "INIT_NOT_INTERACTIVE",
      `\`skillpipe init\` is interactive but stdin is not a TTY (likely running under an AI agent or CI).`,
      `Re-run non-interactively: \`skillpipe init --yes --target <name>\`. Available targets: ${available.join(", ")}.`
    );
  }

  const repoAnswers = await inquirer.prompt<{
    setupRepo: "existing" | "skip";
    repoUrl?: string;
  }>([
    {
      type: "list",
      name: "setupRepo",
      message: "Connect a GitHub repository now?",
      choices: [
        { name: "Yes, connect existing repo", value: "existing" },
        { name: "Skip — I'll connect later", value: "skip" }
      ]
    },
    {
      type: "input",
      name: "repoUrl",
      message: "Repository URL:",
      when: (a) => a.setupRepo === "existing",
      validate: (v: string) =>
        v.trim().length > 0 ? true : "Repository URL cannot be empty"
    }
  ]);

  const target = await promptUntilTargetPicked();

  const followUp = await inquirer.prompt<{
    customProjectPath?: string;
    installPath: string;
  }>([
    {
      type: "input",
      name: "customProjectPath",
      message: "Project skills folder for this agent:",
      when: () => target === "custom",
      default: () => path.join(process.cwd(), "skills"),
      validate: (v: string) =>
        v.trim().length > 0 ? true : "Path cannot be empty"
    },
    {
      type: "input",
      name: "installPath",
      message: "Install path:",
      default: (a: { customProjectPath?: string }) => {
        if (target === "claude-code") return defaultClaudeUserSkillsPath();
        if (target === "hermes") return defaultHermesUserSkillsPath();
        if (target === "openclaw") return defaultOpenclawUserSkillsPath();
        if (target === "levante") return defaultLevanteUserSkillsPath();
        return a.customProjectPath ?? path.join(process.cwd(), "skills");
      }
    }
  ]);

  config.defaultTarget = target;
  config.targets[target] = {
    installPath: path.normalize(followUp.installPath)
  };
  await saveLocalConfig(config);
  logger.success(`Saved local config at ~/.skillpipe/config.json`);

  await installBundledSkill(target, followUp.customProjectPath);

  if (repoAnswers.setupRepo === "existing" && repoAnswers.repoUrl) {
    await runRepoConnect({ url: repoAnswers.repoUrl, force: true });
  } else {
    logger.hint("Connect a repo later with `skillpipe repo connect <url>`.");
  }
}

async function promptUntilTargetPicked(): Promise<string> {
  const NONE = "__none__";
  while (true) {
    const { target } = await inquirer.prompt<{ target: string }>([
      {
        type: "list",
        name: "target",
        message: "Which agent are you setting up here?",
        choices: [
          { name: "— pick one (highlight then Enter) —", value: NONE },
          { name: "Claude Code", value: "claude-code" },
          { name: "Hermes", value: "hermes" },
          { name: "OpenClaw", value: "openclaw" },
          { name: "Levante", value: "levante" },
          { name: "Custom path", value: "custom" }
        ],
        default: NONE
      }
    ]);
    if (target !== NONE) return target;
    logger.warn(
      "You must pick an agent. Use the arrow keys to highlight one, then press Enter."
    );
  }
}

function userScopeInstallPath(target: string): string {
  if (target === "claude-code") return defaultClaudeUserSkillsPath();
  if (target === "hermes") return defaultHermesUserSkillsPath();
  if (target === "openclaw") return defaultOpenclawUserSkillsPath();
  if (target === "levante") return defaultLevanteUserSkillsPath();
  return path.join(process.cwd(), "skills");
}

async function installBundledSkill(
  target: string,
  customProjectPath?: string
): Promise<void> {
  const sourceDir = bundledSkillPath(BUNDLED_SKILL_NAME);
  if (!(await pathExists(sourceDir))) {
    logger.warn(
      `Bundled skill not found at ${sourceDir}; skipping bootstrap.`
    );
    return;
  }

  const adapter = getAdapter(target);
  let installPath: string;
  if (target === "claude-code") {
    installPath = defaultClaudeProjectSkillsPath();
  } else if (target === "hermes") {
    installPath = defaultHermesUserSkillsPath();
  } else if (target === "openclaw") {
    installPath = defaultOpenclawProjectSkillsPath();
  } else if (target === "levante") {
    installPath = defaultLevanteProjectSkillsPath();
  } else {
    installPath = path.normalize(
      customProjectPath ?? path.join(process.cwd(), "skills")
    );
  }

  const result = await adapter.installSkill({
    sourceDir,
    skillName: BUNDLED_SKILL_NAME,
    installPath
  });
  logger.success(`Installed ${BUNDLED_SKILL_NAME} skill at ${result.destPath}`);
}

export async function ensureInitialized(): Promise<LocalConfig> {
  return loadOrInitLocalConfig();
}

export function bareInitConfig(): LocalConfig {
  return defaultLocalConfig();
}
