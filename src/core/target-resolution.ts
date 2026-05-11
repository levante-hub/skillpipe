import { SkillpipeError } from "../utils/errors.js";
import { expandHome } from "../utils/fs.js";
import { TargetAdapter, TargetScope } from "../adapters/index.js";

export interface ResolveInstallPathArgs {
  adapter: TargetAdapter;
  targetName: string;
  configuredInstallPath?: string;
  overrideInstallPath?: string;
  scope?: TargetScope;
  commandExample: string;
}

export function resolveInstallPathForCommand(
  args: ResolveInstallPathArgs
): string {
  if (args.overrideInstallPath) {
    return expandHome(args.overrideInstallPath);
  }

  const supportedScopes = args.adapter.supportedScopes();
  if (args.scope) {
    if (
      supportedScopes.length > 0 &&
      !supportedScopes.includes(args.scope)
    ) {
      throw new SkillpipeError(
        "TARGET_UNKNOWN",
        `Target "${args.targetName}" does not support scope "${args.scope}". Supported scopes: ${formatSupportedScopes(
          supportedScopes
        )}.`
      );
    }
    return args.adapter.getDefaultInstallPath(args.scope);
  }

  if (supportsGlobalAndProjectScopes(args.adapter)) {
    throw new SkillpipeError(
      "TARGET_SCOPE_REQUIRED",
      `Target "${args.targetName}" supports both global and project scopes. Re-run with --scope global or --scope project.`,
      `Example: ${args.commandExample}`
    );
  }

  if (args.configuredInstallPath) {
    return expandHome(args.configuredInstallPath);
  }

  return args.adapter.getDefaultInstallPath(supportedScopes[0]);
}

export function supportsGlobalAndProjectScopes(adapter: TargetAdapter): boolean {
  const scopes = adapter.supportedScopes();
  return scopes.includes("global") && scopes.includes("project");
}

function formatSupportedScopes(scopes: TargetScope[]): string {
  return scopes.length > 0 ? scopes.join(", ") : "none";
}
