# Getting started

This walkthrough sets up SkillSync on a new machine and installs your first skill.

## Requirements

- Node.js ≥ 18 (`node --version`)
- `git` on `PATH`
- [GitHub CLI](https://cli.github.com/) (`gh`) authenticated with `gh auth login`

If anything is missing, run `skillsync doctor` after install — it will tell you
exactly what to fix.

## 1. Install

```bash
npm install -g skillpipe
```

The package on npm is `skillpipe`; the CLI it ships is `skillsync`.

```bash
skillsync --version
```

## 2. Initialize

```bash
skillsync init
```

What happens:

- Creates `~/.skillsync/config.json` and `~/.skillsync/lock.json`.
- Asks which agent you're setting up here (Claude Code or a custom path).
- Installs the bundled `skillsync-cli` skill into the **current project**, so any
  agent working in this directory immediately knows how to use the CLI itself.
  - For Claude Code: `<cwd>/.claude/skills/skillsync-cli/`
  - For Custom: `<your-path>/skillsync-cli/`

For a non-interactive install with defaults (Claude Code):

```bash
skillsync init --yes
```

## 3. Connect a repository

If you already have a skills repo on GitHub:

```bash
skillsync repo connect https://github.com/<you>/my-agent-skills
```

Or, if you want a fresh one with the standard layout (`skills/`, `agents/`,
`workflows/`, `templates/`, `policies/`, validate workflow):

```bash
skillsync repo create my-agent-skills --private
```

The connected repo is cloned into `~/.skillsync/repos/<name>` — that local checkout
is the source the CLI reads from.

## 4. Install skills

See what's available:

```bash
skillsync list
```

Install one or all:

```bash
skillsync install brand-analysis
skillsync install all
```

Skills are **copied** (not symlinked) into the target install path. Default for
Claude Code is `~/.claude/skills/` (user scope). You can override with
`--target` and `--path`.

## 5. Stay up to date

```bash
skillsync status        # which skills are installed, which have upstream changes
skillsync update        # pull and re-install everything that drifted
skillsync update --dry-run  # show what would change without writing
```

## 6. Propose improvements

When you want to edit or add a skill, work in the local checkout
(`~/.skillsync/repos/<repo>/skills/<name>/`) and open a PR via the CLI:

```bash
skillsync add customer-support -d "Triage and answer support tickets"
# edit ~/.skillsync/repos/<repo>/skills/customer-support/SKILL.md
skillsync validate customer-support
skillsync propose customer-support -m "feat: customer-support skill"
```

`propose` validates the skill, creates a branch, commits, pushes, and opens a PR
via `gh`. **Never push directly to `main`.**

## What's next

- [Commands reference](./commands.md)
- [Skill format](./skill-format.md)
- [For agents](./agents.md) — what changes when an AI agent runs these commands.
