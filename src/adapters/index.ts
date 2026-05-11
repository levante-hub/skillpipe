import { SkillpipeError } from "../utils/errors.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { CustomAdapter } from "./custom.js";
import { HermesAdapter } from "./hermes.js";
import { LevanteAdapter } from "./levante.js";
import { OpenclawAdapter } from "./openclaw.js";
import type { ParsedSkill } from "../core/skill.js";

export type TargetScope = "global" | "project";

export interface InstallSkillArgs {
  sourceDir: string;
  skillName: string;
  installPath: string;
  skill: ParsedSkill;
  installedAt: string;
}

export interface InstallSkillResult {
  destPath: string;
}

export interface RemoveSkillArgs {
  skillName: string;
  installPath: string;
}

export interface InstalledSkillSummary {
  name: string;
  path: string;
}

export interface TargetAdapter {
  readonly name: string;
  detect(): Promise<boolean>;
  supportedScopes(): TargetScope[];
  getDefaultInstallPath(scope?: TargetScope): string;
  installSkill(args: InstallSkillArgs): Promise<InstallSkillResult>;
  removeSkill(args: RemoveSkillArgs): Promise<void>;
  listInstalledSkills(installPath: string): Promise<InstalledSkillSummary[]>;
}

const REGISTRY = new Map<string, TargetAdapter>();
REGISTRY.set("claude-code", new ClaudeCodeAdapter());
REGISTRY.set("hermes", new HermesAdapter());
REGISTRY.set("openclaw", new OpenclawAdapter());
REGISTRY.set("levante", new LevanteAdapter());
REGISTRY.set("custom", new CustomAdapter());

export function getAdapter(name: string): TargetAdapter {
  const a = REGISTRY.get(name);
  if (!a) {
    throw new SkillpipeError(
      "TARGET_UNKNOWN",
      `Unknown target "${name}". Available: ${availableAdapters().join(", ")}`
    );
  }
  return a;
}

export function availableAdapters(): string[] {
  return Array.from(REGISTRY.keys());
}

export function registerAdapter(adapter: TargetAdapter): void {
  REGISTRY.set(adapter.name, adapter);
}
