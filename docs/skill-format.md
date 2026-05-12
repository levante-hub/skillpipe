# Skill format

A **skill** is a folder under `skills/<name>/` in your skills repository. The
folder must contain a `SKILL.md` with YAML frontmatter and a Markdown body. Other
files in the folder (templates, examples, helper docs) are copied along with it.

For the repository-level structure that contains these skill folders
(`skillpipe.json`, top-level directories, CI workflow), see
[Repository layout](./repository-layout.md).

## Folder layout

```text
skills/
  brand-analysis/
    SKILL.md          # required
    README.md         # optional
    examples/         # optional, copied as-is
      acme-report.md
```

The folder name and the frontmatter `name` **must match exactly**.

## Frontmatter (required)

```yaml
---
name: brand-analysis
version: 0.1.0
description: Analyze a company, its positioning, market, audience and opportunities.
author: You
tags: [business, research, sales]
targets: [claude-code]
---
```

| Field | Required | Description |
|---|---|---|
| `name` | yes | Slug. Must equal the folder name. Lowercase, dashes, no spaces. |
| `version` | yes | Semver (`MAJOR.MINOR.PATCH`). Bump when you change the body. |
| `description` | yes | One-line summary of what the skill does. Shown by `skillpipe list`. |
| `author` | no | Free text. |
| `tags` | no | Array of strings. Useful for filtering / discovery. |
| `targets` | yes | Array of target adapter names this skill is meant for. Examples: `claude-code`, `hermes`, `openclaw`, `levante`, `custom`. |

## Body (recommended structure)

The body is freeform Markdown, but skills that an AI agent can use reliably tend
to follow a predictable structure. The bundled `skillpipe-cli` skill is a good
reference. The sections that pay off:

- **Goal** — one paragraph: what this skill enables.
- **When to use this skill** — concrete trigger conditions. The agent reads this
  to decide whether to invoke the skill.
- **Mental model** — the entities and their relationships. Especially useful for
  tools with multiple moving parts.
- **Prerequisites** — what must be true before the skill's instructions work.
- **Instructions** — the actual steps, ideally numbered or grouped by scenario.
- **Command/API reference** — table of operations the skill mentions.
- **Error codes / failure modes** — what to do when something goes wrong.
- **Hard rules** — things the agent must *never* do, with rationale.
- **Anti-patterns** — common mistakes, named so the agent can recognize them.

You don't need every section. Pick what serves the task.

## Minimal example

```markdown
---
name: brand-analysis
version: 0.1.0
description: Analyze a company from public information.
author: You
tags: [business, research]
targets: [claude-code]
---

# Brand Analysis

## Goal
Help the agent analyze a company from public information.

## When to use this skill
Whenever the user asks for a brand, competitor or ecommerce analysis.

## Instructions
1. Identify the company.
2. Collect available information.
3. Produce a structured report covering positioning, audience, and opportunities.
```

## Validation

Every skill is validated before installation and before `propose`:

1. **Schema** — frontmatter must match the spec above (`name`, `version`,
   `description`, `targets`).
2. **Folder/name match** — folder name must equal frontmatter `name`.
3. **Secret patterns** — body and any other files in the folder are scanned for
   common secret formats (OpenAI, Anthropic, GitHub, AWS, Slack, Google).
4. **Dangerous patterns** — heuristics for instructions that could be unsafe to
   follow blindly. The validator is conservative; if it flags something, take it
   seriously.

Run `skillpipe validate <name>` before every `propose`.

## Versioning

`version` is semver, but the convention is loose:

- **Patch** (`0.1.0` → `0.1.1`): typo fix, clarification, no behavior change.
- **Minor** (`0.1.0` → `0.2.0`): new section, new step, additive change.
- **Major** (`0.1.0` → `1.0.0`): breaking change in expected behavior — e.g. an
  agent that followed the old version would now do the wrong thing.

The lockfile records the commit hash too, so version bumps are *not* required
for the CLI to detect drift on `update`. They're for humans.

## Where skills end up after install

For built-in dual-scope targets:

- Claude Code global scope: `~/.claude/skills/<name>/`
- Project scope: `<project>/.claude/skills/<name>/`
- OpenClaw global scope: `~/.openclaw/skills/<name>/`
- OpenClaw project scope: `<workspace>/skills/<name>/`
- Levante global scope: `~/levante/skills/<name>/`
- Levante project scope: `<project>/.levante/skills/<name>/`

For the `custom` target: whatever path you configured / passed via `--path`.

The installed copy is **a copy**, but it is also the supported edit surface.
Edit the installed skill and use `skillpipe propose <name>` to sync those
changes back into the internal repo cache before commit/push.
