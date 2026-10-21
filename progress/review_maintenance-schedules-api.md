# Review — #13 maintenance-schedules-api

**Veredicto (vuelta 2):** APPROVED

_Vuelta 1: CHANGES_REQUESTED (se conserva abajo como histórico)._

Un único cambio bloqueante: la migración `0004` no crea la FK `schedule_id` con `ON DELETE SET NULL`, así que la BD real no coincide con el esquema declarado. Todo lo demás (tests, trazabilidad, alcance y arquitectura) está correcto.

## Trazabilidad requirements ↔ tests

- R1: [x] `apps/api/test/schedules.test.ts:70` › `creates, lists, reads, updates and deletes schedules` (fila en `maintenance_schedules` leída con Drizzle, l.101-106)
- R2: [x] `schedules.test.ts:288` › `updates the schedule when a linked record is created or edited` (`scheduleId` en la respuesta de alta y PATCH); `maintenance.test.ts:80` (`scheduleId: null`). La FK existe, pero sin la acción del diseño (ver hallazgo 1)
- R3: [x] `packages/shared/src/schemas/schedules.test.ts:27` (`car_wash` rechazado); `schedules.test.ts:142,150` (400 en el alta y en el PATCH)
- R4: [x] `schemas/schedules.test.ts:7`; `schedules.test.ts:133-143` (400 problem+json, `path: intervalMonths` y lista vacía)
- R5: [x] `schedules.test.ts:145-151` (400 con `detail`, regla intacta)
- R6: [x] `schedules.test.ts:81-100` (201 y cuerpo completo)
- R7: [x] `schedules.test.ts:109` (orden `[schedule, second]`)
- R8: [x] `schedules.test.ts:110`
- R9: [x] `schedules.test.ts:112-122` (conserva el título y los umbrales; recalcula `nextDueDate` y `nextDueOdometer`)
- R10: [x] `schedules.test.ts:124-127` (204, después 404 y lista sin ella)
- R11: [x] `schedules.test.ts:389` › `unlinks records when a schedule is deleted` (respuesta y fila con `scheduleId` null). Hoy pasa gracias al workaround del repositorio, no a la FK (hallazgo 1)
- R12: [x] `schedules.test.ts:154-174` (los 5 endpoints → 404 `Vehicle not found`)
- R13: [x] `schedules.test.ts:183-198` (regla de otro vehículo propio y de otro usuario → 404; los datos no cambian)
- R14: [x] `schedules.test.ts:245` › `returns the computed due fields`; `domain/schedules.test.ts` (todos)
- R15: [x] `domain/schedules.test.ts:105` (incluido el caso `lastDoneOdometer` null → null)
- R16: [x] `domain/schedules.test.ts:24,93` (31 ene → 28/29 feb, 31 mar → 30 abr)
- R17: [x] `domain/schedules.test.ts:40,54` (límite de 90 días incluido; 0-1 lecturas, menos de 30 días, media 0, lecturas fuera de la ventana)
- R18: [x] `domain/schedules.test.ts:118` (`ceil` 86,7 → 87 días); `schedules.test.ts:273-281`
- R19: [x] `domain/schedules.test.ts:132` (gana la estimada o la de meses según el caso)
- R20: [x] `domain/schedules.test.ts:156` (por fecha el mismo día, por km con igualdad exacta, lo primero que llegue)
- R21: [x] `domain/schedules.test.ts:141` (bordes de `warnDays` y `warnDistance`, también `warnDays: 0`)
- R22: [x] `domain/schedules.test.ts:172` (estimada pasada y `status: ok`)
- R23: [x] `schedules.test.ts:201` (incluido `lastDoneOdometer: null` explícito)
- R24: [x] `schedules.test.ts:212,221`
- R25: [x] `schedules.test.ts:212,221` (km de compra, última lectura, null sin lecturas, cada campo por separado)
- R26: [x] `schedules.test.ts:288` (alta, vinculación por PATCH y cambio de fecha sin km → `lastDoneOdometer` null)
- R27: [x] `schedules.test.ts:332` (alta y PATCH con fecha anterior; último realizado intacto)
- R28: [x] `schedules.test.ts:355` (otro vehículo propio, otro usuario e inexistente → 400 problem+json; ningún registro creado, registro editado intacto y reglas intactas)

## Tasks

- T1..T19: [x]

## Checkpoints

- C1: [x] `pnpm harness` en verde; solo una feature activa (#13); rama `feat/maintenance-schedules-api`.
- C2: [x] Están los tres archivos del spec, en EARS y con la tabla de acceptance completa; todas las tasks `[x]`; cada R tiene un test que lo verifica.
- C3: [x] Alcance según `design.md`. Las fixtures `scheduleId: null` en 5 tests web y 1 de la API son consecuencia obligada de R2 (el tipo de respuesta cambia); no hay cambios de código web.
- C4: [ ] **Cambios de BD:** el esquema de `db/schema/` declara `onDelete: 'set null'`, pero la migración incluida no lo aplica (hallazgo 1). El resto de C4 está bien: estructura `modules/schedules/{routes,service,repository}.ts` cableada en `app.ts`, rutas con zod de `@ikrive/shared`, 404 para recursos ajenos, `AppError` y dominio puro con tests en `packages/shared`.
- C5: [x] Sin `any` ni `@ts-ignore`; fechas `YYYY-MM-DD` con aritmética UTC; km sin conversión; sin restos de depuración.
- C6: [x] `pnpm harness --full` en verde (shared 26, api 62, web 112); SQLite en memoria sin mocks; sin UI, así que no hacen falta capturas.
- C7: [x] `impl_*.md` completo; `current.md` al día; `docs/PLAN.md` actualizado (modelo de datos y decisión del estado).

## Hallazgos

1. `apps/api/src/db/migrations/0004_maintenance_schedules.sql:17`: `ALTER TABLE maintenance_records ADD schedule_id text REFERENCES maintenance_schedules(id);` se queda sin acción `ON DELETE`. Lo he comprobado aplicando las migraciones 0000–0004 sobre better-sqlite3 con `foreign_keys = ON`:
   - **Tal como se generó:** `PRAGMA foreign_key_list(maintenance_records)` → `on_delete: "NO ACTION"`. Un `DELETE FROM maintenance_schedules` con un mantenimiento vinculado falla con `FOREIGN KEY constraint failed`.
   - **Añadiendo ` ON DELETE set null` a esa línea:** SQLite lo acepta en `ADD COLUMN`, porque la columna es nullable y su valor por defecto es NULL. El pragma da `on_delete: "SET NULL"` y el mismo borrado deja `schedule_id = null`.

   Por qué bloquea:
   - `design.md` (§ Base de datos) basa R11 en que la FK haga `set null` en la BD, y C4 exige que la migración aplique el cambio de esquema.
   - El esquema TS y `meta/0004_snapshot.json` dicen `set null` y la BD real dice `no action`. drizzle-kit compara contra el snapshot, así que **nunca** volverá a generar un cambio que corrija esa diferencia.
   - Cuando se mergee y se aplique en BD de usuarios, la migración ya no se podrá retocar: arreglarlo exigiría reconstruir la tabla `maintenance_records`.
   - El workaround de `schedules/repository.ts:40-47` solo protege esta ruta de borrado. Cualquier borrado futuro de reglas que no pase por ese método (un job de la feature 15, un script de admin) acabará en un 500 por la FK.

## Avisos para el humano (no bloquean)

- El cambio pedido supone editar una línea de SQL generado, y `.claude/agents/implementer.md` (paso 4) prohíbe escribir SQL a mano. El leader tiene que autorizar esta excepción de forma explícita al relanzar al implementer. En este caso editar la línea **restablece** la coherencia entre esquema, snapshot y migración (es lo que la regla quiere proteger). Conviene dejar un comentario SQL de una línea que explique el retoque por el bug de drizzle-kit 0.31.
- Con la FK corregida, el desvinculado explícito de `schedules/repository.ts › delete` ya no hace falta. Se puede quitar o mantener, pero el JSDoc de las líneas 37-39 dejaría de ser cierto. Además, ese `UPDATE` explícito dispara `$onUpdateFn` y cambia el `updatedAt` de los mantenimientos al borrar la regla (por eso el test de la l.399 usa `expect.any(String)`); la FK no lo cambiaría.
- `schedules.test.ts:221-233` compara contra `todayIn('Europe/Madrid')` calculado en el test: podría fallar si se ejecuta justo al cambiar de día. El riesgo es mínimo.
- `maintenance/service.ts › update`: editar cualquier campo de un mantenimiento ya vinculado cuya fecha sea ≥ `lastDoneDate` reescribe el último realizado con sus valores. Es coherente con R26 («scheduleId resultante») y en la práctica idempotente.

## Cambios requeridos

1. `apps/api/src/db/migrations/0004_maintenance_schedules.sql:17`: añadir `ON DELETE set null` a la FK de `schedule_id` (`... REFERENCES maintenance_schedules(id) ON DELETE set null;`) para que la BD coincida con `db/schema/maintenance.ts` y con `0004_snapshot.json` (R2, R11, C4). Antes hace falta que el leader autorice la excepción a la regla de no editar SQL generado.
2. `apps/api/src/modules/schedules/repository.ts:36-47`: alinear `delete` con la FK corregida. O se elimina el `UPDATE` explícito, o se corrige el JSDoc, que dice que la migración no tiene `ON DELETE SET NULL`. El test `unlinks records when a schedule is deleted` tiene que seguir en verde y cubrir el comportamiento de la FK.

---

## Vuelta 2

**Veredicto:** APPROVED

### Verificación del arreglo
- `apps/api/src/db/migrations/0004_maintenance_schedules.sql:18-19`: la línea es `ADD \`schedule_id\` text REFERENCES maintenance_schedules(id) ON DELETE set null;`. Lleva un comentario SQL que explica el retoque por el bug de drizzle-kit 0.31. Es un retoque manual **autorizado explícitamente por el humano**. El resto del SQL y `meta/0004_snapshot.json` no se han tocado.
- **BD recién migrada:** apliqué 0000–0004 con el `migrate` de drizzle sobre better-sqlite3 en memoria y `foreign_keys = ON`. `PRAGMA foreign_key_list(maintenance_records)` da `maintenance_schedules / schedule_id / SET NULL`. Las FK ya existentes (`vehicles` CASCADE, `odometer_readings` SET NULL) siguen igual. El comentario dentro del bloque del statement no rompe el migrador. `drizzle-kit check` responde «Everything's fine». Esquema TS, snapshot y BD vuelven a coincidir.
- `apps/api/src/modules/schedules/repository.ts:36-39`: `delete` solo hace el `DELETE` y el JSDoc es correcto (la FK desvincula). Ya no hay `UPDATE` de aplicación ni transacción.
- `apps/api/test/schedules.test.ts:389` › `unlinks records when a schedule is deleted`: el test es más estricto que antes y verifica tres cosas:
  - El registro conservado es idéntico salvo `scheduleId: null`. Incluye `updatedAt`, que con el workaround anterior habría cambiado, así que el test demuestra que actúa la FK.
  - La fila en BD tiene `scheduleId` null.
  - El pragma devuelve `on_delete: 'SET NULL'`.

  Los tests construyen la BD con las migraciones reales (`db/client.ts:25`), así que el test cubre la migración y no solo el esquema TS.
- R2 y R11 quedan cubiertos por la FK real. C4 pasa a [x].

### Regresiones
- `git status`: los mismos archivos que en la vuelta 1, sin cambios fuera de alcance.
- `pnpm harness --full` en verde: lint, typecheck y tests (shared 26, api 62, web 112).
- Trazabilidad R1–R28 y tasks T1–T19 sin cambios respecto a la vuelta 1: todas [x].

### Checkpoints (vuelta 2)
- C1: [x] C2: [x] C3: [x] C4: [x] C5: [x] C6: [x] C7: [x]

### Avisos para el humano (no bloquean)
- Siguen los dos avisos menores de la vuelta 1:
  - Riesgo mínimo de que falle `todayIn` si el test se ejecuta justo al cambiar de día.
  - El último realizado se reescribe al editar un mantenimiento ya vinculado. Es idempotente.
- La migración 0004 tiene ahora una línea editada a mano. Si en el futuro se regenera la migración con drizzle-kit, habrá que volver a aplicar el retoque.
