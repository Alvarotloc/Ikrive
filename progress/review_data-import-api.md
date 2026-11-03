# Review — #35 data-import-api (vuelta 3, final)

**Veredicto:** APPROVED

**Arnés:** `pnpm harness --full` en verde (shared 111, web 289, api 277).
- La primera ejecución falló en `apps/web` (`src/features/settings/use-user-locale.test.tsx:48`, `findByRole` agotó el tiempo).
- Es un flake: la feature no toca `apps/web` y al repetir pasó todo en verde. Ver avisos.

**Alcance:** no cambia respecto a la vuelta 2. En esta vuelta solo cambian `routes.ts` (`receive`), `data-import.test.ts` y `impl_data-import-api.md`.

## Verificación de los cambios pedidos en la vuelta 2

### 1. Errores del stream de origen → 400. Hecho.

En `apps/api/src/modules/data-import/routes.ts:24-41`:
- El `WriteStream` se crea aparte.
- Hay un listener `once('error')` en el origen y otro en el destino, que apuntan en `failed ??=` cuál falló primero. `pipeline` destruye los dos con el primer error.
- Si falla el `sink`, se relanza el error (500). Cualquier otro rechazo (error del origen o cierre prematuro sin error) → 400 «The upload ended before the zip was complete».
- Se mantiene la comprobación previa del stream ya destruido.
- El `rm` sigue en el `finally` del handler, así que se ejecuta en todos los caminos.

### 2. Test en varios chunks. Hecho.

`rejects a multipart body that never completes` (l.437) añade un `app.inject` con un `Readable` que entrega tres chunks con pausas: la cabecera de la parte, 1000 B y el resto. Afirma:
- 400 y el `detail` exacto;
- `snapshot` sin cambios;
- `tmp/` vacío.

Además, el test nuevo `answers 500 when the zip cannot be written to disk` (l.482) pone `tmp/` en solo lectura y comprueba el 500 y que `snapshot` no cambia. Así el error de escritura no se confunde con un 400.

### 3. `impl_data-import-api.md` corregido. Hecho.

- En «Vuelta 1», punto 1, hay una nota «Corrección (vuelta 2)» que deja claro que la afirmación anterior era falsa.
- La fila R3 de la trazabilidad está actualizada.
- La sección «Vuelta 2» describe la causa real (el error de busboy «Part terminated early…»).

## Pruebas en vivo (`app.listen`, `IMPORT_MAX_MB=2`)

Scripts:
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/6471f1ab-1a61-4399-bb94-19521042342e/scratchpad/live.mts`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/6471f1ab-1a61-4399-bb94-19521042342e/scratchpad/live2.mts` (24 casos)

Resultados:
- «broken multipart, chunked (head, data, data)» → **400** (antes 500).
- «broken multipart, big chunked 1.5MiB» → **400** (antes 500).
- Multipart roto en un solo chunk → 400.
- Cortes del cliente (a mitad del cuerpo y justo tras la cabecera) y subidas abortadas, por debajo y por encima del límite → sin residuos.
- Límite superado → 413. Cuerpo no multipart → 400.
- Zip truncado, bomb, cifrado, `entryCount` 0xFFFF y sha alterado → 400.
- Canales inválidos → `skipped: 5`.
- Dos ficheros → 201 con el primero.
- Imports válidos → 201, también si el cliente se desconecta tras subir.
- Import válido final tras todos los casos → 201.
- Tras **cada** caso: `tmp=0` y `fds=0`. Al final: `open fds in dataDir []`, `/api/health` 200 y `problems none` (ningún `uncaughtException` ni `unhandledRejection`).
- Sin regresiones respecto a las vueltas 1 y 2.

## Trazabilidad requirements ↔ tests
Todos en `apps/api/test/data-import.test.ts`.
- R1: [x] `imports an export`
- R2: [x] `requires a session`
- R3: [x] Tres tests:
  - `rejects a request without a zip`;
  - `rejects a multipart body that never completes`: un chunk y varios chunks → 400 con `detail` y `tmp/` vacío;
  - `answers 500 when the zip cannot be written to disk`.
- R4–R17: [x] sin cambios respecto a la vuelta 1.
- R18: [x] `skips channels whose config is no longer valid`, `imports an export`, `round-trips…`
- R19–R20: [x] `rolls back when the database insert fails`, `removes written files when a later file fails`
- R21: [x] `deletes the temporary zip`, `rejects a multipart body that never completes`; además `snapshot` incluye `tmp/` en todos los rechazos.
- R22–R24: [x]
- R25: [x] `rejects unsafe entry names` (incluye la entrada cifrada)
- R26–R27: [x]

## Tasks
- T1..T16: [x] (16/16)

## Checkpoints
- C1: [x] Arnés en verde, una sola feature `in_progress` (#35) y rama `feat/data-import-api`.
- C2: [x] Cada R tiene un test que afirma el resultado concreto. R3 se cumple también en vivo con un cuerpo troceado.
- C3: [x] El diff se ciñe a `design.md`. Las desviaciones están justificadas en `impl_data-import-api.md`.
- C4: [x] Validación en los bordes, problem+json y la regla de propiedad: el import solo escribe en la cuenta de la sesión.
- C5: [x] Transacción única en `repo.insert`, limpieza de los ficheros escritos y borrado del zip temporal.
- C6: [x] Tests de integración sobre SQLite real y arnés en verde.
- C7: [x] `impl_data-import-api.md` corregido y coherente con el código y las pruebas en vivo.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- **Flake en `apps/web`:** `use-user-locale.test.tsx:48` agotó el tiempo una vez con la suite completa en paralelo y pasó al repetir. No tiene relación con esta feature, pero conviene vigilarlo.
- **Ruta de adjuntos (#34):** responde 500 al multipart sin boundary de cierre. Es comportamiento previo y conviene abrir un ticket.
- **`requestTimeout: 0`:** es el valor por defecto de Fastify y es una decisión global, fuera del design.
- **Fichero parcial si `storage.save` falla con el disco lleno:** es comportamiento previo de `storage`.
- **El test del 500 por escritura** depende de los permisos del sistema de ficheros: ejecutado como root no se cumpliría.

## Cambios requeridos
Ninguno.
