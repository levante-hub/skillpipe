import { z } from "zod";

export const SkillSyncRepoSecuritySchema = z.object({
  allowDirectPush: z.boolean().default(false),
  requirePullRequest: z.boolean().default(true),
  scanForSecrets: z.boolean().default(true),
  validateBeforeInstall: z.boolean().default(true)
});

export const SkillSyncRepoConfigSchema = z.object({
  name: z.string().min(1),
  version: z.string().default("0.1.0"),
  description: z.string().optional(),
  defaultBranch: z.string().default("main"),
  schemaVersion: z.string().default("1.0.0"),
  skillsPath: z.string().default("skills"),
  agentsPath: z.string().default("agents"),
  workflowsPath: z.string().default("workflows"),
  supportedTargets: z.array(z.string()).default(["claude-code"]),
  security: SkillSyncRepoSecuritySchema.default({
    allowDirectPush: false,
    requirePullRequest: true,
    scanForSecrets: true,
    validateBeforeInstall: true
  })
});

export type SkillSyncRepoConfig = z.infer<typeof SkillSyncRepoConfigSchema>;

export function defaultSkillSyncRepoConfig(
  name: string
): SkillSyncRepoConfig {
  return SkillSyncRepoConfigSchema.parse({
    name,
    version: "0.1.0",
    description: `${name} — agent skills repository managed by SkillSync.`,
    defaultBranch: "main",
    schemaVersion: "1.0.0",
    skillsPath: "skills",
    agentsPath: "agents",
    workflowsPath: "workflows",
    supportedTargets: ["claude-code"]
  });
}
