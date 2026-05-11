import { beforeEach, describe, expect, it, vi } from "vitest";
import { runUpdate } from "./update.js";
import { loadLocalConfig } from "../core/config.js";
import { loadLockfile, saveLockfile } from "../core/lockfile.js";
import { loadRepository, listSkills } from "../core/repository.js";
import {
  fetchRepo,
  pullBranch,
  remoteCommit,
  lastCommitForPath,
  checkoutTrackingBranch
} from "../core/git.js";
import { validateSkill } from "../core/validator.js";
import { installSkill } from "../core/sync.js";
import { getConnectedWorkspace } from "./repo-connect.js";
import type { ParsedSkill } from "../core/skill.js";

vi.mock("../core/config.js", () => ({
  loadLocalConfig: vi.fn()
}));
vi.mock("../core/lockfile.js", () => ({
  loadLockfile: vi.fn(),
  saveLockfile: vi.fn()
}));
vi.mock("../core/repository.js", () => ({
  loadRepository: vi.fn(),
  listSkills: vi.fn()
}));
vi.mock("../core/git.js", () => ({
  fetchRepo: vi.fn(),
  pullBranch: vi.fn(),
  remoteCommit: vi.fn(),
  lastCommitForPath: vi.fn(),
  checkoutTrackingBranch: vi.fn()
}));
vi.mock("../core/validator.js", () => ({
  DEFAULT_VALIDATION_OPTIONS: {},
  validateSkill: vi.fn()
}));
vi.mock("../core/sync.js", () => ({
  installSkill: vi.fn()
}));
vi.mock("./repo-connect.js", () => ({
  getConnectedWorkspace: vi.fn()
}));

function makeSkill(name: string): ParsedSkill {
  return {
    metadata: {
      name,
      version: "0.2.0",
      description: "Test skill for update command.",
      tags: [],
      targets: ["levante"]
    },
    body: "# Test\n",
    rawFrontmatter: {
      name,
      version: "0.2.0",
      description: "Test skill for update command.",
      tags: [],
      targets: ["levante"]
    },
    filePath: `/repo/skills/${name}/SKILL.md`,
    folder: `/repo/skills/${name}`,
    folderName: name,
    size: 10
  };
}

describe("runUpdate", () => {
  beforeEach(() => {
    vi.mocked(loadLocalConfig).mockReset();
    vi.mocked(loadLockfile).mockReset();
    vi.mocked(saveLockfile).mockReset();
    vi.mocked(loadRepository).mockReset();
    vi.mocked(listSkills).mockReset();
    vi.mocked(fetchRepo).mockReset();
    vi.mocked(pullBranch).mockReset();
    vi.mocked(remoteCommit).mockReset();
    vi.mocked(lastCommitForPath).mockReset();
    vi.mocked(checkoutTrackingBranch).mockReset();
    vi.mocked(validateSkill).mockReset();
    vi.mocked(installSkill).mockReset();
    vi.mocked(getConnectedWorkspace).mockReset();

    vi.mocked(loadLocalConfig).mockResolvedValue({
      schemaVersion: "1.0.0",
      defaultRepo: null,
      defaultBranch: "main",
      defaultTarget: "levante",
      auth: { method: "gh-cli" },
      targets: {
        levante: { installPath: "/Users/test/levante/skills" }
      },
      security: {
        requireValidation: false,
        allowDirectMainPush: false,
        scanSecrets: false
      }
    });
    vi.mocked(loadRepository).mockResolvedValue({
      config: {
        security: {
          validateBeforeInstall: false,
          scanForSecrets: false
        }
      }
    });
    vi.mocked(fetchRepo).mockResolvedValue(undefined);
    vi.mocked(checkoutTrackingBranch).mockResolvedValue(undefined);
    vi.mocked(pullBranch).mockResolvedValue(undefined);
    vi.mocked(remoteCommit).mockResolvedValue("remote123");
    vi.mocked(getConnectedWorkspace).mockResolvedValue({
      workspace: "/repo",
      repoFullName: "levante-hub/skills"
    });
  });

  it("errors on update --all when a dual-scope target would install a new skill without scope", async () => {
    vi.mocked(loadLockfile).mockResolvedValue({
      schemaVersion: "1.0.0",
      repo: "levante-hub/skills",
      branch: "main",
      remoteCommit: null,
      updatedAt: "2026-05-12T00:00:00.000Z",
      skills: {}
    });
    vi.mocked(listSkills).mockResolvedValue([makeSkill("plane-compose")]);

    await expect(runUpdate({ all: true })).rejects.toThrow(
      /supports both global and project scopes/i
    );
  });

  it("updates already-installed Levante skills without requiring scope", async () => {
    const skill = makeSkill("twenty");
    vi.mocked(loadLockfile).mockResolvedValue({
      schemaVersion: "1.0.0",
      repo: "levante-hub/skills",
      branch: "main",
      remoteCommit: null,
      updatedAt: "2026-05-12T00:00:00.000Z",
      skills: {
        twenty: {
          version: "0.1.0",
          commit: "old123",
          target: "levante",
          installPath: "/tmp/installed/skills",
          path: "/tmp/installed/skills/twenty",
          installedAt: "2026-05-11T00:00:00.000Z"
        }
      }
    });
    vi.mocked(listSkills).mockResolvedValue([skill]);
    vi.mocked(lastCommitForPath).mockResolvedValue("new456");
    vi.mocked(installSkill).mockResolvedValue("/tmp/installed/skills/twenty");

    await runUpdate();

    expect(installSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        installPath: "/tmp/installed/skills"
      })
    );
    expect(saveLockfile).toHaveBeenCalled();
  });
});
