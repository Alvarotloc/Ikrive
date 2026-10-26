# Design — admin-run-jobs

Solo API, `packages/shared`, build y documentación. Sin cambios de BD ni de web.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/admin.ts` (nuevo) + `index.ts` | `JOB_NAMES = ['reminders', 'odometer-nudge'] as const`, `JobName`, `jobRunSummarySchema = z.object({ job: z.enum(JOB_NAMES), evaluated: int, created: int, failed: int })`. |
| api | `apps/api/src/modules/notification-channels/dispatcher.ts` | `dispatch(rows)` devuelve `Promise<{ sent: number; failed: number }>` (antes `void`). `deliver` cuenta los mensajes fallidos además de guardar `lastError`; sigue sin rechazar. |
| api | `apps/api/src/jobs/reminders.job.ts`, `odometer-nudge.job.ts` | Devuelven `{ evaluated, created, failed }` con el `failed` del dispatch (con 0 filas, `failed: 0`). |
| api | `apps/api/src/jobs/registry.ts` (nuevo) | `isJobName(name): name is JobName` y `runJob(name, { db, dispatcher, now? }): Promise<JobRunSummary>` que mapea el nombre a `runReminders` / `runOdometerNudge`. Único sitio que conoce la lista; lo usan el endpoint y el script. |
| api | `apps/api/src/plugins/auth.ts` | Decorador `requireAdmin` (preHandler): llama a `authenticate` (401) y lanza `ForbiddenError` si `request.user.role !== 'admin'` (403). |
| api | `apps/api/src/modules/admin/routes.ts` (nuevo) | `POST /admin/jobs/:name/run`, `preHandler: app.requireAdmin`, `params: { name: z.string() }`, respuesta `200: jobRunSummarySchema`. Si `!isJobName(name)` → `NotFoundError`. Llama a `runJob` con el `db` y el `dispatcher` que recibe por opciones; registra el resumen con `request.log.info`. Sin `service.ts`/`repository.ts`: no hay lógica propia ni acceso a datos más allá del job. |
| api | `apps/api/src/app.ts` | Un único `dispatcher` (el que ya se crea para `notificationChannelsService`) compartido con `adminRoutes`, así los tests inyectan `fetch`. |
| api | `apps/api/src/jobs/cli.ts` (nuevo) | `runJobCli(args, deps)` testeable (ver abajo). |
| api | `apps/api/src/job.ts` (nuevo) | Punto de entrada: `process.exitCode = await runJobCli(process.argv.slice(2), { env: process.env, stdout, stderr })`. |
| build | `apps/api/tsup.config.ts` | `entry: ['src/server.ts', 'src/job.ts']` → `dist/job.js`. El Dockerfile ya copia `dist/` entero: no cambia. |
| build | `apps/api/package.json` | `"job": "tsx --env-file-if-exists=../../.env src/job.ts"` → `pnpm --filter @ikrive/api job reminders`. |
| docs | `README.md` | Sección «Lanzar los jobs a mano»: endpoint (curl con cookie de sesión de admin), `pnpm --filter @ikrive/api job <name>` y `docker compose exec ikrive node dist/job.js <name>`. La fila de `REMINDERS_ENABLED` menciona ambos jobs y que no afecta al lanzamiento manual. |
| tests | `apps/api/test/admin-jobs.test.ts` (nuevo), `notification-channels-dispatch.test.ts`, `reminders.test.ts`, `odometer-nudge.test.ts` | Ver `tasks.md`. Los `toEqual({ evaluated, created })` existentes pasan a incluir `failed`. |

## Contrato HTTP

`POST /api/admin/jobs/:name/run` — sin cuerpo.

| Caso | Respuesta |
|---|---|
| Admin, job conocido | 200 `{ "job": "reminders", "evaluated": 2, "created": 1, "failed": 0 }` |
| Sin sesión (cualquier `:name`) | 401 `application/problem+json` |
| Usuario `user` (cualquier `:name`) | 403 `application/problem+json` |
| Admin, `:name` desconocido | 404 `application/problem+json`, `detail: "Unknown job: <name>"` |

La autorización va antes que el 404: sin ser admin no se revela qué jobs existen. Entra en el rate limit general de `/api/*`.

## Script

```ts
export async function runJobCli(
  args: string[],
  deps: { env: NodeJS.ProcessEnv; stdout: Writable; stderr: Writable; now?: Date; fetch?: typeof globalThis.fetch },
): Promise<number>; // código de salida
```

1. `args[0]` no es job conocido (o falta) → `stderr`: `Usage: job <reminders|odometer-nudge>`, devuelve 1 sin abrir la BD.
2. `loadConfig(env)`, `createDb(databasePath(config))`, `runMigrations(db)` (idempotente; permite lanzarlo antes del primer arranque).
3. `createNotificationDispatcher({ db, fetch, baseUrl: config.BASE_URL })`, `runJob(name, { db, dispatcher, now })`.
4. `stdout`: `JSON.stringify(summary)` + `\n`; cierra la BD (`finally`) y devuelve 0. Un error inesperado se propaga y Node termina con código ≠ 0.

En Docker corre como `node` con el mismo entorno que el servidor (`DATA_DIR=/data`, `AUTH_SECRET`…), así que `loadConfig` pasa. Varios procesos sobre la misma SQLite: WAL + `busy_timeout = 5000` (ya en `createDb`) y la deduplicación por `dedupeKey` único evitan duplicados si coincide con una ejecución programada.

## UI

Ninguna. El admin usa curl o el script.

## Alternativas descartadas

- **Opción «forzar» que salte el día/hora del usuario**: cambia la semántica de los jobs y la deduplicación seguiría impidiendo repetir avisos; el criterio pide ejecutar *el mismo* job.
- **Script que llame al endpoint por HTTP**: necesitaría credenciales de admin en la línea de comandos; el acceso al contenedor ya implica control total de la instancia.
- **Validar `:name` con `z.enum`**: daría 400, y el criterio pide 404 para un job desconocido.
- **Contar en `failed` canales con error en vez de mensajes**: un canal con tres mensajes y uno fallido ocultaría cuántos avisos no llegaron.

## Decisiones a validar (Gate 1)

1. **Mismas reglas que el planificador**: lanzado a las 3:00, `reminders` puede devolver `evaluated: 0`; para probar la instalación se lanza tras la hora de recordatorio del usuario. Sin modo «forzar».
2. **`failed` = mensajes fallidos** (canal × notificación), no canales.
3. **`REMINDERS_ENABLED=false` no bloquea** el endpoint ni el script: solo controla el planificador.
4. **401/403 antes que 404** para cualquier `:name`.
5. **El script aplica migraciones** pendientes antes de ejecutar.
6. **Código de salida 0 aunque haya envíos fallidos**: el fallo de canal se ve en `failed` y en `lastError`; 1 solo para uso incorrecto.
7. **Nombre del script en Docker**: `node dist/job.js <name>` (la imagen no tiene pnpm).

## Riesgos

- Cambiar el tipo de retorno de `dispatch` toca dos jobs y sus tests; `sendTest` no cambia.
- tsup con dos entradas puede extraer un chunk común; `dist/` se copia entero, así que sigue funcionando. Se verifica con `docker build` + `docker run … node dist/job.js reminders`.

## Fuera de alcance

- Botón en la web para lanzar jobs y gestión de usuarios/roles para el admin.
- Elegir `now` o un usuario concreto al lanzar un job.
- Historial de ejecuciones.
