import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SkillpipeError } from "../utils/errors.js";
import { ghCreateIssue, ghTryAddIssueLabels } from "../core/github.js";

const DEFAULT_ISSUE_REPO = "levante-hub/skillpipe";
const DEFAULT_LABELS = ["agent-report", "bug"] as const;
const TITLE_PREFIX = "[agent-report]";

export type ReportIssueSeverity = "low" | "medium" | "high";

const VALID_SEVERITIES = new Set<ReportIssueSeverity>([
  "low",
  "medium",
  "high"
]);

export interface ReportIssueOptions {
  title: string;
  summary: string;
  command?: string;
  error?: string;
  expected?: string;
  actual?: string;
  severity?: string;
  labels?: string;
}

export async function runReportIssue(opts: ReportIssueOptions): Promise<void> {
  validateReportIssueOptions(opts);

  const severity = normalizeSeverity(opts.severity);
  const repo = resolveIssueRepo(process.env.SKILLPIPE_ISSUE_REPO);
  const title = formatReportIssueTitle(opts.title);
  const labels = buildIssueLabels(opts.labels, severity);
  const body = renderReportIssueBody(opts, labels);

  const url = await ghCreateIssue({ repo, title, body });
  const labelResult = await ghTryAddIssueLabels({
    repo,
    issue: url,
    labels
  });

  if (!labelResult.applied) {
    writeStderrLine(
      `warning: issue created, but labels could not be applied automatically: ${labelResult.error}`
    );
  }

  process.stdout.write(url + "\n");
}

export function validateReportIssueOptions(opts: ReportIssueOptions): void {
  if (!opts.title || !opts.title.trim()) {
    throw new SkillpipeError(
      "VALIDATION_FAILED",
      "--title is required and cannot be empty."
    );
  }
  if (!opts.summary || !opts.summary.trim()) {
    throw new SkillpipeError(
      "VALIDATION_FAILED",
      "--summary is required and cannot be empty."
    );
  }

  const rawSeverity = opts.severity?.trim();
  if (rawSeverity && !normalizeSeverity(rawSeverity)) {
    throw new SkillpipeError(
      "VALIDATION_FAILED",
      `Invalid --severity "${opts.severity}". Use one of: low, medium, high.`
    );
  }
}

export function formatReportIssueTitle(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith(TITLE_PREFIX)
    ? trimmed
    : `${TITLE_PREFIX} ${trimmed}`;
}

export function buildIssueLabels(
  extra: string | undefined,
  severity?: ReportIssueSeverity
): string[] {
  const extraLabels = (extra ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const severityLabels = severity ? [`severity:${severity}`] : [];
  return Array.from(
    new Set([...DEFAULT_LABELS, ...severityLabels, ...extraLabels])
  );
}

export function renderReportIssueBody(
  opts: ReportIssueOptions,
  labels: string[]
): string {
  const meta = collectMetadata();
  const severity = normalizeSeverity(opts.severity);
  const sections: string[] = [];

  sections.push(`## Summary\n\n${opts.summary.trim()}`);

  if (opts.command && opts.command.trim()) {
    sections.push(
      "## Reproduction\n\n```sh\n" + opts.command.trim() + "\n```"
    );
  }
  if (opts.expected && opts.expected.trim()) {
    sections.push(`## Expected behavior\n\n${opts.expected.trim()}`);
  }
  if (opts.actual && opts.actual.trim()) {
    sections.push(`## Actual behavior\n\n${opts.actual.trim()}`);
  }
  if (opts.error && opts.error.trim()) {
    sections.push("## Error output\n\n```\n" + opts.error.trim() + "\n```");
  }
  if (severity) {
    sections.push(`## Severity\n\n${severity}`);
  }

  sections.push(
    ["## Requested labels", "", ...labels.map((label) => `- \`${label}\``)].join(
      "\n"
    )
  );

  sections.push(
    [
      "## Environment",
      "",
      `- skillpipe: ${meta.cliVersion}`,
      `- node: ${meta.nodeVersion}`,
      `- platform: ${meta.platform} (${meta.arch})`,
      `- os release: ${meta.osRelease}`
    ].join("\n")
  );

  sections.push(
    "---\n_Filed automatically by an AI agent via `skillpipe report-issue`._"
  );

  return sections.join("\n\n");
}

interface Metadata {
  cliVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  osRelease: string;
}

function collectMetadata(): Metadata {
  return {
    cliVersion: readCliVersion(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release()
  };
}

function readCliVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

function resolveIssueRepo(raw: string | undefined): string {
  return raw?.trim() || DEFAULT_ISSUE_REPO;
}

function normalizeSeverity(
  raw: string | undefined
): ReportIssueSeverity | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  if (!VALID_SEVERITIES.has(value as ReportIssueSeverity)) {
    return undefined;
  }
  return value as ReportIssueSeverity;
}

function writeStderrLine(message: string): void {
  process.stderr.write(message + "\n");
}
