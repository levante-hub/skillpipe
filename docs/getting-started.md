# Getting started

This walkthrough sets up Skillpipe on a new machine and installs your first skill.

## Requirements

- Node.js ≥ 18 (`node --version`)
- `git` on `PATH`
- [GitHub CLI](https://cli.github.com/) (`gh`) authenticated with `gh auth login`

If anything is missing, run `skillpipe doctor` after install — it will tell you
exactly what to fix.

## 1. Install

```bash
npm install -g skillpipe
```

The package on npm is `skillpipe`; the CLI it ships is `skillpipe`.

```bash
skillpipe --version
```

## 2. Initialize

```bash
skillpipe init
```

What happens:

- Creates `<workspace>/.skillpipe/config.json` and `<workspace>/.skillpipe/lock.json`.
- Asks which agent you're setting up here.
- Installs the bundled `skillpipe-cli` skill into the **current project**, so any
  agent working in this directory immediately knows how to use the CLI itself.
  - For Claude Code: `<cwd>/.claude/skills/skillpipe-cli/`
  - For Levante: `<cwd>/.levante/skills/skillpipe-cli/`
  - For Custom: `<your-path>/skillpipe-cli/`

For a non-interactive install:

```bash
skillpipe init --yes --target levante
```

## 3. Connect a repository

If you already have a skills repo on GitHub:

```bash
skillpipe repo connect https://github.com/<you>/my-agent-skills
```

Or, if you want a fresh one with the standard layout (`skills/`, `agents/`,
`workflows/`, `templates/`, `policies/`, validate workflow):

```bash
skillpipe repo create my-agent-skills --private
```

Prefer to build the repo by hand? See [Repository layout](./repository-layout.md)
for the required files, the `skillpipe.json` reference, and a copy-pasteable
bootstrap.

The connected repo is cloned into `<workspace>/.skillpipe/repos/<name>` — that local checkout
is the source the CLI reads from.

## 4. Install skills

See what's available:

```bash
skillpipe list
```

Install one or all:

```bash
skillpipe install brand-analysis --target claude-code --scope global
skillpipe install plane-compose --target levante --scope project
skillpipe install all
```

Skills are **copied** (not symlinked) into the target install path. Default for
single-scope targets like Hermes is the configured path. For dual-scope targets
like Claude Code, OpenClaw and Levante, you must choose `--scope global` or
`--scope project` unless you pass `--path`.

Edit the skill at its install path; `skillpipe propose <name>` automatically
syncs those edits into the internal repo cache before pushing.

## 5. Stay up to date

```bash
skillpipe status        # which skills are installed, which have upstream changes
skillpipe update        # pull and re-install everything that drifted
skillpipe update --dry-run  # show what would change without writing
```

## 6. Propose improvements

When you want to edit or add a skill, work in the installed copy and open a PR
via the CLI:

```bash
skillpipe add customer-support -d "Triage and answer support tickets"
# edit <installPath>/customer-support/SKILL.md
skillpipe validate customer-support
skillpipe propose customer-support -m "feat: customer-support skill"
```

`propose` validates the skill, creates a branch, commits, pushes, and opens a PR
via `gh`. **Never push directly to `main`.**

## What's next

- [Commands reference](./commands.md)
- [Skill format](./skill-format.md)
- [For agents](./agents.md) — what changes when an AI agent runs these commands.
