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
  bundledSkillPath,
  BUNDLED_SKILL_NAME,
  SKILLPIPE_HOME,
  REPOS_DIR
} from "../core/paths.js";
import { runRepoConnect } from "./repo-connect.js";
import { ensureDir, pathExists } from "../utils/fs.js";
import { getAdapter } from "../adapters/index.js";

export interface InitOptions {
  yes?: boolean;
}

export async function runInit(opts: InitOptions = {}): Promise<void> {
  logger.step("Initializing Skillpipe");

  await ensureDir(SKILLPIPE_HOME);
  await ensureDir(REPOS_DIR);

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

  if (opts.yes) {
    config.targets["claude-code"] = {
      installPath: defaultClaudeUserSkillsPath(),
      mode: "copy"
    };
    config.defaultTarget = "claude-code";
    await saveLocalConfig(config);
    await installBundledSkill("claude-code");
    logger.success("Initialized with default settings.");
    logger.hint("Connect a repo with `skillpipe repo connect <url>`.");
    return;
  }

  const answers = await inquirer.prompt<{
    setupRepo: "existing" | "skip";
    repoUrl?: string;
    target: string;
    customProjectPath?: string;
    installPath: string;
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
    },
    {
      type: "list",
      name: "target",
      message: "Which agent are you setting up here?",
      choices: [
        { name: "Claude Code", value: "claude-code" },
        { name: "Hermes", value: "hermes" },
        { name: "OpenClaw", value: "openclaw" },
        { name: "Custom path", value: "custom" }
      ],
      default: "claude-code"
    },
    {
      type: "input",
      name: "customProjectPath",
      message: "Project skills folder for this agent:",
      when: (a) => a.target === "custom",
      default: () => path.join(process.cwd(), "skills"),
      validate: (v: string) =>
        v.trim().length > 0 ? true : "Path cannot be empty"
    },
    {
      type: "input",
      name: "installPath",
      message: "Install path:",
      default: (a: { target: string; customProjectPath?: string }) => {
        if (a.target === "claude-code") return defaultClaudeUserSkillsPath();
        if (a.target === "hermes") return defaultHermesUserSkillsPath();
        if (a.target === "openclaw") return defaultOpenclawUserSkillsPath();
        return a.customProjectPath ?? path.join(process.cwd(), "skills");
      }
    }
  ]);

  config.defaultTarget = answers.target;
  config.targets[answers.target] = {
    installPath: path.normalize(answers.installPath),
    mode: "copy"
  };
  await saveLocalConfig(config);
  logger.success(`Saved local config at ~/.skillpipe/config.json`);

  await installBundledSkill(answers.target, answers.customProjectPath);

  if (answers.setupRepo === "existing" && answers.repoUrl) {
    await runRepoConnect({ url: answers.repoUrl });
  } else {
    logger.hint("Connect a repo later with `skillpipe repo connect <url>`.");
  }
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
  } else {
    installPath = path.normalize(
      customProjectPath ?? path.join(process.cwd(), "skills")
    );
  }

  const dest = await adapter.installSkill({
    sourceDir,
    skillName: BUNDLED_SKILL_NAME,
    installPath
  });
  logger.success(`Installed ${BUNDLED_SKILL_NAME} skill at ${dest}`);
}

export async function ensureInitialized(): Promise<LocalConfig> {
  return loadOrInitLocalConfig();
}

export function bareInitConfig(): LocalConfig {
  return defaultLocalConfig();
}
