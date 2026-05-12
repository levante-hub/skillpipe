# Repository layout

This page is for people who want to build a Skillpipe-compatible repository
**by hand** instead of letting `skillpipe repo create` scaffold it. After
following this guide, `skillpipe repo connect <your-repo-url>` will accept the
repository without `--init`.

If you're happy to delegate scaffolding to the CLI, run
`skillpipe repo create <name>` instead — it produces exactly the layout
described below. See [Getting started](./getting-started.md).

## Minimum required structure

A Skillpipe repository only needs two things at the root for the CLI to
recognize it:

```text
my-agent-skills/
├── skillpipe.json     # required — repo metadata read by the CLI
└── skills/            # required — one folder per skill
    └── <name>/
        └── SKILL.md   # required — the agent-facing instructions
```

Everything else is optional and only useful if you intend to grow the repo
beyond raw skills.

## Recommended full layout

```text
my-agent-skills/
├── skillpipe.json                # required
├── README.md                     # recommended — humans read this on GitHub
├── .gitignore                    # recommended
├── skills/                       # required — agent skills
│   ├── brand-analysis/
│   │   ├── SKILL.md              # required per skill
│   │   ├── README.md             # optional — humans
│   │   └── examples/             # optional — copied as-is on install
│   └── customer-support/
│       └── SKILL.md
├── agents/                       # optional — agent definitions
├── workflows/                    # optional — multi-step workflows
├── templates/                    # optional — reusable templates
├── policies/                     # optional — shared policies
└── .github/
    └── workflows/
        └── validate-skills.yml   # optional — CI validation on PRs
```

`agents/`, `workflows/`, `templates/` and `policies/` are conventions, not
hard requirements. The CLI will read them only if `skillpipe.json` points at
them (see `agentsPath` and `workflowsPath` below). You can omit them entirely
on day one and add them later without breaking anything.

## `skillpipe.json` — repository metadata

`skillpipe.json` lives at the repo root. It tells the CLI what the repo is
called, which branch is canonical, where skills live inside the repo, and
which security policies apply. Minimum valid file:

```json
{
  "name": "my-agent-skills",
  "version": "0.1.0",
  "defaultBranch": "main"
}
```

Every other field has a sensible default. Full reference:

| Field | Type | Default | Purpose |
|---|---|---|---|
| `name` | string | — (required) | Human-readable name of the repo. |
| `version` | string | `"0.1.0"` | Semver of the repo itself. Bump on breaking layout changes. |
| `description` | string | optional | One-line summary. Surfaced by `skillpipe list`. |
| `defaultBranch` | string | `"main"` | Branch the CLI fetches/pushes against. |
| `schemaVersion` | string | `"1.0.0"` | Format version of `skillpipe.json` itself. Leave as-is unless migrating. |
| `skillsPath` | string | `"skills"` | Folder (relative to repo root) where skill folders live. **Change at your own risk** — most tooling assumes `skills/`. |
| `agentsPath` | string | `"agents"` | Folder for agent definitions, if you use them. |
| `workflowsPath` | string | `"workflows"` | Folder for multi-step workflows, if you use them. |
| `supportedTargets` | string[] | `["claude-code"]` | Adapters this repo's skills target. Inform consumers; doesn't restrict install. |
| `security.allowDirectPush` | boolean | `false` | If `false`, the CLI refuses to push directly to `defaultBranch`. |
| `security.requirePullRequest` | boolean | `true` | If `true`, `skillpipe propose` always opens a PR. |
| `security.scanForSecrets` | boolean | `true` | Run secret scanning during validation. |
| `security.validateBeforeInstall` | boolean | `true` | Validate a skill before installing it. |

A complete example with all the security defaults made explicit:

```json
{
  "name": "my-agent-skills",
  "version": "0.1.0",
  "description": "Personal agent skills repository.",
  "defaultBranch": "main",
  "schemaVersion": "1.0.0",
  "skillsPath": "skills",
  "agentsPath": "agents",
  "workflowsPath": "workflows",
  "supportedTargets": ["claude-code", "levante"],
  "security": {
    "allowDirectPush": false,
    "requirePullRequest": true,
    "scanForSecrets": true,
    "validateBeforeInstall": true
  }
}
```

## Skill folder anatomy

Each skill is a folder inside `skillsPath/` (default `skills/`). The folder
**name must equal the skill's frontmatter `name`** — the validator rejects
mismatches.

```text
skills/brand-analysis/
├── SKILL.md          # required
├── README.md         # optional
└── examples/         # optional — copied as-is on install
    └── acme-report.md
```

`SKILL.md` is the only required file. Everything else in the folder is copied
verbatim into the agent's install path, so it's a fine place to drop
templates, example outputs, or supporting docs the agent should read.

Full frontmatter spec and body conventions: see [Skill format](./skill-format.md).

## Optional: CI validation

If you want PRs against the repo to be checked automatically, drop the
following at `.github/workflows/validate-skills.yml`:

```yaml
name: Validate skills

on:
  pull_request:
    paths:
      - 'skills/**'
      - 'skillpipe.json'
  push:
    branches: [ main ]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g skillpipe
      - run: skillpipe validate --repo .
```

This is the same workflow `skillpipe repo create` writes for you.

## Manual bootstrap, end to end

If you'd rather build the repo by hand:

```bash
# 1. Create the GitHub repo (via the website or gh CLI)
gh repo create my-agent-skills --private

# 2. Clone it locally
git clone https://github.com/<you>/my-agent-skills
cd my-agent-skills

# 3. Create the minimum required files
mkdir -p skills/example
cat > skillpipe.json <<'JSON'
{
  "name": "my-agent-skills",
  "version": "0.1.0",
  "defaultBranch": "main"
}
JSON

cat > skills/example/SKILL.md <<'MD'
---
name: example
version: 0.1.0
description: Example starter skill — replace with your first real skill.
tags: []
targets:
  - claude-code
---

# Example Skill

## Goal
Describe what this skill enables the agent to do.

## When to use this skill
Describe the trigger conditions.

## Instructions
1. Step one.
2. Step two.
MD

# 4. Commit and push
git add .
git commit -m "chore: initial Skillpipe repo"
git push -u origin main

# 5. Connect it from any machine
skillpipe repo connect https://github.com/<you>/my-agent-skills
```

After step 5, `skillpipe list` should show the `example` skill and
`skillpipe install example --target claude-code --scope project` should put
it at `<cwd>/.claude/skills/example/`.

## Common pitfalls

- **Folder name ≠ frontmatter `name`** — validation fails. Both must be
  identical, lowercase, dashes allowed.
- **`SKILL.md` at the wrong depth** — must be `skills/<name>/SKILL.md`, not
  `skills/<name>/<anything>/SKILL.md`. Nested skill folders are not scanned.
- **Forgot `skillpipe.json`** — `repo connect` will refuse the repository and
  suggest `--init`. Add it manually or re-run with `--init` to have the CLI
  scaffold a default one.
- **Custom `skillsPath`** — supported by the schema, but most tooling
  (including the GitHub Action above) hardcodes `skills/`. Stick with the
  default unless you have a strong reason.
- **Pushing directly to `main`** — disabled by default
  (`security.allowDirectPush: false`). Use `skillpipe propose` to open a PR.

## See also

- [Skill format](./skill-format.md) — `SKILL.md` frontmatter, body
  conventions, validation rules, install destinations.
- [Targets & adapters](./targets.md) — which adapters consume which install
  paths.
- [Getting started](./getting-started.md) — the CLI-driven walkthrough.
