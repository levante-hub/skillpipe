export type SkillSyncErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "REPO_NOT_CONNECTED"
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
  | "UNKNOWN";

export class SkillSyncError extends Error {
  readonly code: SkillSyncErrorCode;
  readonly hint?: string;

  constructor(code: SkillSyncErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "SkillSyncError";
    this.code = code;
    this.hint = hint;
  }
}

export function isSkillSyncError(e: unknown): e is SkillSyncError {
  return e instanceof SkillSyncError;
}
