import { run, which, requireBinary } from "../utils/shell.js";
import { SkillpipeError } from "../utils/errors.js";

export async function ghAvailable(): Promise<boolean> {
  return which("gh");
}

export async function ensureGhAvailable(): Promise<void> {
  await requireBinary(
    "gh",
    "GH_NOT_AVAILABLE",
    "Install GitHub CLI from https://cli.github.com/"
  );
}

export async function ghAuthStatus(): Promise<{
  authenticated: boolean;
  details: string;
}> {
  if (!(await ghAvailable())) {
    return { authenticated: false, details: "gh CLI is not installed" };
  }
  const r = await run("gh", ["auth", "status"]);
  return {
    authenticated: r.exitCode === 0,
    details: (r.stdout + r.stderr).trim()
  };
}

export async function requireGhAuth(): Promise<void> {
  await ensureGhAvailable();
  const status = await ghAuthStatus();
  if (!status.authenticated) {
    throw new SkillpipeError(
      "GH_NOT_AUTHENTICATED",
      "GitHub CLI is not authenticated.",
      "Run `gh auth login` and try again."
    );
  }
}

export interface CreateRepoOptions {
  name: string;
  visibility: "public" | "private";
  description?: string;
  ownerLogin?: string;
}

export async function ghCreateRepo(
  opts: CreateRepoOptions
): Promise<string> {
  await requireGhAuth();
  const fullName = opts.ownerLogin
    ? `${opts.ownerLogin}/${opts.name}`
    : opts.name;
  const args = [
    "repo",
    "create",
    fullName,
    `--${opts.visibility}`,
    "--confirm"
  ];
  if (opts.description) {
    args.push("--description", opts.description);
  }
  const r = await run("gh", args);
  if (r.exitCode !== 0) {
    throw new SkillpipeError(
      "GIT_OPERATION_FAILED",
      `gh repo create failed: ${r.stderr.trim() || r.stdout.trim()}`
    );
  }
  return r.stdout.trim();
}

export interface CreatePrOptions {
  cwd: string;
  title: string;
  body: string;
  base?: string;
  head?: string;
  draft?: boolean;
}

export async function ghCreatePr(
  opts: CreatePrOptions
): Promise<string> {
  await requireGhAuth();
  const args = ["pr", "create", "--title", opts.title, "--body", opts.body];
  if (opts.base) args.push("--base", opts.base);
  if (opts.head) args.push("--head", opts.head);
  if (opts.draft) args.push("--draft");
  const r = await run("gh", args, { cwd: opts.cwd });
  if (r.exitCode !== 0) {
    throw new SkillpipeError(
      "GIT_OPERATION_FAILED",
      `gh pr create failed: ${r.stderr.trim() || r.stdout.trim()}`,
      "Make sure the branch is pushed and you have permission to open PRs."
    );
  }
  const url = r.stdout.trim().split("\n").pop() ?? "";
  return url;
}

export async function ghCurrentUser(): Promise<string | null> {
  if (!(await ghAvailable())) return null;
  const r = await run("gh", ["api", "user", "--jq", ".login"]);
  if (r.exitCode !== 0) return null;
  return r.stdout.trim() || null;
}

export interface CreateIssueOptions {
  repo: string; // "owner/name"
  title: string;
  body: string;
}

export interface TryAddIssueLabelsOptions {
  repo: string; // "owner/name"
  issue: string; // issue URL returned by gh issue create
  labels: string[];
}

export interface AddIssueLabelsResult {
  applied: boolean;
  error?: string;
}

export async function ghCreateIssue(opts: CreateIssueOptions): Promise<string> {
  await requireGhAuth();
  const args = [
    "issue",
    "create",
    "--repo",
    opts.repo,
    "--title",
    opts.title,
    "--body",
    opts.body
  ];
  const r = await run("gh", args);
  if (r.exitCode !== 0) {
    throw new SkillpipeError(
      "ISSUE_CREATE_FAILED",
      `gh issue create failed: ${r.stderr.trim() || r.stdout.trim()}`,
      "Verify the destination repo exists and the authenticated GitHub user can open issues there."
    );
  }
  const url = r.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  if (!url || !url.startsWith("http")) {
    throw new SkillpipeError(
      "ISSUE_CREATE_FAILED",
      `gh issue create succeeded but no URL was returned. Raw stdout: ${r.stdout.trim()}`
    );
  }
  return url;
}

export async function ghTryAddIssueLabels(
  opts: TryAddIssueLabelsOptions
): Promise<AddIssueLabelsResult> {
  if (opts.labels.length === 0) {
    return { applied: true };
  }
  const r = await run("gh", [
    "issue",
    "edit",
    opts.issue,
    "--repo",
    opts.repo,
    "--add-label",
    opts.labels.join(",")
  ]);
  if (r.exitCode !== 0) {
    return {
      applied: false,
      error: r.stderr.trim() || r.stdout.trim() || "gh issue edit failed"
    };
  }
  return { applied: true };
}
