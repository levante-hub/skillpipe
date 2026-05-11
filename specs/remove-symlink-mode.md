# Runbook: eliminar `symlink` mode de skillpipe-cli

## Objetivo

Eliminar por completo el modo `symlink` como opción de producto y dejar una sola semántica de instalación: **copiar siempre**.

Este documento es un **runbook de implementación**. No describe ideas sueltas: fija decisiones, cierra ambigüedades y enumera los cambios necesarios para que la implementación quede consistente.

## Problema que se corrige

- Skills instalados como symlink no son descubiertos de forma fiable por todos los runtimes soportados. Hermes es el caso reportado, pero no debe asumirse que es el único.
- Tener `symlink` como default introdujo:
  - bugs silenciosos de auto-discovery,
  - dos ramas de código para instalar,
  - documentación inconsistente,
  - un edit loop difícil de explicar,
  - soporte accidental a flujos que el usuario no distingue.

## Resultado esperado

Después de este cambio:

- `install` y `update` siempre materializan una **copia real**.
- El CLI ya no acepta `--mode`.
- `propose` ya no acepta `--from-installed`.
- El usuario edita siempre en el **install path**.
- El repo cache interno sigue existiendo, pero queda oculto como detalle interno.
- Configs y lockfiles legacy con `mode: "symlink"` se leen sin romper y se normalizan en disco.
- Symlinks legacy ya existentes en disco no se tocan hasta el siguiente `install`/`update`.

## Decisiones cerradas

### 1. Superficie de producto

- `copy` es el único modo soportado.
- `mode` desaparece de la CLI, de `status`, de la documentación y del modelo mental del usuario.
- No se deja alias deprecado para `--mode` ni para `--from-installed`. Commander debe rechazar la opción desconocida.

### 2. Compatibilidad hacia atrás

- Config y lockfile deben **aceptar** datos legacy con `mode: "symlink"` o `mode: "copy"`.
- El tipo normalizado en memoria ya no debe exponer `mode`.
- Si un archivo legacy contiene el campo `mode`, se reescribe silenciosamente sin ese campo.
- La migración silenciosa debe ser **específica** al campo legacy `mode`; no debe depender de comparar `JSON.stringify(raw)` con `JSON.stringify(parsed)`.

### 3. Flujo de autoría

- El usuario y el agente editan en el **install path**.
- `add` debe scaffoldear en el install path, no en el repo cache interno.
- `validate <name>` debe funcionar tanto para skills que ya existen en el repo como para skills nuevas que todavía solo viven en el install path.
- `propose <name>` debe sincronizar automáticamente install path → repo cache cuando corresponda, sin flag.

### 4. `status`

- `status` ya no muestra columna `mode`.
- Si el lockfile legacy todavía tiene `mode`, la carga lo migra y `status` solo muestra target, path, versiones y estado.

### 5. Auto-PR fallback

- Se conserva la propuesta de fallback automático a PR cuando falla el push directo por non-fast-forward o branch protegida.
- La secuencia exacta debe dejar claro cómo se limpia `main` local tras crear la rama feature.

## Alcance

**Afecta**:

- adapters,
- `init`,
- `install`,
- `update`,
- `status`,
- `add`,
- `validate`,
- `propose`,
- schemas de config y lockfile,
- utilidades fs,
- docs,
- tests.

**No afecta**:

- la detección defensiva de symlinks ya existentes en disco,
- el hecho de que `plainCopySkill` reemplace un symlink legacy cuando vuelva a instalar.

## Implementación

### 1. Schemas y tipos legacy-aware

#### `src/schemas/config.schema.ts`

Cambiar `TargetConfigSchema` para aceptar `mode` legacy pero eliminarlo del tipo normalizado:

```ts
const LegacyInstallModeSchema = z.enum(["copy", "symlink"]);

export const TargetConfigSchema = z
  .object({
    installPath: z.string(),
    mode: LegacyInstallModeSchema.optional()
  })
  .transform(({ installPath }) => ({ installPath }));
```

Resultado:

- entrada legacy válida,
- salida tipada sin `mode`,
- nuevos `saveLocalConfig()` ya no vuelven a escribir el campo.

#### `src/schemas/lockfile.schema.ts`

Aplicar el mismo patrón en `InstalledSkillSchema`:

```ts
const LegacyInstallModeSchema = z.enum(["copy", "symlink"]);

export const InstalledSkillSchema = z
  .object({
    version: z.string(),
    commit: z.string(),
    target: z.string(),
    installPath: z.string(),
    path: z.string(),
    mode: LegacyInstallModeSchema.optional(),
    installedAt: z.string()
  })
  .transform(({ version, commit, target, installPath, path, installedAt }) => ({
    version,
    commit,
    target,
    installPath,
    path,
    installedAt
  }));
```

Resultado:

- lockfiles legacy se leen,
- el tipo normalizado ya no contiene `mode`,
- nuevas escrituras no reintroducen el campo.

#### Tipos a retirar

- `src/core/sync.ts`: borrar `InstallMode` o reducirlo al literal `"copy"` solo si hace más sencilla la migración. Recomendación: **borrarlo**.
- `src/adapters/index.ts`: quitar el export de `InstallMode`.
- Cualquier firma pública que hoy acepte `mode` debe dejar de aceptarlo.

### 2. Migración silenciosa precisa

#### `src/core/config.ts`

`loadLocalConfig()` no debe usar comparación global del objeto. Debe migrar solo si el raw contiene el campo legacy:

```ts
export async function loadLocalConfig(): Promise<LocalConfig> {
  const raw = await readJson<unknown>(configPath());
  const parsed = LocalConfigSchema.parse(raw);
  if (rawConfigContainsLegacyMode(raw)) {
    await saveLocalConfig(parsed);
  }
  return parsed;
}
```

Helper esperado:

- inspecciona `targets`,
- devuelve `true` si algún target tiene propiedad propia `mode`,
- no depende del valor (`copy` o `symlink`).

#### `src/core/lockfile.ts`

Mismo patrón:

```ts
export async function loadLockfile(): Promise<Lockfile> {
  const raw = await readJson<unknown>(lockPath());
  const parsed = LockfileSchema.parse(raw);
  if (rawLockfileContainsLegacyMode(raw)) {
    await saveLockfile(parsed);
  }
  return parsed;
}
```

Notas:

- Aquí sí cambiará `updatedAt`, pero **solo** cuando exista realmente el campo legacy `mode`.
- No debe haber dirty write en comandos de solo lectura salvo en esa migración específica.

### 3. `materializeSkill` deja de saber de symlinks

#### `src/core/sync.ts`

Reemplazar por una única implementación:

```ts
export async function materializeSkill(
  sourceDir: string,
  destDir: string
): Promise<"copy"> {
  await plainCopySkill(sourceDir, destDir);
  return "copy";
}
```

Cambio asociado en `installSkill()`:

- quitar `mode` de `InstallSkillArgs`,
- dejar de pasarlo al adapter,
- dejar de guardar `mode` en lockfile.

### 4. Borrar `symlinkDir`

#### `src/utils/fs.ts`

- borrar `symlinkDir`,
- conservar `isSymlink`,
- conservar `removePath` tal como está.

### 5. Adapters

#### `src/adapters/index.ts`

Nuevo contrato:

```ts
export interface InstallSkillArgs {
  sourceDir: string;
  skillName: string;
  installPath: string;
}

export interface InstallSkillResult {
  destPath: string;
}
```

Si se prefiere minimizar refactor, `InstallSkillResult` puede conservar `mode: "copy"` literal. Recomendación del runbook: **eliminarlo** también.

#### `src/adapters/{claude-code,hermes,openclaw,levante,custom}.ts`

Patrón único:

- quitar `args.mode`,
- llamar a `materializeSkill(args.sourceDir, dest)`,
- devolver `destPath`,
- no propagar `mode`.

### 6. `init`

#### `src/commands/init.ts`

- dejar de escribir `mode` en `config.targets[target]`,
- la instalación del bundled skill ya no pasa `mode`,
- el config guardado en disco contiene solo `installPath`.

### 7. `install`

#### `src/commands/install.ts`

- quitar `mode` de `InstallOptions`,
- quitar resolución `opts.mode ?? targetCfg?.mode ?? ...`,
- quitar `mode` del log de éxito,
- conservar la detección de conflictos y el contexto de symlink legacy.

El mensaje de éxito debe quedar en algo como:

```ts
logger.success(`Installed ${skill.metadata.name} → ${destPath}`);
```

### 8. `update`

#### `src/commands/update.ts`

- quitar cualquier fallback a `installed.mode` o `targetCfg.mode`,
- `update` siempre reinstala con copia,
- el lockfile nuevo ya no registra `mode`.

### 9. `status`

#### `src/commands/status.ts`

Eliminar la columna `mode`.

La fila debe quedar con:

- `name`
- `local`
- `remote`
- `target`
- `path`
- `state`

`status` es importante porque hoy expone directamente el concepto que estamos retirando.

### 10. `propose`: auto-sync por defecto

#### Cambios de CLI

#### `src/cli.ts`

- borrar `-i, --from-installed`,
- borrar `fromInstalled` del tipo de opciones,
- borrar `fromInstalled` del payload a `runPropose`.

#### `src/commands/propose.ts`

`ProposeOptions` ya no tiene `fromInstalled`.

Flujo nuevo:

```ts
let skill = await tryFindSkill(repo, opts.name);
let adoption: AdoptionPlan | null = null;

if (!skill) {
  adoption = await prepareAdoption(opts.name, config, repo);
  skill = await findSkill(repo, opts.name);
} else {
  await autoSyncFromInstalled(opts.name, skill.folder);
}
```

#### `autoSyncFromInstalled`

Debe ser defensiva:

```ts
async function autoSyncFromInstalled(
  skillName: string,
  workspaceSkillFolder: string
): Promise<void> {
  const lock = await loadLockfile();
  const entry = lock.skills[skillName];
  if (!entry) return;

  const installed = expandHome(entry.path);
  if (!(await pathExists(installed))) return;
  if (await isSymlink(installed)) return;
  if (path.resolve(installed) === path.resolve(workspaceSkillFolder)) return;

  logger.step(`Syncing edits from ${installed} → workspace`);
  await plainCopySkill(installed, workspaceSkillFolder);
}
```

Propiedades deseadas:

- no depende de `entry.mode`,
- no falla si el skill no está instalado,
- evita copiar source-on-source,
- ignora symlink legacy porque en ese caso el edit ya cayó en el workspace.

### 11. `propose`: flujo de adopción

#### `src/commands/propose.ts`

`AdoptionPlan` queda:

```ts
interface AdoptionPlan {
  localSource: string;
  targetName: string;
}
```

`prepareAdoption()`:

- ya no lee `targetCfg.mode`,
- copia local → workspace con `plainCopySkill`.

`finalizeAdoption()`:

- ya no llama a `materializeSkill`,
- deja una copia real en `plan.localSource`,
- registra lockfile sin `mode`.

Patrón:

```ts
await removePath(plan.localSource);
await plainCopySkill(workspaceSkillFolder, plan.localSource);
```

### 12. `propose`: auto-PR fallback al fallar push directo

#### Motivación

Si el push directo falla por non-fast-forward o branch protegida, el CLI debe convertirlo automáticamente en PR, en vez de dejar ese trabajo al agente.

#### Clasificación del error

Crear helper:

```ts
function isPushConflict(err: Error): { isConflict: boolean; reason: string }
```

Patrones case-insensitive:

- `non-fast-forward`
- `updates were rejected`
- `tip of your current branch is behind`
- `protected branch`
- `gh006`
- `refusing to allow`

#### Secuencia exacta del fallback

En el bloque de push directo:

```ts
commitSha = await addAndCommit(workspace, [relSkillPath], opts.message);

try {
  await pushBranch(workspace, branch);
  logger.success(`Pushed ${commitSha.slice(0, 7)} to ${branch}.`);
} catch (err) {
  const conflict = isPushConflict(err as Error);
  if (!conflict.isConflict) throw err;

  const branchName = generateBranchName(opts.name);
  logger.warn(
    `Direct push to "${branch}" was rejected (${conflict.reason}).`
  );
  logger.info("Falling back to Pull Request mode automatically.");

  await checkoutBranch(workspace, branchName, true);
  await pushBranch(workspace, branchName);

  let prUrl = "";
  try {
    prUrl = await ghCreatePr(...);
  } finally {
    await checkoutBranch(workspace, branch);
    await resetHardToRemote(workspace, branch);
  }

  logger.success(`Created branch ${branchName} from your commit.`);
  logger.success(`Pull Request created: ${prUrl}`);
  logger.hint(
    `A maintainer must merge this PR before the change lands on ${branch}.`
  );
}
```

Punto importante:

- el `resetHardToRemote()` no debe ejecutarse mientras HEAD siga en la rama feature,
- primero hay que volver a `branch`,
- luego resetear `branch` a `origin/<branch>`.

#### `src/core/git.ts`

Añadir helper:

```ts
export async function resetHardToRemote(
  cwd: string,
  branch: string
): Promise<void> {
  const r = await run("git", ["reset", "--hard", `origin/${branch}`], { cwd });
  if (r.exitCode !== 0) {
    throw new SkillpipeError(
      "GIT_OPERATION_FAILED",
      `git reset --hard origin/${branch} failed: ${r.stderr.trim()}`
    );
  }
}
```

Este helper es destructivo, pero el runbook lo limita al repo cache interno del CLI tras un fallback ya controlado.

#### Edge cases

- Si el error no es de conflicto, se re-lanza.
- Si `gh` no está autenticado o no está instalado, el fallback debe:
  - dejar la rama feature creada y empujada si ya llegó a ese punto,
  - limpiar `branch` local de vuelta a `origin/<branch>`,
  - surfacing un error explícito.

### 13. `add`: scaffold al install path

#### `src/commands/add.ts`

Cambiar el flujo para escribir en el install path del target activo:

1. cargar config local,
2. resolver `defaultTarget`,
3. resolver `installPath`,
4. crear `<installPath>/<name>`,
5. escribir `SKILL.md` y `README.md`,
6. validar ese skill directamente,
7. mostrar hint hacia `propose`.

Notas:

- ya no se debe hacer `findSkill(repo, opts.name)` porque el skill recién creado todavía no existe en el repo cache,
- la validación post-scaffold debe usar `parseSkill(folder)` directamente.

Patrón esperado:

```ts
const skill = await parseSkill(folder);
const report = await validateSkill(skill, ...);
```

### 14. `validate`: soporte para install-path-only skills

#### `src/commands/validate.ts`

Este cambio es obligatorio para que el flujo documentado `add → validate → propose` funcione.

Nuevo comportamiento:

- `skillpipe validate` sin nombre:
  - sigue validando el repo conectado completo.
- `skillpipe validate <name>`:
  - primero intenta resolver el skill en el repo conectado,
  - si no existe allí, intenta resolverlo en el install path/local source,
  - si lo encuentra fuera del repo, lo parsea y valida directamente.

Recomendación:

- extraer helper reutilizable tipo `findLocalSkillSource(name, config)` o compartir la lógica de resolución con `propose`.
- evitar duplicación fuerte entre `validate` y `propose`, pero no bloquear este cambio por sobre-ingeniería.

### 15. Documentación

#### `docs/targets.md`

- borrar cualquier mención a “symlink mode supported/recommended”,
- reescribir “How install actually works” como copy-only,
- reescribir el edit loop para explicar el **auto-sync implícito** de `propose`,
- no mencionar `--from-installed`.

La frase correcta es:

> Edit the skill at its install path. `skillpipe propose <name>` automatically syncs those edits into Skillpipe's internal repo cache before commit/push.

#### `docs/getting-started.md`

- dejar “copied (not symlinked)”,
- quitar “by default” si aparece.

#### `docs/security.md`

- quitar “by default” donde la semántica ya no es opcional.

#### `skills/skillpipe-cli/SKILL.md`

Cambios obligatorios:

- ocultar la ruta exacta del repo cache interno,
- borrar la sección de install modes,
- borrar `--mode`,
- borrar `--from-installed`,
- documentar el flujo único:
  - `add` crea en install path,
  - `validate <name>` funciona ahí,
  - `propose <name>` sincroniza automáticamente.

También debe incluir la regla del auto-PR fallback:

> When you see that direct push was rejected and Skillpipe fell back to PR mode automatically, do not treat it as a failure. Surface the PR URL and explain that the change is not merged yet.

### 16. Versionado

Este es un breaking change de CLI.

Recomendación:

- bump a `0.6.0` en `package.json`,
- actualizar la versión en `skills/skillpipe-cli/SKILL.md`,
- si existe `CHANGELOG.md`, añadir entrada.

## Archivos a tocar

### Núcleo

- `src/core/sync.ts`
- `src/core/config.ts`
- `src/core/lockfile.ts`
- `src/core/git.ts`
- `src/utils/fs.ts`

### Schemas

- `src/schemas/config.schema.ts`
- `src/schemas/lockfile.schema.ts`

### Adapters

- `src/adapters/index.ts`
- `src/adapters/claude-code.ts`
- `src/adapters/hermes.ts`
- `src/adapters/openclaw.ts`
- `src/adapters/levante.ts`
- `src/adapters/custom.ts`

### Comandos

- `src/cli.ts`
- `src/commands/init.ts`
- `src/commands/install.ts`
- `src/commands/update.ts`
- `src/commands/status.ts`
- `src/commands/propose.ts`
- `src/commands/add.ts`
- `src/commands/validate.ts`

### Docs

- `docs/targets.md`
- `docs/getting-started.md`
- `docs/security.md`
- `skills/skillpipe-cli/SKILL.md`
- `package.json`
- `CHANGELOG.md` si existe

## Tests obligatorios

### Config / lockfile

- `src/core/config.test.ts`
  - migra config legacy con `mode`
  - no reescribe si no hay `mode`
- `src/core/lockfile.test.ts`
  - migra lockfile legacy con `mode`
  - no reescribe si no hay `mode`

### Sync / adapters

- `src/core/sync.test.ts`
  - `materializeSkill` siempre copia
- `src/adapters/hermes.test.ts`
  - instala directorio real
  - no crea symlink
  - remove limpia destino

### Commands

- `src/commands/propose.test.ts`
  - auto-sync install → workspace
  - no-op si install path == workspace
  - skip si install path es symlink legacy
  - flow sin instalación previa
  - fallback a PR por non-fast-forward
  - fallback a PR por branch protegida
  - re-throw en auth/red
  - cleanup de `branch` local tras fallback
- `src/commands/add.test.ts`
  - scaffold en install path
  - no sobrescribe carpeta existente
  - valida el folder local sin depender del repo cache
- `src/commands/validate.test.ts`
  - `validate <name>` funciona para skill solo en install path
  - `validate` sin nombre sigue recorriendo el repo
- `src/commands/status.test.ts`
  - no muestra columna `mode`

## Verificación manual

1. **La CLI rechaza opciones retiradas**
   ```bash
   skillpipe install foo --mode symlink
   skillpipe install foo --mode copy
   skillpipe propose foo --from-installed -m "..."
   ```
   Esperado: Commander rechaza las opciones desconocidas.

2. **`init` ya no escribe `mode`**
   ```bash
   skillpipe init --yes --target hermes
   cat ./.skillpipe/config.json
   ```
   Esperado: `targets.hermes` contiene `installPath` y no contiene `mode`.

3. **Migración silenciosa de config legacy**
   ```bash
   # añadir manualmente mode a targets.hermes
   skillpipe status
   cat ./.skillpipe/config.json
   ```
   Esperado: `mode` desaparece del archivo.

4. **Migración silenciosa de lockfile legacy**
   ```bash
   # añadir manualmente mode a una entrada de skills
   skillpipe status
   cat ./.skillpipe/lock.json
   ```
   Esperado: `mode` desaparece del lockfile.

5. **`status` no muestra `mode`**
   ```bash
   skillpipe status
   ```
   Esperado: tabla sin columna `mode`.

6. **`install` crea directorio real**
   ```bash
   skillpipe install foo
   ls -la <installPath>/foo
   readlink <installPath>/foo
   ```
   Esperado: directorio real; `readlink` no devuelve target válido.

7. **`update` reemplaza symlink legacy**
   ```bash
   skillpipe update foo
   ls -la <installPath>/foo
   ```
   Esperado: tras update queda directorio real.

8. **Flujo `add → validate → propose`**
   ```bash
   skillpipe add foo -d "A sufficiently long description"
   skillpipe validate foo
   skillpipe propose foo -m "feat: add foo"
   ```
   Esperado:
   - `add` escribe en install path,
   - `validate foo` funciona aunque el skill todavía no exista en el repo cache,
   - `propose` adopta el skill y lo registra.

9. **`propose` auto-sync sin flag**
   ```bash
   echo "edit" >> ~/.claude/skills/foo/SKILL.md
   skillpipe propose foo -m "tweak: foo"
   ```
   Esperado: sync install → workspace y luego commit/push.

10. **`propose --pr` también sincroniza**
   ```bash
   echo "edit" >> ~/.claude/skills/foo/SKILL.md
   skillpipe propose foo --pr -m "feat: foo"
   ```
   Esperado: mismo sync + PR.

11. **Symlink legacy en install path no duplica cambios**
   ```bash
   echo "edit" >> ~/.claude/skills/foo/SKILL.md
   skillpipe propose foo -m "..."
   ```
   Precondición: `~/.claude/skills/foo` es symlink legacy al workspace.

   Esperado: `autoSyncFromInstalled()` retorna sin copiar y el commit recoge el cambio igualmente.

12. **No-op sin cambios**
   ```bash
   skillpipe propose foo -m "..."
   ```
   Esperado: `GIT_OPERATION_FAILED: No local changes to propose`.

13. **Auto-PR fallback**
   ```bash
   skillpipe propose foo -m "fix: foo"
   ```
   Precondición: push directo rechazado por non-fast-forward o branch protegida.

   Esperado:
   - warning claro,
   - creación de branch feature,
   - PR abierto,
   - `main` local reseteado a `origin/main`,
   - mensaje explícito de que el cambio aún no está mergeado.

14. **Sin fallback en auth/red**
   ```bash
   skillpipe propose foo -m "..."
   ```
   Precondición: fallo real de red o permisos.

   Esperado: se re-lanza el error original, sin PR automático.

## Criterio de aceptación

El cambio está listo cuando se cumplen todas estas condiciones:

- no existe ninguna opción o doc que ofrezca `symlink` o `--from-installed`,
- `install`, `update` y adopción dejan siempre directorios reales,
- `status` ya no habla de `mode`,
- `add → validate → propose` funciona desde el install path,
- `propose` sincroniza automáticamente,
- configs y lockfiles legacy se migran sin romper,
- el fallback automático a PR deja el repo cache interno en estado limpio.
