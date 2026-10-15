# Bitácora (append-only)

> Una entrada por feature cerrada. No se editan entradas anteriores; solo se añade al final.

---

## 2026-10-14 — Arnés SDD

- **Cambios:** `AGENTS.md`, `CHECKPOINTS.md`, `feature_list.json`, `docs/sdd.md`, `docs/verification.md`, `progress/`, agentes en `.claude/agents/`, hooks y skills en `.claude/`, `scripts/harness/`.
- **Backlog:** fases 1, 1b y 2 registradas como `done` (anteriores al arnés, sin spec). Fase 3 dividida en las features 4–8 (`pending`, `sdd: true`).
- **Resultado:** `pnpm harness` en verde.

## 2026-10-15 — #4 maintenance-records-api

- **Rama:** `feat/maintenance-records-api` (spec en `specs/maintenance-records-api/`, 18 R / 15 T).
- **Cambios:** helpers zod movidos a `shared/schemas/common.ts`; esquemas `shared/schemas/maintenance.ts`; tabla `maintenance_records` (migración `0002`, enlace `odometer_reading_id` con `set null`); módulo `api/modules/maintenance` con CRUD en `/api/vehicles/:id/maintenance`, sincronizado en transacción con una lectura de odómetro `source: 'maintenance'` (409 en conflicto, 400 en fecha futura, 404 en recursos ajenos).
- **Tests:** `apps/api/test/maintenance.test.ts` (11) y `shared/schemas/maintenance.test.ts` (3). `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_maintenance-records-api.md`). Avisos no bloqueantes: un PATCH revalida fecha/km actuales; test de borrado en cascada del vehículo pendiente para la feature 6.
- **Gate 2:** probado manualmente por el humano vía curl y aprobado.

## 2026-10-15 — #5 maintenance-attachments-api

- **Rama:** `feat/maintenance-attachments-api` (spec en `specs/maintenance-attachments-api/`, 20 R / 17 T).
- **Cambios:** enums `ATTACHMENT_MIME_TYPES`/`ATTACHMENT_ENTITY_TYPES` y `shared/schemas/attachments.ts`; tabla polimórfica `attachments` (migración `0003`); `lib/file-type.ts` (magic bytes de PDF, JPEG, PNG y WebP, sin dependencias nuevas), decodificación y miniatura WebP de 320 px en `lib/images.ts`, `UnsupportedMediaTypeError` (415); módulo `api/modules/attachments` con listado, subida, descarga, miniatura y borrado en `/api/vehicles/:id/maintenance/:recordId/attachments`; borrar un mantenimiento o un vehículo borra sus adjuntos (filas y ficheros).
- **Tests:** `apps/api/test/attachments.test.ts` (13) y `apps/api/test/file-type.test.ts` (2). `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_maintenance-attachments-api.md`). Avisos no bloqueantes: `request.file()` acepta cualquier nombre de campo; el fichero se bufferiza antes del 404 de propiedad; si una fila no tiene su fichero en disco, la descarga y la miniatura dan 500 en vez de 404 (revisar con el barrido de huérfanos de la fase 7).
- **Gate 2:** curls de prueba manual entregados al humano; merge aprobado.

## 2026-10-15 — #9 web-component-testing

- **Rama:** `feat/web-component-testing` (`sdd: false`, sin spec; guiada por los `acceptance`). Añadida a petición del humano para ir antes de #6.
- **Cambios:** devDependencies de Testing Library (`react`, `dom`, `user-event`, `jest-dom`) y `jsdom` en `apps/web`; `apps/web/vitest.config.ts` con proyectos `unit` (node, `*.test.ts`) y `dom` (jsdom, `*.test.tsx`); helper `apps/web/src/test/render.tsx` (`renderWithProviders`, `mockApi`) y `setup.ts`; `allowImportingTsExtensions` en `apps/web/tsconfig.json`; el script `test` de la web ya no usa `--passWithNoTests`. Docs en `CONTRIBUTING.md` y `docs/verification.md`.
- **Tests:** `odometer-form.test.tsx` (409 → error en el campo) y `form-field.test.tsx` (`role="alert"`). Web 18 tests. `pnpm harness --full` en verde.
- **Revisión:** APPROVED (`progress/review_web-component-testing.md`), con re-revisión tras Gate 2. Avisos no bloqueantes: el test de `OdometerForm` localiza la petición por URL en texto; `packages/shared` sigue con `--passWithNoTests`.
- **Gate 2:** el humano pidió quitar `--passWithNoTests` y aprobó el merge.
