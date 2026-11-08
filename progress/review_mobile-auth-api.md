# Review — #49 mobile-auth-api

**Veredicto:** APPROVED

Segunda ronda. Revisado: `git diff main...HEAD` (solo spec + arranque) + árbol de trabajo sin commitear (`git diff` y los nuevos `apps/api/src/plugins/cors.ts`, `apps/api/test/mobile-auth.test.ts`, `progress/impl_mobile-auth-api.md`). La ronda 1 terminó en CHANGES_REQUESTED por R6 (Hallazgo 1: el puente `/api/auth/*` pisaba `Access-Control-Expose-Headers`). El leader eligió la opción (a).

## Verificación del arreglo (ronda 2)

- `apps/api/src/plugins/auth.ts`: el puente ya no sobrescribe `access-control-expose-headers`. Lo fusiona con `mergeHeaderList(reply.getHeader(key), value)`: hace la unión de las dos listas separadas por comas, sin duplicados (sin distinguir mayúsculas), y conserva el orden y la grafía de la primera aparición. Contempla tanto `string` como `string[]` y, si no hay valor, `undefined`. El resto de cabeceras y `set-cookie` siguen igual.
- **Same-origin web sin cambios:** sin un origen permitido, el plugin CORS no pone ninguna cabecera. `getHeader` devuelve `undefined`, así que el resultado es exactamente el valor de Better Auth (`set-auth-token`), como antes. Lo afirma el test.
- Test nuevo: `apps/api/test/mobile-auth.test.ts:259` › `CORS › keeps both exposed headers on Better Auth responses that create a session`. Comprueba lo siguiente:
  - Login nativo (`capacitor://localhost`): 200, `allow-origin` igual al origen nativo, `expose-headers === 'set-auth-token, content-disposition'` y sin `allow-credentials`.
  - Login web desde `BASE_URL`: 200, sin `allow-origin` y `expose-headers === 'set-auth-token'`.
  - Según `impl_mobile-auth-api.md`, el test falla con el puente original.
- Desviación documentada en `progress/impl_mobile-auth-api.md` (Desviaciones, 3) y trazada en la tabla de R6.

## Trazabilidad requirements ↔ tests

Todos en `apps/api/test/mobile-auth.test.ts`.

- R1: [x] `bearer session › returns a signed token in set-auth-token on sign-in`: comprueba que `set-auth-token` es `<token del cuerpo>.<firma>`.
- R2: [x] `… › authenticates protected and admin routes with the bearer token`: `/api/me`, `POST`/`GET /api/vehicles` y `GET /api/admin/users` (200 para el admin y 403 para un usuario), todo sin cookie.
- R3: [x] `… › invalidates the token on sign-out`: 200, luego 401 problem con el mismo token; la cookie sigue valiendo.
- R4: [x] `… › rejects malformed, forged and unsigned tokens with 401` (6 variantes) y `files with a bearer token › answers 401 without a token`.
- R5: [x] `… › keeps cookie sign-in working for the web`.
- R6: [x] `CORS › answers allowed origins with CORS headers, also on errors` (`/api/me` 200 y 401) + `CORS › keeps both exposed headers on Better Auth responses that create a session` (`/api/auth/sign-in/email`).
- R7: [x] `CORS › answers the preflight of an allowed origin with 204`: methods, headers y max-age exactos.
- R8: [x] `CORS › sends no CORS headers to other origins`.
- R9: [x] Se afirma la ausencia de `access-control-allow-credentials` en el 200, el 401, el preflight y el login nativo.
- R10: [x] `CORS › sends no CORS headers outside /api`.
- R11: [x] `trusted origins › accepts sign-in from a native origin`.
- R12: [x] `trusted origins › rejects sign-in from an untrusted origin with 403`.
- R13: [x] `CORS_ORIGINS config › uses the Capacitor origins by default` y el test de R11.
- R14: [x] `… › trusts no extra origin when empty`.
- R15: [x] `… › rejects invalid origins` y `accepts a custom list`.
- R16: [x] Fila en `docs/self-hosting.md`; `config-docs.test.ts` en verde.
- R17: [x] `files with a bearer token › serves photo, thumbnail and invoice to the owner`.
- R18: [x] `… › answers 404 to another user's token`.
- R19: [x] `disabled accounts › rejects the tokens of a disabled account, also after re-enabling it`.
- R20: [x] `disabled accounts › does not issue a token to a disabled account`.

## Tasks
- T1..T18: [x]

## Checkpoints
- C1: [x] Arnés: features OK, una sola feature activa (#49 `in_progress`) y rama `feat/mobile-auth-api`.
- C2: [x] Spec completo y EARS correcto. R6 ya se cumple en todas las respuestas de `/api/*`, incluidas las de Better Auth que crean sesión.
- C3: [x] El diff se ciñe a `design.md` más tres desviaciones justificadas y documentadas: `test/helpers.ts`, `test/client-config.test.ts` y `plugins/auth.ts`. Esta última es la que pidió la ronda 1 con la opción (a).
- C4: [x] Sin módulos, BD ni web nuevos. CORS en `plugins/cors.ts`. El cambio en `plugins/auth.ts` es local al puente.
- C5: [x] Sin `any`, `@ts-ignore` ni `console.log`. El helper nuevo tipa la entrada como `unknown` y la estrecha.
- C6: [x] `pnpm harness --full`: lint `[OK]`, typecheck `[OK]`; shared 119/119, web 348/348, e2e 6/6. En api, 356/357 como root: el único fallo es `data-import › answers 500 when the zip cannot be written to disk`, que no vale como root (es preexistente, ver `progress/history.md:357`). Para confirmarlo, ejecuté la suite de api completa como usuario no root (`setpriv` uid 65534) sobre una copia exacta del árbol de trabajo en el scratchpad, ya borrada: **36/36 ficheros y 357/357 tests en verde**.
- C7: [x] `impl_mobile-auth-api.md` está actualizado con la ronda de review y la desviación 3. `current.md` y `PLAN.md` están al día.

## Hallazgos

Ninguno bloqueante. El Hallazgo 1 de la ronda 1 queda resuelto.

## Avisos para el humano (no bloquean)

- El login web desde `BASE_URL` sigue llevando `Access-Control-Expose-Headers: set-auth-token`, que añade `bearer`. No lleva `Allow-Origin`, así que el navegador la ignora. No viola R8, R9 ni R10, y el comportamiento es el mismo que antes del arreglo.
- `@fastify/cors` con un delegator dinámico añade `Vary: Origin` a todas las respuestas. Es inocuo.
- No hay daemon para `docker build`. `test/build.test.ts` está en verde; conviene verlo en CI.
- Como root, el arnés falla siempre por el test de data-import citado. Confirmado en verde como no root; conviene confirmarlo también en CI antes de Gate 2.

## Cambios requeridos

Ninguno.
