import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { HermesAdapter } from "./hermes.js";
import { parseSkill } from "../core/skill.js";

describe("HermesAdapter.installSkill", () => {
  let work: string;
  const originalHermesHome = process.env.HERMES_HOME;

  beforeEach(async () => {
    work = await fs.mkdtemp(path.join(os.tmpdir(), "skillpipe-hermes-"));
    process.env.HERMES_HOME = work;
  });

  afterEach(async () => {
    if (originalHermesHome === undefined) {
      delete process.env.HERMES_HOME;
    } else {
      process.env.HERMES_HOME = originalHermesHome;
    }
    await fs.rm(work, { recursive: true, force: true });
  });

  it("installs as a real directory, never a symlink", async () => {
    const src = path.join(work, "src");
    const installPath = path.join(work, "install");
    await fs.mkdir(src);
    await fs.writeFile(
      path.join(src, "SKILL.md"),
      `---
name: foo
version: 0.1.0
description: Hermes adapter test skill.
tags: []
targets:
  - hermes
---

# Foo
`,
      "utf8"
    );
    const skill = await parseSkill(src);

    const adapter = new HermesAdapter();
    const { destPath } = await adapter.installSkill({
      sourceDir: src,
      skillName: "foo",
      installPath,
      skill,
      installedAt: "2026-05-12T00:00:00.000Z"
    });

    expect(destPath).toBe(path.join(installPath, "foo"));
    const stat = await fs.lstat(destPath);
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
  });

  it("removeSkill clears the install destination", async () => {
    const src = path.join(work, "src");
    const installPath = path.join(work, "install");
    await fs.mkdir(src);
    await fs.writeFile(
      path.join(src, "SKILL.md"),
      `---
name: foo
version: 0.1.0
description: Hermes adapter test skill.
tags: []
targets:
  - hermes
---

# Foo
`,
      "utf8"
    );
    const skill = await parseSkill(src);

    const adapter = new HermesAdapter();
    const { destPath } = await adapter.installSkill({
      sourceDir: src,
      skillName: "foo",
      installPath,
      skill,
      installedAt: "2026-05-12T00:00:00.000Z"
    });
    expect(await fs.stat(destPath).then((s) => s.isDirectory())).toBe(true);

    await adapter.removeSkill({ skillName: "foo", installPath });
    await expect(fs.stat(destPath)).rejects.toThrow();
  });
});
