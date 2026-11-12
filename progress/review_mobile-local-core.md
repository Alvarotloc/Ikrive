# Review — #54 mobile-local-core

**Veredicto:** APPROVED (segunda revisión)

Primera revisión: CHANGES_REQUESTED por tests inestables en `welcome.test.tsx` (Hallazgo 1). Los dos cambios requeridos están resueltos y verificados (ver «Segunda revisión» al final).

## Trazabilidad requirements ↔ tests

- R1: [x] `apps/web/src/features/mobile/welcome.test.tsx:61` › `choosing «En este teléfono» opens the dashboard in local mode without network` (botón activo sin «Próximamente», «Hola, Local», ruta `/`, flag `local`, DataSource ≠ HTTP, `fetch` sin llamadas)
- R2: [x] `welcome.test.tsx:79` › `remembers local mode on restart` (reinicio simulado con `forgetLocalDataSource`, el vehículo creado sigue ahí, `device.opened === 2`, sin red)
- R3: [x] `welcome.test.tsx:98` › `local mode redirects login and register to the dashboard` (ambas rutas → `/`, sin red)
- R4: [x] `apps/web/src/lib/data-source/local/local-data-source.test.ts` › `returns the local user and config` (`meSchema.parse`, id/name/email/role, `config` = `LOCAL_CLIENT_CONFIG`, ninguna sentencia SQL) + R1 sin red
- R5: [x] `apps/web/src/features/mobile/local-mode.test.tsx:53` › `leaving local mode goes to welcome and keeps the data` (ruta `/welcome`, flag borrado, DataSource HTTP, al volver el vehículo sigue)
- R6: [x] `welcome.test.tsx:112` › `saving a server turns local mode off` (flag `null`, `isLocalMode()` falso, DataSource HTTP, `/login`)
- R7: [x] `apps/web/src/lib/app-mode.test.ts` › `is local only in the native app with the stored flag`; `welcome.test.tsx:133` › `web ignores the local mode flag` (va a `/login`, HTTP, `device.opened === 0`)
- R8: [x] `packages/db/src/index.test.ts` › `points MIGRATIONS_FOLDER to the drizzle-kit journal` + typecheck/suite de la API importando `@ikrive/db/schema` vía `apps/api/src/db/schema.ts` (requirement estructural; aceptable)
- R9: [x] `apps/api/test/build.test.ts` › `copies the migrations and the report fonts` (compara `dist/migrations` con `packages/db/migrations`); SQL renombrados al 100 % (`git status` → `R`); 368 tests de la API sin cambiar aserciones
- R10: [x] `apps/web/src/lib/data-source/local/database.test.ts` › `creates the same schema as the API migrator` (igualdad de `sqlite_master` con el migrador de better-sqlite3) y `records the same migration hashes as the API migrator`
- R11: [x] `database.test.ts` › `applies only pending migrations on reopen` (parte de 5 migraciones, comprueba que no recrea `vehicles`, sí `notifications`, 13 filas y tercer open idempotente)
- R12: [x] `database.test.ts` › `seeds the local user and default settings once` (1 usuario con sus campos, settings = `DEFAULT_USER_SETTINGS`)
- R13: [x] `serial.test.ts` › `runs operations one after another even when one fails` (orden exacto de eventos, fallo no bloquea); `local-data-source.test.ts` › `serializes concurrent writes` (5 creates concurrentes → 5 logs y 5 lecturas)
- R14: [x] `apps/web/src/lib/native-sqlite.test.ts` (5 tests: arrays en orden de columna, `run(…, false)`, `RETURNING` con `run(…, false, 'all')`, primera fila en `get`, reutiliza conexión) + checklist del dispositivo
- R15: [x] `local-data-source.test.ts` › `rejects invalid input with a validation problem and writes nothing` (400 `Validation failed`, paths `make`/`year`/`totalPrice`, `writes()` vacío)
- R16: [x] `local-data-source.test.ts` › `rejects unknown ids with 404` (vehículo, lectura, repostaje, mantenimiento, plan, gasto, stats con `detail` exacto)
- R17: [x] `local-data-source.test.ts` › `reads and updates the settings`
- R18: [x] `local-data-source.test.ts` › `creates a vehicle with its initial reading and lists it by status`, `archives and deletes a vehicle cascading its data` (`vehicleSchema.parse`, `photoUrl: null`, lectura inicial, filtros por estado)
- R19: [x] `local-data-source.test.ts` › `archives and deletes a vehicle cascading its data` (tablas de lecturas, repostajes, mantenimientos y planes vacías)
- R20: [x] `local-data-source.test.ts` › `rejects a future or conflicting reading and keeps readings of other records` (400 con detail, 409, sin escrituras, 409 al borrar lectura `fuel`)
- R21: [x] `local-data-source.test.ts` › `keeps the fuel reading in sync on create, edit and delete`, `recomputes fuel prices on edit`
- R22: [x] `local-data-source.test.ts` › `keeps the maintenance reading and the schedule last done in sync`
- R23: [x] `local-data-source.test.ts` › `rejects a schedule of another vehicle without writing` (400 con detail exacto, `writes()` vacío)
- R24: [x] `local-data-source.test.ts` › `rounds the maintenance spending` (0 sin registros, 10.1 + 20.2 + null → 30.3)
- R25: [x] `local-data-source.test.ts` › `creates schedules with defaults and requires an interval on edit`
- R26: [x] `local-data-source.test.ts` › `computes the same stats as computeVehicleStats`
- R27: [x] `local-data-source.test.ts` › `rejects unsupported operations with 501` (27 operaciones, problem exacto, ninguna sentencia)
- R28: [x] `local-mode.test.tsx:71` › `hides the bell and users and shows switch mode`
- R29: [x] `local-mode.test.tsx:82` › `settings hide channels, calendar feed, device notifications and data` (+ `fetchMock` sin llamadas en `afterEach`)
- R30: [x] `local-mode.test.tsx:112` › `vehicle page hides the sale report and the photo picker`
- R31: [x] `local-mode.test.tsx:125` › `maintenance hides attachments`
- R32: [x] `local-mode.test.tsx:141` › `does not sync device notifications`
- R33: [x] `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys` (`nav.leaveLocal` en ambos; `comingSoon` eliminado de ambos y sin referencias)
- R34: [x] `local-mode.test.tsx:97` › `settings hide reminder preferences` (campos ocultos y, tras guardar moneda, `odometerReminderWeekday: 3`, `reminderHour: 20` intactos)
- R35: [x] `apps/mobile/test/release-workflow.test.mjs` › `ci android job only runs when mobile, web, packages/db, the lockfile or the workflow change`

## Tasks

- T1..T25: [x] (todas marcadas en `specs/mobile-local-core/tasks.md`)

## Desviaciones declaradas en `impl_mobile-local-core.md`

1. `drizzle(callback, batch, config)`: aceptable. Es necesaria por la firma real de `sqlite-proxy` 0.45.4 y los tests de esquema/semilla demuestran el `snake_case`.
2. `BUNDLED_MIGRATIONS` con el SQL completo y hash en `migrateLocal`: aceptable (`crypto.subtle` es async); los hashes se comparan con los del migrador de la API.
3. `MIGRATIONS_FOLDER` con `new URL(...).pathname` sin `node:url`: aceptable para Linux/macOS/Docker; ver aviso sobre Windows.
4. `useChangeServer` vuelve también a `httpDataSource`: aceptable y correcto (evita que peticiones de servidor caigan en SQLite); cubierto por `saving a server turns local mode off`.
5. Tests extra: bien.
6. `@ikrive/db` como devDependency de la API: aceptable, coherente con `@ikrive/shared` (va en el bundle de tsup; build y smoke de Docker OK).
7. `checkConnectionsConsistency()` antes de `isConnection`: aceptable, patrón documentado del plugin; cubierto por `reuses an existing connection`.

## Checkpoints

- C1: [x] `pnpm harness` en verde; una feature activa (#54); rama `feat/mobile-local-core`.
- C2: [x] spec completo; EARS con tabla acceptance → R; tasks `[x]`; cada R con test leído.
- C3: [x] diff limitado a lo de `design.md`. Los cambios en `.claude/agents/implementer.md` y `docs/sdd.md` (ruta del esquema → `packages/db/src/schema/`) son configuración del arnés coherente con el movimiento, no código de otra feature.
- C4: [x] sin endpoints ni cambios de esquema (solo `git mv`); código web en `lib/data-source/local/` y `features/mobile/` según el design; textos en `es.json`/`en.json`; lógica de dominio reutilizada de `@ikrive/shared`; la orquestación local replica fielmente los `service.ts`/`repository.ts` (mismos `orderBy`, textos de error, orden validación → propiedad → escritura, transacciones).
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs nuevos; fechas `YYYY-MM-DD`; sin ficheros subidos (adjuntos/foto → 501).
- C6: [x] `pnpm harness --full` en verde y suite web estable bajo carga (Hallazgo 1 resuelto). Tests con SQLite en memoria real (better-sqlite3), sin mocks de BD. Capturas: solo `/welcome` (claro/oscuro/móvil); ajustes y ficha en local quedan en la checklist del dispositivo, justificado (el plugin necesita la app nativa; así lo prevé el design).
- C7: [x] `impl_mobile-local-core.md` con archivos, mapa R → test y salida; `progress/current.md` al día; `docs/PLAN.md` actualizado (estructura y convención de BD; la feature no cierra fase).

## Hallazgos

1. **`apps/web/src/features/mobile/welcome.test.tsx:71` y `:84` — tests inestables (R1, R2).** Reproducido: `pnpm --filter @ikrive/web exec vitest run` con la CPU cargada falla 2 de 5 ejecuciones exactamente con los dos tests que vio el leader:
   ```
   × choosing «En este teléfono» opens the dashboard in local mode without network 1333ms
   × remembers local mode on restart 1006ms
   TestingLibraryElementError: Unable to find role="heading" and name "Hola, Local"
   ```
   Causa: `activateLocalDataSource()` (`features/mobile/local-mode.ts:14-19`) hace `import('@/lib/data-source/local')`, que arrastra `drizzle-orm/sqlite-proxy`, `@ikrive/db/schema`, los 13 SQL de `import.meta.glob` y los seis dominios. En `welcome.test.tsx` el primer test que entra en modo local paga esa transformación de Vite **dentro** del `findByRole` de 1 s (sin carga ya tarda ~330 ms; con carga supera 1 s). El segundo test falla en cascada porque la transformación del primero sigue en curso. Es exactamente el anti-patrón que `src/test/render-app.tsx` documenta y evita para los chunks de rutas («the first test of a worker pays for Vite transforming… runs out with an empty body»), pero `renderApp` no precarga este `import()`. `local-mode.test.tsx` se salva solo por orden: su primer test llama a `localData()` antes de renderizar y calienta el módulo para los demás; `hides the bell…`, `settings hide channels…` y `does not sync…` fallarían igual si se ejecutan aislados (`-t`) o en otro orden con carga.
   Agravante (estado de módulo compartido): si un test agota el timeout con la activación aún pendiente, `afterEach` hace `forgetLocalDataSource()` y `setDataSource(httpDataSource)`, pero la promesa huérfana sigue viva y su `setDataSource(await local)` (`local-mode.ts:28`) instala más tarde la DataSource del test anterior sobre la del siguiente.

## Avisos para el humano (no bloquean)

- R14 (`run(…, false)` con `BEGIN` del proxy, orden de columnas con `Object.values`) solo se verifica con el plugin simulado: la checklist del dispositivo de `impl_mobile-local-core.md` es imprescindible antes de Gate 2, tal y como prevé el design.
- `packages/shared` tampoco está en el filtro `android` del CI (preexistente; anotado por el implementer).
- README (hoja de ruta) sigue diciendo «después, modo En este teléfono».

## Cambios requeridos (primera revisión, resueltos)

1. Hacer deterministas los tests de modo local (Hallazgo 1): cargar `@/lib/data-source/local` (y el mock de `@/lib/native-sqlite`) **antes** de cualquier `findBy*`, con la misma estrategia que `renderApp` aplica a los chunks de rutas. Por ejemplo, un `beforeAll(async () => { await import('@/lib/data-source/local'); })` en `welcome.test.tsx` y en `local-mode.test.tsx` (para que no dependa del orden de los tests), o que `renderApp` lo precargue cuando `isLocalMode()` sea cierto o la ruta sea `/welcome`. Verificar con la suite web bajo carga (p. ej. 40 bucles `node -e "while(true){}"` en paralelo) varias veces seguidas.
2. Evitar la fuga entre tests de la activación pendiente: que una activación invalidada por `forgetLocalDataSource()` no llegue a llamar a `setDataSource` (p. ej. comprobar tras el `await` que la promesa sigue siendo la vigente antes de instalarla).

## Segunda revisión

1. **Hallazgo 1, tests inestables: resuelto.** `welcome.test.tsx:25` y `local-mode.test.tsx:39` cargan `@/lib/data-source/local` y `@/lib/native-sqlite` en un `beforeAll`, antes de cualquier `findBy*`. Verificación propia: la suite web completa 5 veces seguidas con 40 bucles de CPU al 100 % en paralelo dio 517/517 las 5 veces (antes fallaban 2 de 5 ejecuciones). `local-mode.test.tsx -t "does not sync"`, que antes dependía del orden de los tests, pasa aislado.
2. **Activación huérfana: resuelto.** `features/mobile/local-mode.ts` › `activateLocalDataSource` solo llama a `setDataSource` si, tras el `await`, la promesa sigue siendo la vigente, y un fallo solo limpia `local` si es la suya. Test nuevo: `local-mode.test.tsx:164` › `an activation forgotten while opening never installs its DataSource`. Retiene la apertura con `device.gate`, que `beforeEach` restablece; comprueba que sigue la DataSource HTTP y que la activación siguiente sí instala la local.
3. **Aviso de Windows: resuelto.** `packages/db/src/index.ts` › `fileUrlToPath` quita la barra de `/C:/…`. Test: `packages/db/src/index.test.ts` › `turns file URLs into paths on POSIX and Windows`.

`pnpm harness --full`: verde (lint, typecheck; shared 165, db 3, api 368, web 517, mobile OK, e2e 6). Los ficheros tocados son los mismos que en la primera revisión, sin nada nuevo fuera del alcance.

Antes de Gate 2 sigue siendo imprescindible la checklist del dispositivo de `impl_mobile-local-core.md` (R14 sobre el plugin real).
