# Adding a new adapter

A **target adapter** teaches Skillpipe how to install skills into one specific
agent environment. The CLI ships with two: `claude-code` (first-class, copies
to `~/.claude/skills/` or `<project>/.claude/skills/`) and `custom` (generic
"copy to this path"). This page walks through adding a new one.

If your target is "I just want skills in some directory I control," you don't
need a new adapter — the existing `custom` adapter already handles it. Add a
new adapter when the target has its own conventions: a non-obvious install
path, a different folder layout, environment detection, or any post-install
step that the generic copy doesn't cover.

## The contract

Every adapter implements the `TargetAdapter` interface in
`src/adapters/index.ts`:

```ts
export interface TargetAdapter {
  readonly name: string;
  detect(): Promise<boolean>;
  getDefaultInstallPath(scope?: "user" | "project"): string;
  installSkill(args: InstallSkillArgs): Promise<string>;
  removeSkill(args: RemoveSkillArgs): Promise<void>;
  listInstalledSkills(installPath: string): Promise<InstalledSkillSummary[]>;
}
```

| Method | Responsibility |
|---|---|
| `name` | Slug used by users and config. Lowercase, dashes (`my-agent`). Must be unique. |
| `detect()` | Returns `true` when the target is plausibly present on this machine. Used for hints, not gating. |
| `getDefaultInstallPath(scope)` | Where skills land by default. Honor `user` vs `project` scope when meaningful; otherwise return one path and ignore the argument. |
| `installSkill(args)` | Copy / link the skill from `args.sourceDir` into `args.installPath` under `args.skillName`. Return the absolute destination path. Must overwrite if the destination already exists. |
| `removeSkill(args)` | Remove a previously installed skill. No-op if it doesn't exist. |
| `listInstalledSkills(installPath)` | Read the install path and return the skills currently there. |

The simplest adapter (the `claude-code` one) is ~30 lines because most of the
work is delegated to `plainCopySkill` from `src/core/sync.js`. Use that helper
unless your target needs custom layout.

## Walkthrough: adding a `cursor` adapter

Suppose Cursor reads skills from `~/.cursor/skills/<name>/` (user) or
`<project>/.cursor/skills/<name>/` (project). Here's the full set of changes.

### 1. Create the adapter file

`src/adapters/cursor.ts`:

```ts
import path from "node:path";
import os from "node:os";
import { plainCopySkill } from "../core/sync.js";
import { listDirs, pathExists, removePath } from "../utils/fs.js";
import {
  TargetAdapter,
  InstallSkillArgs,
  RemoveSkillArgs,
  InstalledSkillSummary
} from "./index.js";

export class CursorAdapter implements TargetAdapter {
  readonly name = "cursor";

  async detect(): Promise<boolean> {
    return pathExists(path.join(os.homedir(), ".cursor"));
  }

  getDefaultInstallPath(scope: "user" | "project" = "user"): string {
    return scope === "project"
      ? path.join(process.cwd(), ".cursor", "skills")
      : path.join(os.homedir(), ".cursor", "skills");
  }

  async installSkill(args: InstallSkillArgs): Promise<string> {
    const dest = path.join(args.installPath, args.skillName);
    await plainCopySkill(args.sourceDir, dest);
    return dest;
  }

  async removeSkill(args: RemoveSkillArgs): Promise<void> {
    const target = path.join(args.installPath, args.skillName);
    if (await pathExists(target)) {
      await removePath(target);
    }
  }

  async listInstalledSkills(
    installPath: string
  ): Promise<InstalledSkillSummary[]> {
    const dirs = await listDirs(installPath);
    return dirs.map((name) => ({
      name,
      path: path.join(installPath, name)
    }));
  }
}
```

That's it for the adapter itself. The `claude-code` adapter is the same
shape — only the paths differ.

### 2. Register it

`src/adapters/index.ts`:

```ts
import { CursorAdapter } from "./cursor.js";

const REGISTRY = new Map<string, TargetAdapter>();
REGISTRY.set("claude-code", new ClaudeCodeAdapter());
REGISTRY.set("custom", new CustomAdapter());
REGISTRY.set("cursor", new CursorAdapter()); // <- add
```

`getAdapter("cursor")` now resolves, and `availableAdapters()` includes it
in the `TARGET_UNKNOWN` error message.

### 3. Add it to the `init` prompt

`src/commands/init.ts` has a `target` prompt with a fixed list of choices:

```ts
choices: [
  { name: "Claude Code", value: "claude-code" },
  { name: "Cursor",      value: "cursor"      }, // <- add
  { name: "Custom path", value: "custom"      }
],
```

If your adapter needs a non-default install path different from
`getDefaultInstallPath()`, also extend the `installPath` default branch in
the same prompt. For most adapters the default is fine.

### 4. Add path helpers (optional but recommended)

If your adapter has well-known paths, expose them from `src/core/paths.ts`
the way `defaultClaudeUserSkillsPath` and `defaultClaudeProjectSkillsPath`
are exposed. This keeps path knowledge in one place and lets `init` and
other commands reuse it without importing the adapter.

```ts
// src/core/paths.ts
export function defaultCursorUserSkillsPath(): string {
  return path.join(os.homedir(), ".cursor", "skills");
}
export function defaultCursorProjectSkillsPath(cwd = process.cwd()): string {
  return path.join(cwd, ".cursor", "skills");
}
```

Then your adapter imports from `paths.ts` instead of hardcoding.

### 5. Tests

Add `src/adapters/cursor.test.ts` covering at minimum:

- `installSkill` writes the expected destination and overwrites cleanly.
- `removeSkill` no-ops when the path is missing.
- `listInstalledSkills` returns the right shape.
- `detect()` flips based on whether `~/.cursor` exists. Use a temp
  `os.homedir()` mock or `SKILLPIPE_HOME`-style isolation; do not touch the
  real home directory.

Look at the existing adapter tests (if present) and `src/core/sync.test.ts`
for the patterns the project already uses.

### 6. Docs

- Add a row to the table in [`docs/targets.md`](./targets.md).
- If the adapter has unusual conventions (post-install step, special folder
  layout, environment requirements), add a short subsection there.

### 7. Update the bundled skill

The bundled `skillpipe-cli` skill (in `skills/skillpipe-cli/SKILL.md`) lists
the adapters it knows about. If your adapter is part of the standard set
shipping with the CLI, mention it in the **Mental model** and **Anti-patterns**
sections so an AI agent reading the skill knows the new option exists.

## Design notes

A few things to keep in mind while writing an adapter:

- **Overwrite is the contract.** `installSkill` must replace whatever was at
  the destination. `plainCopySkill` already does this — if you bypass it,
  you have to do it yourself.
- **Idempotency.** Running `install` twice in a row must produce the same
  state as running it once. Same for `remove` on a missing target.
- **No global state.** Adapter instances are constructed once and reused;
  don't stash request-scoped state on `this`.
- **Don't read or write the lockfile.** Adapters are filesystem-only. The
  lockfile and config are managed by `core/` — adapters never touch them.
- **Be tolerant on `listInstalledSkills`.** The install path may not exist
  yet (return `[]`), or may contain non-skill files (skip them).
- **Detection is a hint, not a gate.** A `detect()` that returns `false`
  must not block install — the user may be setting up the target right
  now. Use detection only to inform messaging.

## Anti-patterns

- Reading the skill body and rewriting it for the target. Skills are written
  for the agent that consumes them; the adapter just places the file. If the
  target needs a different format, that's a separate concern (a transform
  layer), not an adapter concern.
- Spawning processes during install. Adapters should be filesystem-pure.
- Adding adapter-specific fields to `skillpipe.json` or the lockfile.
  Adapter behavior should be derivable from the `targets` array in the
  skill's frontmatter and the configured install path. If you genuinely need
  more state, open an issue first.

## Submitting your adapter

Once your adapter has tests and docs, open a PR. Title:
`feat(adapters): <name> adapter`. In the description, include:

1. What the target is and where it stores skills by default.
2. Any non-default behavior (post-install, layout quirks).
3. How you tested it (the `npm test` output is fine, plus any manual run).

Welcome new adapters — they're how Skillpipe grows.
