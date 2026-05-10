# SkillSync is for AI agents

SkillSync exists because AI agents — Claude Code, custom CLI agents, anything that
reads instructions from a `skills/` folder — need **one source of truth** for those
instructions across machines, projects, and teammates.

Without that, every machine ends up with a slightly different copy of the same
skill, and improvements made on one don't propagate to the others.

## What is a skill, in agent terms

A **skill** is a Markdown document (with YAML frontmatter) that tells an AI agent
how to do something: when to trigger, what mental model to hold, which commands to
run, what failure modes to watch for, what *not* to do.

It's not code the agent calls. It's instructions the agent reads and follows.

A minimal skill looks like this:

```markdown
---
name: brand-analysis
version: 0.1.0
description: Analyze a company, its positioning, market, audience and opportunities.
author: You
tags: [business, research, sales]
targets: [claude-code]
---

# Brand Analysis Skill

## Goal
Help the agent analyze a company from public information.

## When to use this skill
Whenever the user asks for a brand, competitor or ecommerce analysis.

## Instructions
1. Identify the company.
2. Collect available information.
3. Produce a structured report.
```

See [Skill format](./skill-format.md) for the full spec.

## How an agent consumes a skill

For Claude Code, skills live under `~/.claude/skills/<name>/` (user scope) or
`<project>/.claude/skills/<name>/` (project scope). Claude Code reads them
automatically — no configuration step on the agent side.

For other targets, the same pattern: SkillSync drops a `<name>/` directory at a
known path, and the agent reads from there.

## Why this is built for agents (not for humans)

Three properties of SkillSync only make sense if the consumer is an agent:

1. **Skills are bootstrapped on `init`.** Running `skillsync init` in a project
   automatically installs the `skillsync-cli` skill into that project. That means
   the *first* thing an agent working in the project sees is a skill teaching it
   how to use SkillSync correctly. A human user wouldn't need that — they'd read
   the docs.

2. **Validation is paranoid.** Schema, secret scanning, dangerous patterns — these
   run before installation because skills are *executed by inference*. A skill
   that contains a leaked API key or a destructive instruction is a real risk.
   See [Security model](./security.md).

3. **PR-only contribution flow.** `skillsync propose` is the only way to change
   a skill in the upstream repo. Direct push to `main` is blocked by convention.
   This is so that an agent that decides "this skill should be improved" can act
   on that decision *safely* — open a PR, wait for human review — rather than
   silently rewriting the source of truth.

## The agent's mental model

Four moving parts. An agent that uses SkillSync should hold all four in mind:

1. **Local config** — `~/.skillsync/config.json`. Which repo is connected, which
   target adapter is active, default install path.
2. **Lockfile** — `~/.skillsync/lock.json`. Per-skill record of
   `{version, commit, target, installPath, installedAt}`.
3. **Cloned workspace** — `~/.skillsync/repos/<name>`. The actual git checkout of
   the skills repo. This is what the CLI reads from.
4. **Target** — where skills are *installed* so the agent can read them. Default
   for `claude-code` is `~/.claude/skills/` (user) or `./.claude/skills/`
   (project).

Editing a skill in the *installed* copy (`~/.claude/skills/<name>/`) is silently
overwritten on the next `update`. Edits must go in the cloned workspace.

## The bundled `skillsync-cli` skill

When you run `skillsync init` in a project, SkillSync installs a skill named
`skillsync-cli` into that project. That skill is the operator's manual for the
CLI — written for an AI consumer.

If you're an agent reading this: that skill is the document you should consult
before running any SkillSync command. It documents prerequisites, the order of
operations, the error code table, hard rules, and anti-patterns. The version
shipped in the npm package matches the CLI version.

If you're a human reading this: that skill is what makes any AI agent in your
project immediately competent at SkillSync. You don't have to teach it.

## Suggested first session for an agent

1. `skillsync doctor` — environment check.
2. `skillsync status` — what's connected, what's installed.
3. `skillsync list` — what's available in the connected repo.
4. Only then, any state-changing command.

This is what the bundled `skillsync-cli` skill says under "Always start with a
status read, not a write." Follow it.
