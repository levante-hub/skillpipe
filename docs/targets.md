# Targets & adapters

A **target** is the agent environment where a skill is installed. Skillpipe
talks to each target through an **adapter**: a small piece of code that knows
how to lay out skill files for that specific environment.

## Built-in adapters

| Adapter | Default install path | Notes |
|---|---|---|
| `claude-code` | `~/.claude/skills/` (user) or `<project>/.claude/skills/` (project) | First-class. The CLI ships with this enabled. |
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

- **Levante** — internal Levante agent runtime.
- **Hermes** — Hermes agent runtime.
- **OpenCode** — OpenCode IDE integration.

Each adapter is a thin module under `src/adapters/`. Adding one is mostly a
matter of mapping skill folders to whatever layout the target expects, and
registering the adapter in `src/adapters/index.ts`. See
[Adding a new adapter](./adapters.md) for the full walkthrough.

## How install actually works

For all adapters today, `install` is a **copy**. The skill folder
(`~/.skillpipe/repos/<repo>/skills/<name>/`) is copied to the target install
path. If the destination already exists, it's overwritten. The copy mode is
recorded in the lockfile so `update` knows what to re-install.

Symlink mode is on the v0.3 roadmap — see the project-level roadmap. With
symlinks, edits to the source would be live in the target without an explicit
`update`. For now, `update` is the way.
