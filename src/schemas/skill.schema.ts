import { z } from "zod";

export const SkillMetadataSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9][a-z0-9-_]*$/,
      "Skill name must be lowercase, may contain digits, '-' and '_'"
    ),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "Version must be semver (e.g. 0.1.0)")
    .default("0.1.0"),
  description: z.string().min(1).max(500),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  targets: z.array(z.string()).default([])
});

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;
