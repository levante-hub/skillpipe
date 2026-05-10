# Security model

SkillSync skills are **instructions executed by AI inference**. A skill that
contains a leaked API key or a destructive instruction is a real risk, not a
hypothetical one. The security model reflects that.

## Three lines of defense

### 1. Validation before installation

Every skill is validated before it lands in the target install path:

- **Schema** — frontmatter must include `name`, `version`, `description`,
  `targets`. Folder name must equal `name`.
- **Secret scanning** — the body and adjacent files are scanned for common
  secret patterns: OpenAI (`sk-…`), Anthropic (`sk-ant-…`), GitHub
  (`ghp_…`, `gho_…`, `ghs_…`), AWS (`AKIA…`), Slack (`xox…`), Google API
  keys.
- **Dangerous patterns** — heuristics for instructions that could be unsafe to
  execute blindly (e.g. `rm -rf /`, `curl … | sh`, `--no-verify` patterns,
  `chmod 777`, etc.).

Validation runs on `install`, on `update`, and on `propose`. You can also run
it on demand with `skillsync validate`.

### 2. PR-only contribution flow

Day-to-day skill changes go through `skillsync propose` — which validates,
creates a branch, commits, pushes, and opens a Pull Request via `gh`.

**Direct push to `main` is a hard rule violation.** It bypasses validation and
bypasses human review. The CLI will not help you do it.

The only commands that write directly to `main` are repo-bootstrap commands
(`repo create`, the initial scaffold) — and only when the repo is brand new
and there's nothing on `main` to protect yet.

### 3. Copy semantics, not symlink

Skills are copied (not symlinked) into the target by default. This means:

- The version of a skill an agent reads is *the version that was installed*,
  not whatever happens to be in the source repo right now.
- A bad commit upstream doesn't immediately propagate to running agents.
- `skillsync status` and `skillsync update --dry-run` show you exactly what
  *would* change before you accept it.

## Hard rules

These rules are baked into the CLI and the bundled `skillsync-cli` skill:

1. **Never edit `~/.skillsync/config.json` or `~/.skillsync/lock.json` by
   hand.** Always go through the CLI.
2. **Never push directly to `main`** of the skills repo. Use `propose`.
3. **Never pass `--allow-secret-risk` unprompted.** If the validator flags a
   secret, the secret must be removed from the file. Period.
4. **Never run `gh auth login` on the user's behalf** — it's interactive. The
   bundled skill instructs agents to suggest the user run it themselves.
5. **Never delete `~/.skillsync/repos/<name>` to "fix" a problem** before
   reading the error and trying `skillsync doctor`. That folder may contain
   uncommitted local edits.
6. **Always run `skillsync validate <name>` immediately before
   `skillsync propose <name>`.** `propose` does this for you, but if you
   skipped to `git push` somehow, you skipped validation.
7. **Always prefer `--dry-run` on `update`** when the change set is large or
   the user is uncertain.
8. **Always confirm with the user** before `skillsync install all` or
   `skillsync update --all`, since both can write many files.

## When the validator flags something

The validator is conservative — when in doubt it flags. If you believe a flag
is a false positive:

- For a **secret pattern**: re-read the file. If it's actually a placeholder
  (e.g. `sk-EXAMPLE-…` in a doc), rename it so it doesn't match the pattern
  (`sk-XXXX-…`, or describe the format in prose). Don't bypass.
- For a **dangerous pattern**: rewrite the instruction. The validator is
  saying "an AI following this literally could do harm." Fixing the pattern
  usually also makes the skill clearer to a human reader.

The escape hatch `--allow-secret-risk` exists for genuine emergencies — never
as a routine workflow.

## What SkillSync does *not* do

Things that are explicitly out of scope:

- **Sandboxing skill content.** SkillSync does not run skills; agents do.
  Sandboxing is the agent platform's job.
- **Signature verification.** v0.4+ on the roadmap (signed releases). Today,
  trust is rooted in the GitHub repo you connect.
- **Network policy.** SkillSync uses `git` and `gh`; it doesn't proxy or
  mediate the network.

## Reporting a vulnerability

If you find a security issue in SkillSync itself (not in a third-party skill),
open a private security advisory on the
[GitHub repo](https://github.com/levante-hub/skillpipe/security/advisories).
Do not file it as a public issue.
