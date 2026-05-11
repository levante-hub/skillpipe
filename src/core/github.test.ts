import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ghCreateIssue,
  ghTryAddIssueLabels
} from "./github.js";
import { SkillpipeError } from "../utils/errors.js";
import { requireBinary, run, which } from "../utils/shell.js";

vi.mock("../utils/shell.js", () => ({
  run: vi.fn(),
  which: vi.fn(),
  requireBinary: vi.fn()
}));

describe("github issue helpers", () => {
  beforeEach(() => {
    vi.mocked(run).mockReset();
    vi.mocked(which).mockReset();
    vi.mocked(requireBinary).mockReset();

    vi.mocked(which).mockResolvedValue(true);
    vi.mocked(requireBinary).mockResolvedValue(undefined);
  });

  it("parses the created issue URL from gh output", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: 0
      })
      .mockResolvedValueOnce({
        stdout: "https://github.com/levante-hub/skillpipe/issues/12\n",
        stderr: "",
        exitCode: 0
      });

    const url = await ghCreateIssue({
      repo: "levante-hub/skillpipe",
      title: "[agent-report] Failure",
      body: "## Summary\n\nBroken"
    });

    expect(url).toBe("https://github.com/levante-hub/skillpipe/issues/12");
  });

  it("throws ISSUE_CREATE_FAILED when gh issue create fails", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: 0
      })
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "GraphQL: could not resolve to a Repository",
        exitCode: 1
      });

    await expect(
      ghCreateIssue({
        repo: "levante-hub/skillpipe",
        title: "[agent-report] Failure",
        body: "## Summary\n\nBroken"
      })
    ).rejects.toMatchObject<Partial<SkillpipeError>>({
      code: "ISSUE_CREATE_FAILED"
    });
  });

  it("returns a non-fatal result when label application fails", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: "",
      stderr: "could not add label: 'agent-report' not found",
      exitCode: 1
    });

    await expect(
      ghTryAddIssueLabels({
        repo: "levante-hub/skillpipe",
        issue: "https://github.com/levante-hub/skillpipe/issues/12",
        labels: ["agent-report", "bug"]
      })
    ).resolves.toEqual({
      applied: false,
      error: "could not add label: 'agent-report' not found"
    });
  });

  it("returns success immediately when there are no labels to apply", async () => {
    await expect(
      ghTryAddIssueLabels({
        repo: "levante-hub/skillpipe",
        issue: "https://github.com/levante-hub/skillpipe/issues/12",
        labels: []
      })
    ).resolves.toEqual({ applied: true });
  });
});
