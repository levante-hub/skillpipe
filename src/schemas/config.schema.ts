import { z } from "zod";

export const TargetConfigSchema = z.object({
  installPath: z.string(),
  mode: z.enum(["copy", "symlink"]).default("copy")
});

export type TargetConfig = z.infer<typeof TargetConfigSchema>;

export const LocalSecurityConfigSchema = z.object({
  requireValidation: z.boolean().default(true),
  allowDirectMainPush: z.boolean().default(false),
  scanSecrets: z.boolean().default(true)
});

export const LocalAuthConfigSchema = z.object({
  method: z.enum(["gh-cli", "none"]).default("gh-cli")
});

export const LocalConfigSchema = z.object({
  schemaVersion: z.literal("1.0.0").default("1.0.0"),
  defaultRepo: z.string().nullable().default(null),
  defaultBranch: z.string().default("main"),
  defaultTarget: z.string().default("claude-code"),
  auth: LocalAuthConfigSchema.default({ method: "gh-cli" }),
  targets: z
    .record(z.string(), TargetConfigSchema)
    .default({}),
  security: LocalSecurityConfigSchema.default({
    requireValidation: true,
    allowDirectMainPush: false,
    scanSecrets: true
  })
});

export type LocalConfig = z.infer<typeof LocalConfigSchema>;

export function defaultLocalConfig(): LocalConfig {
  return LocalConfigSchema.parse({});
}
