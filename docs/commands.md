# Commands reference

Every command supports `--help` for full usage. Global flag `-v, --verbose`
enables verbose logging. Set `SKILLSYNC_DEBUG=1` to print stack traces for
unexpected errors.

## Lifecycle overview

| Command | When to run |
|---|---|
| `skillsync doctor` | When anything is off. Run this first. |
| `skillsync init` | Once per machine. |
| `skillsync repo connect <url>` | Once per repo, per machine. |
| `skillsync repo create <name>` | When you have no skills repo yet. |
| `skillsync list` (alias `ls`) | Anytime — read-only. |
| `skillsync install <name\|all>` | Per skill, after `connect`. |
| `skillsync update [name]` | Recurring. |
| `skillsync status` | Anytime — read-only. |
| `skillsync add <name>` | When authoring a new skill. |
| `skillsync validate [name]` | Before every `propose`, and on demand. |
| `skillsync propose <name>` | After local edits, to open a PR. |

---

## `skillsync init`

Initialize SkillSync on this machine. Creates `~/.skillsync/config.json` and
`~/.skillsync/lock.json`. Asks which agent target you're setting up and installs
the bundled `skillsync-cli` skill into the current project.

```bash
skillsync init
skillsync init --yes        # non-interactive, defaults to claude-code
```

| Flag | Purpose |
|---|---|
| `-y, --yes` | Skip prompts; use Claude Code defaults. |

## `skillsync repo connect <url>`

Connect a GitHub repository as the skills source. Clones into
`~/.skillsync/repos/<name>` and tracks the default branch.

```bash
skillsync repo connect https://github.com/<you>/my-agent-skills
skillsync repo connect git@github.com:<you>/my-agent-skills.git --branch dev
```

| Flag | Purpose |
|---|---|
| `-b, --branch <name>` | Track a non-default branch. |
| `--init` | Use only when the repo is brand new and lacks a `skillsync.json`. |

## `skillsync repo create <name>`

Create a new skills repo on GitHub via `gh repo create`, clone it, and scaffold
the standard layout.

```bash
skillsync repo create my-agent-skills --private
```

| Flag | Purpose |
|---|---|
| `--public` / `--private` | Visibility. Defaults to `--private`. |
| `-d, --description <text>` | Repo description. |
| `-t, --target <name>` | Default target for the example skill (defaults to `claude-code`). |

## `skillsync list` / `skillsync ls`

List skills in the connected repository. Read-only.

## `skillsync install <name|all>`

Install a skill (or all of them) into the configured target.

```bash
skillsync install brand-analysis
skillsync install all
skillsync install brand-analysis --target custom --path ./agent/skills
```

| Flag | Purpose |
|---|---|
| `-t, --target <name>` | Override the default target adapter. |
| `-p, --path <dir>` | Override the install path. |

## `skillsync update [name]`

Pull upstream changes and re-install drifted skills.

```bash
skillsync update                # update everything currently installed
skillsync update brand-analysis # update one skill
skillsync update --all          # update every skill in the repo, even uninstalled ones
skillsync update --dry-run      # show what would change
```

| Flag | Purpose |
|---|---|
| `--all` | Include skills not currently installed locally. |
| `--dry-run` | Don't write — show planned changes. |

## `skillsync status`

Show install status, lockfile state, and which installed skills have a newer
commit upstream. Read-only.

## `skillsync add <name>`

Scaffold a new skill from a template inside the connected repo's local checkout.
This creates `skills/<name>/SKILL.md` in `~/.skillsync/repos/<repo>/` — it does
**not** install anything into the target.

```bash
skillsync add customer-support -d "Triage and answer support tickets"
```

| Flag | Purpose |
|---|---|
| `-d, --description <text>` | Skill description. |
| `-t, --target <name>` | Initial target list. |
| `-y, --yes` | Skip prompts. |

## `skillsync validate [name]`

Validate a skill (or the whole repo) against schema, secret patterns, and
dangerous-pattern rules.

```bash
skillsync validate                       # validate every skill in the connected repo
skillsync validate brand-analysis        # validate one
skillsync validate --repo ./my-skills    # validate a repo at an arbitrary path
skillsync validate brand-analysis --no-secrets  # skip secret scanning (rare)
```

| Flag | Purpose |
|---|---|
| `-r, --repo <dir>` | Validate a repo at a path other than the connected one. |
| `--no-secrets` | Disable secret scanning. Use sparingly. |

## `skillsync propose <name> -m "..."`

Open a Pull Request with local changes to a skill. Validates, creates a branch
named `skillsync/<name>-YYYY-MM-DD`, commits, pushes, and opens a PR via `gh`.

```bash
skillsync propose customer-support -m "feat: customer-support skill"
skillsync propose customer-support -m "wip" --draft
```

| Flag | Purpose |
|---|---|
| `-m, --message <text>` | Commit and PR title. **Required.** |
| `--draft` | Open a draft PR. |
| `--branch <name>` | Override the auto-generated branch name. |
| `--allow-secret-risk` | Skip the secret-scan block. **Use only after the user has acknowledged the risk.** |

## `skillsync doctor`

Diagnose the local setup: Node version, `git`, `gh`, auth status, config and
lockfile presence, connected repo health.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `SKILLSYNC_HOME` | Override `~/.skillsync/`. Useful for testing. |
| `SKILLSYNC_DEBUG=1` | Print stack traces on non-typed errors. |

## Error codes

The CLI emits typed errors as `[CODE] message`. The full table — with what each
code means and how to recover — lives in the bundled `skillsync-cli` skill (the
one installed into your project on `skillsync init`). See
`<your-project>/.claude/skills/skillsync-cli/SKILL.md`, section "Error codes and
recovery".
