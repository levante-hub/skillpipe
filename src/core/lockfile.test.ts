import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadLockfile } from "./lockfile.js";

async function makeTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skillpipe-lockfile-"));
  process.env.SKILLPIPE_HOME = dir;
  return dir;
}

async function writeLock(home: string, raw: unknown): Promise<void> {
  await fs.writeFile(
    path.join(home, "lock.json"),
    JSON.stringify(raw, null, 2),
    "utf8"
  );
}

async function readLock(home: string): Promise<unknown> {
  const text = await fs.readFile(path.join(home, "lock.json"), "utf8");
  return JSON.parse(text);
}

describe("loadLockfile — legacy mode migration", () => {
  let home: string;
  const originalHome = process.env.SKILLPIPE_HOME;

  beforeEach(async () => {
    home = await makeTempHome();
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.SKILLPIPE_HOME;
    } else {
      process.env.SKILLPIPE_HOME = originalHome;
    }
    await fs.rm(home, { recursive: true, force: true });
  });

  it("strips legacy `mode` from installed skills and rewrites the file", async () => {
    await writeLock(home, {
      schemaVersion: "1.0.0",
      repo: "foo/bar",
      branch: "main",
      remoteCommit: null,
      updatedAt: "2024-01-01T00:00:00.000Z",
      skills: {
        foo: {
          version: "1.0.0",
          commit: "abc",
          target: "claude-code",
          installPath: "/tmp",
          path: "/tmp/foo",
          mode: "symlink",
          installedAt: "2024-01-01T00:00:00.000Z"
        }
      }
    });

    const lock = await loadLockfile();
    expect(lock.skills.foo).toBeDefined();
    expect("mode" in (lock.skills.foo as object)).toBe(false);

    const raw = (await readLock(home)) as {
      skills: Record<string, Record<string, unknown>>;
    };
    expect("mode" in raw.skills.foo!).toBe(false);
  });

  it("does not rewrite the file when no legacy mode is present", async () => {
    await writeLock(home, {
      schemaVersion: "1.0.0",
      repo: "foo/bar",
      branch: "main",
      remoteCommit: null,
      updatedAt: "2024-01-01T00:00:00.000Z",
      skills: {
        foo: {
          version: "1.0.0",
          commit: "abc",
          target: "claude-code",
          installPath: "/tmp",
          path: "/tmp/foo",
          installedAt: "2024-01-01T00:00:00.000Z"
        }
      }
    });

    const before = (await fs.stat(path.join(home, "lock.json"))).mtimeMs;
    await new Promise((r) => setTimeout(r, 20));

    await loadLockfile();

    const after = (await fs.stat(path.join(home, "lock.json"))).mtimeMs;
    expect(after).toBe(before);
  });
});
