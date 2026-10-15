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
