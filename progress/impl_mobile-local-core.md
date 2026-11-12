# Implementación — mobile-local-core (#54)

Rama `feat/mobile-local-core`. Todas las tasks T1–T25 marcadas en `specs/mobile-local-core/tasks.md`. Sin commits.

## Resumen de cambios por archivo

### A. `packages/db` (T1–T3)
- `packages/db/package.json` (nuevo): `@ikrive/db`, exports `.` y `./schema`, deps `drizzle-orm ^0.45.4` y `@ikrive/shared`, dev `drizzle-kit` (sale de la API); scripts `typecheck`, `test`, `db:generate`.
- `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts` (`git mv` desde la API; `schema: ./src/schema/index.ts`, `out: ./migrations`).
- `packages/db/src/schema/*.ts` y `packages/db/migrations/**`: `git mv` sin cambios de contenido (`git status` los muestra como `R`, renombrados al 100 %).
- `packages/db/src/index.ts`: re-exporta el esquema, `LOCAL_USER_ID = 'local'` y `MIGRATIONS_FOLDER`. `index.test.ts`: la ruta apunta al journal.
- `apps/api/src/db/schema.ts` (sustituye la carpeta): `export * from '@ikrive/db/schema'`. Los imports de `src/` y `test/` no cambian.
- `apps/api/src/db/client.ts`: `dist/migrations` junto al bundle si existe; si no, `MIGRATIONS_FOLDER`.
- `apps/api/tsup.config.ts`: copia `packages/db/migrations` a `dist/migrations`.
- `apps/api/test/build.test.ts`: `copies the migrations…` compara con `packages/db/migrations`.
- `apps/api/package.json`: `@ikrive/db` (devDependency, como `@ikrive/shared`: va en el bundle); fuera `drizzle-kit` y `db:generate`.
- `package.json` (raíz): `db:generate` → `pnpm --filter @ikrive/db db:generate`.
- `docker/Dockerfile`: `COPY packages/db/package.json packages/db/`.

### B. Base y DataSource local (T4–T13)
- `apps/web/src/test/memory-sqlite.ts`: `createMemorySqlite()` (better-sqlite3 `:memory:`, filas como arrays con `.raw()`).
- `apps/web/src/lib/data-source/local/migrations.ts`: `BUNDLED_MIGRATIONS` (`import.meta.glob` de `packages/db/migrations/*.sql` + `_journal.json`) y `migrateLocal` (misma tabla y misma sentencia `CREATE TABLE __drizzle_migrations` que drizzle, hash SHA-256 con `crypto.subtle`, una transacción).
- `local/database.ts`: `openLocalDatabase` (`PRAGMA foreign_keys = ON`, migraciones, semilla de `user` y `user_settings` con `onConflictDoNothing`), tipos `LocalDb`/`LocalTx`, `LOCAL_USER`.
- `local/serial.ts`: `createSerialQueue()`.
- `local/problems.ts`: `problem`, `badRequest`, `notFound`, `conflict`, `unsupported` (501), `parseInput` (400 `Validation failed`).
- `local/{settings,vehicles,fuel-logs,maintenance,schedules,stats}.ts`: orquestación copiada de los `service.ts`/`repository.ts` de la API (mismos `orderBy`, textos de error y `toDto`), async y con `db.transaction`.
- `local/index.ts`: `createLocalDataSource` (cada método por la cola), `LOCAL_ME`, `LOCAL_CLIENT_CONFIG`, operaciones sin soporte → 501.
- `apps/web/package.json`: `@capacitor-community/sqlite 8.1.1`, `@ikrive/db`, `drizzle-orm ^0.45.4`; dev `better-sqlite3 ^13.0.3`, `@types/better-sqlite3 ^9.6.0` (una sola copia de drizzle-orm en el lockfile).

### C. Plugin nativo (T14–T15)
- `apps/web/src/lib/native-sqlite.ts`: `openDeviceDatabase()` (`checkConnectionsConsistency` + `isConnection` → `retrieveConnection` o `createConnection('ikrive', false, 'no-encryption', 1, false)`, `open()` si no está abierta) y `deviceCallback()` (SELECT/PRAGMA/WITH y cualquier sentencia con `RETURNING` → `query`; el resto de escrituras → `run(sql, params, false)`; `Object.values` por fila; `get` → primera fila).
- `apps/web/src/features/pwa/config.ts`: `native-(files|calendar|notifications|sqlite)` en `NATIVE_ONLY_MODULES`.
- `apps/mobile/package.json`: `@capacitor-community/sqlite 8.1.1`.

### D. Modo en la web (T16–T21)
- `apps/web/src/lib/app-mode.ts`: `MODE_KEY = 'ikrive.mode'`, `isLocalMode()`, `setLocalMode()`.
- `apps/web/src/features/mobile/local-mode.ts`: `activateLocalDataSource()` (promesa cacheada; `import()` de `native-sqlite` y `data-source/local`), `forgetLocalDataSource()` (tests), `useEnterLocalMode()`, `useLeaveLocalMode()`.
- `features/mobile/require-server.ts`: `requireServer()` redirige a `/` en modo local; nuevo `requireDataSource()` para `_app`.
- `routes/_app.tsx`: `beforeLoad` con `requireDataSource()`; `DeviceNotificationsSync` solo si nativa y no local.
- `routes/welcome.tsx`: tarjeta «En este teléfono» activa (estilo de «Mi servidor»), sin el badge «Próximamente».
- `features/mobile/use-change-server.ts`: `setLocalMode(false)` y vuelta a `httpDataSource`.
- `features/navigation/app-navigation.tsx`: en local, sin campana y «Cambiar de modo» en lugar de «Cerrar sesión» (Usuarios ya queda oculto por rol `user`).
- `routes/_app/settings.tsx`: en local el loader no pide canales ni feed iCal; se ocultan canales, feed iCal, notificaciones del teléfono, «Tus datos» y los campos de día del aviso de km y hora de recordatorios (siguen en el formulario con su valor).
- `routes/_app/vehicles/$vehicleId/index.tsx` / `edit.tsx`: sin `SaleReportDialog` ni `PhotoPicker` en local.
- `features/maintenance/maintenance-form.tsx` / `maintenance-timeline.tsx`: sin `AttachmentPicker` ni botón/diálogo de facturas en local.
- `i18n/locales/{es,en}.json`: `nav.leaveLocal` («Cambiar de modo» / «Switch mode»); fuera `mobile.welcome.comingSoon`.
- `src/test/setup.ts`: en `afterEach`, `setDataSource(httpDataSource)` y `forgetLocalDataSource()` (el flag ya lo borra `localStorage.clear()`).

### E. Cierre (T22–T25)
- `.github/workflows/ci.yml`: `'packages/db/**'` en el filtro `android`; `apps/mobile/test/release-workflow.test.mjs`: test renombrado a `ci android job only runs when mobile, web, packages/db, the lockfile or the workflow change`.
- `docs/mobile.md` (sección «En este teléfono», límites, CI), `CONTRIBUTING.md` (estructura, base de datos, DataSource local), `docs/PLAN.md` (estructura, convención de cambios de BD). No he tocado la tabla de estado del PLAN.

## Trazabilidad

| R | Archivo › test |
|---|---|
| R1 | `apps/web/src/features/mobile/welcome.test.tsx` › `choosing «En este teléfono» opens the dashboard in local mode without network` |
| R2 | `welcome.test.tsx` › `remembers local mode on restart`; `local-mode.test.tsx` › `an activation forgotten while opening never installs its DataSource` |
| R3 | `welcome.test.tsx` › `local mode redirects login and register to the dashboard` |
| R4 | `apps/web/src/lib/data-source/local/local-data-source.test.ts` › `returns the local user and config`; `welcome.test.tsx` › `choosing «En este teléfono»…` (sin red, «Hola, Local») |
| R5 | `apps/web/src/features/mobile/local-mode.test.tsx` › `leaving local mode goes to welcome and keeps the data` |
| R6 | `welcome.test.tsx` › `saving a server turns local mode off` |
| R7 | `apps/web/src/lib/app-mode.test.ts` › `is local only in the native app with the stored flag`; `welcome.test.tsx` › `web ignores the local mode flag` |
| R8 | `packages/db/src/index.test.ts` › `points MIGRATIONS_FOLDER to the drizzle-kit journal`, `turns file URLs into paths on POSIX and Windows`; typecheck y suite de la API (importa `@ikrive/db/schema`) |
| R9 | `apps/api/test/build.test.ts` › `copies the migrations and the report fonts`; 368 tests de la API sin cambiar aserciones; `pnpm db:generate` → «No schema changes, nothing to migrate»; imagen Docker + `docker/smoke.mjs` OK |
| R10 | `apps/web/src/lib/data-source/local/database.test.ts` › `creates the same schema as the API migrator`, `records the same migration hashes as the API migrator` |
| R11 | `database.test.ts` › `applies only pending migrations on reopen` |
| R12 | `database.test.ts` › `seeds the local user and default settings once` |
| R13 | `apps/web/src/lib/data-source/local/serial.test.ts` › `runs operations one after another even when one fails`; `local-data-source.test.ts` › `serializes concurrent writes` (comprobado que falla sin la cola: «cannot start a transaction within a transaction») |
| R14 | `apps/web/src/lib/native-sqlite.test.ts` › `maps selected rows to arrays in column order`, `runs writes without the plugin transaction`, `sends RETURNING statements through query, never through the plugin emulation`, `returns the first row for get`, `reuses an existing connection` (+ checklist del dispositivo) |
| R15 | `local-data-source.test.ts` › `rejects invalid input with a validation problem and writes nothing` |
| R16 | `local-data-source.test.ts` › `rejects unknown ids with 404` |
| R17 | `local-data-source.test.ts` › `reads and updates the settings` |
| R18 | `local-data-source.test.ts` › `creates a vehicle with its initial reading and lists it by status`, `archives and deletes a vehicle cascading its data`; `apps/web/src/features/vehicles/vehicle-save-errors.test.tsx` (error visible si falla el guardado) |
| R19 | `local-data-source.test.ts` › `archives and deletes a vehicle cascading its data` |
| R20 | `local-data-source.test.ts` › `rejects a future or conflicting reading and keeps readings of other records` |
| R21 | `local-data-source.test.ts` › `keeps the fuel reading in sync on create, edit and delete`, `recomputes fuel prices on edit` |
| R22 | `local-data-source.test.ts` › `keeps the maintenance reading and the schedule last done in sync` |
| R23 | `local-data-source.test.ts` › `rejects a schedule of another vehicle without writing` |
| R24 | `local-data-source.test.ts` › `rounds the maintenance spending` |
| R25 | `local-data-source.test.ts` › `creates schedules with defaults and requires an interval on edit` |
| R26 | `local-data-source.test.ts` › `computes the same stats as computeVehicleStats` |
| R27 | `local-data-source.test.ts` › `rejects unsupported operations with 501` |
| R28 | `local-mode.test.tsx` › `hides the bell and users and shows switch mode` |
| R29 | `local-mode.test.tsx` › `settings hide channels, calendar feed, device notifications and data` |
| R30 | `local-mode.test.tsx` › `vehicle page hides the sale report and the photo picker` |
| R31 | `local-mode.test.tsx` › `maintenance hides attachments` |
| R32 | `local-mode.test.tsx` › `does not sync device notifications` |
| R33 | `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys` |
| R34 | `local-mode.test.tsx` › `settings hide reminder preferences` |
| R35 | `apps/mobile/test/release-workflow.test.mjs` › `ci android job only runs when mobile, web, packages/db, the lockfile or the workflow change` |

## `pnpm harness --full`

```
[OK]    68 features: 63 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #54 mobile-local-core (in_progress)
[OK]    Rama actual: feat/mobile-local-core
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  22 files, 165 tests passed
packages/db       1 file,    3 tests passed
apps/api         38 files, 368 tests passed
apps/web         79 files, 517 tests passed
apps/mobile      27 tests passed, 0 fail
e2e               2 files,   6 tests passed
[OK]    pnpm test
[OK]    Arnés en verde.
```

Verificaciones adicionales:
- `pnpm db:generate` tras el movimiento: «No schema changes, nothing to migrate».
- `pnpm --filter @ikrive/web build`: drizzle y las migraciones solo están en el chunk `assets/local-*.js` (≈101 kB, no precargado por `index.html`); `native-sqlite` va a `assets/native/`. `build:native` OK.
- `docker build -f docker/Dockerfile` + `node docker/smoke.mjs` contra el contenedor: todos los checks en verde; `dist/migrations` con los 13 SQL + `meta/`.

## Revisión visual

Sin dispositivo ni plugin en el navegador (el plugin necesita la app nativa), solo pude capturar `/welcome` con `vite --mode native`:
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/59ba3f82-22c6-42fa-87bf-b7288f0e4c50/scratchpad/shots/welcome-light.png` (con hover sobre «En este teléfono»)
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/59ba3f82-22c6-42fa-87bf-b7288f0e4c50/scratchpad/shots/welcome-dark.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/59ba3f82-22c6-42fa-87bf-b7288f0e4c50/scratchpad/shots/welcome-mobile.png`

Las capturas de ajustes y de la ficha en modo local van en la checklist del dispositivo.

## Checklist manual del dispositivo (T23, la ejecuta el humano antes de Gate 2)

Con la APK de depuración (artefacto `ikrive-debug-apk` del CI de esta rama, o `pnpm --filter @ikrive/mobile build:web && pnpm --filter @ikrive/mobile exec cap sync android && cd apps/mobile/android && ./gradlew assembleDebug`). Mejor en una instalación limpia (desinstala antes o borra los datos de la app). Ten `adb logcat | grep -i -E "capacitor|sqlite|console"` abierto para ver errores.

1. ✅ **Elegir el modo** (pasado por el humano en la primera prueba). Abre la app → `/welcome`. «En este teléfono» está activa (sin «Próximamente»). Púlsala → entra al panel «Hola, Local» con el estado vacío, sin login ni «Mi servidor».
2. ✅ **Navegación** (pasado). No hay campana ni «Usuarios»; en lugar de «Cerrar sesión» aparece «Cambiar de modo».
3. **Crear vehículo** (`INSERT … RETURNING`; falló en la primera prueba) con kilometraje actual (p. ej. 12 000). Tras «Añadir vehículo» se abre su ficha con ese km de hoy y aparece en el panel. En la ficha no hay «Informe de venta»; en «Editar» no hay selector de foto. Si fallara, ahora debe salir el toast «Algo ha ido mal» y quedarse en el formulario (nunca un botón que no hace nada).
4. **Editar el vehículo** (`UPDATE … RETURNING`): cambia el nombre o la matrícula y guarda → la ficha muestra el valor nuevo. Archiva y desarchiva desde la ficha, y márcalo como vendido y deshazlo: el estado cambia en cada paso.
5. **Lecturas de km:** añade una lectura manual válida (aparece en el historial y en el km del vehículo) y bórrala (desaparece).
6. **Repostaje:** añade uno con fecha pasada y km menor que el actual → lo rechaza («no puede retroceder»). Añade otro válido (hoy, 12 400 km, 40 L, 60 €): se ve en la lista, el precio por litro es 1,5 y el km del vehículo pasa a 12 400. **Edítalo** (cambia los litros y el km): el precio se recalcula y el km del vehículo sigue al repostaje. **Bórralo**: desaparece también su lectura de km.
7. **Regla y mantenimiento:** crea una regla («Aceite», cada 15 000 km) y **edítala** (cambia el título o el intervalo) → se ve el cambio. Crea un mantenimiento con km 12 500, coste 80 y esa regla: el formulario no muestra «Facturas»; la fila no tiene el clip; la regla pasa a «última vez» = esa fecha y km; el gasto de la ficha muestra 80 €. **Edita** el mantenimiento (km 12 600, coste 90) → la lectura, la regla y el gasto (90 €) se actualizan. **Bórralo** → desaparece con su lectura y el gasto vuelve a 0. **Borra la regla**. Las estadísticas se pintan sin error.
8. **Ajustes:** solo Preferencias (sin día del aviso de km ni hora de recordatorios) y Apariencia; sin canales, calendario/iCal, notificaciones del teléfono ni «Tus datos». Cambia la moneda y guarda (`INSERT … ON CONFLICT … RETURNING`) → «Ajustes guardados» y los importes cambian de moneda.
9. **Reiniciar la app** (ciérrala desde recientes y ábrela): entra directa al panel en modo local, con el vehículo y sus datos.
10. **Borrar el vehículo:** desaparece junto con sus lecturas, repostajes, mantenimientos y reglas (crea otro vehículo después y comprueba que empieza vacío).
11. **Salir del modo:** «Cambiar de modo» → `/welcome`. Vuelve a elegir «En este teléfono» → los datos siguen ahí. Sal otra vez, elige «Mi servidor» y conecta un servidor real → login de ese servidor; tras iniciar sesión se ven sus datos, no los locales.
12. **Capturas** en modo local, tema claro, oscuro y vertical de móvil (Ajustes › Apariencia para el tema): `/welcome`, Ajustes y la ficha del vehículo (con repostaje, mantenimiento y regla).

Si algo de 3–10 falla con un error de SQL o de transacción (`cannot start a transaction within a transaction`, filas vacías o columnas cambiadas), es el riesgo de R14 descrito en el design: la feature vuelve a `in_progress` con el logcat.

## Desviaciones del spec

1. **`drizzle(callback, batch, config)` en lugar de `drizzle(callback, { schema, casing })`.** `drizzle-orm/sqlite-proxy` 0.45.4 solo lee `casing` del tercer argumento (`new SQLiteAsyncDialect({ casing: config?.casing })`); con dos argumentos generaba columnas en camelCase y fallaba (`table user has no column named emailVerified`). `openLocalDatabase` pasa un batch callback que ejecuta las sentencias una a una y la config como tercer argumento. Mismo resultado que el diseño.
2. **`BUNDLED_MIGRATIONS` guarda el SQL completo de cada fichero** (`tag`, `when`, `sql`) y `migrateLocal` calcula el hash y parte por `--> statement-breakpoint` al aplicarlas, porque `crypto.subtle.digest` es asíncrono y la constante no puede serlo. Firma de `openLocalDatabase(callback, migrations = BUNDLED_MIGRATIONS)` igual que en el diseño.
3. **`MIGRATIONS_FOLDER` sin `node:url`:** `fileUrlToPath(new URL('../migrations', import.meta.url))` (helper propio de `@ikrive/db`: pathname decodificado, sin la barra inicial de una unidad de Windows `/C:/…`) con la URL en una variable, para que la web pueda importar `@ikrive/db` en el navegador (Vite externaliza `node:*` y transformaría `new URL('…', import.meta.url)` en asset).
4. **`useChangeServer` también vuelve a `httpDataSource`** además de `setLocalMode(false)` (R6): si se guarda un servidor con la DataSource local instalada (p. ej. desde el enlace «Cambiar servidor» de la pantalla de error), las peticiones irían a SQLite.
5. **Tests extra:** `database.test.ts` › `records the same migration hashes as the API migrator` y `packages/db/src/index.test.ts`.
6. **`@ikrive/db` como devDependency de la API**, igual que `@ikrive/shared` (ambos van dentro del bundle de tsup); el diseño decía «dependencia».
7. `openDeviceDatabase` llama a `checkConnectionsConsistency()` antes de `isConnection` (patrón documentado del plugin para cuando el WebView se recarga y el lado nativo conserva la conexión) y solo hace `open()` si `isDBOpen()` es falso.

## Notas para el leader

- `.claude/agents/implementer.md` (paso 4) sigue diciendo «edita `apps/api/src/db/schema/`»: ahora es `packages/db/src/schema/`. No lo he tocado (fuera del alcance de `design.md`).
- El README (hoja de ruta) dice «después, modo En este teléfono»; se puede actualizar al publicar.
- En modo local el panel saluda «Hola, Local» (nombre del usuario sintético decidido en Gate 1).
- `packages/shared` también va en la APK y tampoco está en el filtro `android` del CI (ya pasaba antes; el spec solo pedía `packages/db`).

## Cambios tras la revisión (`progress/review_mobile-local-core.md`)

1. **Tests de modo local deterministas (Hallazgo 1).** `welcome.test.tsx` y `local-mode.test.tsx` cargan `@/lib/data-source/local` y `@/lib/native-sqlite` (el mock) en un `beforeAll`, antes de cualquier `findBy*`, igual que `renderApp` precarga los chunks de rutas: la transformación de Vite ya no consume el timeout de 1 s ni depende del orden de los tests.
2. **Activación huérfana (agravante del Hallazgo 1).** `activateLocalDataSource()` solo instala la DataSource si, tras el `await`, su promesa sigue siendo la vigente; si `forgetLocalDataSource()` la descartó mientras abría, no llama a `setDataSource` (y un fallo tampoco borra una activación posterior). Test nuevo: `local-mode.test.tsx` › `an activation forgotten while opening never installs its DataSource` (retiene la apertura con una promesa, olvida, la suelta: sigue la HTTP; la siguiente activación sí instala la local). Comprobado que falla sin la guarda.
3. **Aviso no bloqueante de Windows:** `MIGRATIONS_FOLDER` usa `fileUrlToPath` (`/C:/…` → `C:/…`) con su test en `packages/db/src/index.test.ts`.

Verificación: la suite web completa 5 veces seguidas con `nproc` bucles `node` de CPU al 100 % y los tests de la API en paralelo en cada vuelta: 517/517 las 5 veces. `pnpm harness --full` en verde (salida arriba).

## Cambios tras la prueba en dispositivo

El humano pasó los pasos 1–2 de la checklist; el 3 (crear vehículo) falló: `TypeError: Cannot read properties of undefined (reading 'id')` en `vehicles.create`, dentro de `db.transaction`, sin ningún aviso en la UI.

1. **Causa y arreglo (R14).** Con `run(sql, params, false, 'all')` el plugin (Android, `Database.java`) quita el `RETURNING`, ejecuta la sentencia y relee las filas por `rowid` entre el `last_insert_rowid()` de la conexión anterior (del último insert en cualquier tabla) y el nuevo: el rango sale vacío y `.returning().get()` devuelve `undefined`; `UPDATE/DELETE … RETURNING` también se emulan. `deviceCallback` manda ahora toda sentencia con `RETURNING` por `connection.query(sql, params)` (el SQLite de SQLCipher 4.17 lo soporta de forma nativa y `query` pasa la sentencia tal cual); el resto de escrituras sigue con `run(sql, params, false)`. Comentario del módulo actualizado con el motivo.
2. **Tests.** `native-sqlite.test.ts` › `sends RETURNING statements through query, never through the plugin emulation`: el `run` simulado lanza si recibe una sentencia con `RETURNING` o un `returnMode`; INSERT, UPDATE y DELETE con `RETURNING` van por `query` con sus parámetros y devuelven las filas como arrays (falla con el código anterior). `returns the first row for get` ya no usa `run`.
3. **Errores visibles al guardar** (en los dos modos). `VehicleForm` captura el rechazo de su `onSubmit` y muestra el toast `common.error` («Algo ha ido mal») sin salir del formulario (alta en `vehicles/new.tsx` y edición en `$vehicleId/edit.tsx`); lo mismo en `vehicle-actions.tsx` (archivar, vendido, borrar) y en el guardado de Ajustes. El resto de formularios del alcance local (repostaje, mantenimiento, regla, lectura de km y los borrados de sus listas) ya capturaban el error. Tests en `apps/web/src/features/vehicles/vehicle-save-errors.test.tsx`: `shows an error and stays on the form when the API fails`, `shows an error and stays on the form when the phone database fails` (el callback de la base falla en `insert into "vehicles"`), `shows an error when saving the settings fails`; los dos primeros fallan sin el cambio en `VehicleForm`.
4. **Checklist ampliada** (arriba): pasos 1–2 marcados como pasados; pasos explícitos de edición (`UPDATE … RETURNING`: vehículo, archivar/vendido, repostaje, regla, mantenimiento, ajustes) y de borrado (lectura, repostaje, mantenimiento, regla, vehículo).

`pnpm harness --full` en verde tras estos cambios (web 520 tests).
