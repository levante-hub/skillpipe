import { beforeEach, describe, expect, it, vi } from "vitest";

import { pullBranch } from "./git.js";
import { run, requireBinary } from "../utils/shell.js";

vi.mock("../utils/shell.js", () => ({
  run: vi.fn(),
  requireBinary: vi.fn()
}));

describe("pullBranch", () => {
  beforeEach(() => {
    vi.mocked(run).mockReset();
    vi.mocked(requireBinary).mockReset();
    vi.mocked(requireBinary).mockResolvedValue(undefined);
  });

  it("fast-forwards the local branch from the fetched tracking ref", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: "Updating 6f5b385..d00df85",
      stderr: "",
      exitCode: 0
    });

    await pullBranch("/repo", "main");

    expect(run).toHaveBeenCalledWith(
      "git",
      ["merge", "--ff-only", "origin/main"],
      { cwd: "/repo" }
    );
  });

  it("surfaces a local-state hint when fast-forward is blocked", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: "",
      stderr: "fatal: Not possible to fast-forward, aborting.",
      exitCode: 128
    });

    await expect(pullBranch("/repo", "main")).rejects.toMatchObject({
      code: "GIT_OPERATION_FAILED",
      message: expect.stringContaining(
        "Failed to fast-forward main to origin/main"
      ),
      hint: expect.stringContaining(
        "Local changes are blocking the update"
      )
    });
  });

  it("suggests ref validation when the tracking branch is unavailable", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: "",
      stderr: "merge: origin/main - not something we can merge",
      exitCode: 1
    });

    await expect(pullBranch("/repo", "main")).rejects.toMatchObject({
      code: "GIT_OPERATION_FAILED",
      hint: expect.stringContaining("git fetch --all --prune")
    });
  });
});
