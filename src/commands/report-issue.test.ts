import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildIssueLabels,
  formatReportIssueTitle,
  renderReportIssueBody,
  runReportIssue,
  validateReportIssueOptions
} from "./report-issue.js";
import { ghCreateIssue, ghTryAddIssueLabels } from "../core/github.js";

vi.mock("../core/github.js", () => ({
  ghCreateIssue: vi.fn(),
  ghTryAddIssueLabels: vi.fn()
}));

describe("report-issue command", () => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  beforeEach(() => {
    stdout.length = 0;
    stderr.length = 0;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderr.push(String(chunk));
      return true;
    });
    vi.mocked(ghCreateIssue).mockReset();
    vi.mocked(ghTryAddIssueLabels).mockReset();
    delete process.env.SKILLPIPE_ISSUE_REPO;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SKILLPIPE_ISSUE_REPO;
  });

  it("validates severity values", () => {
    expect(() =>
      validateReportIssueOptions({
        title: "x",
        summary: "y",
        severity: "urgent"
      })
    ).toThrow('Invalid --severity "urgent". Use one of: low, medium, high.');

    expect(() =>
      validateReportIssueOptions({
        title: "x",
        summary: "y",
        severity: "Medium"
      })
    ).not.toThrow();
  });

  it("formats the title with a stable prefix", () => {
    expect(formatReportIssueTitle("Issue title")).toBe(
      "[agent-report] Issue title"
    );
    expect(formatReportIssueTitle("[agent-report] Issue title")).toBe(
      "[agent-report] Issue title"
    );
  });

  it("builds labels with defaults, severity and dedupe", () => {
    expect(buildIssueLabels("bug, cli , agent-report,cli", "high")).toEqual([
      "agent-report",
      "bug",
      "severity:high",
      "cli"
    ]);
  });

  it("renders a compact body with optional sections", () => {
    const body = renderReportIssueBody(
      {
        title: "Failure",
        summary: "Something broke",
        command: "skillpipe install foo",
        expected: "Command succeeds",
        actual: "Command aborts",
        error: "Error: ENOENT",
        severity: "High"
      },
      ["agent-report", "bug", "severity:high", "cli"]
    );

    expect(body).toContain("## Summary");
    expect(body).toContain("## Reproduction");
    expect(body).toContain("```sh");
    expect(body).toContain("## Expected behavior");
    expect(body).toContain("## Actual behavior");
    expect(body).toContain("## Error output");
    expect(body).toContain("## Severity");
    expect(body).toContain("## Requested labels");
    expect(body).toContain("- `severity:high`");
    expect(body).toContain("## Environment");
  });

  it("omits optional sections when they are not provided", () => {
    const body = renderReportIssueBody(
      {
        title: "Failure",
        summary: "Minimal reproduction"
      },
      ["agent-report", "bug"]
    );

    expect(body).not.toContain("## Reproduction");
    expect(body).not.toContain("## Expected behavior");
    expect(body).not.toContain("## Actual behavior");
    expect(body).not.toContain("## Error output");
    expect(body).not.toContain("## Severity");
    expect(body).toContain("## Requested labels");
  });

  it("prints only the issue URL to stdout on success", async () => {
    vi.mocked(ghCreateIssue).mockResolvedValue(
      "https://github.com/levante-hub/skillpipe/issues/123"
    );
    vi.mocked(ghTryAddIssueLabels).mockResolvedValue({ applied: true });

    await runReportIssue({
      title: "Failure",
      summary: "Something broke",
      severity: "medium",
      labels: "cli"
    });

    expect(stdout.join("")).toBe(
      "https://github.com/levante-hub/skillpipe/issues/123\n"
    );
    expect(stderr.join("")).toBe("");
    expect(ghCreateIssue).toHaveBeenCalledWith({
      repo: "levante-hub/skillpipe",
      title: "[agent-report] Failure",
      body: expect.stringContaining("## Summary")
    });
    expect(ghTryAddIssueLabels).toHaveBeenCalledWith({
      repo: "levante-hub/skillpipe",
      issue: "https://github.com/levante-hub/skillpipe/issues/123",
      labels: ["agent-report", "bug", "severity:medium", "cli"]
    });
  });

  it("warns on stderr when labels cannot be applied, but still succeeds", async () => {
    process.env.SKILLPIPE_ISSUE_REPO = "someone/sandbox";

    vi.mocked(ghCreateIssue).mockResolvedValue(
      "https://github.com/someone/sandbox/issues/9"
    );
    vi.mocked(ghTryAddIssueLabels).mockResolvedValue({
      applied: false,
      error: "could not add label: 'agent-report' not found"
    });

    await runReportIssue({
      title: "Failure",
      summary: "Something broke"
    });

    expect(stdout.join("")).toBe(
      "https://github.com/someone/sandbox/issues/9\n"
    );
    expect(stderr.join("")).toContain(
      "warning: issue created, but labels could not be applied automatically:"
    );
  });
});
