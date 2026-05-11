#!/usr/bin/env node
import { Command, Option } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
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
import { runReportIssue } from "./commands/report-issue.js";

const pkg = readPackageJson();

const program = new Command();

program
  .name("skillpipe")
  .description("Git-native CLI for syncing AI agent skills across environments.")
  .version(pkg.version)
  .option("-v, --verbose", "enable verbose logging")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals<{ verbose?: boolean }>();
    if (opts.verbose) logger.setVerbose(true);
  });

program
  .command("init")
  .description("Initialize Skillpipe on this machine.")
  .option("-y, --yes", "non-interactive mode; must be combined with --target")
  .option(
    "-t, --target <name>",
    "agent to set up (claude-code, hermes, openclaw, levante, custom)"
  )
  .action(
    wrap(async (opts: { yes?: boolean; target?: string }) =>
      runInit({ yes: opts.yes, target: opts.target })
    )
  );

const repo = program
  .command("repo")
  .description("Manage the source-of-truth GitHub repository.");

repo
  .command("connect <url>")
  .description("Connect Skillpipe to an existing GitHub repository.")
  .option("-b, --branch <name>", "branch to track locally (defaults to repo default)")
  .option("--init", "create skillpipe.json if missing")
  .option(
    "-f, --force",
    "switch the connected repository even if another one is already linked"
  )
  .action(
    wrap(
      async (
        url: string,
        opts: { branch?: string; init?: boolean; force?: boolean }
      ) =>
        runRepoConnect({
          url,
          branch: opts.branch,
          initSkillpipe: opts.init,
          force: opts.force
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
  .addOption(
    new Option("--scope <scope>", "install scope for targets that support both")
      .choices(["global", "project"])
  )
  .option(
    "-f, --force",
    "overwrite local skill folders that conflict with installed names"
  )
  .option(
    "--keep-local",
    "skip skills whose name conflicts with an existing local folder"
  )
  .action(
    wrap(
      async (
        name: string,
        opts: {
          target?: string;
          path?: string;
          scope?: "global" | "project";
          force?: boolean;
          keepLocal?: boolean;
        }
      ) =>
        runInstall({
          name,
          target: opts.target,
          installPath: opts.path,
          scope: opts.scope,
          force: opts.force,
          keepLocal: opts.keepLocal
        })
    )
  );

program
  .command("update [name]")
  .description("Update installed skills with remote changes.")
  .option("--all", "update every skill in the repo, not only installed ones")
  .option("--dry-run", "show what would change without writing")
  .addOption(
    new Option("--scope <scope>", "install scope for new skills on dual-scope targets")
      .choices(["global", "project"])
  )
  .action(
    wrap(
      async (
        name: string | undefined,
        opts: { all?: boolean; dryRun?: boolean; scope?: "global" | "project" }
      ) =>
        runUpdate({
          name,
          all: opts.all,
          dryRun: opts.dryRun,
          scope: opts.scope
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
  .description(
    "Push local skill changes to the tracked branch (default) or open a Pull Request with `--pr`."
  )
  .requiredOption("-m, --message <text>", "commit (and PR) title")
  .option("--pr", "open a Pull Request instead of pushing to the tracked branch")
  .option("--draft", "open the PR as draft (requires --pr)")
  .option(
    "--branch <name>",
    "override the auto-generated branch name (requires --pr)"
  )
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
          pr?: boolean;
          draft?: boolean;
          branch?: string;
          allowSecretRisk?: boolean;
        }
      ) =>
        runPropose({
          name,
          message: opts.message,
          pr: opts.pr,
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

program
  .command("report-issue")
  .description(
    "Open a GitHub issue in the public skillpipe repo (intended for AI agents)."
  )
  .requiredOption("--title <text>", "issue title")
  .requiredOption("--summary <text>", "short summary of the problem")
  .option("--command <cmd>", "the skillpipe command that triggered the issue")
  .option("--error <text>", "error message or stack trace observed")
  .option("--expected <text>", "what the agent expected to happen")
  .option("--actual <text>", "what actually happened")
  .option("--severity <level>", "low | medium | high")
  .option("--labels <list>", "comma-separated extra labels to request")
  .action(
    wrap(
      async (opts: {
        title: string;
        summary: string;
        command?: string;
        error?: string;
        expected?: string;
        actual?: string;
        severity?: string;
        labels?: string;
      }) =>
        runReportIssue({
          title: opts.title,
          summary: opts.summary,
          command: opts.command,
          error: opts.error,
          expected: opts.expected,
          actual: opts.actual,
          severity: opts.severity,
          labels: opts.labels
        })
    )
  );

program.parseAsync(process.argv).catch((err) => {
  reportError(err);
  process.exit(1);
});

function readPackageJson(): { version: string } {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(here, "..", "package.json");
  return JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
}

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
