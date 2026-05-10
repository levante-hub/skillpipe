# SkillSync documentation

SkillSync is a Git-native CLI for syncing **AI agent skills** across environments.
You define your skills once in a GitHub repository and SkillSync handles installing
them into the agent environments where they're consumed (Claude Code today, more
adapters planned).

This documentation is organized by what you're trying to do:

| Doc | Read when… |
|---|---|
| [Getting started](./getting-started.md) | You're setting up SkillSync for the first time. |
| [For agents](./agents.md) | You want to understand why SkillSync is built for AI agents and how an agent consumes a skill. |
| [Commands reference](./commands.md) | You need the full list of commands and flags. |
| [Skill format](./skill-format.md) | You're writing a new skill or auditing an existing one. |
| [Targets & adapters](./targets.md) | You want to install skills into something other than Claude Code, or customize install paths. |
| [Security model](./security.md) | You're reviewing the validation pipeline, secret scanning, or the PR-only contribution flow. |
| [Contributing](./contributing.md) | You want to contribute code, tests, or docs to SkillSync itself. |
| [Adding a new adapter](./adapters.md) | You want to add support for a new agent target (Cursor, Codex, your own agent, …). |

---

## At a glance

```bash
npm install -g skillpipe
skillsync init
skillsync repo connect https://github.com/<you>/my-agent-skills
skillsync install brand-analysis
skillsync update
```

That's the whole loop:

1. **Init** once per machine.
2. **Connect** a GitHub repo as the source of truth.
3. **Install** the skills you want into the agent target (Claude Code by default).
4. **Update** when upstream changes.
5. **Propose** improvements back to the repo via Pull Request — never direct push to `main`.

---

## Who this is for

If you work with AI agents — Claude Code, custom CLI agents, or anything else that
reads instructions from a `skills/` folder — and you want **one source of truth**
for those instructions across machines and projects, SkillSync is for you.

See [For agents](./agents.md) for the deeper rationale.
