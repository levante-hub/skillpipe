import path from "node:path";
import { logger } from "../utils/logger.js";
import {
  loadOrInitLocalConfig,
  saveLocalConfig
} from "../core/config.js";
import { loadLockfile, saveLockfile } from "../core/lockfile.js";
import { ghCreateRepo, ghCurrentUser, requireGhAuth } from "../core/github.js";
import {
  ensureGitAvailable,
  cloneRepo,
  addAndCommit,
  pushBranch,
  fetchRepo,
  remoteCommit,
  checkoutBranch
} from "../core/git.js";
import { ensureDir, pathExists, writeText } from "../utils/fs.js";
import {
  defaultRepoConfigFor,
  writeRepoConfig
} from "../core/repository.js";
import { workspaceForRepo } from "../core/paths.js";
import {
  renderRepoReadme,
  renderSkillTemplate,
  renderSkillReadme
} from "../utils/template.js";
import { SkillpipeError } from "../utils/errors.js";

export interface RepoCreateOptions {
  name: string;
  visibility?: "public" | "private";
  description?: string;
  target?: string;
}

export async function runRepoCreate(opts: RepoCreateOptions): Promise<void> {
  await requireGhAuth();
  await ensureGitAvailable();

  const visibility = opts.visibility ?? "private";
  const owner = await ghCurrentUser();
  if (!owner) {
    throw new SkillpipeError(
      "GH_NOT_AUTHENTICATED",
      "Could not determine the authenticated GitHub user."
    );
  }

  logger.step(`Creating GitHub repository ${owner}/${opts.name} (${visibility})`);
  await ghCreateRepo({
    name: opts.name,
    visibility,
    description:
      opts.description ?? `${opts.name} — agent skills repo (Skillpipe)`,
    ownerLogin: owner
  });

  const url = `https://github.com/${owner}/${opts.name}.git`;
  const workspace = workspaceForRepo(opts.name);

  logger.step(`Cloning into ${workspace}`);
  await cloneRepo(url, workspace);

  await scaffoldRepo(workspace, opts);

  logger.step("Creating initial commit");
  await checkoutBranch(workspace, "main", true);
  await addAndCommit(workspace, ["."], "chore: initial Skillpipe repo scaffold");
  await pushBranch(workspace, "main");

  await fetchRepo(workspace);
  const commit = await remoteCommit(workspace, "main");

  const config = await loadOrInitLocalConfig();
  config.defaultRepo = `${owner}/${opts.name}`;
  config.defaultBranch = "main";
  await saveLocalConfig(config);

  const lock = await loadLockfile();
  lock.repo = config.defaultRepo;
  lock.branch = "main";
  lock.remoteCommit = commit;
  await saveLockfile(lock);

  logger.success(
    `Repo ready: https://github.com/${owner}/${opts.name}`
  );
  logger.hint("Edit skills/example/SKILL.md and run `skillpipe propose example`.");
}

async function scaffoldRepo(
  workspace: string,
  opts: RepoCreateOptions
): Promise<void> {
  const cfg = defaultRepoConfigFor(opts.name);
  if (opts.target) cfg.supportedTargets = [opts.target];
  await writeRepoConfig(workspace, cfg);

  await writeText(
    path.join(workspace, "README.md"),
    renderRepoReadme(opts.name)
  );

  await ensureDir(path.join(workspace, "skills", "example"));
  await writeText(
    path.join(workspace, "skills", "example", "SKILL.md"),
    renderSkillTemplate({
      name: "example",
      description:
        "Example starter skill — replace this with your first real skill.",
      target: opts.target ?? "claude-code"
    })
  );
  await writeText(
    path.join(workspace, "skills", "example", "README.md"),
    renderSkillReadme("example")
  );

  await ensureDir(path.join(workspace, "agents"));
  await ensureDir(path.join(workspace, "workflows"));
  await ensureDir(path.join(workspace, "templates"));
  await ensureDir(path.join(workspace, "policies"));

  await writeText(
    path.join(workspace, ".gitignore"),
    [".DS_Store", "node_modules/", "*.log", ""].join("\n")
  );

  if (!(await pathExists(path.join(workspace, ".github", "workflows")))) {
    await ensureDir(path.join(workspace, ".github", "workflows"));
    await writeText(
      path.join(workspace, ".github", "workflows", "validate-skills.yml"),
      validateWorkflow()
    );
  }
}

function validateWorkflow(): string {
  return `name: Validate skills

on:
  pull_request:
    paths:
      - 'skills/**'
      - 'skillpipe.json'
  push:
    branches: [ main ]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g skillpipe
      - run: skillpipe validate --repo .
`;
}
