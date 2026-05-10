import { CONFIG_PATH } from "./paths.js";
import {
  LocalConfig,
  LocalConfigSchema,
  defaultLocalConfig
} from "../schemas/config.schema.js";
import { pathExists, readJson, writeJson } from "../utils/fs.js";
import { SkillpipeError } from "../utils/errors.js";

export async function loadLocalConfig(): Promise<LocalConfig> {
  if (!(await pathExists(CONFIG_PATH))) {
    throw new SkillpipeError(
      "CONFIG_NOT_FOUND",
      "Skillpipe is not initialized on this machine.",
      "Run `skillpipe init` to set it up."
    );
  }
  try {
    const raw = await readJson<unknown>(CONFIG_PATH);
    return LocalConfigSchema.parse(raw);
  } catch (e) {
    throw new SkillpipeError(
      "CONFIG_INVALID",
      `Invalid config at ${CONFIG_PATH}: ${(e as Error).message}`,
      "Delete the file and re-run `skillpipe init` if you cannot recover it."
    );
  }
}

export async function loadOrInitLocalConfig(): Promise<LocalConfig> {
  if (await pathExists(CONFIG_PATH)) return loadLocalConfig();
  const cfg = defaultLocalConfig();
  await saveLocalConfig(cfg);
  return cfg;
}

export async function saveLocalConfig(cfg: LocalConfig): Promise<void> {
  await writeJson(CONFIG_PATH, cfg);
}

export async function localConfigExists(): Promise<boolean> {
  return pathExists(CONFIG_PATH);
}
