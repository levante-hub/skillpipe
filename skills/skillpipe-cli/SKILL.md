---
name: skillpipe-cli
version: 0.7.0
description: Operate the Skillpipe CLI to install, update, validate and propose AI agent skills from a Git-backed source of truth.
author: Skillpipe
tags: [skillpipe, cli, skills, git, github, claude-code, hermes, openclaw, levante]
targets: [claude-code, hermes, openclaw, levante, custom]
---

# Skillpipe CLI Skill

## Goal

Use the `skillpipe` CLI safely and correctly to:

1. Connect a machine to a GitHub repository that holds AI agent skills.
2. Install, update and audit those skills into a local target (Claude Code, Hermes, OpenClaw, Levante, or a custom path).
3. Author new skills and contribute changes back. By default `propose` pushes directly to the tracked branch (typically `main`); pass `--pr` only when the user explicitly wants a Pull Request for review.

## When to use this skill

Trigger this skill whenever the user:

- Asks to set up Skillpipe, connect a skills repo, or install/update skills.
- Wants to add a new skill, edit one, or open a PR with their changes.
- Reports an error whose code starts with a Skillpipe prefix (e.g. `[REPO_NOT_CONNECTED]`, `[SECRET_DETECTED]`, `[REPO_ALREADY_CONNECTED]`).
- Asks "where do my skills live?", "why aren't my skills updating?", or similar operational questions.
- Hits a Skillpipe bug, an inconsistency between this skill's docs and the actual CLI behavior, or a flow that blocks them — file it via `skillpipe report-issue` (see "Reporting bugs back to maintainers" below).

Do **not** use this skill for editing skill *content* itself (that is a separate authoring task) — only for the mechanics of moving skills between the repo, the local config and the target.

## Mental model

Skillpipe has three moving parts the user needs to keep in mind:

1. **Local config** at `<workspace>/.skillpipe/config.json` — which repo is connected, which target adapter is active, default install path. Always **per-workspace** since v0.5.0: `skillpipe init` creates `.skillpipe/` in the current working directory, and every later command resolves the home by walking up from `cwd` to the nearest `.skillpipe/` (with `SKILLPIPE_HOME` env var as a last-resort override). Two workspaces on the same machine = two independent configs.
2. **Lockfile** at `<workspace>/.skillpipe/lock.json` — per-skill record of `{version, commit, target, installPath, path, installedAt}`.
3. **Target** — where skills are *installed* so the agent can read them. Each adapter knows the directory its agent scans:
   - `claude-code` → `~/.claude/skills/` (user) or `<cwd>/.claude/skills/` (project)
   - `hermes` → `~/.hermes/skills/` (user only; respects `HERMES_HOME`)
   - `openclaw` → `~/.openclaw/skills/` (user) or `<cwd>/skills/` (project)
   - `levante` → `~/levante/skills/` (global) or `<cwd>/.levante/skills/` (project)
   - `custom` → whatever path the user configured

Skillpipe also maintains an internal clone of the connected repo, but treat it as an implementation detail. **You always edit at the install path.** `propose` handles syncing those edits into the internal cache before commit/push.

A skill is a folder under `skills/<name>/` containing at minimum a `SKILL.md` with YAML frontmatter (`name`, `description`; optionally `version`, `targets`, `tags`) and a Markdown body.

### Install semantics

`install` and `update` always materialize a **real copy** of the skill folder at the target's install path. There is no symlink mode, no `--mode` flag. Editing the install path is the supported edit surface; `propose` reads those edits back automatically.

For targets that support both global and project scopes (`claude-code`, `openclaw`, `levante`), the caller must pass `--scope global` or `--scope project` unless they pass `--path`. If they omit both, the CLI raises `TARGET_SCOPE_REQUIRED` with an explanatory re-run example. Do not guess.

### Install conflicts (local folder vs remote skill)

When `install <name>` or `install all` finds a folder already present at `<installPath>/<skillName>` that the lockfile does **not** track as that skill in that path, the CLI treats it as a local conflict. Default behavior:

- **Interactive (TTY):** the CLI prompts per skill — *Replace with remote*, *Keep local (skip)*, plus *Replace all remaining* / *Keep all remaining* when running `install all`. Surface this prompt verbatim to the user; never auto-pick.
- **Non-interactive (no TTY) or scripted:** the CLI raises `USER_ABORTED` with a hint. Re-run with `--force` to overwrite or `--keep-local` to skip silently. Choose the flag *only after* asking the user; never assume.

Flags `--force` and `--keep-local` are mutually exclusive.

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

1. `skillpipe init` — interactive; you **must** pick an agent explicitly (no default). For CI/scripts use `skillpipe init --yes --target <name>` — `--yes` alone errors out and lists available targets.
2. `skillpipe repo connect <https-or-ssh-url>` — clones the repo into the internal cache and tracks the default branch. Add `--branch <name>` only if the user names a non-default branch. Add `--init` only when the repo is brand new and lacks a `skillpipe.json`. If the machine is already connected to a different repo the command refuses unless you pass `--force`.
3. `skillpipe list` — confirm the expected skills appear.
4. `skillpipe install <name>` for the skills the user wants, or `skillpipe install all` if they want everything.

### Daily / recurring usage

- `skillpipe status` to see what's installed and whether any installed skill has a newer commit upstream.
- `skillpipe update` to pull and re-install everything that drifted. Add `--dry-run` first if the user is cautious or if many skills are affected.
- `skillpipe update <name>` to update a single skill.
- `skillpipe update --all` to update *every* skill in the repo, including ones not currently installed locally — only do this if the user explicitly asks for it. On dual-scope targets, add `--scope global` or `--scope project` if new skills may be installed.

### Authoring a new skill

1. `skillpipe add <name> -d "<short description>"` — scaffolds `<installPath>/<name>/SKILL.md` directly under the current target's install path.
2. Edit `<installPath>/<name>/SKILL.md` — fill in goal, when-to-use, instructions. Keep the frontmatter `name` exactly equal to the folder name.
3. `skillpipe validate <name>` — works even though the skill is not yet in the connected repo cache.
4. `skillpipe propose <name> -m "feat: <name> skill"` — adopts the new skill into the repo cache, commits, and pushes to the tracked branch.

### Propose modes

- **Direct push (default)** — `propose` commits on the tracked branch (e.g. `main`) and pushes. No PR is opened, no `gh` auth required when push succeeds. If the direct push is rejected (non-fast-forward or protected branch), Skillpipe automatically falls back to PR mode: it creates a feature branch from your commit, pushes it, opens a Pull Request via `gh`, then resets the local tracked branch back to `origin/<branch>` so the cache stays clean. Surface the PR URL the CLI prints — the change is **not merged yet**.
- **Pull Request (`--pr`)** — Skip the direct-push attempt: creates branch `skillpipe/<name>-YYYY-MM-DD` (override with `--branch <name>`), pushes it, and opens a PR via `gh`. Add `--draft` to open the PR as draft. Both `--draft` and `--branch` require `--pr` — passing them without it errors out.

Only switch to `--pr` proactively when the user explicitly asks for review. **Never** pass `--allow-secret-risk` unless the user has explicitly asked for it and acknowledged the risk in this same session.

When you see that direct push was rejected and Skillpipe fell back to PR mode automatically, do not treat it as a failure. Surface the PR URL and explain that the change is not merged yet.

### Contributing changes to an existing skill

Edit the skill at its install path (e.g. `~/.claude/skills/<name>/SKILL.md`). Then run `skillpipe validate <name>` and `skillpipe propose <name> -m "..."`. `propose` syncs the edits from the install path into Skillpipe's internal cache before committing — you do not pass any flag for this.

### Creating a fresh skills repo

Use `skillpipe repo create <name>` only when the user is starting from zero. This calls `gh repo create`, clones it, and scaffolds the standard layout (`skills/`, `agents/`, `workflows/`, `templates/`, `policies/`, `.github/workflows/validate-skills.yml`, an example skill, `skillpipe.json`). Defaults to `--private`; pass `--public` only on explicit request.

### Reporting bugs back to maintainers

When you, as an AI agent, hit a problem with the CLI itself — an error you cannot map to a known cause, a command that misbehaves, a discrepancy between these docs and what `skillpipe` actually does, a flow that blocks the user — file an issue in the public Skillpipe repository so a maintainer can fix it. `skillpipe report-issue` exists exactly for this purpose: it is non-interactive, fully driven by flags, and designed to be invoked by an agent without the user mediating.

```bash
skillpipe report-issue \
  --title "<short, specific title>" \
  --summary "<one paragraph describing what went wrong and the impact>" \
  --command "<the exact skillpipe command that triggered the issue>" \
  --error "<error output or stack trace you observed>" \
  --expected "<what you expected to happen>" \
  --actual "<what actually happened>" \
  --severity <low|medium|high> \
  --labels "<comma,separated,extra,labels>"
```

Contract:

- `--title` and `--summary` are the only required flags. Add the rest only when you have real content for them — never fabricate context.
- On success, the command writes **only the issue URL** to `stdout`, followed by a newline. Capture it and surface it to the user so they can follow up.
- Non-fatal warnings (e.g. labels could not be applied because the repo does not define them) go to `stderr`. The issue is still created and the command exits 0.
- Default destination is `levante-hub/skillpipe`. The `SKILLPIPE_ISSUE_REPO` env var overrides this; do not expose that override to the user unless they ask, since the public repo is the right default.
- Default labels are `agent-report` and `bug`. `--severity` adds `severity:<level>`. `--labels` adds extras (deduplicated). Even if GitHub rejects applying labels, the body of the issue includes a `## Requested labels` section so a maintainer can apply them by hand.

When to invoke `report-issue`:

- A typed error you cannot recover from after following the error code table.
- The CLI did something this skill says it should not, or did not do something this skill says it should.
- A command hangs, crashes, or silently produces wrong state (e.g. lockfile out of sync with the install path).
- A behavior you believe is a genuine bug rather than user error.

When **not** to invoke:

- User error you can fix by clarifying or rerunning the command. Solve it first.
- Missing prerequisite (`gh` not installed, `gh auth status` failing, `git` not on `PATH`). Ask the user to fix it; that is not a Skillpipe bug.
- A feature the user wishes existed. That is a feature request, not a bug — ask the user before filing, and frame the title accordingly if you do file.
- Network glitches or transient failures you have not retried.

## Command reference

| Command | When to run | Notable flags |
|---------|-------------|---------------|
| `skillpipe init` | Once per machine | `-y, --yes` (requires `--target`), `-t, --target <name>` |
| `skillpipe repo connect <url>` | Once per repo, per machine | `-b, --branch <name>`, `--init`, `-f, --force` |
| `skillpipe repo create <name>` | When the user has no skills repo yet | `--public` / `--private`, `-d, --description`, `-t, --target` |
| `skillpipe list` (alias `ls`) | Anytime — read-only | — |
| `skillpipe install <name\|all>` | Per skill, after `connect` | `-t, --target <name>`, `-p, --path <dir>`, `--scope <global\|project>`, `-f, --force`, `--keep-local` |
| `skillpipe update [name]` | Recurring | `--all`, `--dry-run`, `--scope <global\|project>` |
| `skillpipe status` | Anytime — read-only | — |
| `skillpipe add <name>` | Authoring a new skill (scaffolds in the install path) | `-d, --description <text>`, `-t, --target <name>`, `-y, --yes` |
| `skillpipe validate [name]` | Before every `propose`, and on demand | `-r, --repo <dir>`, `--no-secrets` |
| `skillpipe propose <name>` | After local edits, to publish them | `-m, --message <text>` (required), `--pr`, `--draft` (with `--pr`), `--branch <name>` (with `--pr`), `--allow-secret-risk` |
| `skillpipe doctor` | When anything is off | — |
| `skillpipe report-issue` | When you hit a Skillpipe bug, an inconsistency, or a blocker you cannot resolve | `--title` (required), `--summary` (required), `--command`, `--error`, `--expected`, `--actual`, `--severity <low\|medium\|high>`, `--labels <csv>` |

Global flags: `-v, --verbose` for verbose logging; `--help` on any command for full usage.

## Error codes and recovery

The CLI prints typed errors as `[CODE] message` followed by a hint. Map them to actions:

| Code | Likely cause | Action |
|------|--------------|--------|
| `CONFIG_NOT_FOUND` | `.skillpipe/config.json` not found upward from `cwd` | Run `skillpipe init` in this workspace |
| `CONFIG_INVALID` | Config file is corrupted or hand-edited badly | Inspect the file; if unsalvageable, re-run `skillpipe init` |
| `REPO_NOT_CONNECTED` | No repo registered in config | Run `skillpipe repo connect <url>` |
| `REPO_NOT_FOUND` | Local clone is missing | Re-run `skillpipe repo connect <url>` |
| `REPO_ALREADY_CONNECTED` | A different repo is already connected on this machine | Confirm intent with the user, then re-run with `--force` |
| `REPO_CLONE_FAILED` | Network, auth or URL problem | Verify URL and `gh auth status`; retry |
| `REPO_REMOTE_MISMATCH` | Local clone points at a different remote than config expects | Stop. Ask the user before mutating; usually means a stale internal clone from a previous repo. Resolve by removing the stale clone, then re-running `skillpipe repo connect`. |
| `SKILL_NOT_FOUND` | Name typo, skill not in repo, and no matching folder in cwd to adopt | `skillpipe list` to see actual names |
| `SKILL_INVALID` | Frontmatter or body fails schema | Run `skillpipe validate <name>` for details |
| `VALIDATION_FAILED` | One or more validators failed | Re-run validate, fix the issues it reports |
| `SECRET_DETECTED` | Secret pattern found in a skill file | Remove the secret. Do **not** suggest `--allow-secret-risk` as a workaround |
| `TARGET_UNKNOWN` | Adapter name not in registry, or `--yes` used without `--target` | Pass `--target <claude-code\|hermes\|openclaw\|levante\|custom>` |
| `TARGET_SCOPE_REQUIRED` | The target supports both global and project scopes and the command omitted both `--scope` and `--path` | Re-run with `--scope global` or `--scope project`, or pass `--path <dir>` explicitly |
| `TARGET_NOT_INSTALLED` | Target adapter present but install path missing | Pass `--path <dir>` or install first |
| `GH_NOT_AVAILABLE` | `gh` CLI not installed | Tell the user to install GitHub CLI and re-run |
| `GH_NOT_AUTHENTICATED` | `gh auth status` fails | Ask the user to run `gh auth login` themselves (interactive) |
| `GIT_NOT_AVAILABLE` | `git` not on `PATH` | Tell the user to install git |
| `GIT_OPERATION_FAILED` | Underlying `git` command failed | Read the underlying message; fix and retry |
| `WORKSPACE_DIRTY` | Uncommitted changes in the internal clone | Either commit/stash via `skillpipe propose`, or have the user clean the workspace manually |
| `LOCKFILE_INVALID` | `.skillpipe/lock.json` corrupted | Inspect; if unsalvageable, delete and re-run installs |
| `USER_ABORTED` | User said no at a prompt, **or** `install` hit a local-folder conflict in a non-TTY context | Honor the abort. For install conflicts: ask the user whether to overwrite (re-run with `--force`) or skip (re-run with `--keep-local`). Never retry blindly. |
| `ISSUE_CREATE_FAILED` | `skillpipe report-issue` could not open the GitHub issue (repo missing, no permission, network, `gh` not authenticated) | Verify `gh auth status` and that the destination repo accepts issues from the authenticated user. Retry once; if it keeps failing, report the original problem to the user directly instead of looping. |

If the code is `UNKNOWN` or unfamiliar, set `SKILLPIPE_DEBUG=1` and re-run with `--verbose` to get a stack trace before guessing.

## Hard rules

These rules are non-negotiable. Follow them even if they slow you down:

1. **Never** edit `<workspace>/.skillpipe/config.json` or `<workspace>/.skillpipe/lock.json` by hand. Always go through the CLI.
2. **Never** push from inside Skillpipe's internal repo cache directly. Always go through `skillpipe propose` so validation, lockfile updates and adoption fire. By default `propose` pushes to the tracked branch; switch to `--pr` only when the user wants review.
3. **Never** pass `--allow-secret-risk` unprompted. If the validator flags a secret, the secret must be removed from the file. Period.
4. **Never** run `gh auth login` on the user's behalf — it is interactive. Ask the user to run it themselves (suggest the `! gh auth login` shortcut if they are inside Claude Code).
5. **Never** delete Skillpipe's internal repo cache to "fix" a problem before reading the error and trying `skillpipe doctor`. That folder may contain uncommitted local edits.
6. **Never** pick an agent for the user in `skillpipe init` — it always requires an explicit choice. If the user wants non-interactive, use `--yes --target <name>`.
7. **Always** run `skillpipe validate <name>` immediately before `skillpipe propose <name>`.
8. **Always** prefer `--dry-run` on `update` when the change set is large or when the user is uncertain.
9. **Always** confirm with the user before `skillpipe install all` or `skillpipe update --all`, since both can write many files.
10. **Always** pass `--scope global` or `--scope project` on dual-scope targets unless the user gave an explicit `--path`. Never infer the scope from old config.
11. **Always** use `repo connect --force` only after confirming the user really wants to switch the connected repo on this machine.
12. **Never** silently resolve an `install` local-folder conflict. If you see the prompt or `USER_ABORTED`, surface the conflict to the user with: (a) the skill name, (b) the conflicting path, (c) that overwriting would replace whatever lives there with the remote version. Then ask whether to overwrite (`--force`) or keep local (`--keep-local`).
13. **When you hit a Skillpipe bug, inconsistency or unrecoverable error, file it via `skillpipe report-issue`** before giving up. Closing the feedback loop is the whole point of that command — silent failure is worse than a noisy issue. Capture the URL it prints on stdout and share it with the user. Do **not** file an issue for user error, missing prerequisites, or feature requests — see the "Reporting bugs back to maintainers" section above.
14. **When direct push falls back to PR automatically, surface the PR URL** and explain the change is not merged yet. Do not retry the push; the fallback already cleaned the local tracked branch back to `origin/<branch>`.

## Anti-patterns to avoid

- Running `skillpipe install <name>` before `skillpipe repo connect` — it will fail with `REPO_NOT_CONNECTED`. Run `status` first.
- Telling the user "I installed the skill" after only running `skillpipe add` — `add` scaffolds a file in the install path; it does not register the skill in the repo. The skill becomes part of the repo only after `propose`.
- Treating `skillpipe update` as idempotent across machines: each machine has its own lockfile. Updating on machine A does not propagate to machine B until machine B also runs `update`.
- Editing inside Skillpipe's internal repo cache instead of the install path. The install path is the supported edit surface; `propose` syncs from there automatically.
- Suggesting `git push` from inside Skillpipe's internal repo cache — use `skillpipe propose` so validation runs and (optionally) a PR is opened.
- Passing `--force` to `install` without telling the user first that a local folder will be overwritten. The conflict prompt exists to protect their work.
- Trying to bypass the explicit target choice in `init` by guessing or scripting around it. The forced choice exists because silent defaults previously caused skills to land in the wrong adapter's directory.

## Useful environment variables

- `SKILLPIPE_HOME` — overrides the workspace-local `.skillpipe/` resolution. When set, the CLI uses that path directly instead of the upward search. Useful for testing.
- `SKILLPIPE_DEBUG=1` — prints stack traces for non-typed errors.
- `SKILLPIPE_ISSUE_REPO` — overrides the destination repo for `skillpipe report-issue`. Defaults to `levante-hub/skillpipe`. Use only for testing against a sandbox; do not change it on the user's behalf.
- `HERMES_HOME` — overrides `~/.hermes/` for the Hermes adapter.
- `OPENCLAW_STATE_DIR` — overrides `~/.openclaw/` for the OpenClaw adapter.

## Quick recipes

**"Set me up from scratch with this repo: <url>"**

```bash
skillpipe doctor
skillpipe init                                 # interactive — user picks agent
# (or for CI:) skillpipe init --yes --target hermes
skillpipe repo connect <url>
skillpipe list
skillpipe install all --scope project          # dual-scope targets need --scope; confirm first
```

**"Update everything"**

```bash
skillpipe status
skillpipe update --dry-run
skillpipe update                               # only after the user reviews the dry run
```

**"I changed `~/.claude/skills/foo/SKILL.md`, publish it"**

```bash
skillpipe validate foo
skillpipe propose foo -m "fix(foo): <one-line summary>"            # direct push to tracked branch

# Same edit, but open a Pull Request for review
skillpipe propose foo --pr -m "fix(foo): <one-line summary>"
```

**"My agent just created a new skill in this project, publish it"**

```bash
# Skill lives at <cwd>/.claude/skills/<name>/ (or equivalent for the target)
skillpipe propose <name> -m "feat: <name> skill"
# propose adopts the new skill into the internal cache, pushes to the tracked
# branch, and registers it in the lockfile. Add `--pr` instead if the user
# wants a Pull Request.
```

**"`install` aborted with `USER_ABORTED` — local folder conflict"**

```bash
# Re-run, having asked the user which they want:
skillpipe install <name> --force         # replace the local folder with the remote version
skillpipe install <name> --keep-local    # leave the local folder alone, skip this skill
```

**"Why isn't my skill picking up changes?"**

```bash
skillpipe status                # is it installed? is the commit stale?
skillpipe update <name>         # pull + re-install
# then verify in the target path (e.g. ~/.claude/skills/<name>/)
```

**"Switch this machine to a different skills repo"**

```bash
skillpipe status                                   # confirm what's currently connected
skillpipe repo connect <new-url> --force           # only after user confirms
```

**"I hit a Skillpipe bug I cannot work around — file it"**

```bash
skillpipe report-issue \
  --title "install writes skill to the wrong target path" \
  --summary "Installing brand-analysis into claude-code wrote to ~/.claude/ instead of <cwd>/.claude/, ignoring the per-workspace config." \
  --command "skillpipe install brand-analysis" \
  --error "<paste the observed error or unexpected output>" \
  --expected "Skill installed at <cwd>/.claude/skills/brand-analysis/" \
  --actual   "Skill installed at ~/.claude/skills/brand-analysis/" \
  --severity medium \
  --labels cli
# stdout contains only the issue URL — share it with the user.
```
