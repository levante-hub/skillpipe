# Commands reference

Every command supports `--help` for full usage. Global flag `-v, --verbose`
enables verbose logging. Set `SKILLPIPE_DEBUG=1` to print stack traces for
unexpected errors.

## Lifecycle overview

| Command | When to run |
|---|---|
| `skillpipe doctor` | When anything is off. Run this first. |
| `skillpipe init` | Once per machine. |
| `skillpipe repo connect <url>` | Once per repo, per machine. |
| `skillpipe repo create <name>` | When you have no skills repo yet. |
| `skillpipe list` (alias `ls`) | Anytime — read-only. |
| `skillpipe install <name\|all>` | Per skill, after `connect`. |
| `skillpipe update [name]` | Recurring. |
| `skillpipe status` | Anytime — read-only. |
| `skillpipe add <name>` | When authoring a new skill. |
| `skillpipe validate [name]` | Before every `propose`, and on demand. |
| `skillpipe propose <name>` | After local edits, to open a PR. |

---

## `skillpipe init`

Initialize Skillpipe on this machine. Creates `~/.skillpipe/config.json` and
`~/.skillpipe/lock.json`. Asks which agent target you're setting up and installs
the bundled `skillpipe-cli` skill into the current project.

```bash
skillpipe init
skillpipe init --yes        # non-interactive, defaults to claude-code
```

| Flag | Purpose |
|---|---|
| `-y, --yes` | Skip prompts; use Claude Code defaults. |

## `skillpipe repo connect <url>`

Connect a GitHub repository as the skills source. Clones into
`~/.skillpipe/repos/<name>` and tracks the default branch.

```bash
skillpipe repo connect https://github.com/<you>/my-agent-skills
skillpipe repo connect git@github.com:<you>/my-agent-skills.git --branch dev
```

| Flag | Purpose |
|---|---|
| `-b, --branch <name>` | Track a non-default branch. |
| `--init` | Use only when the repo is brand new and lacks a `skillpipe.json`. |

## `skillpipe repo create <name>`

Create a new skills repo on GitHub via `gh repo create`, clone it, and scaffold
the standard layout.

```bash
skillpipe repo create my-agent-skills --private
```

| Flag | Purpose |
|---|---|
| `--public` / `--private` | Visibility. Defaults to `--private`. |
| `-d, --description <text>` | Repo description. |
| `-t, --target <name>` | Default target for the example skill (defaults to `claude-code`). |

## `skillpipe list` / `skillpipe ls`

List skills in the connected repository. Read-only.

## `skillpipe install <name|all>`

Install a skill (or all of them) into the configured target.

```bash
skillpipe install brand-analysis
skillpipe install all
skillpipe install brand-analysis --target custom --path ./agent/skills
```

| Flag | Purpose |
|---|---|
| `-t, --target <name>` | Override the default target adapter. |
| `-p, --path <dir>` | Override the install path. |

## `skillpipe update [name]`

Pull upstream changes and re-install drifted skills.

```bash
skillpipe update                # update everything currently installed
skillpipe update brand-analysis # update one skill
skillpipe update --all          # update every skill in the repo, even uninstalled ones
skillpipe update --dry-run      # show what would change
```

| Flag | Purpose |
|---|---|
| `--all` | Include skills not currently installed locally. |
| `--dry-run` | Don't write — show planned changes. |

## `skillpipe status`

Show install status, lockfile state, and which installed skills have a newer
commit upstream. Read-only.

## `skillpipe add <name>`

Scaffold a new skill from a template inside the connected repo's local checkout.
This creates `skills/<name>/SKILL.md` in `~/.skillpipe/repos/<repo>/` — it does
**not** install anything into the target.

```bash
skillpipe add customer-support -d "Triage and answer support tickets"
```

| Flag | Purpose |
|---|---|
| `-d, --description <text>` | Skill description. |
| `-t, --target <name>` | Initial target list. |
| `-y, --yes` | Skip prompts. |

## `skillpipe validate [name]`

Validate a skill (or the whole repo) against schema, secret patterns, and
dangerous-pattern rules.

```bash
skillpipe validate                       # validate every skill in the connected repo
skillpipe validate brand-analysis        # validate one
skillpipe validate --repo ./my-skills    # validate a repo at an arbitrary path
skillpipe validate brand-analysis --no-secrets  # skip secret scanning (rare)
```

| Flag | Purpose |
|---|---|
| `-r, --repo <dir>` | Validate a repo at a path other than the connected one. |
| `--no-secrets` | Disable secret scanning. Use sparingly. |

## `skillpipe propose <name> -m "..."`

Open a Pull Request with local changes to a skill. Validates, creates a branch
named `skillpipe/<name>-YYYY-MM-DD`, commits, pushes, and opens a PR via `gh`.

```bash
skillpipe propose customer-support -m "feat: customer-support skill"
skillpipe propose customer-support -m "wip" --draft
```

| Flag | Purpose |
|---|---|
| `-m, --message <text>` | Commit and PR title. **Required.** |
| `--draft` | Open a draft PR. |
| `--branch <name>` | Override the auto-generated branch name. |
| `--allow-secret-risk` | Skip the secret-scan block. **Use only after the user has acknowledged the risk.** |

## `skillpipe doctor`

Diagnose the local setup: Node version, `git`, `gh`, auth status, config and
lockfile presence, connected repo health.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `SKILLPIPE_HOME` | Override `~/.skillpipe/`. Useful for testing. |
| `SKILLPIPE_DEBUG=1` | Print stack traces on non-typed errors. |

## Error codes

The CLI emits typed errors as `[CODE] message`. The full table — with what each
code means and how to recover — lives in the bundled `skillpipe-cli` skill (the
one installed into your project on `skillpipe init`). See
`<your-project>/.claude/skills/skillpipe-cli/SKILL.md`, section "Error codes and
recovery".
