import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";
import { autoSyncFromInstalled, isPushConflict } from "./propose.js";
import { findLocalSkillSource } from "../core/local-skill-source.js";
import { LocalConfig } from "../schemas/config.schema.js";

describe("isPushConflict", () => {
  it("detects non-fast-forward rejections", () => {
    const err = new Error(
      "git push failed: ! [rejected] main -> main (non-fast-forward)"
    );
    expect(isPushConflict(err)).toEqual({
      isConflict: true,
      reason: "non-fast-forward"
    });
  });

  it("detects 'updates were rejected'", () => {
    const err = new Error("Updates were rejected because the remote contains work");
    expect(isPushConflict(err).isConflict).toBe(true);
  });

  it("detects branch-behind messages", () => {
    const err = new Error(
      "tip of your current branch is behind its remote counterpart"
    );
    expect(isPushConflict(err).isConflict).toBe(true);
  });

  it("detects protected branch rejections", () => {
    expect(
      isPushConflict(new Error("remote: error: GH006: Protected branch update failed"))
        .isConflict
    ).toBe(true);
    expect(
      isPushConflict(new Error("Refusing to allow a non-fast-forward push"))
        .isConflict
    ).toBe(true);
    expect(
      isPushConflict(new Error("remote: error: protected branch hook declined"))
        .isConflict
    ).toBe(true);
  });

  it("returns isConflict=false for unrelated errors", () => {
    expect(isPushConflict(new Error("Permission denied (publickey)")).isConflict).toBe(
      false
    );
    expect(
      isPushConflict(new Error("Could not resolve hostname github.com")).isConflict
    ).toBe(false);
  });
});

describe("autoSyncFromInstalled", () => {
  let home: string;
  const originalHome = process.env.SKILLPIPE_HOME;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "skillpipe-autosync-"));
    process.env.SKILLPIPE_HOME = home;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.SKILLPIPE_HOME;
    } else {
      process.env.SKILLPIPE_HOME = originalHome;
    }
    await fs.rm(home, { recursive: true, force: true });
  });

  async function writeLock(installedPath: string): Promise<void> {
    await fs.writeFile(
      path.join(home, "lock.json"),
      JSON.stringify({
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
            installPath: path.dirname(installedPath),
            path: installedPath,
            installedAt: "2024-01-01T00:00:00.000Z"
          }
        }
      }),
      "utf8"
    );
  }

  it("copies install path content into the workspace skill folder", async () => {
    const installed = path.join(home, "installed", "foo");
    const workspace = path.join(home, "ws", "foo");
    await fs.mkdir(installed, { recursive: true });
    await fs.mkdir(path.dirname(workspace), { recursive: true });
    await fs.writeFile(path.join(installed, "SKILL.md"), "edited", "utf8");
    await writeLock(installed);

    await autoSyncFromInstalled("foo", workspace);

    expect(await fs.readFile(path.join(workspace, "SKILL.md"), "utf8")).toBe(
      "edited"
    );
  });

  it("no-ops when install path equals workspace path", async () => {
    const same = path.join(home, "shared", "foo");
    await fs.mkdir(same, { recursive: true });
    await fs.writeFile(path.join(same, "SKILL.md"), "original", "utf8");
    await writeLock(same);

    await autoSyncFromInstalled("foo", same);

    expect(await fs.readFile(path.join(same, "SKILL.md"), "utf8")).toBe(
      "original"
    );
  });

  it("skips when the installed path is a symlink (legacy installs)", async () => {
    const realTarget = path.join(home, "real", "foo");
    const installed = path.join(home, "installed", "foo");
    const workspace = path.join(home, "ws", "foo");
    await fs.mkdir(realTarget, { recursive: true });
    await fs.writeFile(path.join(realTarget, "SKILL.md"), "from-link", "utf8");
    await fs.mkdir(path.dirname(installed), { recursive: true });
    fssync.symlinkSync(realTarget, installed, "dir");
    await fs.mkdir(path.dirname(workspace), { recursive: true });
    await writeLock(installed);

    await autoSyncFromInstalled("foo", workspace);

    await expect(fs.access(workspace)).rejects.toThrow();
  });

  it("no-ops when no lockfile entry exists for the skill", async () => {
    const workspace = path.join(home, "ws", "foo");
    await fs.mkdir(path.dirname(workspace), { recursive: true });

    await autoSyncFromInstalled("foo", workspace);

    await expect(fs.access(workspace)).rejects.toThrow();
  });

  it("no-ops when the installed path no longer exists", async () => {
    const installed = path.join(home, "installed", "foo");
    const workspace = path.join(home, "ws", "foo");
    await fs.mkdir(path.dirname(workspace), { recursive: true });
    await writeLock(installed);

    await autoSyncFromInstalled("foo", workspace);

    await expect(fs.access(workspace)).rejects.toThrow();
  });
});

describe("findLocalSkillSource", () => {
  let work: string;

  beforeEach(async () => {
    work = await fs.mkdtemp(path.join(os.tmpdir(), "skillpipe-local-source-"));
  });

  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  it("finds skills in a configured non-default target install path", async () => {
    const hermesInstallPath = path.join(work, ".hermes", "skills");
    const config: LocalConfig = {
      schemaVersion: "1.0.0",
      defaultRepo: null,
      defaultBranch: "main",
      defaultTarget: "claude-code",
      auth: { method: "gh-cli" },
      targets: {
        "claude-code": { installPath: path.join(work, ".claude", "skills") },
        hermes: { installPath: hermesInstallPath }
      },
      security: {
        requireValidation: true,
        allowDirectMainPush: false,
        scanSecrets: true
      }
    };
    const skillPath = path.join(hermesInstallPath, "foo");
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "body", "utf8");

    const found = await findLocalSkillSource("foo", config, work);

    expect(found).toEqual({
      path: skillPath,
      targetName: "hermes"
    });
  });

  it("maps <cwd>/skills to the configured target instead of defaulting blindly", async () => {
    const config: LocalConfig = {
      schemaVersion: "1.0.0",
      defaultRepo: null,
      defaultBranch: "main",
      defaultTarget: "claude-code",
      auth: { method: "gh-cli" },
      targets: {
        "claude-code": { installPath: path.join(work, ".claude", "skills") },
        custom: { installPath: path.join(work, "skills") }
      },
      security: {
        requireValidation: true,
        allowDirectMainPush: false,
        scanSecrets: true
      }
    };
    const skillPath = path.join(work, "skills", "foo");
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "body", "utf8");

    const found = await findLocalSkillSource("foo", config, work);

    expect(found).toEqual({
      path: skillPath,
      targetName: "custom"
    });
  });
});
