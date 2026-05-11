import path from "node:path";
import { LocalConfig } from "../schemas/config.schema.js";
import { expandHome, isSymlink, pathExists } from "../utils/fs.js";

export interface LocalSkillSource {
  path: string;
  targetName: string | null;
}

export async function findLocalSkillSource(
  name: string,
  config: LocalConfig | null,
  cwd: string = process.cwd()
): Promise<LocalSkillSource | null> {
  const cwdSkillsRoot = path.join(cwd, "skills");
  const candidates: LocalSkillSource[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidatePath: string, targetName: string | null) => {
    const normalized = path.resolve(expandHome(candidatePath));
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push({ path: normalized, targetName });
  };

  if (config) {
    for (const [targetName, targetCfg] of Object.entries(config.targets)) {
      if (targetCfg.installPath) {
        pushCandidate(path.join(targetCfg.installPath, name), targetName);
      }
    }
  }

  pushCandidate(path.join(cwd, ".claude", "skills", name), "claude-code");
  pushCandidate(path.join(cwd, ".levante", "skills", name), "levante");
  pushCandidate(
    path.join(cwdSkillsRoot, name),
    inferTargetForCwdSkillsPath(config, cwdSkillsRoot)
  );

  for (const candidate of candidates) {
    if ((await pathExists(candidate.path)) && !(await isSymlink(candidate.path))) {
      return candidate;
    }
  }
  return null;
}

function inferTargetForCwdSkillsPath(
  config: LocalConfig | null,
  cwdSkillsPath: string
): string | null {
  if (!config) return null;

  const matches = Object.entries(config.targets)
    .filter(([, targetCfg]) =>
      targetCfg.installPath &&
      path.resolve(expandHome(targetCfg.installPath)) === cwdSkillsPath
    )
    .map(([targetName]) => targetName);

  if (matches.length === 0) return null;
  if (matches.includes(config.defaultTarget)) return config.defaultTarget;
  return matches[0] ?? null;
}
