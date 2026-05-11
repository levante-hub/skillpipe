import { beforeEach, describe, expect, it, vi } from "vitest";
import { runInstall } from "./install.js";
import { loadLocalConfig } from "../core/config.js";
import { loadLockfile, saveLockfile } from "../core/lockfile.js";
import {
  loadRepository,
  findSkill
} from "../core/repository.js";
import {
  fetchRepo,
  pullBranch,
  remoteCommit,
  checkoutTrackingBranch
} from "../core/git.js";
import { validateSkill } from "../core/validator.js";
import { installSkill } from "../core/sync.js";
import { getConnectedWorkspace } from "./repo-connect.js";
import { defaultLevanteProjectSkillsPath } from "../core/paths.js";
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
  findSkill: vi.fn(),
  listSkills: vi.fn()
}));
vi.mock("../core/git.js", () => ({
  fetchRepo: vi.fn(),
  pullBranch: vi.fn(),
  remoteCommit: vi.fn(),
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
      version: "0.1.0",
      description: "Test skill for install command.",
      tags: [],
      targets: ["levante"]
    },
    body: "# Test\n",
    rawFrontmatter: {
      name,
      version: "0.1.0",
      description: "Test skill for install command.",
      tags: [],
      targets: ["levante"]
    },
    filePath: `/repo/skills/${name}/SKILL.md`,
    folder: `/repo/skills/${name}`,
    folderName: name,
    size: 10
  };
}

describe("runInstall", () => {
  beforeEach(() => {
    vi.mocked(loadLocalConfig).mockReset();
    vi.mocked(loadLockfile).mockReset();
    vi.mocked(saveLockfile).mockReset();
    vi.mocked(loadRepository).mockReset();
    vi.mocked(findSkill).mockReset();
    vi.mocked(fetchRepo).mockReset();
    vi.mocked(pullBranch).mockReset();
    vi.mocked(remoteCommit).mockReset();
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
        levante: { installPath: "/Users/test/.levante/skills" }
      },
      security: {
        requireValidation: false,
        allowDirectMainPush: false,
        scanSecrets: false
      }
    });
    vi.mocked(getConnectedWorkspace).mockResolvedValue({
      workspace: "/repo",
      repoFullName: "levante-hub/skills"
    });
  });

  it("errors when a dual-scope target is used without --scope or --path", async () => {
    await expect(
      runInstall({ name: "plane-compose", target: "levante" })
    ).rejects.toThrow(/supports both global and project scopes/i);

    expect(fetchRepo).not.toHaveBeenCalled();
  });

  it("accepts an explicit scope for Levante installs", async () => {
    const skill = makeSkill("scope-install-check");
    vi.mocked(loadLockfile).mockResolvedValue({
      schemaVersion: "1.0.0",
      repo: "levante-hub/skills",
      branch: "main",
      remoteCommit: null,
      updatedAt: "2026-05-12T00:00:00.000Z",
      skills: {}
    });
    vi.mocked(loadRepository).mockResolvedValue({
      config: {
        security: {
          validateBeforeInstall: false,
          scanForSecrets: false
        }
      }
    });
    vi.mocked(findSkill).mockResolvedValue(skill);
    vi.mocked(fetchRepo).mockResolvedValue(undefined);
    vi.mocked(checkoutTrackingBranch).mockResolvedValue(undefined);
    vi.mocked(pullBranch).mockResolvedValue(undefined);
    vi.mocked(remoteCommit).mockResolvedValue("abc1234");
    vi.mocked(installSkill).mockResolvedValue(defaultLevanteProjectSkillsPath());

    await runInstall({
      name: skill.metadata.name,
      target: "levante",
      scope: "project"
    });

    expect(installSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        installPath: defaultLevanteProjectSkillsPath()
      })
    );
  });
});
