# Design — mobile-local-core

Tres bloques: **A** el esquema y las migraciones se mueven a `packages/db` (la API no cambia de comportamiento), **B** una `DataSource` local sobre `drizzle-orm/sqlite-proxy` (en el dispositivo, el plugin; en los tests, better-sqlite3 en memoria), **C** el modo en la web (indicador, rutas, lo que se oculta).

## Motor: versión del plugin

`@capacitor-community/sqlite` **8.1.1** (npm, 2026-08-06; `peerDependencies: { "@capacitor/core": ">=8.0.0" }`, Android `minSdkVersion` 24 como `apps/mobile/android/variables.gradle`). Versión exacta en `apps/mobile/package.json` y `apps/web/package.json`, como el resto de plugins. Activa `foreign_keys` al abrir en Android (`Database.java` › `setForeignKeyConstraintsEnabled(true)`); aun así `openLocalDatabase` ejecuta `PRAGMA foreign_keys = ON`, que también necesita la base de los tests. No hace falta código nativo: `cap sync` registra el plugin.

## A. `packages/db`

| Archivo | Cambio |
|---|---|
| `packages/db/package.json` (nuevo) | `@ikrive/db`, `type: module`, `exports`: `"."` → `src/index.ts`, `"./schema"` → `src/schema/index.ts`. Deps: `drizzle-orm` (mismo rango que la API, `^0.45.4`), `@ikrive/shared: workspace:*`. Dev: `drizzle-kit` (movido de la API). Scripts: `typecheck`, `test`, `db:generate` |
| `packages/db/src/schema/*.ts` | `git mv` de los 12 ficheros de `apps/api/src/db/schema/`, sin cambios de contenido |
| `packages/db/migrations/` | `git mv` de `apps/api/src/db/migrations/` (SQL + `meta/`), sin cambios |
| `packages/db/drizzle.config.ts` | movido; `schema: './src/schema/index.ts'`, `out: './migrations'`, `casing: 'snake_case'` |
| `packages/db/src/index.ts` | re-exporta el esquema, `LOCAL_USER_ID = 'local'` y `MIGRATIONS_FOLDER` (ruta absoluta desde `import.meta.url`, válida ejecutando desde fuentes) |
| `apps/api/src/db/schema.ts` (sustituye la carpeta) | `export * from '@ikrive/db/schema';` — los ~30 `import … from '…/db/schema'` de `src/` y `test/` no cambian |
| `apps/api/src/db/client.ts` | `MIGRATIONS_DIR` = `dist/migrations` junto al bundle si existe; si no (dev, tests), `MIGRATIONS_FOLDER` de `@ikrive/db` |
| `apps/api/tsup.config.ts` | `writeRuntimeFiles` copia `packages/db/migrations` a `dist/migrations` |
| `apps/api/test/build.test.ts` | `copies the migrations…` compara con `packages/db/migrations` |
| `apps/api/package.json` | `@ikrive/db: workspace:*`; sin `drizzle-kit`; `db:generate` se va a `packages/db` |
| `package.json` (raíz) | `db:generate` → `pnpm --filter @ikrive/db db:generate` |
| `docker/Dockerfile` | `COPY packages/db/package.json packages/db/` en la etapa de dependencias |

La API sigue empaquetando `@ikrive/db` (no es `RUNTIME_EXTERNALS`). Verificación de R9: `pnpm db:generate` tras el movimiento dice «No schema changes» (se anota en `progress/impl_mobile-local-core.md`), `git diff -M` muestra los SQL como renombrados al 100 % y los tests de la API pasan sin cambiar aserciones.

## B. DataSource local

### Archivos (`apps/web`)

| Archivo | Contenido |
|---|---|
| `src/lib/data-source/local/database.ts` | `openLocalDatabase(callback: AsyncRemoteCallback): Promise<LocalDb>`: `drizzle(callback, { schema, casing: 'snake_case' })`, `PRAGMA foreign_keys = ON`, migraciones, semilla del usuario local (R12). `LocalDb = SqliteRemoteDatabase<typeof schema>` |
| `src/lib/data-source/local/migrations.ts` | `BUNDLED_MIGRATIONS`: `import.meta.glob('<ruta a packages/db/migrations>/*.sql', { query: '?raw', import: 'default', eager: true })` + `meta/_journal.json`, partidos por `--> statement-breakpoint`, con `folderMillis = entry.when` y `hash` = SHA-256 hex del fichero (`crypto.subtle`). `migrateLocal(db, migrations)` replica `drizzle-orm/sqlite-proxy/migrator` sin `node:fs`: misma tabla `__drizzle_migrations`, aplica las de `created_at` mayor que la última, todo dentro de `BEGIN … COMMIT` |
| `src/lib/data-source/local/serial.ts` | `createSerialQueue()`: cola de promesas; `run(fn)` ejecuta `fn` cuando acaba la anterior, aunque esta falle (R13) |
| `src/lib/data-source/local/problems.ts` | `problem(status, title, detail?, errors?)` → `ApiError`; `notFound`, `badRequest`, `conflict`, `unsupported` (501 `Not Implemented`, «Not available on this device»); `parseInput(schema, value)` → `safeParse` o 400 `Validation failed` con `errors[].path = issue.path.join('.')` (R15) |
| `src/lib/data-source/local/{settings,vehicles,fuel-logs,maintenance,schedules,stats}.ts` | Una función por dominio que recibe `LocalDb` y devuelve su parte de `DataSource`. Copian la orquestación de `apps/api/src/modules/<dominio>/{service,repository}.ts` (mismos `orderBy`, mismos textos de error, `toDto`) con `await` y `db.transaction(async (tx) => …)`, llamando a las mismas funciones de `@ikrive/shared`. `ownerId = LOCAL_USER_ID` |
| `src/lib/data-source/local/index.ts` | `createLocalDataSource(db): DataSource`: compone los dominios, envuelve cada método en la cola, `me()` → `LOCAL_ME`, `config()` → `LOCAL_CLIENT_CONFIG`, operaciones sin soporte → `unsupported()` (R27) |
| `src/lib/native-sqlite.ts` (nuevo, solo nativo) | `openDeviceDatabase(): Promise<AsyncRemoteCallback>` sobre `SQLiteConnection(CapacitorSQLite)`: base `ikrive`, `no-encryption`, versión 1, no readonly; `createConnection` o `retrieveConnection` si ya existe, `open()`. Callback (R14): `SELECT`/`PRAGMA`/`WITH` → `query(sql, params)` y `Object.values` de cada fila; `INSERT/UPDATE/DELETE … RETURNING` con método `all`/`get` → `run(sql, params, false, 'all')` y `changes.values`; resto → `run(sql, params, false)`. `get` devuelve la primera fila; `run` devuelve `{ rows: [] }` |
| `src/test/memory-sqlite.ts` (nuevo) | `createMemorySqlite(): AsyncRemoteCallback` sobre `better-sqlite3(':memory:')` con `prepare(sql).raw()` para `all`/`values`/`get` y `.run()` para `run` (sentencias sin resultado como `BEGIN` también por `run`) |
| `src/features/pwa/config.ts` | `NATIVE_ONLY_MODULES`: `native-(files|calendar|notifications|sqlite)`; el plugin ya entra por `@capacitor-community` |
| `package.json` | `@capacitor-community/sqlite: 8.1.1`, `@ikrive/db: workspace:*`, `drizzle-orm` (`^0.45.4`); dev: `better-sqlite3`, `@types/better-sqlite3` (mismos rangos que la API) |
| `apps/mobile/package.json` | `@capacitor-community/sqlite: 8.1.1` |

### Tipos y firmas

```ts
// packages/db
export const LOCAL_USER_ID = 'local';
// apps/web/src/lib/data-source/local/index.ts
export const LOCAL_ME: Me = { id: LOCAL_USER_ID, name: 'Local', email: 'local@ikrive.invalid', role: 'user' };
export const LOCAL_CLIENT_CONFIG: ClientConfig = { maxUploadMb: 20, localBaseUrl: true };
export function createLocalDataSource(db: LocalDb): DataSource;
export async function openLocalDatabase(callback: AsyncRemoteCallback, migrations = BUNDLED_MIGRATIONS): Promise<LocalDb>;
```

La semilla (R12) inserta `user` (`id: 'local'`, `name: 'Local'`, `email: 'local@ikrive.invalid'`, `role: 'user'`) y `user_settings` (`userId: 'local'`, defaults del esquema = `DEFAULT_USER_SETTINGS`) con `onConflictDoNothing()`. Las tablas de Better Auth (`session`, `account`, `verification`) existen pero quedan vacías.

### Reglas (mismas que la API)

| Operación | Reglas de `@ikrive/shared` | Errores |
|---|---|---|
| `vehicles.create/update` | `createVehicleSchema`/`updateVehicleSchema`, `initialOdometerReading` (con `todayIn(settings.timezone)`), `archivedAtAfterUpdate`, `vehicleStatus` | 400, 404 |
| `odometer.add/remove` | `createOdometerReadingSchema`, `validateOdometerWrite`, `odometerConflictMessage`, `canDeleteOdometerReading` | 400 fecha futura, 409 conflicto/lectura ajena, 404 |
| `fuelLogs.*` | `createFuelLogSchema`/`update…`, `validateOdometerWrite` (lectura propia excluida), `fuelReadingChange`, `editedFuelPrices`; lectura `fuel` y repostaje en la misma transacción | 400, 404, 409 |
| `maintenance.*` | `createMaintenanceRecordSchema`/`update…`, `validateOdometerWrite`, `maintenanceReadingChange`, `scheduleLastDoneUpdate`; plan del mismo vehículo; lectura, registro y plan en la misma transacción | 400, 404, 409 |
| `maintenance.spending` | `roundMoney(total(cost))` | 404 |
| `schedules.*` | `create…Schema`/`update…`, `scheduleDefaults`, `computeScheduleDue`, `hasIntervalAfterUpdate` | 400, 404 |
| `stats.get` | `computeVehicleStats` con repostajes del más antiguo al más nuevo (lista invertida, como `stats/service.ts`) | 404 |
| `settings.*` | `updateUserSettingsSchema`; `get` hace upsert si falta la fila | 400 |

Los DTO cumplen el esquema de respuesta (`vehicleSchema`, `fuelLogSchema`…): los tests los validan con `.parse`. Un borrado de vehículo confía en las FK `on delete cascade` del esquema (R19).

### Ejecución en los tests

Sin dispositivo: `openLocalDatabase(createMemorySqlite())` en cada test del proyecto `unit` (Node). Los tests de componentes (`dom`) sustituyen `@/lib/native-sqlite` con `vi.mock` para que `openDeviceDatabase` devuelva `createMemorySqlite()`; `mockApi({})` asegura que no sale ninguna petición. `src/test/setup.ts` restaura en `afterEach` la DataSource HTTP, el indicador de modo y la conexión local cacheada.

## C. Modo en la web

| Archivo | Cambio |
|---|---|
| `src/lib/app-mode.ts` (nuevo) | `MODE_KEY = 'ikrive.mode'`; `isLocalMode()` = `isNativeApp() && localStorage[MODE_KEY] === 'local'` (R7); `setLocalMode(on: boolean)` |
| `src/features/mobile/local-mode.ts` (nuevo) | `activateLocalDataSource()`: idempotente (promesa en módulo); `import('@/lib/native-sqlite')` e `import('@/lib/data-source/local')`, abre, migra y `setDataSource`. `useEnterLocalMode()`: `setLocalMode(true)`, `queryClient.clear()`, navega a `/`. `useLeaveLocalMode()`: `setLocalMode(false)`, `setDataSource(httpDataSource)`, `queryClient.clear()`, navega a `/welcome`; no cierra ni borra la base (R5) |
| `src/features/mobile/require-server.ts` | `requireServer()`: en modo local redirige a `/` (usado por `/login` y `/register`, R3). Nuevo `requireDataSource()` (async) para `_app`: en modo local `await activateLocalDataSource()`; si no, la regla actual (nativa sin servidor → `/welcome`) (R2) |
| `src/routes/_app.tsx` | `beforeLoad` usa `requireDataSource()`; `DeviceNotificationsSync` solo si nativa y no local (R32) |
| `src/routes/welcome.tsx` | la tarjeta «En este teléfono» es un `button` activo que llama a `useEnterLocalMode()`; desaparece el badge «Próximamente» (R1) |
| `src/features/mobile/use-change-server.ts` | `setLocalMode(false)` al guardar un servidor (R6) |
| `src/features/navigation/app-navigation.tsx` | en modo local: sin `NotificationBell` ni «Usuarios» y botón «Cambiar de modo» (`nav.leaveLocal`) con `useLeaveLocalMode()` en lugar de `useLogout()` (R28) |
| `src/routes/_app/settings.tsx` | en modo local, el loader no pide canales ni feed iCal y no se pintan `NotificationChannelsSection`, `CalendarFeedSection`, `DeviceNotificationsSection` ni `DataPortabilitySection` (R29); tampoco los campos `odometerReminderWeekday` y `reminderHour` (con su `InfoPopover` y su pista), que siguen en el formulario con el valor guardado para que guardar el resto no los cambie (R34) |
| `src/routes/_app/vehicles/$vehicleId/index.tsx`, `…/edit.tsx` | sin `SaleReportDialog` ni `PhotoPicker` en modo local (R30) |
| `src/features/maintenance/maintenance-form.tsx`, `maintenance-timeline.tsx` | sin `AttachmentPicker` ni el diálogo de adjuntos en modo local (R31) |
| `src/i18n/locales/{es,en}.json` | `nav.leaveLocal` («Cambiar de modo» / «Switch mode»); `mobile.welcome.comingSoon` se borra (R33) |
| `.github/workflows/ci.yml` | `'packages/db/**'` en el filtro `android` del job `changes` (R35) |
| `apps/mobile/test/release-workflow.test.mjs` | `ci android job only runs when…` exige también `packages/db/**` (R35) |
| `docs/mobile.md`, `CONTRIBUTING.md`, `docs/PLAN.md` | modo local y sus límites; `packages/db` en «Estructura» y «Base de datos»; convención de cambios de BD |

UI: mismos componentes y estados vacío/carga/error que hoy; solo se ocultan secciones. La tarjeta activa usa el estilo de la de «Mi servidor» (`hover:border-foreground/40`). Sin dispositivo Android para el implementer: deja en `progress/impl_mobile-local-core.md` una checklist manual (elegir el modo, crear vehículo, repostaje, mantenimiento con plan, borrar el vehículo, reiniciar la app, salir del modo; capturas en claro, oscuro y móvil de `/welcome`, ajustes y la ficha del vehículo) que el humano ejecuta con la APK de depuración antes de Gate 2.

Ajustes de recordatorios: ocultos en local hasta #67 (decidido en Gate 1); vuelven con los recordatorios locales.

Sin cambios de contrato HTTP ni de BD (las migraciones solo se mueven).

## Alternativas descartadas

- **Compartir los repositorios y servicios de la API** (hacerlos async y genéricos sobre el driver): son ~104 llamadas síncronas (`.all/.get/.run`) y transacciones síncronas de better-sqlite3 que no admiten callbacks async; además los servicios dependen de `sharp`, `node:fs` y el almacenamiento. Rompería «la API no cambia de comportamiento». Se comparten esquema, migraciones y reglas puras; la orquestación (≈ 500 líneas) se replica con tests propios.
- **Migraciones con `addUpgradeStatement` del plugin**: duplicaría el SQL en otra fuente de verdad y no se podría probar en Node. Se reutilizan los SQL de drizzle-kit y su tabla `__drizzle_migrations`.
- **`node:sqlite` para los tests**: evita una dependencia, pero es experimental en Node 22 y no es el motor de la API; better-sqlite3 ya se compila en el workspace (`allowBuilds`).
- **Abrir la base en `main.tsx` antes de renderizar**: un fallo del plugin dejaría la app en blanco; en el `beforeLoad` de `_app` acaba en `RouteErrorScreen`.

## Decisiones a validar

1. **Operaciones sin soporte → 501 `Not Implemented`** (no 404 ni 400): deja claro que existe pero no en este dispositivo. La UI no las llama porque están ocultas.
2. **Usuario local**: `id: 'local'`, `name: 'Local'`, `email: 'local@ikrive.invalid'`, `role: 'user'` (así el admin queda oculto por rol). `config()`: `maxUploadMb: 20` (default de la API) y `localBaseUrl: true`.
3. **Entrar en modo local no borra el servidor guardado** ni su token; mientras el indicador está a `local`, gana el modo local. Guardar un servidor en `/server` lo apaga (R6).
4. **Salir del modo local**: un botón «Cambiar de modo» ocupa el sitio de «Cerrar sesión» en la navegación y lleva a `/welcome`. La base queda abierta y se reutiliza al volver.
5. **El código local se carga con `import()`** solo en modo local; su chunk (drizzle + dominios) no se marca como nativo: la web lo precachea pero nunca lo ejecuta. Solo `lib/native-sqlite.ts` y el plugin van a `assets/native/`.

## Riesgos

- **Orden de columnas en Android**: el plugin devuelve filas como objetos y sqlite-proxy necesita arrays en orden de columna. `Object.values` lo respeta si el JSON conserva el orden (sí en Android) y no hay nombres repetidos: las consultas locales no hacen joins con columnas homónimas (si hace falta, alias). iOS antepone `ios_columns`: fuera de alcance (no hay app iOS).
- **`RETURNING` y transacciones del plugin**: `run` abre una transacción propia salvo `transaction=false`; dentro de `BEGIN` fallaría. Lo cubren el test de `native-sqlite.ts` con el plugin simulado (R14) y los de la base en memoria (R19); el comportamiento real del plugin solo se comprueba con la checklist manual que el humano ejecuta en el dispositivo antes de Gate 2. Si falla, vuelve a `in_progress`.
- **Dos copias de `drizzle-orm`** (api, db, web): mismos rangos para que pnpm resuelva una sola versión.
- **Ruta de `import.meta.glob`** fuera de `apps/web`: Vite la admite (el workspace está en `server.fs.allow`); si no, alias en `vite.config.ts`.
- **Enlace de «Añadir al calendario»** en local apunta a `https://localhost/…` (`getServerUrl() ?? origin`): inofensivo, se revisa con #67/#68.

## Fuera de alcance

Adjuntos, foto y `files.get` (#65); export/import y migración local → servidor (#66); avisos, bandeja y recordatorios (#67); PDF del informe (#68); cifrado (SQLCipher), copia de seguridad del dispositivo y app iOS.
