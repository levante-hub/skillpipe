import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runValidate } from "./validate.js";

async function writeRepoFiles(workspace: string): Promise<void> {
  await fs.mkdir(workspace, { recursive: true });
  await fs.writeFile(
    path.join(workspace, "skillpipe.json"),
    JSON.stringify({
      name: "test-repo",
      defaultBranch: "main",
      skillsPath: "skills",
      supportedTargets: ["claude-code"]
    }),
    "utf8"
  );
  await fs.mkdir(path.join(workspace, "skills"), { recursive: true });
}

async function writeConfig(
  home: string,
  installPath: string
): Promise<void> {
  await fs.writeFile(
    path.join(home, "config.json"),
    JSON.stringify({
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
    }),
    "utf8"
  );
}

function skillBody(name: string): string {
  return `---
name: ${name}
version: 0.1.0
description: A short test skill for validate command.
tags: []
targets:
  - claude-code
---

# Test skill

## Goal

Verify validate works for install-path-only skills.

## When to use this skill

Never; this is a test fixture.

## Instructions

1. Do nothing.

## Output format

Plain text.
`;
}

describe("runValidate", () => {
  let home: string;
  let workspace: string;
  let installPath: string;
  const originalHome = process.env.SKILLPIPE_HOME;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), "skillpipe-validate-"));
    workspace = path.join(home, "workspace");
    installPath = path.join(home, "skills");
    await fs.mkdir(installPath);
    await writeRepoFiles(workspace);
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

  it("validates a skill that lives only at the configured install path", async () => {
    const folder = path.join(installPath, "local-only");
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, "SKILL.md"), skillBody("local-only"), "utf8");

    const result = await runValidate({ name: "local-only", repoPath: workspace });
    expect(result.failed).toBe(0);
  });

  it("walks the repository when no name is given", async () => {
    const folder = path.join(workspace, "skills", "in-repo");
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, "SKILL.md"), skillBody("in-repo"), "utf8");

    const result = await runValidate({ repoPath: workspace });
    expect(result.failed).toBe(0);
  });

  it("errors when the skill is not in the repo nor any install path", async () => {
    await expect(
      runValidate({ name: "missing", repoPath: workspace })
    ).rejects.toThrow(/not found/i);
  });
});
