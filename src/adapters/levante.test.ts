import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { LevanteAdapter } from "./levante.js";
import { parseSkill } from "../core/skill.js";

describe("LevanteAdapter", () => {
  let work: string;

  beforeEach(async () => {
    work = await fs.mkdtemp(path.join(os.tmpdir(), "skillpipe-levante-"));
  });

  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  it("uses the Levante global skills root without the dot-prefix", () => {
    const adapter = new LevanteAdapter();
    expect(adapter.getDefaultInstallPath("global")).toBe(
      path.join(os.homedir(), "levante", "skills")
    );
  });

  it("rewrites SKILL.md with Levante-compatible frontmatter on install", async () => {
    const src = path.join(work, "src");
    const installPath = path.join(work, "install");
    await fs.mkdir(src);
    await fs.writeFile(
      path.join(src, "SKILL.md"),
      `---
name: twenty
version: 0.1.0
description: Twenty CLI reference for Levante.
author: Skillpipe
tags: [twenty, cli]
targets: [levante]
---

# Twenty

Levante body.
`,
      "utf8"
    );
    const skill = await parseSkill(src);
    const adapter = new LevanteAdapter();

    const { destPath } = await adapter.installSkill({
      sourceDir: src,
      skillName: "twenty",
      installPath,
      skill,
      installedAt: "2026-05-12T10:00:00.000Z"
    });

    const installed = await fs.readFile(path.join(destPath, "SKILL.md"), "utf8");
    expect(installed).toContain("id: custom/twenty");
    expect(installed).toContain("category: custom");
    expect(installed).toContain("user-invocable: 'true'");
    expect(installed).toContain("installed-at: '2026-05-12T10:00:00.000Z'");
    expect(installed).toContain("author: Skillpipe");
    expect(installed).toContain("- twenty");
    expect(installed).toContain("- levante");
    expect(installed).toContain("# Twenty");
    expect(installed).toContain("Levante body.");
  });
});
