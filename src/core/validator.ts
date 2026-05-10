import path from "node:path";
import { ParsedSkill } from "./skill.js";
import { findFiles, readText, fileSize } from "../utils/fs.js";
import {
  scanForSecrets,
  scanForDangerousPatterns,
  type SecretFinding,
  type DangerousFinding
} from "./secrets.js";

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  file?: string;
  line?: number;
}

export interface ValidationReport {
  skill: string;
  ok: boolean;
  issues: ValidationIssue[];
}

export interface ValidationOptions {
  scanSecrets: boolean;
  maxSkillBytes: number;
  maxFileBytes: number;
}

export const DEFAULT_VALIDATION_OPTIONS: ValidationOptions = {
  scanSecrets: true,
  maxSkillBytes: 5 * 1024 * 1024,
  maxFileBytes: 1 * 1024 * 1024
};

export async function validateSkill(
  skill: ParsedSkill,
  opts: ValidationOptions = DEFAULT_VALIDATION_OPTIONS
): Promise<ValidationReport> {
  const issues: ValidationIssue[] = [];

  if (skill.metadata.name !== skill.folderName) {
    issues.push({
      level: "error",
      code: "NAME_MISMATCH",
      message: `Skill name "${skill.metadata.name}" does not match folder "${skill.folderName}"`,
      file: skill.filePath
    });
  }

  if (skill.metadata.description.trim().length < 10) {
    issues.push({
      level: "warning",
      code: "DESCRIPTION_TOO_SHORT",
      message: "Description is suspiciously short. Consider expanding it.",
      file: skill.filePath
    });
  }

  if (skill.body.trim().length === 0) {
    issues.push({
      level: "error",
      code: "EMPTY_BODY",
      message: "SKILL.md has no body content after the frontmatter.",
      file: skill.filePath
    });
  }

  const allFiles = await findFiles(["**/*"], skill.folder);
  let totalBytes = 0;
  for (const rel of allFiles) {
    const abs = path.join(skill.folder, rel);
    const size = await fileSize(abs);
    totalBytes += size;
    if (size > opts.maxFileBytes) {
      issues.push({
        level: "warning",
        code: "FILE_TOO_LARGE",
        message: `File ${rel} is ${(size / 1024).toFixed(1)} KB, larger than recommended ${
          opts.maxFileBytes / 1024
        } KB`,
        file: abs
      });
    }
  }
  if (totalBytes > opts.maxSkillBytes) {
    issues.push({
      level: "warning",
      code: "SKILL_TOO_LARGE",
      message: `Skill total size is ${(totalBytes / 1024).toFixed(1)} KB`
    });
  }

  if (opts.scanSecrets) {
    const textFiles = allFiles.filter((rel) => isTextFile(rel));
    for (const rel of textFiles) {
      const abs = path.join(skill.folder, rel);
      const content = await readText(abs);
      pushSecretFindings(issues, abs, scanForSecrets(content));
      pushDangerousFindings(issues, abs, scanForDangerousPatterns(content));
    }
  }

  const hasError = issues.some((i) => i.level === "error");
  const hasSecret = issues.some((i) => i.code === "SECRET_DETECTED");

  return {
    skill: skill.metadata.name,
    ok: !hasError && !hasSecret,
    issues
  };
}

function pushSecretFindings(
  issues: ValidationIssue[],
  file: string,
  findings: SecretFinding[]
): void {
  for (const f of findings) {
    issues.push({
      level: "error",
      code: "SECRET_DETECTED",
      message: `${f.description} detected: ${f.excerpt}`,
      file,
      line: f.line
    });
  }
}

function pushDangerousFindings(
  issues: ValidationIssue[],
  file: string,
  findings: DangerousFinding[]
): void {
  for (const f of findings) {
    issues.push({
      level: "warning",
      code: "DANGEROUS_PATTERN",
      message: `Suspicious pattern "${f.pattern}": ${f.excerpt}`,
      file,
      line: f.line
    });
  }
}

function isTextFile(rel: string): boolean {
  const ext = path.extname(rel).toLowerCase();
  const allow = [
    ".md",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".js",
    ".ts",
    ".py",
    ".sh",
    ".toml",
    ".ini",
    ".cfg",
    ""
  ];
  return allow.includes(ext);
}
