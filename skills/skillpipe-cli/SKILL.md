---
name: skillpipe-cli
version: 0.1.0
description: Operate the Skillpipe CLI to install, update, validate and propose AI agent skills from a Git-backed source of truth.
author: Skillpipe
tags: [skillpipe, cli, skills, git, github, claude-code]
targets: [claude-code]
---

# Skillpipe CLI Skill

## Goal

Use the `skillpipe` CLI safely and correctly to:

1. Connect a machine to a GitHub repository that holds AI agent skills.
2. Install, update and audit those skills into a local target (Claude Code by default).
3. Author new skills and contribute changes back via Pull Request — never by pushing directly to `main`.

## When to use this skill

Trigger this skill whenever the user:

- Asks to set up Skillpipe, connect a skills repo, or install/update skills.
- Wants to add a new skill, edit one, or open a PR with their changes.
- Reports an error whose code starts with a Skillpipe prefix (e.g. `[REPO_NOT_CONNECTED]`, `[SECRET_DETECTED]`).
- Asks "where do my skills live?", "why aren't my skills updating?", or similar operational questions.

Do **not** use this skill for editing skill *content* itself (that is a separate authoring task) — only for the mechanics of moving skills between the repo, the local config and the target.

## Mental model

Skillpipe has four moving parts. Hold all four in mind before running any command:

1. **Local config** at `~/.skillpipe/config.json` — which repo is connected, which target adapter is active, default install path.
2. **Lockfile** at `~/.skillpipe/lock.json` — per-skill record of `{version, commit, target, installPath, installedAt}`.
3. **Cloned workspace** at `~/.skillpipe/repos/<name>` — the actual git checkout of the skills repo. This is the source the CLI reads from.
4. **Target** — where skills are *installed* (copied) so the agent can read them. Default `claude-code` adapter writes to `~/.claude/skills/` (user) or `./.claude/skills/` (project).

A skill is a folder under `skills/<name>/` containing at minimum a `SKILL.md` with YAML frontmatter (`name`, `version`, `description`, `targets`) and a Markdown body.

## Prerequisites

Before any command beyond `skillpipe doctor` will work, verify:

- Node.js ≥ 18 (`node --version`).
- `git` on `PATH`.
- GitHub CLI (`gh`) installed **and authenticated**: `gh auth status` must succeed.
- For commands that touch GitHub (`repo connect`, `repo create`, `propose`): network access to `github.com`.

If any of these are missing, run `skillpipe doctor` first and fix what it reports before continuing.

## Instructions

### Always start with a status read, not a write

Before running any state-changing command (`install`, `update`, `propose`, `repo connect`, `repo create`), run a read-only command first to understand the current state:

- `skillpipe doctor` — confirms environment is healthy.
- `skillpipe status` — shows which repo is connected and what's installed.
- `skillpipe list` — shows what skills are available in the connected repo.

This avoids the most common failure mode: writing to a target the user did not expect.

### First-time setup on a new machine

Run these commands in order. Stop and report the failure if any step errors.

1. `skillpipe init` — interactive. Use `skillpipe init --yes` only if the user has explicitly said "use defaults".
2. `skillpipe repo connect <https-or-ssh-url>` — clones the repo into `~/.skillpipe/repos/<name>` and tracks the default branch. Add `--branch <name>` only if the user names a non-default branch. Add `--init` only when the repo is brand new and lacks a `skillpipe.json`.
3. `skillpipe list` — confirm the expected skills appear.
4. `skillpipe install <name>` for the skills the user wants, or `skillpipe install all` if they want everything.

### Daily / recurring usage

- `skillpipe status` to see what's installed and whether any installed skill has a newer commit upstream.
- `skillpipe update` to pull and re-install everything that drifted. Add `--dry-run` first if the user is cautious or if many skills are affected.
- `skillpipe update <name>` to update a single skill.
- `skillpipe update --all` to update *every* skill in the repo, including ones not currently installed locally — only do this if the user explicitly asks for it.

### Authoring a new skill

1. `skillpipe add <name> -d "<short description>"` — scaffolds `skills/<name>/SKILL.md` from a template inside the connected repo's local checkout.
2. Edit `~/.skillpipe/repos/<repo>/skills/<name>/SKILL.md` — fill in goal, when-to-use, instructions. Keep the frontmatter `name` exactly equal to the folder name.
3. `skillpipe validate <name>` — fix any issues before proposing.
4. `skillpipe propose <name> -m "feat: <name> skill"` — opens a PR. Add `--draft` if the user wants to keep iterating. **Never** pass `--allow-secret-risk` unless the user has explicitly asked for it and acknowledged the risk in this same session.

### Contributing changes to an existing skill

Same as authoring, minus the `add` step. Edit the file in the local checkout under `~/.skillpipe/repos/<repo>/skills/<name>/`, then `validate`, then `propose`.

The `propose` command auto-creates a branch named `skillpipe/<name>-YYYY-MM-DD`, commits, pushes and opens a PR via `gh`. Override the branch name only if the user asks.

### Creating a fresh skills repo

Use `skillpipe repo create <name>` only when the user is starting from zero. This calls `gh repo create`, clones it, and scaffolds the standard layout (`skills/`, `agents/`, `workflows/`, `templates/`, `policies/`, `.github/workflows/validate-skills.yml`, an example skill, `skillpipe.json`). Defaults to `--private`; pass `--public` only on explicit request.

## Command reference

| Command | When to run | Notable flags |
|---------|-------------|---------------|
| `skillpipe init` | Once per machine | `-y, --yes` (skip prompts) |
| `skillpipe repo connect <url>` | Once per repo, per machine | `-b, --branch <name>`, `--init` |
| `skillpipe repo create <name>` | When the user has no skills repo yet | `--public` / `--private`, `-d, --description`, `-t, --target` |
| `skillpipe list` (alias `ls`) | Anytime — read-only | — |
| `skillpipe install <name\|all>` | Per skill, after `connect` | `-t, --target <name>`, `-p, --path <dir>` |
| `skillpipe update [name]` | Recurring | `--all`, `--dry-run` |
| `skillpipe status` | Anytime — read-only | — |
| `skillpipe add <name>` | Authoring a new skill | `-d, --description <text>`, `-t, --target <name>`, `-y, --yes` |
| `skillpipe validate [name]` | Before every `propose`, and on demand | `-r, --repo <dir>`, `--no-secrets` |
| `skillpipe propose <name>` | After local edits, to open a PR | `-m, --message <text>` (required), `--draft`, `--branch <name>`, `--allow-secret-risk` |
| `skillpipe doctor` | When anything is off | — |

Global flags: `-v, --verbose` for verbose logging; `--help` on any command for full usage.

## Error codes and recovery

The CLI prints typed errors as `[CODE] message` followed by a hint. Map them to actions:

| Code | Likely cause | Action |
|------|--------------|--------|
| `CONFIG_NOT_FOUND` | `~/.skillpipe/config.json` does not exist | Run `skillpipe init` |
| `CONFIG_INVALID` | Config file is corrupted or hand-edited badly | Inspect the file; if unsalvageable, re-run `skillpipe init` |
| `REPO_NOT_CONNECTED` | No repo registered in config | Run `skillpipe repo connect <url>` |
| `REPO_NOT_FOUND` | Local clone is missing | Re-run `skillpipe repo connect <url>` |
| `REPO_CLONE_FAILED` | Network, auth or URL problem | Verify URL and `gh auth status`; retry |
| `REPO_REMOTE_MISMATCH` | Local clone points at a different remote than config expects | Stop. Ask the user before mutating; usually means a stale `~/.skillpipe/repos/<name>` from a previous repo |
| `SKILL_NOT_FOUND` | Name typo or skill not in repo | `skillpipe list` to see actual names |
| `SKILL_INVALID` | Frontmatter or body fails schema | Run `skillpipe validate <name>` for details |
| `VALIDATION_FAILED` | One or more validators failed | Re-run validate, fix the issues it reports |
| `SECRET_DETECTED` | Secret pattern found in a skill file | Remove the secret. Do **not** suggest `--allow-secret-risk` as a workaround |
| `TARGET_UNKNOWN` | Adapter name not in registry | Use `claude-code` or `custom` |
| `TARGET_NOT_INSTALLED` | Target adapter present but install path missing | Pass `--path <dir>` or fix the configured path |
| `GH_NOT_AVAILABLE` | `gh` CLI not installed | Tell the user to install GitHub CLI and re-run |
| `GH_NOT_AUTHENTICATED` | `gh auth status` fails | Ask the user to run `gh auth login` themselves (interactive) |
| `GIT_NOT_AVAILABLE` | `git` not on `PATH` | Tell the user to install git |
| `GIT_OPERATION_FAILED` | Underlying `git` command failed | Read the underlying message; fix and retry |
| `WORKSPACE_DIRTY` | Uncommitted changes in the local clone | Either commit/stash via `skillpipe propose`, or have the user clean the workspace manually |
| `LOCKFILE_INVALID` | `~/.skillpipe/lock.json` corrupted | Inspect; if unsalvageable, delete and re-run installs |
| `USER_ABORTED` | User said no at a prompt | Honor the abort, do not retry without asking |

If the code is `UNKNOWN` or unfamiliar, set `SKILLPIPE_DEBUG=1` and re-run with `--verbose` to get a stack trace before guessing.

## Hard rules

These rules are non-negotiable. Follow them even if they slow you down:

1. **Never** edit `~/.skillpipe/config.json` or `~/.skillpipe/lock.json` by hand. Always go through the CLI.
2. **Never** push directly to `main` of the skills repo. Day-to-day skill changes go through `skillpipe propose` → PR.
3. **Never** pass `--allow-secret-risk` unprompted. If the validator flags a secret, the secret must be removed from the file. Period.
4. **Never** run `gh auth login` on the user's behalf — it is interactive. Ask the user to run it themselves (suggest the `! gh auth login` shortcut if they are inside Claude Code).
5. **Never** delete `~/.skillpipe/repos/<name>` to "fix" a problem before reading the error and trying `skillpipe doctor`. That folder may contain uncommitted local edits.
6. **Always** run `skillpipe validate <name>` immediately before `skillpipe propose <name>`.
7. **Always** prefer `--dry-run` on `update` when the change set is large or when the user is uncertain.
8. **Always** confirm with the user before `skillpipe install all` or `skillpipe update --all`, since both can write many files.

## Anti-patterns to avoid

- Running `skillpipe install <name>` before `skillpipe repo connect` — it will fail with `REPO_NOT_CONNECTED`. Run `status` first.
- Telling the user "I installed the skill" after only running `skillpipe add` — `add` scaffolds a file in the *repo*, it does not install anything into the target.
- Treating `skillpipe update` as idempotent across machines: each machine has its own lockfile. Updating on machine A does not propagate to machine B until machine B also runs `update`.
- Editing skill files inside `~/.claude/skills/` (the *installed* copy) instead of inside `~/.skillpipe/repos/<name>/skills/<name>/` (the *source*). Edits to the installed copy are silently overwritten on the next `update`.
- Suggesting `git push` from inside `~/.skillpipe/repos/<name>` — use `skillpipe propose` so validation runs and a PR is opened.

## Useful environment variables

- `SKILLPIPE_HOME` — overrides `~/.skillpipe/` (rarely needed; useful for testing).
- `SKILLPIPE_DEBUG=1` — prints stack traces for non-typed errors.

## Quick recipes

**"Set me up from scratch with this repo: <url>"**

```bash
skillpipe doctor
skillpipe init --yes        # only if user accepted defaults
skillpipe repo connect <url>
skillpipe list
skillpipe install all       # only after confirming with the user
```

**"Update everything"**

```bash
skillpipe status
skillpipe update --dry-run
skillpipe update            # only after the user reviews the dry run
```

**"I changed `skills/foo/SKILL.md`, open a PR"**

```bash
skillpipe validate foo
skillpipe propose foo -m "fix(foo): <one-line summary>"
```

**"Why isn't my skill picking up changes?"**

```bash
skillpipe status            # is it installed? is the commit stale?
skillpipe update <name>     # pull + re-copy
# then verify in the target path (e.g. ~/.claude/skills/<name>/)
```
