# Phase 10 — `report-issue` command

## 1. Resumen de la solución

Añadimos un comando no interactivo `skillpipe report-issue` pensado para ser invocado por agentes de IA cuando detectan un error, una incoherencia o un bloqueo al usar el CLI. El comando recibe todo el contexto por flags (`title`, `summary`, `command`, `error`, `expected`, `actual`, `severity`, `labels`), renderiza un cuerpo de issue Markdown con secciones estables y metadata de entorno (versión del CLI, Node, plataforma y release del SO), crea la issue en el repo público `levante-hub/skillpipe` vía `gh issue create`, y luego intenta aplicar labels de forma **best-effort** con `gh issue edit --add-label`.

La diferencia clave respecto a la spec anterior es deliberada:

- La **creación de la issue no depende de las labels**. Se crea primero la issue sin labels.
- Las labels (`agent-report`, `bug`, `severity:<level>` y extras) se intentan aplicar **después**. Si el repo no tiene esas labels o el usuario autenticado no tiene permisos para aplicarlas, la issue ya creada **no se pierde**: el comando devuelve éxito, escribe una advertencia en `stderr` y deja en el cuerpo una sección `Requested labels` para que un mantenedor pueda aplicarlas manualmente.
- En éxito, `stdout` contiene **exactamente una línea**: la URL de la issue. No se usa `logger` en la ruta feliz para no mezclar salida humana y salida máquina.

> Nota: la spec original mencionaba `skillsync report-issue`, pero el `bin` real del paquete es `skillpipe` (`package.json` → `"bin": { "skillpipe": "dist/cli.js" }`). Toda la implementación usa `skillpipe`.

## 2. Archivos a crear / modificar

**Crear:**
- `src/commands/report-issue.ts`
- `src/commands/report-issue.test.ts`
- `src/core/github.test.ts`

**Modificar:**
- `src/utils/errors.ts` — añadir el código `ISSUE_CREATE_FAILED`.
- `src/core/github.ts` — añadir helpers para crear la issue y aplicar labels en segundo paso.
- `src/cli.ts` — registrar el comando `report-issue`.

No se añaden dependencias nuevas. Se reutiliza `vitest`, ya presente en el proyecto.

## 3. Código exacto

### 3.1 `src/utils/errors.ts` (modificación)

Reemplazar el union type por este, manteniendo intacto el resto del archivo:

```ts
export type SkillpipeErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_INVALID"
  | "REPO_NOT_CONNECTED"
  | "REPO_ALREADY_CONNECTED"
  | "REPO_NOT_FOUND"
  | "REPO_CLONE_FAILED"
  | "REPO_REMOTE_MISMATCH"
  | "SKILL_NOT_FOUND"
  | "SKILL_INVALID"
  | "VALIDATION_FAILED"
  | "SECRET_DETECTED"
  | "TARGET_UNKNOWN"
  | "TARGET_NOT_INSTALLED"
  | "GH_NOT_AVAILABLE"
  | "GH_NOT_AUTHENTICATED"
  | "GIT_NOT_AVAILABLE"
  | "GIT_OPERATION_FAILED"
  | "WORKSPACE_DIRTY"
  | "LOCKFILE_INVALID"
  | "USER_ABORTED"
  | "INIT_NOT_INTERACTIVE"
  | "ISSUE_CREATE_FAILED"
  | "UNKNOWN";
```

### 3.2 `src/core/github.ts` (modificación — append al final del archivo)

Añadir, sin tocar nada de lo existente:

```ts
export interface CreateIssueOptions {
  repo: string; // "owner/name"
  title: string;
  body: string;
}

export interface TryAddIssueLabelsOptions {
  repo: string; // "owner/name"
  issue: string; // issue URL returned by gh issue create
  labels: string[];
}

export interface AddIssueLabelsResult {
  applied: boolean;
  error?: string;
}

export async function ghCreateIssue(opts: CreateIssueOptions): Promise<string> {
  await requireGhAuth();
  const args = [
    "issue",
    "create",
    "--repo",
    opts.repo,
    "--title",
    opts.title,
    "--body",
    opts.body
  ];
  const r = await run("gh", args);
  if (r.exitCode !== 0) {
    throw new SkillpipeError(
      "ISSUE_CREATE_FAILED",
      `gh issue create failed: ${r.stderr.trim() || r.stdout.trim()}`,
      "Verify the destination repo exists and the authenticated GitHub user can open issues there."
    );
  }
  const url = r.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  if (!url || !url.startsWith("http")) {
    throw new SkillpipeError(
      "ISSUE_CREATE_FAILED",
      `gh issue create succeeded but no URL was returned. Raw stdout: ${r.stdout.trim()}`
    );
  }
  return url;
}

export async function ghTryAddIssueLabels(
  opts: TryAddIssueLabelsOptions
): Promise<AddIssueLabelsResult> {
  if (opts.labels.length === 0) {
    return { applied: true };
  }
  const r = await run("gh", [
    "issue",
    "edit",
    opts.issue,
    "--repo",
    opts.repo,
    "--add-label",
    opts.labels.join(",")
  ]);
  if (r.exitCode !== 0) {
    return {
      applied: false,
      error: r.stderr.trim() || r.stdout.trim() || "gh issue edit failed"
    };
  }
  return { applied: true };
}
```

### 3.3 `src/commands/report-issue.ts` (nuevo archivo, contenido completo)

```ts
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SkillpipeError } from "../utils/errors.js";
import { ghCreateIssue, ghTryAddIssueLabels } from "../core/github.js";

const DEFAULT_ISSUE_REPO = "levante-hub/skillpipe";
const DEFAULT_LABELS = ["agent-report", "bug"] as const;
const TITLE_PREFIX = "[agent-report]";

export type ReportIssueSeverity = "low" | "medium" | "high";

const VALID_SEVERITIES = new Set<ReportIssueSeverity>([
  "low",
  "medium",
  "high"
]);

export interface ReportIssueOptions {
  title: string;
  summary: string;
  command?: string;
  error?: string;
  expected?: string;
  actual?: string;
  severity?: string;
  labels?: string;
}

export async function runReportIssue(opts: ReportIssueOptions): Promise<void> {
  validateReportIssueOptions(opts);

  const severity = normalizeSeverity(opts.severity);
  const repo = resolveIssueRepo(process.env.SKILLPIPE_ISSUE_REPO);
  const title = formatReportIssueTitle(opts.title);
  const labels = buildIssueLabels(opts.labels, severity);
  const body = renderReportIssueBody(opts, labels);

  const url = await ghCreateIssue({ repo, title, body });
  const labelResult = await ghTryAddIssueLabels({
    repo,
    issue: url,
    labels
  });

  if (!labelResult.applied) {
    writeStderrLine(
      `warning: issue created, but labels could not be applied automatically: ${labelResult.error}`
    );
  }

  process.stdout.write(url + "\n");
}

export function validateReportIssueOptions(opts: ReportIssueOptions): void {
  if (!opts.title || !opts.title.trim()) {
    throw new SkillpipeError(
      "VALIDATION_FAILED",
      "--title is required and cannot be empty."
    );
  }
  if (!opts.summary || !opts.summary.trim()) {
    throw new SkillpipeError(
      "VALIDATION_FAILED",
      "--summary is required and cannot be empty."
    );
  }

  const rawSeverity = opts.severity?.trim();
  if (rawSeverity && !normalizeSeverity(rawSeverity)) {
    throw new SkillpipeError(
      "VALIDATION_FAILED",
      `Invalid --severity "${opts.severity}". Use one of: low, medium, high.`
    );
  }
}

export function formatReportIssueTitle(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith(TITLE_PREFIX)
    ? trimmed
    : `${TITLE_PREFIX} ${trimmed}`;
}

export function buildIssueLabels(
  extra: string | undefined,
  severity?: ReportIssueSeverity
): string[] {
  const extraLabels = (extra ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const severityLabels = severity ? [`severity:${severity}`] : [];
  return Array.from(
    new Set([...DEFAULT_LABELS, ...severityLabels, ...extraLabels])
  );
}

export function renderReportIssueBody(
  opts: ReportIssueOptions,
  labels: string[]
): string {
  const meta = collectMetadata();
  const severity = normalizeSeverity(opts.severity);
  const sections: string[] = [];

  sections.push(`## Summary\n\n${opts.summary.trim()}`);

  if (opts.command && opts.command.trim()) {
    sections.push(
      "## Reproduction\n\n```sh\n" + opts.command.trim() + "\n```"
    );
  }
  if (opts.expected && opts.expected.trim()) {
    sections.push(`## Expected behavior\n\n${opts.expected.trim()}`);
  }
  if (opts.actual && opts.actual.trim()) {
    sections.push(`## Actual behavior\n\n${opts.actual.trim()}`);
  }
  if (opts.error && opts.error.trim()) {
    sections.push("## Error output\n\n```\n" + opts.error.trim() + "\n```");
  }
  if (severity) {
    sections.push(`## Severity\n\n${severity}`);
  }

  sections.push(
    ["## Requested labels", "", ...labels.map((label) => `- \`${label}\``)].join(
      "\n"
    )
  );

  sections.push(
    [
      "## Environment",
      "",
      `- skillpipe: ${meta.cliVersion}`,
      `- node: ${meta.nodeVersion}`,
      `- platform: ${meta.platform} (${meta.arch})`,
      `- os release: ${meta.osRelease}`
    ].join("\n")
  );

  sections.push(
    "---\n_Filed automatically by an AI agent via `skillpipe report-issue`._"
  );

  return sections.join("\n\n");
}

interface Metadata {
  cliVersion: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  osRelease: string;
}

function collectMetadata(): Metadata {
  return {
    cliVersion: readCliVersion(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release()
  };
}

function readCliVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

function resolveIssueRepo(raw: string | undefined): string {
  return raw?.trim() || DEFAULT_ISSUE_REPO;
}

function normalizeSeverity(
  raw: string | undefined
): ReportIssueSeverity | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  if (!VALID_SEVERITIES.has(value as ReportIssueSeverity)) {
    return undefined;
  }
  return value as ReportIssueSeverity;
}

function writeStderrLine(message: string): void {
  process.stderr.write(message + "\n");
}
```

### 3.4 `src/commands/report-issue.test.ts` (nuevo archivo, contenido completo)

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildIssueLabels,
  formatReportIssueTitle,
  renderReportIssueBody,
  runReportIssue,
  validateReportIssueOptions
} from "./report-issue.js";
import { ghCreateIssue, ghTryAddIssueLabels } from "../core/github.js";

vi.mock("../core/github.js", () => ({
  ghCreateIssue: vi.fn(),
  ghTryAddIssueLabels: vi.fn()
}));

describe("report-issue command", () => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  beforeEach(() => {
    stdout.length = 0;
    stderr.length = 0;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderr.push(String(chunk));
      return true;
    });
    vi.mocked(ghCreateIssue).mockReset();
    vi.mocked(ghTryAddIssueLabels).mockReset();
    delete process.env.SKILLPIPE_ISSUE_REPO;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SKILLPIPE_ISSUE_REPO;
  });

  it("validates severity values", () => {
    expect(() =>
      validateReportIssueOptions({
        title: "x",
        summary: "y",
        severity: "urgent"
      })
    ).toThrow('Invalid --severity "urgent". Use one of: low, medium, high.');

    expect(() =>
      validateReportIssueOptions({
        title: "x",
        summary: "y",
        severity: "Medium"
      })
    ).not.toThrow();
  });

  it("formats the title with a stable prefix", () => {
    expect(formatReportIssueTitle("Issue title")).toBe(
      "[agent-report] Issue title"
    );
    expect(formatReportIssueTitle("[agent-report] Issue title")).toBe(
      "[agent-report] Issue title"
    );
  });

  it("builds labels with defaults, severity and dedupe", () => {
    expect(buildIssueLabels("bug, cli , agent-report,cli", "high")).toEqual([
      "agent-report",
      "bug",
      "severity:high",
      "cli"
    ]);
  });

  it("renders a compact body with optional sections", () => {
    const body = renderReportIssueBody(
      {
        title: "Failure",
        summary: "Something broke",
        command: "skillpipe install foo",
        expected: "Command succeeds",
        actual: "Command aborts",
        error: "Error: ENOENT",
        severity: "High"
      },
      ["agent-report", "bug", "severity:high", "cli"]
    );

    expect(body).toContain("## Summary");
    expect(body).toContain("## Reproduction");
    expect(body).toContain("```sh");
    expect(body).toContain("## Expected behavior");
    expect(body).toContain("## Actual behavior");
    expect(body).toContain("## Error output");
    expect(body).toContain("## Severity");
    expect(body).toContain("## Requested labels");
    expect(body).toContain("- `severity:high`");
    expect(body).toContain("## Environment");
  });

  it("omits optional sections when they are not provided", () => {
    const body = renderReportIssueBody(
      {
        title: "Failure",
        summary: "Minimal reproduction"
      },
      ["agent-report", "bug"]
    );

    expect(body).not.toContain("## Reproduction");
    expect(body).not.toContain("## Expected behavior");
    expect(body).not.toContain("## Actual behavior");
    expect(body).not.toContain("## Error output");
    expect(body).not.toContain("## Severity");
    expect(body).toContain("## Requested labels");
  });

  it("prints only the issue URL to stdout on success", async () => {
    vi.mocked(ghCreateIssue).mockResolvedValue(
      "https://github.com/levante-hub/skillpipe/issues/123"
    );
    vi.mocked(ghTryAddIssueLabels).mockResolvedValue({ applied: true });

    await runReportIssue({
      title: "Failure",
      summary: "Something broke",
      severity: "medium",
      labels: "cli"
    });

    expect(stdout.join("")).toBe(
      "https://github.com/levante-hub/skillpipe/issues/123\n"
    );
    expect(stderr.join("")).toBe("");
    expect(ghCreateIssue).toHaveBeenCalledWith({
      repo: "levante-hub/skillpipe",
      title: "[agent-report] Failure",
      body: expect.stringContaining("## Summary")
    });
    expect(ghTryAddIssueLabels).toHaveBeenCalledWith({
      repo: "levante-hub/skillpipe",
      issue: "https://github.com/levante-hub/skillpipe/issues/123",
      labels: ["agent-report", "bug", "severity:medium", "cli"]
    });
  });

  it("warns on stderr when labels cannot be applied, but still succeeds", async () => {
    process.env.SKILLPIPE_ISSUE_REPO = "someone/sandbox";

    vi.mocked(ghCreateIssue).mockResolvedValue(
      "https://github.com/someone/sandbox/issues/9"
    );
    vi.mocked(ghTryAddIssueLabels).mockResolvedValue({
      applied: false,
      error: "could not add label: 'agent-report' not found"
    });

    await runReportIssue({
      title: "Failure",
      summary: "Something broke"
    });

    expect(stdout.join("")).toBe(
      "https://github.com/someone/sandbox/issues/9\n"
    );
    expect(stderr.join("")).toContain(
      "warning: issue created, but labels could not be applied automatically:"
    );
  });
});
```

### 3.5 `src/core/github.test.ts` (nuevo archivo, contenido completo)

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ghCreateIssue,
  ghTryAddIssueLabels
} from "./github.js";
import { SkillpipeError } from "../utils/errors.js";
import { requireBinary, run, which } from "../utils/shell.js";

vi.mock("../utils/shell.js", () => ({
  run: vi.fn(),
  which: vi.fn(),
  requireBinary: vi.fn()
}));

describe("github issue helpers", () => {
  beforeEach(() => {
    vi.mocked(run).mockReset();
    vi.mocked(which).mockReset();
    vi.mocked(requireBinary).mockReset();

    vi.mocked(which).mockResolvedValue(true);
    vi.mocked(requireBinary).mockResolvedValue(undefined);
  });

  it("parses the created issue URL from gh output", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: 0
      })
      .mockResolvedValueOnce({
        stdout: "https://github.com/levante-hub/skillpipe/issues/12\n",
        stderr: "",
        exitCode: 0
      });

    const url = await ghCreateIssue({
      repo: "levante-hub/skillpipe",
      title: "[agent-report] Failure",
      body: "## Summary\n\nBroken"
    });

    expect(url).toBe("https://github.com/levante-hub/skillpipe/issues/12");
  });

  it("throws ISSUE_CREATE_FAILED when gh issue create fails", async () => {
    vi.mocked(run)
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: 0
      })
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "GraphQL: could not resolve to a Repository",
        exitCode: 1
      });

    await expect(
      ghCreateIssue({
        repo: "levante-hub/skillpipe",
        title: "[agent-report] Failure",
        body: "## Summary\n\nBroken"
      })
    ).rejects.toMatchObject<Partial<SkillpipeError>>({
      code: "ISSUE_CREATE_FAILED"
    });
  });

  it("returns a non-fatal result when label application fails", async () => {
    vi.mocked(run).mockResolvedValue({
      stdout: "",
      stderr: "could not add label: 'agent-report' not found",
      exitCode: 1
    });

    await expect(
      ghTryAddIssueLabels({
        repo: "levante-hub/skillpipe",
        issue: "https://github.com/levante-hub/skillpipe/issues/12",
        labels: ["agent-report", "bug"]
      })
    ).resolves.toEqual({
      applied: false,
      error: "could not add label: 'agent-report' not found"
    });
  });

  it("returns success immediately when there are no labels to apply", async () => {
    await expect(
      ghTryAddIssueLabels({
        repo: "levante-hub/skillpipe",
        issue: "https://github.com/levante-hub/skillpipe/issues/12",
        labels: []
      })
    ).resolves.toEqual({ applied: true });
  });
});
```

### 3.6 `src/cli.ts` (modificación)

**Añadir el import** junto al resto:

```ts
import { runReportIssue } from "./commands/report-issue.js";
```

**Registrar el comando**, justo antes de `program.parseAsync(process.argv)...`:

```ts
program
  .command("report-issue")
  .description(
    "Open a GitHub issue in the public skillpipe repo (intended for AI agents)."
  )
  .requiredOption("--title <text>", "issue title")
  .requiredOption("--summary <text>", "short summary of the problem")
  .option("--command <cmd>", "the skillpipe command that triggered the issue")
  .option("--error <text>", "error message or stack trace observed")
  .option("--expected <text>", "what the agent expected to happen")
  .option("--actual <text>", "what actually happened")
  .option("--severity <level>", "low | medium | high")
  .option("--labels <list>", "comma-separated extra labels to request")
  .action(
    wrap(
      async (opts: {
        title: string;
        summary: string;
        command?: string;
        error?: string;
        expected?: string;
        actual?: string;
        severity?: string;
        labels?: string;
      }) =>
        runReportIssue({
          title: opts.title,
          summary: opts.summary,
          command: opts.command,
          error: opts.error,
          expected: opts.expected,
          actual: opts.actual,
          severity: opts.severity,
          labels: opts.labels
        })
    )
  );
```

No se modifica nada más de `wrap`, `reportError` ni del resto de comandos.

## 4. Decisiones clave

### 4.1 Contrato de salida

- En éxito, `stdout` contiene solo la URL final de la issue, seguida de `\n`.
- No se usa `logger.step`, `logger.success` ni `logger.hint` en la ruta feliz, porque hoy el `logger` escribe en `stdout` y eso rompería la captura máquina-a-máquina.
- Las advertencias no fatales se escriben en `stderr`.
- Los errores fatales siguen el camino normal del CLI: `throw SkillpipeError` y `wrap()` se encarga de `reportError` + `exit 1`.

### 4.2 Labels: best-effort, no bloqueantes

- Labels por defecto: `agent-report` y `bug`.
- `--severity` se normaliza a minúsculas y se convierte en `severity:<level>`.
- `--labels` se parsea como CSV, con `trim()` y deduplicación estable.
- La issue se crea **sin labels**.
- En un segundo paso se intenta `gh issue edit <url> --add-label ...`.
- Si ese segundo paso falla porque la label no existe o porque el usuario no tiene permisos para aplicarla, el comando **no falla**. La issue ya quedó creada y el warning viaja por `stderr`.
- Para no perder la intención de triage, el cuerpo incluye siempre `## Requested labels`.

### 4.3 Repo destino

- Por defecto: `levante-hub/skillpipe`.
- Override opcional por env: `SKILLPIPE_ISSUE_REPO`.
- No se añade `--repo` como flag CLI. El override por env cubre testing/sandbox sin abrir un destino arbitrario en la interfaz pública del comando.

### 4.4 Validación

- `--title` y `--summary` son obligatorios y no aceptan cadenas vacías o solo espacios.
- `--severity` acepta `low`, `medium`, `high` en cualquier combinación de mayúsculas/minúsculas de entrada; internamente se normaliza a minúsculas.
- No se valida la existencia real de las labels en GitHub desde el cliente: eso depende del repo destino y de permisos del usuario autenticado.

### 4.5 Cobertura de pruebas

- `src/commands/report-issue.test.ts` cubre validación, formateo, render del cuerpo y contrato de `stdout`/`stderr`.
- `src/core/github.test.ts` cubre el parseo de la URL devuelta por `gh issue create`, el error fatal de creación y el fallo no fatal al aplicar labels.
- No hace falta tocar `package.json` ni `tsconfig.json`: el proyecto ya usa `vitest` y `tsconfig.json` excluye `**/*.test.ts` del build de `tsc`.

## 5. Runbook de implementación y validación

### 5.1 Implementación

Aplicar exactamente los cambios descritos en §3. No implementar nada fuera de esos bloques.

### 5.2 Build + tests

```sh
npm run clean
npm run build
npm test -- src/commands/report-issue.test.ts src/core/github.test.ts
node dist/cli.js --help
node dist/cli.js report-issue --help
```

Esperado:

- `npm run build` termina sin errores.
- Los dos test files pasan.
- `report-issue` aparece en `--help`.
- El subcomando muestra todos los flags esperados.

### 5.3 Validación de errores locales

Cada uno debe terminar con exit code 1 y error claro:

```sh
node dist/cli.js report-issue --summary "x"
node dist/cli.js report-issue --title "x"
node dist/cli.js report-issue --title "x" --summary "y" --severity urgent
```

Esperado:

- Los dos primeros fallan por validación de commander (`requiredOption`).
- El tercero falla con `[VALIDATION_FAILED] Invalid --severity "urgent"...`.

### 5.4 Smoke test contra sandbox

```sh
SKILLPIPE_ISSUE_REPO="<tu-user>/skillpipe-sandbox" \
node dist/cli.js report-issue \
  --title "Sanity check from local build" \
  --summary "Verifying report-issue end-to-end against sandbox." \
  --command "skillpipe install brand-analysis" \
  --error "Error: ENOENT skills/brand-analysis/SKILL.md" \
  --expected "Skill installs successfully." \
  --actual "Install aborts with ENOENT before copying files." \
  --severity medium \
  --labels cli,triage
```

Verificar:

1. `stdout` contiene solo la URL de la issue.
2. La issue existe en GitHub.
3. El título es `[agent-report] Sanity check from local build`.
4. El cuerpo contiene `Summary`, `Reproduction`, `Expected behavior`, `Actual behavior`, `Error output`, `Severity`, `Requested labels`, `Environment` y el footer.
5. Si el usuario tiene permiso de triage/write y las labels existen, la issue queda etiquetada con `agent-report`, `bug`, `severity:medium`, `cli`, `triage`.
6. Si no hay permiso o falta alguna label, la issue sigue creada y `stderr` muestra un warning, pero el comando devuelve exit code 0.

### 5.5 Captura desde un script

```sh
URL=$(SKILLPIPE_ISSUE_REPO="<tu-user>/skillpipe-sandbox" \
  node dist/cli.js report-issue \
    --title "Capture URL test" \
    --summary "Verify stdout capture.")
echo "Got: $URL"
```

Esperado:

- `$URL` empieza por `https://github.com/<tu-user>/skillpipe-sandbox/issues/`.
- No hace falta `tail -n 1`, porque `stdout` ya contiene solo la URL.

### 5.6 Caso borde: labels inexistentes

Ejecutar el smoke test contra un repo de pruebas donde `agent-report` o `severity:medium` no existan.

Esperado:

1. La issue se crea igualmente.
2. `stdout` sigue devolviendo solo la URL.
3. `stderr` muestra `warning: issue created, but labels could not be applied automatically: ...`.
4. El cuerpo de la issue mantiene `## Requested labels`, de modo que el mantenedor ve qué labels eran deseables.

### 5.7 Verificación contra el repo público real

Solo cuando §5.2–§5.6 hayan pasado contra sandbox.

Precondiciones:

- `gh auth status` devuelve autenticado.
- El usuario puede abrir issues en `levante-hub/skillpipe`.

Comando:

```sh
node dist/cli.js report-issue \
  --title "First real report-issue validation" \
  --summary "Final verification against the public repository."
```

Esperado:

- Se crea una issue real en `levante-hub/skillpipe`.
- Si las labels no pueden aplicarse, la issue sigue siendo válida porque el cuerpo ya contiene la intención de triage.
- La URL final es directamente reutilizable por el agente que invocó el comando.
