#!/usr/bin/env node
import { Command } from "commander";
import { logger } from "./utils/logger.js";
import { isSkillpipeError } from "./utils/errors.js";

import { runInit } from "./commands/init.js";
import { runRepoConnect } from "./commands/repo-connect.js";
import { runList } from "./commands/list.js";
import { runInstall } from "./commands/install.js";
import { runUpdate } from "./commands/update.js";
import { runStatus } from "./commands/status.js";
import { runValidate } from "./commands/validate.js";
import { runDoctor } from "./commands/doctor.js";
import { runAdd } from "./commands/add.js";
import { runPropose } from "./commands/propose.js";
import { runRepoCreate } from "./commands/repo-create.js";

const program = new Command();

program
  .name("skillpipe")
  .description("Git-native CLI for syncing AI agent skills across environments.")
  .version("0.1.0")
  .option("-v, --verbose", "enable verbose logging")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals<{ verbose?: boolean }>();
    if (opts.verbose) logger.setVerbose(true);
  });

program
  .command("init")
  .description("Initialize Skillpipe on this machine.")
  .option("-y, --yes", "accept defaults without prompting")
  .action(wrap(async (opts: { yes?: boolean }) => runInit({ yes: opts.yes })));

const repo = program
  .command("repo")
  .description("Manage the source-of-truth GitHub repository.");

repo
  .command("connect <url>")
  .description("Connect Skillpipe to an existing GitHub repository.")
  .option("-b, --branch <name>", "branch to track locally (defaults to repo default)")
  .option("--init", "create skillpipe.json if missing")
  .action(
    wrap(async (url: string, opts: { branch?: string; init?: boolean }) =>
      runRepoConnect({
        url,
        branch: opts.branch,
        initSkillpipe: opts.init
      })
    )
  );

program
  .command("list")
  .alias("ls")
  .description("List skills available in the connected repository.")
  .action(wrap(async () => runList()));

program
  .command("install <name>")
  .description("Install a skill (or 'all') into the configured target.")
  .option("-t, --target <name>", "target adapter (default: configured)")
  .option("-p, --path <dir>", "override install path")
  .action(
    wrap(async (name: string, opts: { target?: string; path?: string }) =>
      runInstall({ name, target: opts.target, installPath: opts.path })
    )
  );

program
  .command("update [name]")
  .description("Update installed skills with remote changes.")
  .option("--all", "update every skill in the repo, not only installed ones")
  .option("--dry-run", "show what would change without writing")
  .action(
    wrap(
      async (
        name: string | undefined,
        opts: { all?: boolean; dryRun?: boolean }
      ) =>
        runUpdate({
          name,
          all: opts.all,
          dryRun: opts.dryRun
        })
    )
  );

program
  .command("status")
  .description("Show current install status and pending updates.")
  .action(wrap(async () => runStatus()));

program
  .command("validate [name]")
  .description("Validate one skill or the entire repository.")
  .option("-r, --repo <dir>", "validate a repository at a local path")
  .option("--no-secrets", "skip secret scanning")
  .action(
    wrap(
      async (
        name: string | undefined,
        opts: { repo?: string; secrets?: boolean }
      ) => {
        const { failed } = await runValidate({
          name,
          repoPath: opts.repo,
          scanSecrets: opts.secrets !== false
        });
        if (failed > 0) process.exitCode = 1;
      }
    )
  );

program
  .command("doctor")
  .description("Run diagnostics for the Skillpipe setup.")
  .action(
    wrap(async () => {
      const { failures } = await runDoctor();
      if (failures > 0) process.exitCode = 1;
    })
  );

program
  .command("add <name>")
  .description("Create a new skill from a template inside the connected repo.")
  .option("-d, --description <text>", "short description")
  .option("-t, --target <name>", "target adapter", "claude-code")
  .option("-y, --yes", "skip prompts and use defaults")
  .action(
    wrap(
      async (
        name: string,
        opts: { description?: string; target?: string; yes?: boolean }
      ) =>
        runAdd({
          name,
          description: opts.description,
          target: opts.target,
          yes: opts.yes
        })
    )
  );

program
  .command("propose <name>")
  .description("Open a Pull Request with local changes for a skill.")
  .requiredOption("-m, --message <text>", "commit and PR title")
  .option("--draft", "open the PR as draft")
  .option("--branch <name>", "override the auto-generated branch name")
  .option(
    "--allow-secret-risk",
    "DANGER: bypass secret scanning (not recommended)"
  )
  .action(
    wrap(
      async (
        name: string,
        opts: {
          message: string;
          draft?: boolean;
          branch?: string;
          allowSecretRisk?: boolean;
        }
      ) =>
        runPropose({
          name,
          message: opts.message,
          draft: opts.draft,
          branch: opts.branch,
          allowSecretRisk: opts.allowSecretRisk
        })
    )
  );

repo
  .command("create <name>")
  .description("Create a new GitHub repository with the Skillpipe structure.")
  .option("--public", "create a public repository")
  .option("--private", "create a private repository (default)")
  .option("-d, --description <text>", "repository description")
  .option("-t, --target <name>", "default supported target", "claude-code")
  .action(
    wrap(
      async (
        name: string,
        opts: {
          public?: boolean;
          private?: boolean;
          description?: string;
          target?: string;
        }
      ) =>
        runRepoCreate({
          name,
          visibility: opts.public ? "public" : "private",
          description: opts.description,
          target: opts.target
        })
    )
  );

program.parseAsync(process.argv).catch((err) => {
  reportError(err);
  process.exit(1);
});

type AnyAsync = (...args: any[]) => Promise<unknown>;

function wrap<T extends AnyAsync>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (e) {
      reportError(e);
      process.exit(1);
    }
  }) as T;
}

function reportError(e: unknown): void {
  if (isSkillpipeError(e)) {
    logger.error(`[${e.code}] ${e.message}`);
    if (e.hint) logger.hint(e.hint);
    return;
  }
  if (e instanceof Error) {
    logger.error(e.message);
    if (process.env.SKILLPIPE_DEBUG) {
      console.error(e.stack);
    }
    return;
  }
  logger.error(String(e));
}
