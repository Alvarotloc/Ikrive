# Sesión actual

> Estado vivo. Se actualiza mientras se trabaja, no al final. Al cerrar la feature, su resumen pasa a `history.md` y este archivo vuelve a la plantilla.

- **Feature:** #54 `mobile-local-core` (reabierta en Gate 2, PR #58 sin integrar)
- **Rama:** `feat/mobile-local-core`
- **Estado:** ready_to_merge
- **Inicio:** 2026-11-12

## Plan

Arreglar el fallo encontrado en la checklist del dispositivo (paso 3, crear vehículo).

## Bitácora

- 2026-11-12: el humano pasa la checklist con la APK del CI: pasos 1–2 OK; paso 3 falla sin feedback. Consola del WebView: `TypeError: Cannot read properties of undefined (reading 'id')` en `vehicles.create`. Causa: el plugin emula `RETURNING` en `run(…, 'all')` releyendo `rowid BETWEEN last_insert_rowid()+1 AND lastId`, con el `last_insert_rowid()` previo de la conexión (otra tabla) → rango vacío. SQLCipher 4.17 soporta `RETURNING` nativo y `query()` pasa la sentencia tal cual.
- 2026-11-12: implementer: `native-sqlite.ts` manda las sentencias con `RETURNING` por `query` (test que prohíbe la emulación del plugin para INSERT/UPDATE/DELETE); `VehicleForm`, `vehicle-actions` y Ajustes muestran «Algo ha ido mal» si falla el guardado (`vehicle-save-errors.test.tsx`); checklist ampliada con edición y borrado; `pnpm harness --full` en verde.
- 2026-11-12: arreglo (RETURNING por `query`, errores de guardado visibles) → reviewer APPROVED (3ª revisión). Estado → ready_to_merge; push al PR #58 para la APK nueva.

## Notas del humano

- Pasa la checklist del dispositivo antes de integrar el PR.

## Próximo paso

El humano repite la checklist del dispositivo desde el paso 3 con la APK nueva del PR #58. Si pasa: estado → done, actualizar la entrada de history.md, commit de cierre y el humano integra el PR.
