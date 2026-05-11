import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadLocalConfig } from "./config.js";

async function makeTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skillpipe-config-"));
  process.env.SKILLPIPE_HOME = dir;
  return dir;
}

async function writeConfig(home: string, raw: unknown): Promise<void> {
  await fs.writeFile(
    path.join(home, "config.json"),
    JSON.stringify(raw, null, 2),
    "utf8"
  );
}

async function readConfig(home: string): Promise<unknown> {
  const text = await fs.readFile(path.join(home, "config.json"), "utf8");
  return JSON.parse(text);
}

describe("loadLocalConfig — legacy mode migration", () => {
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

  it("strips legacy `mode` from targets and rewrites the file", async () => {
    await writeConfig(home, {
      schemaVersion: "1.0.0",
      defaultRepo: null,
      defaultBranch: "main",
      defaultTarget: "claude-code",
      auth: { method: "gh-cli" },
      targets: {
        "claude-code": { installPath: "/tmp/skills", mode: "symlink" }
      },
      security: {
        requireValidation: true,
        allowDirectMainPush: false,
        scanSecrets: true
      }
    });

    const cfg = await loadLocalConfig();
    expect(cfg.targets["claude-code"]).toEqual({ installPath: "/tmp/skills" });

    const raw = (await readConfig(home)) as {
      targets: Record<string, Record<string, unknown>>;
    };
    expect(raw.targets["claude-code"]).toEqual({ installPath: "/tmp/skills" });
    expect("mode" in raw.targets["claude-code"]!).toBe(false);
  });

  it("does not rewrite the file when no legacy mode is present", async () => {
    await writeConfig(home, {
      schemaVersion: "1.0.0",
      defaultRepo: null,
      defaultBranch: "main",
      defaultTarget: "claude-code",
      auth: { method: "gh-cli" },
      targets: {
        "claude-code": { installPath: "/tmp/skills" }
      },
      security: {
        requireValidation: true,
        allowDirectMainPush: false,
        scanSecrets: true
      }
    });

    const before = (await fs.stat(path.join(home, "config.json"))).mtimeMs;
    // tick to make the timestamps differ if we rewrite
    await new Promise((r) => setTimeout(r, 20));

    await loadLocalConfig();

    const after = (await fs.stat(path.join(home, "config.json"))).mtimeMs;
    expect(after).toBe(before);
  });
});
