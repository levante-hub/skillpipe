import { logger } from "../utils/logger.js";
import { which } from "../utils/shell.js";
import {
  configPath,
  lockPath,
  reposDir,
  workspaceForRepo
} from "../core/paths.js";
import { ghAuthStatus } from "../core/github.js";
import { localConfigExists, loadLocalConfig } from "../core/config.js";
import { loadLockfile } from "../core/lockfile.js";
import { pathExists } from "../utils/fs.js";

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
  hint?: string;
}

export async function runDoctor(): Promise<{ failures: number }> {
  const checks: Check[] = [];

  checks.push({ label: "git installed", ok: await which("git") });
  const ghOk = await which("gh");
  checks.push({
    label: "gh installed",
    ok: ghOk,
    hint: ghOk ? undefined : "Install from https://cli.github.com/"
  });

  if (ghOk) {
    const auth = await ghAuthStatus();
    checks.push({
      label: "gh authenticated",
      ok: auth.authenticated,
      detail: auth.details.split("\n").pop(),
      hint: auth.authenticated ? undefined : "Run `gh auth login`"
    });
  }

  const cfgExists = await localConfigExists();
  checks.push({
    label: `local config exists (${configPath()})`,
    ok: cfgExists,
    hint: cfgExists ? undefined : "Run `skillpipe init`"
  });

  if (cfgExists) {
    try {
      const cfg = await loadLocalConfig();
      const target = cfg.defaultTarget;
      const tCfg = cfg.targets[target];
      checks.push({
        label: `target "${target}" configured`,
        ok: Boolean(tCfg),
        detail: tCfg?.installPath
      });
      if (cfg.defaultRepo) {
        const [, name] = cfg.defaultRepo.split("/");
        const wsExists =
          name !== undefined && (await pathExists(workspaceForRepo(name)));
      checks.push({
        label: `workspace for ${cfg.defaultRepo}`,
        ok: wsExists,
        hint: wsExists ? undefined : "Run `skillpipe repo connect <url>`"
      });
      } else {
        checks.push({
          label: "default repo connected",
          ok: false,
          hint: "Run `skillpipe repo connect <url>`"
        });
      }
    } catch (e) {
      checks.push({
        label: "local config valid",
        ok: false,
        detail: (e as Error).message
      });
    }
  }

  const lock = await loadLockfile().catch(() => null);
  checks.push({
    label: `lockfile readable (${lockPath()})`,
    ok: lock !== null,
    hint: lock ? undefined : "Delete the file and re-run install"
  });

  const repos = reposDir();
  checks.push({
    label: `repos cache (${repos})`,
    ok: await pathExists(repos)
  });

  let failures = 0;
  for (const c of checks) {
    if (c.ok) {
      logger.success(`✓ ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
    } else {
      failures += 1;
      logger.error(`✗ ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
      if (c.hint) logger.hint(`   ${c.hint}`);
    }
  }

  logger.newline();
  if (failures === 0) {
    logger.success("All checks passed.");
  } else {
    logger.warn(`${failures} check(s) failed.`);
  }
  return { failures };
}
