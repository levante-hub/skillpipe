export type SkillpipeErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "REPO_NOT_CONNECTED"
  | "REPO_ALREADY_CONNECTED"
  | "REPO_NOT_FOUND"
  | "REPO_CLONE_FAILED"
  | "REPO_REMOTE_MISMATCH"
  | "SKILL_NOT_FOUND"
  | "SKILL_INVALID"
  | "VALIDATION_FAILED"
  | "SECRET_DETECTED"
  | "TARGET_UNKNOWN"
  | "TARGET_NOT_INSTALLED"
  | "GH_NOT_AVAILABLE"
  | "GH_NOT_AUTHENTICATED"
  | "GIT_NOT_AVAILABLE"
  | "GIT_OPERATION_FAILED"
  | "WORKSPACE_DIRTY"
  | "LOCKFILE_INVALID"
  | "USER_ABORTED"
  | "INIT_NOT_INTERACTIVE"
  | "UNKNOWN";

export class SkillpipeError extends Error {
  readonly code: SkillpipeErrorCode;
  readonly hint?: string;

  constructor(code: SkillpipeErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "SkillpipeError";
    this.code = code;
    this.hint = hint;
  }
}

export function isSkillpipeError(e: unknown): e is SkillpipeError {
  return e instanceof SkillpipeError;
}
