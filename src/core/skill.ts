import path from "node:path";
import matter from "gray-matter";
import { readText, pathExists, fileSize } from "../utils/fs.js";
import {
  SkillMetadata,
  SkillMetadataSchema
} from "../schemas/skill.schema.js";
import { SkillpipeError } from "../utils/errors.js";

export interface ParsedSkill {
  metadata: SkillMetadata;
  body: string;
  rawFrontmatter: Record<string, unknown>;
  filePath: string;
  folder: string;
  folderName: string;
  size: number;
}

export async function parseSkill(skillFolder: string): Promise<ParsedSkill> {
  const skillFile = path.join(skillFolder, "SKILL.md");
  if (!(await pathExists(skillFile))) {
    throw new SkillpipeError(
      "SKILL_INVALID",
      `Missing SKILL.md in ${skillFolder}`
    );
  }
  const raw = await readText(skillFile);
  const parsed = matter(raw);
  const result = SkillMetadataSchema.safeParse(parsed.data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "frontmatter"}: ${i.message}`)
      .join("; ");
    throw new SkillpipeError(
      "SKILL_INVALID",
      `Invalid frontmatter in ${skillFile}: ${issues}`
    );
  }
  const size = await fileSize(skillFile);
  return {
    metadata: result.data,
    body: parsed.content,
    rawFrontmatter: parsed.data,
    filePath: skillFile,
    folder: skillFolder,
    folderName: path.basename(skillFolder),
    size
  };
}
