# Tasks — mobile-local-core

## A. `packages/db`

- [x] T1 — Crear `packages/db` (`package.json`, `tsconfig.json`, `drizzle.config.ts`, `src/index.ts` con `LOCAL_USER_ID` y `MIGRATIONS_FOLDER`); `git mv` de `apps/api/src/db/schema/*` a `packages/db/src/schema/` y de `apps/api/src/db/migrations/` a `packages/db/migrations/`; `drizzle-kit` y `db:generate` pasan a `@ikrive/db` (y el script raíz). Cubre: R8.
- [x] T2 — `apps/api/src/db/schema.ts` re-exporta `@ikrive/db/schema`; `client.ts` resuelve `MIGRATIONS_DIR` (bundle → `dist/migrations`, fuentes → `MIGRATIONS_FOLDER`); `tsup.config.ts` copia `packages/db/migrations`; dependencia `@ikrive/db` en la API; `COPY packages/db/package.json` en `docker/Dockerfile`. Cubre: R8, R9.
- [x] T3 — `apps/api/test/build.test.ts` › `copies the migrations and the report fonts` compara `dist/migrations` con `packages/db/migrations`. Ejecutar `pnpm db:generate` y confirmar «No schema changes». Cubre: R9.

## B. Base local

- [x] T4 — `apps/web/src/test/memory-sqlite.ts` (`createMemorySqlite`) y devDependencies `better-sqlite3`, `@types/better-sqlite3`; dependencias `@ikrive/db`, `drizzle-orm`. Cubre: R10.
- [x] T5 — `apps/web/src/lib/data-source/local/migrations.ts` (`BUNDLED_MIGRATIONS`, `migrateLocal`) y `database.ts` (`openLocalDatabase` con `foreign_keys`, migraciones y semilla del usuario local). Cubre: R10, R11, R12.
- [x] T6 — Tests en `apps/web/src/lib/data-source/local/database.test.ts`: `creates the same schema as the API migrator` (compara `sqlite_master` con el de `drizzle-orm/better-sqlite3/migrator` sobre `MIGRATIONS_FOLDER`), `applies only pending migrations on reopen` (reabrir no falla y `__drizzle_migrations` tiene 13 filas), `seeds the local user and default settings once`. Cubre: R10, R11, R12.
- [x] T7 — `apps/web/src/lib/data-source/local/serial.ts` y test `serial.test.ts` › `runs operations one after another even when one fails`. Cubre: R13.
- [x] T8 — `apps/web/src/lib/data-source/local/problems.ts` (`problem`, `notFound`, `badRequest`, `conflict`, `unsupported`, `parseInput`). Cubre: R15, R16, R27.

## C. Dominios locales

- [x] T9 — `local/settings.ts` y `local/vehicles.ts` (vehículos + lecturas). Cubre: R17, R18, R19, R20.
- [x] T10 — `local/fuel-logs.ts`. Cubre: R21.
- [x] T11 — `local/maintenance.ts` (incluye `spending`) y `local/schedules.ts`. Cubre: R22, R23, R24, R25.
- [x] T12 — `local/stats.ts` y `local/index.ts` (`createLocalDataSource`, `LOCAL_ME`, `LOCAL_CLIENT_CONFIG`, cola en cada método, `unsupported()` para foto, adjuntos, `files`, `saleReport`, `reportShares`, `notifications`, `notificationChannels`, `calendarFeed`, `dataPortability`, `adminUsers`). Cubre: R4, R13, R26, R27.
- [x] T13 — Tests en `apps/web/src/lib/data-source/local/local-data-source.test.ts` (base en memoria): `reads and updates the settings`, `rejects invalid input with a validation problem and writes nothing`, `creates a vehicle with its initial reading and lists it by status`, `archives and deletes a vehicle cascading its data`, `rejects unknown ids with 404`, `rejects a future or conflicting reading and keeps readings of other records`, `keeps the fuel reading in sync on create, edit and delete`, `recomputes fuel prices on edit`, `keeps the maintenance reading and the schedule last done in sync`, `rejects a schedule of another vehicle without writing`, `rounds the maintenance spending`, `creates schedules with defaults and requires an interval on edit`, `computes the same stats as computeVehicleStats`, `returns the local user and config`, `serializes concurrent writes`, `rejects unsupported operations with 501`. Los DTO se validan con su esquema de `@ikrive/shared`. Cubre: R4, R13, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27.

## D. Plugin nativo

- [x] T14 — `@capacitor-community/sqlite` 8.1.1 en `apps/mobile/package.json` y `apps/web/package.json`; `apps/web/src/lib/native-sqlite.ts` (`openDeviceDatabase`); `native-sqlite` en `NATIVE_ONLY_MODULES` (`features/pwa/config.ts`). Cubre: R14.
- [x] T15 — Test `apps/web/src/lib/native-sqlite.test.ts` con el plugin simulado (`vi.mock('@capacitor-community/sqlite')`): `maps selected rows to arrays in column order`, `runs writes without the plugin transaction`, `returns RETURNING rows`, `returns the first row for get`, `reuses an existing connection`. `src/features/pwa/native-only.test.ts` sigue en verde. Cubre: R14.

## E. Modo en la web

- [x] T16 — `apps/web/src/lib/app-mode.ts` y test `app-mode.test.ts` › `is local only in the native app with the stored flag`. Cubre: R7.
- [x] T17 — `apps/web/src/features/mobile/local-mode.ts` (`activateLocalDataSource`, `useEnterLocalMode`, `useLeaveLocalMode`); `require-server.ts` (`requireServer` con local → `/`, `requireDataSource`); `routes/_app.tsx`; `routes/welcome.tsx` con la tarjeta activa; `use-change-server.ts` apaga el modo local; reset en `src/test/setup.ts`. Cubre: R1, R2, R3, R5, R6, R32.
- [x] T18 — Navegación (`app-navigation.tsx`), ajustes (`routes/_app/settings.tsx`, incluidas las preferencias de recordatorios y aviso de km), ficha y edición del vehículo, formulario y timeline de mantenimiento ocultan lo indicado en modo local. Textos `nav.leaveLocal` en `es.json`/`en.json`; se borra `mobile.welcome.comingSoon`. Cubre: R28, R29, R30, R31, R32, R33, R34.
- [x] T19 — Tests en `apps/web/src/features/mobile/welcome.test.tsx` (sustituye `shows «En este teléfono» disabled as coming soon`): `choosing «En este teléfono» opens the dashboard in local mode without network`, `remembers local mode on restart`, `local mode redirects login and register to the dashboard`, `saving a server turns local mode off`, `web ignores the local mode flag`. `@/lib/native-sqlite` sustituido por `createMemorySqlite()`. Cubre: R1, R2, R3, R4, R6, R7.
- [x] T20 — Tests en `apps/web/src/features/mobile/local-mode.test.tsx` (`renderApp`, modo local, sin red): `leaving local mode goes to welcome and keeps the data` (crear vehículo, salir, volver a entrar y verlo), `hides the bell and users and shows switch mode`, `settings hide channels, calendar feed, device notifications and data`, `settings hide reminder preferences` (no se ven día del aviso de km ni hora de recordatorios y guardar el resto conserva sus valores), `vehicle page hides the sale report and the photo picker`, `maintenance hides attachments`, `does not sync device notifications`. Cubre: R5, R28, R29, R30, R31, R32, R34.
- [x] T21 — `src/i18n/locales.test.ts` › `es and en define the same keys` en verde. Cubre: R33.

## F. Cierre

- [x] T22 — Documentar el modo local en `docs/mobile.md` (cómo elegirlo, salir, qué falta hasta #65–#68), `packages/db` en `CONTRIBUTING.md` («Estructura», «Base de datos», DataSource local) y en `docs/PLAN.md` (estructura, convención de cambios de BD). Cubre: R8.
- [x] T23 — Escribir en `progress/impl_mobile-local-core.md` la checklist manual para el humano con la APK de depuración antes de Gate 2 (no la ejecuta el implementer): elegir el modo, crear vehículo, repostaje, mantenimiento con plan, borrar el vehículo, reiniciar la app y salir del modo; capturas en claro, oscuro y móvil de `/welcome`, ajustes y la ficha en modo local. R14 y R19 quedan cubiertos por T13 y T15. Cubre: R1, R2.
- [x] T25 — Añadir `'packages/db/**'` al filtro `android` del job `changes` en `.github/workflows/ci.yml` y a la lista de rutas de `apps/mobile/test/release-workflow.test.mjs` › `ci android job only runs when mobile, web, the lockfile or the workflow change` (nombre ajustado para incluir `packages/db`). Cubre: R35.
- [x] T24 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_mobile-local-core.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22, R23, R24, R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R35.
