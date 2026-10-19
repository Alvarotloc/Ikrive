# Review — #8 vehicle-maintenance-spending

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/api/test/maintenance.test.ts` › `maintenance spending` › `sums the costs of the vehicle's records`: 10.1 + 20.2 + un `null`; los 500 de otro vehículo del mismo usuario no cuentan → 200 `{ total: 30.3 }`. Tras el PATCH da 35.75 y tras el DELETE 15.55.
- R2: [x] mismo describe › `returns zero without records with cost`: sin registros → 200 `{ total: 0 }`; con un registro sin coste → 200 `{ total: 0 }`.
- R3: [x] `sums the costs of the vehicle's records`: `toEqual({ total: 30.3 })` comprueba el redondeo (en coma flotante sería 30.299999999999997). 35.75 y 15.55 también salen exactos.
- R4: [x] mismo describe › `hides other users' spending`: un vehículo ajeno y un id inexistente → 404, `content-type` `application/problem+json`, `detail` «Vehicle not found». Sin sesión → 401.
- R5: [x] `apps/web/src/features/maintenance/maintenance-spending.test.tsx` › `shows the spending in the user's currency`: con USD, el texto coincide con `Intl.NumberFormat('es', USD)` y la tarjeta no contiene «€». El montaje en la ficha se valida con typecheck y capturas; revisé `mobile-375-dark-zero.png`.
- R6: [x] mismo archivo › `shows zero as an amount`: se muestra «0,00 €» y no «—».
- R7: [x] mismo archivo › `refreshes the spending after deleting a record`: la métrica pasa de 489,90 € a 89,90 € tras confirmar el borrado en `MaintenanceSection`. Además, `maintenance-form.test.tsx` › `invalidates the vehicle queries after saving` afirma `isInvalidated` en `maintenanceSpending('v1')` tras crear.
- R8: [x] las claves `vehicles.metrics.maintenanceSpending` están en `es.json` y en `en.json`. Lo cubre `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys`, y los tests de componente usan la etiqueta en español.

## Tasks
- T1..T13: [x]

## Checkpoints
- C1: [x] El arnés está en verde, hay una sola feature activa (#8 in_progress) y la rama es `feat/vehicle-maintenance-spending`.
- C2: [x] Están los 3 archivos del spec, los requirements en EARS cubren los 3 acceptance, las tasks están `[x]` y cada R tiene un test leído.
- C3: [x] El diff coincide archivo por archivo con la tabla de `design.md`. Fuera de ella solo se tocan `progress/` y `tasks.md`.
- C4: [x] El código está en `modules/maintenance/{routes,service,repository}`. La ruta valida con `idParamSchema` y `maintenanceSpendingSchema` de `@ikrive/shared`. `requireVehicle` responde 404 a un vehículo ajeno. No hay cambios de BD. En la web: `features/maintenance`, `queryOptions`, i18n en es/en y se reutiliza `Metric`. No hay lógica de dominio pura nueva que deba ir a shared: el redondeo es una línea en el servicio, como dice el diseño.
- C5: [x] Sin `any`, sin `@ts-ignore`, sin `console.log` y sin TODOs. Ni fechas ni ficheros entran en juego.
- C6: [x] `pnpm harness --full` en verde, ejecutado por mí: shared 11, api 45, web 107. Los tests de API usan la app de test con SQLite en memoria. Hay capturas en claro, oscuro, 375 px, 1024 px y escritorio.
- C7: [x] `impl_<name>.md` incluye los archivos, el mapa R→test y la salida. `current.md` está al día. `PLAN.md` no cambia: la feature no cierra fase ni cambia decisiones.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- Las capturas están en el scratchpad de la sesión (`/tmp/claude-1000/.../scratchpad/shots/`), que es efímero: se perderán al limpiarse `/tmp`.
- El registro estático `/maintenance/spending` antes de `/:recordId` se apoya en la prioridad de find-my-way, y el primer test lo comprueba de forma implícita: una colisión devolvería 404 de registro.
- A 1024 px y en escritorio, la etiqueta «GASTO EN MANTENIMIENTO» ocupa dos líneas (lo anota el implementer). La cifra no se corta.

## Cambios requeridos
Ninguno.
