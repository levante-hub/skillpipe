import { z } from "zod";

export const InstalledSkillSchema = z.object({
  version: z.string(),
  commit: z.string(),
  target: z.string(),
  installPath: z.string(),
  path: z.string(),
  mode: z.enum(["copy", "symlink"]).default("copy"),
  installedAt: z.string()
});

export type InstalledSkill = z.infer<typeof InstalledSkillSchema>;

export const LockfileSchema = z.object({
  schemaVersion: z.literal("1.0.0").default("1.0.0"),
  repo: z.string().nullable().default(null),
  branch: z.string().default("main"),
  remoteCommit: z.string().nullable().default(null),
  updatedAt: z.string().default(() => new Date().toISOString()),
  skills: z.record(z.string(), InstalledSkillSchema).default({})
});

export type Lockfile = z.infer<typeof LockfileSchema>;

export function emptyLockfile(): Lockfile {
  return LockfileSchema.parse({});
}
