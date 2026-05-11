import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fssync from "node:fs";
import os from "node:os";
import path from "node:path";

import { materializeSkill } from "./sync.js";

describe("materializeSkill", () => {
  let work: string;

  beforeEach(async () => {
    work = await fs.mkdtemp(path.join(os.tmpdir(), "skillpipe-sync-"));
  });

  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  it("always returns 'copy' and creates a real directory", async () => {
    const src = path.join(work, "src");
    const dest = path.join(work, "dest");
    await fs.mkdir(src);
    await fs.writeFile(path.join(src, "SKILL.md"), "hello", "utf8");

    const mode = await materializeSkill(src, dest);
    expect(mode).toBe("copy");

    const stat = await fs.lstat(dest);
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(await fs.readFile(path.join(dest, "SKILL.md"), "utf8")).toBe("hello");
  });

  it("replaces an existing symlink at the destination with a real copy", async () => {
    const realTarget = path.join(work, "real-target");
    const src = path.join(work, "src");
    const dest = path.join(work, "dest");
    await fs.mkdir(realTarget);
    await fs.writeFile(path.join(realTarget, "OLD.md"), "old", "utf8");
    await fs.mkdir(src);
    await fs.writeFile(path.join(src, "SKILL.md"), "new", "utf8");
    fssync.symlinkSync(realTarget, dest, "dir");

    await materializeSkill(src, dest);

    const stat = await fs.lstat(dest);
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isSymbolicLink()).toBe(false);
    expect(await fs.readFile(path.join(dest, "SKILL.md"), "utf8")).toBe("new");
    // The original symlink target should not be polluted by the copy.
    expect(
      fssync.existsSync(path.join(realTarget, "SKILL.md"))
    ).toBe(false);
  });
});
