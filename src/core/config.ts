import { configPath } from "./paths.js";
import {
  LocalConfig,
  LocalConfigSchema,
  defaultLocalConfig
} from "../schemas/config.schema.js";
import { pathExists, readJson, writeJson } from "../utils/fs.js";
import { SkillpipeError } from "../utils/errors.js";

export async function loadLocalConfig(): Promise<LocalConfig> {
  if (!(await pathExists(configPath()))) {
    throw new SkillpipeError(
      "CONFIG_NOT_FOUND",
      "Skillpipe is not initialized on this machine.",
      "Run `skillpipe init` to set it up."
    );
  }
  try {
    const raw = await readJson<unknown>(configPath());
    const parsed = LocalConfigSchema.parse(raw);
    if (rawConfigContainsLegacyMode(raw)) {
      await saveLocalConfig(parsed);
    }
    return parsed;
  } catch (e) {
    throw new SkillpipeError(
      "CONFIG_INVALID",
      `Invalid config at ${configPath()}: ${(e as Error).message}`,
      "Delete the file and re-run `skillpipe init` if you cannot recover it."
    );
  }
}

export async function loadOrInitLocalConfig(): Promise<LocalConfig> {
  if (await pathExists(configPath())) return loadLocalConfig();
  const cfg = defaultLocalConfig();
  await saveLocalConfig(cfg);
  return cfg;
}

export async function saveLocalConfig(cfg: LocalConfig): Promise<void> {
  await writeJson(configPath(), cfg);
}

export async function localConfigExists(): Promise<boolean> {
  return pathExists(configPath());
}

function rawConfigContainsLegacyMode(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const targets = (raw as { targets?: unknown }).targets;
  if (!targets || typeof targets !== "object") return false;
  for (const key of Object.keys(targets as Record<string, unknown>)) {
    const entry = (targets as Record<string, unknown>)[key];
    if (
      entry &&
      typeof entry === "object" &&
      Object.prototype.hasOwnProperty.call(entry, "mode")
    ) {
      return true;
    }
  }
  return false;
}
