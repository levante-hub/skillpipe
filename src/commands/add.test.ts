import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runAdd } from "./add.js";

async function writeConfig(home: string, installPath: string): Promise<void> {
  const cfg = {
    schemaVersion: "1.0.0",
    defaultRepo: null,
    defaultBranch: "main",
    defaultTarget: "claude-code",
    auth: { method: "gh-cli" },
    targets: {
      "claude-code": { installPath }
    },
    security: {
      requireValidation: true,
      allowDirectMainPush: false,
      scanSecrets: true
    }
  };
  await fs.writeFile(
    path.join(home, "config.json"),
    JSON.stringify(cfg, null, 2),
    "utf8"
  );
}

describe("runAdd", () => {
  let home: string;
  let installPath: string;
  const originalHome = process.env.SKILLPIPE_HOME;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "skillpipe-add-"));
    installPath = path.join(home, "skills");
    await fs.mkdir(installPath);
    process.env.SKILLPIPE_HOME = home;
    await writeConfig(home, installPath);
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.SKILLPIPE_HOME;
    } else {
      process.env.SKILLPIPE_HOME = originalHome;
    }
    await fs.rm(home, { recursive: true, force: true });
  });

  it("scaffolds the skill folder at the configured install path", async () => {
    await runAdd({
      name: "demo-skill",
      description: "A demo skill used for testing scaffolding.",
      yes: true
    });

    const folder = path.join(installPath, "demo-skill");
    const stat = await fs.lstat(folder);
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);

    const skillMd = await fs.readFile(path.join(folder, "SKILL.md"), "utf8");
    expect(skillMd).toContain("name: demo-skill");
    expect(skillMd).toContain("A demo skill used for testing scaffolding.");
    const readme = await fs.readFile(path.join(folder, "README.md"), "utf8");
    expect(readme.length).toBeGreaterThan(0);
  });

  it("refuses to overwrite an existing folder", async () => {
    const folder = path.join(installPath, "demo-skill");
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, "keep.txt"), "keep me", "utf8");

    await expect(
      runAdd({
        name: "demo-skill",
        description: "A demo skill used for testing scaffolding.",
        yes: true
      })
    ).rejects.toThrow(/already exists/);

    expect(await fs.readFile(path.join(folder, "keep.txt"), "utf8")).toBe(
      "keep me"
    );
  });

  it("validates the scaffolded skill without needing a connected repo", async () => {
    await runAdd({
      name: "valid-skill",
      description: "A scaffolded skill that should pass validation cleanly.",
      yes: true
    });

    const folder = path.join(installPath, "valid-skill");
    expect(await fs.stat(path.join(folder, "SKILL.md"))).toBeDefined();
  });
});
