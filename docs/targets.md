# Targets & adapters

A **target** is the agent environment where a skill is installed. Skillpipe
talks to each target through an **adapter**: a small piece of code that knows
how to lay out skill files for that specific environment.

## Built-in adapters

| Adapter | Default install path | Notes |
|---|---|---|
| `claude-code` | `~/.claude/skills/` (user) or `<project>/.claude/skills/` (project) | First-class. The CLI ships with this enabled. |
| `hermes` | `~/.hermes/skills/` (user only — respects `HERMES_HOME`) | Hermes agent runtime. No project scope. |
| `openclaw` | `~/.openclaw/skills/` (user, respects `OPENCLAW_STATE_DIR`) or `<workspace>/skills/` (project) | OpenClaw personal AI assistant. Auto-discovery, no manual registration. |
| `levante` | `~/.levante/skills/` (user) or `<cwd>/.levante/skills/` (project) | Levante agent. Detected by `levante` on `PATH`. Project scope wins on name collision. |
| `custom` | Whatever you pass via `--path` or set in config | Use for any agent that reads skills from a directory you control. |

## Choosing a target

`skillpipe init` asks which target you want and saves it as the default in
`~/.skillpipe/config.json`. You can override per-command:

```bash
skillpipe install brand-analysis --target custom --path ./agent/skills
```

## User scope vs project scope (Claude Code)

For Claude Code, skills can live at two scopes:

- **User scope** — `~/.claude/skills/`. Available to every Claude Code session
  on this machine. Good for personal, cross-project skills.
- **Project scope** — `<project>/.claude/skills/`. Only visible inside that
  project. Good for skills that depend on project-specific context.

`skillpipe init` writes the bundled `skillpipe-cli` skill to **project scope**
(it's about teaching the agent in that project how to use the CLI). Subsequent
`skillpipe install` calls default to user scope, configurable via `--path`.

## Hermes adapter

The `hermes` adapter installs skills into Hermes's global skills directory.
Hermes auto-discovers any folder under that directory containing a `SKILL.md` —
no extra registration is needed.

- **Default path** — `~/.hermes/skills/`.
- **`HERMES_HOME` override** — if `HERMES_HOME` is set, skills are installed
  under `$HERMES_HOME/skills/` instead.
- **No project scope** — unlike Claude Code, Hermes does not read skills from
  the cwd. All Hermes skills live globally for the user.

The `SKILL.md` format is compatible: same YAML frontmatter, same folder
layout. A skill written for Claude Code generally works in Hermes without
changes.

## OpenClaw adapter

The `openclaw` adapter installs skills into one of OpenClaw's auto-discovered
skill directories. OpenClaw scans several roots in precedence order; Skillpipe
defaults to the two most common ones:

- **User scope** — `~/.openclaw/skills/`. Available across all workspaces.
- **Project scope** — `<workspace>/skills/`. Highest precedence in OpenClaw's
  resolution order; only visible inside that workspace.

`OPENCLAW_STATE_DIR` overrides the user-scope home (default `~/.openclaw`),
useful for isolating installations or service-user setups.

`skillpipe init` writes the bundled `skillpipe-cli` skill to **project scope**
so the agent in that workspace immediately knows how to use the CLI.
Subsequent `skillpipe install` calls default to user scope, configurable via
`--path`.

OpenClaw auto-discovers any folder containing a valid `SKILL.md`, so no extra
registration in `openclaw.json` is needed.

## Levante adapter

The `levante` adapter installs skills into Levante's auto-discovered skill
directories. Levante scans two roots in precedence order, and Skillpipe
exposes both:

- **User scope** — `~/.levante/skills/`. Available across all projects.
- **Project scope** — `<cwd>/.levante/skills/`. Highest precedence; if a
  project-scope skill shares the `name` of a user-scope skill, the project
  one wins.

Levante auto-discovers any first-level subdirectory containing a valid
`SKILL.md` (same YAML contract: `name` and `description` required; `version`,
`targets`, `tags` optional). No manifest registration needed. There is no
environment variable override; paths are resolved strictly from the user
home and the current working directory.

`skillpipe init` writes the bundled `skillpipe-cli` skill to **project scope**
so the agent in that workspace immediately knows how to operate the CLI.
Subsequent `skillpipe install` calls default to user scope, configurable via
`--path`.

Detection: Skillpipe considers Levante available when the `levante` binary
is reachable on the system `PATH`.

Levante caches skills at session start, so after a fresh install or update
restart the Levante session (or trigger a reload command if one is exposed)
to pick up changes. Symlink mode is supported and recommended.

## Custom adapter

The `custom` adapter is a generic "copy the skill folder to this path" target.
Use it when:

- You're building your own agent that reads skills from a known directory.
- You want skills in a non-default location for a specific project.
- You're integrating with an editor or IDE that consumes skills its own way.

Configure once via `skillpipe init` (choose **Custom path**, enter the directory)
or override per-command with `--target custom --path <dir>`.

## Roadmap

Planned adapters in upcoming releases:

- **OpenCode** — OpenCode IDE integration.

Each adapter is a thin module under `src/adapters/`. Adding one is mostly a
matter of mapping skill folders to whatever layout the target expects, and
registering the adapter in `src/adapters/index.ts`. See
[Adding a new adapter](./adapters.md) for the full walkthrough.

## How install actually works

`install` runs in one of two modes, recorded per-skill in the lockfile:

- **`symlink` (default)** — `<installPath>/<skill>` is a symlink to
  `~/.skillpipe/repos/<repo>/skills/<skill>`. The agent reads the symlink
  transparently; any edit it makes lands directly in the git workspace, so
  `skillpipe propose <skill>` picks the changes up with no extra step.
- **`copy`** — the skill folder is copied. Safer on filesystems or platforms
  that don't tolerate symlinks well (e.g. Windows without developer mode).
  Trade-off: edits made in the install path are *not* reflected in the
  workspace, so propose-from-installed has to copy them back (see below).

If the destination already exists, it's overwritten in both modes.

Pick the mode with `--mode copy|symlink` on `skillpipe install`. The
configured default for each target lives in `~/.skillpipe/config.json` under
`targets.<name>.mode` and was set during `skillpipe init`. `update` re-uses
whatever mode is recorded for that skill in the lockfile.

### Closing the edit loop with `propose`

When the skill is installed in **symlink** mode, this just works:

```bash
# agent edits ~/.claude/skills/<skill>/SKILL.md
skillpipe propose <skill> -m "tweak: ..."
```

The edit is already in the workspace, so `propose` commits and opens the PR.

When the skill is installed in **copy** mode, the edits live only in the
install path. Use `--from-installed` to copy them back into the workspace
first:

```bash
skillpipe propose <skill> --from-installed -m "tweak: ..."
```

`propose --from-installed` is a no-op when the skill is in symlink mode (it
just logs that the edits are already in place), so it's safe to use as a
default in scripts.
