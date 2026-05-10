# Contributing

Thanks for considering a contribution. This guide covers the basics; if you're
adding a new target adapter (Cursor, Codex, Copilot, your own agent, …) jump
straight to [Adding a new adapter](./adapters.md) — it's the more common case
and has its own walkthrough.

## Prerequisites

- Node.js ≥ 18
- `git`
- [GitHub CLI](https://cli.github.com/) (`gh`) authenticated

## Project setup

```bash
git clone https://github.com/levante-hub/skillpipe
cd skillpipe
npm install
```

## Common scripts

| Script | Purpose |
|---|---|
| `npm run build` | Compile TypeScript to `dist/`. |
| `npm run dev -- <command>` | Run the CLI from source via `tsx` (no build needed). |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run clean` | Remove `dist/`. |

To exercise a build like a real user without publishing:

```bash
npm run build
node dist/cli.js init --yes
```

Or use `npm link` to make `skillpipe` available globally from your local
checkout:

```bash
npm run build
npm link
skillpipe --version
# when done:
npm unlink -g skillpipe
```

## Project layout

```text
src/
  cli.ts                # commander entry point
  commands/             # one file per command (init, install, propose, …)
  adapters/             # target adapters — claude-code, custom, index
  core/                 # config, lockfile, sync, paths, github helpers
  schemas/              # zod schemas for config, skill frontmatter, skillpipe.json
  utils/                # fs, logger, errors
skills/
  skillpipe-cli/        # bundled skill, ships in the npm tarball
docs/                   # user + contributor docs
dist/                   # build output (gitignored)
```

Tests live next to the code as `*.test.ts` files under `src/`. Vitest finds
them automatically.

## Code style

- TypeScript strict mode is on. Don't disable it for new code.
- Prefer named exports.
- Throw `SkillpipeError(code, message)` for user-facing errors; the CLI
  formats those as `[CODE] message` and adds a hint. Use a new code only when
  no existing one fits — see `src/utils/errors.ts` for the table.
- Keep commands thin: they parse flags, call into `core/` and `adapters/`,
  and emit log lines via `utils/logger.ts`. Business logic belongs in `core/`.
- No comments on what code does (names should explain that). Only add a
  comment when *why* is non-obvious.

## Tests

- Add tests for any new behavior in `core/`, `adapters/`, or schemas.
- For commands, prefer testing the function the command calls (e.g.
  `runInstall`) rather than spawning the CLI binary.
- The validator and the secret scanner are the most safety-critical parts —
  any change there should come with a regression test.

```bash
npm test
```

## Pull request flow

1. Branch off `main`: `git checkout -b feature/<short-description>`.
2. Commit in small, reviewable steps.
3. Run `npm run build && npm test` before pushing.
4. Open a PR against `main`. Describe the *why* in the PR body, not just the
   what. Reference an issue if one exists.
5. CI must pass. A reviewer will look at the change before merge.

## Things that need a review conversation, not a PR

Open an issue first (or start a draft PR) for:

- New top-level commands (`skillpipe foo`).
- Changes to the lockfile or config schema.
- Changes to the validation rules (especially the secret-pattern table).
- Anything that affects how skills are installed (mode, layout, scope rules).

The bar is "could this surprise someone whose `update` runs on a cron?". If
yes, talk first.

## Things you can PR straight away

- Bug fixes with a regression test.
- Documentation improvements in `docs/` or skill READMEs.
- New target adapters that don't change the core interface (see
  [adapters](./adapters.md)).
- Adding error codes to the table when you discover an unhandled case.

## Releasing

Releases are cut from `main`. Maintainers run:

```bash
npm version <patch|minor|major>
npm run build
npm publish --access public
git push --follow-tags
```

If you're not a maintainer you don't need to worry about this — your PR will
ride the next release.
