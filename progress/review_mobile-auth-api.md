# Review — #49 mobile-auth-api

**Veredicto:** APPROVED

Revisado sobre `git diff main...HEAD` (solo el spec y `feature_list.json`) + el árbol de trabajo sin commitear (13 modificados y 4 nuevos). Spec actualizado tras Gate 1: design › «Comprobación de origen en tests» y T19a.

## Trazabilidad requirements ↔ tests

- R1: [x] `apps/api/test/config.test.ts` › `parses TRUSTED_ORIGINS with the Capacitor defaults` (comprueba `['capacitor://localhost','https://localhost']`), `trims and drops empty TRUSTED_ORIGINS items` (comprueba que quita espacios y elementos vacíos), `allows an empty TRUSTED_ORIGINS list` (`''` y `' , '` dan `[]`)
- R2: [x] `config.test.ts` › `rejects TRUSTED_ORIGINS entries that are not origins`: ruta, query, fragmento, `*`, `https://*.example.com` y valor sin esquema; cada uno lanza `/Invalid configuration[\s\S]*TRUSTED_ORIGINS/`
- R3: [x] `config-docs.test.ts` › `documents every environment variable` (ya existía y recorre `ENV_VARIABLES`); fila presente en `docs/self-hosting.md:51`
- R4: [x] `mobile-auth.test.ts:141` › `returns a session token on sign-up and sign-in`: `set-auth-token` no vacía en el registro y en el inicio de sesión, y distinta entre ambos
- R5: [x] `mobile-auth.test.ts:161`: con token y sin cookie, `/api/me` (id, email y rol), POST 201, PATCH (cuerpo, contrastado después con la cookie del mismo usuario), DELETE 204 y `/api/admin/users` (`requireAdmin`)
- R6: [x] `mobile-auth.test.ts:196`: token desconocido, firma alterada, `Bearer `, `Bearer`, `Basic` y sesión caducada (`expiresAt` en el pasado en BD) → 401 problem+json; antes de caducar, el mismo token da 200
- R7: [x] `mobile-auth.test.ts:223`: sign-out con Bearer → 200; después el mismo token → 401 problem+json y la cookie web sigue funcionando
- R8: [x] `mobile-auth.test.ts:242`: 200 antes; 401 tras `disable` y sigue en 401 tras `enable`
- R9: [x] `mobile-auth.test.ts:266`: login desde `capacitor://localhost` → 403 y sin `set-auth-token`
- R10: [x] `mobile-auth.test.ts:283`: foto, adjunto y miniatura con cookie y con token: 200, mismo `content-type`, mismo `cache-control` y bytes idénticos, no vacíos
- R11: [x] `mobile-auth.test.ts:300`: token de otro usuario → 404 problem+json en los tres ficheros
- R12: [x] `mobile-auth.test.ts:311`: sin credenciales → 401 problem+json en los tres
- R13: [x] `mobile-auth.test.ts:323`: preflight a `/api/vehicles` y `/api/auth/sign-in/email` → 204; comprueba `allow-origin`, que `allow-methods` y `allow-headers` coinciden exactamente y que no hay `allow-credentials`
- R14: [x] `mobile-auth.test.ts:336`: respuestas 200, 401, 404 (vehículo ajeno) y login, todas con `allow-origin`, `vary` con Origin y `expose-headers` = `set-auth-token, content-disposition` exacto. Así también se comprueba que el filtro del puente (T8) funciona
- R15: [x] `mobile-auth.test.ts:373` y `:389`: con `evil.example` y con la lista vacía, el preflight (API y auth), `/api/health` y el login salen sin ninguna cabecera `access-control-*`
- R16: [x] `allow-credentials` es `undefined` en `:332` y `:369`; `corsHeaders == []` en `:378`, `:386`, `:394`, `:398` y `:401`
- R17: [x] `mobile-auth.test.ts:404`: `/` y `/assets/app.js` desde un origen permitido devuelven 200 sin cabeceras `access-control-*`
- R18: [x] `mobile-auth.test.ts:416`: 200 desde `capacitor://localhost` y desde `myapp://ikrive` con `TRUSTED_ORIGINS` propio (con `set-auth-token`)
- R19: [x] `mobile-auth.test.ts:429`: `evil.example`, y `capacitor://localhost` con la lista vacía → 403, sin `set-auth-token` y sin filas nuevas en `session`. Es verificable gracias a `disableOriginCheck: false`: he comprobado en `better-auth/dist/context/create-context.mjs:211` que sin él `skipOriginCheck` valdría `isTest()`
- R20: [x] `mobile-auth.test.ts:452`: cookie `httpOnly` + `SameSite=Lax`; `/api/me` y la foto con la cookie → 200 sin cabeceras CORS; el resto de la suite sigue en verde

## Tasks
- T1–T22 y T19a: [x]

## Checkpoints
- C1: [x] el arnés sale con 0; una sola feature activa (#49 `in_progress`); rama `feat/mobile-auth-api`
- C2: [x] están los tres archivos; EARS con un `DEBE` por requirement; la tabla de acceptance cubre los 7 criterios; todas las tasks `[x]`; he leído cada test
- C3: [x] el diff se ciñe a la tabla «Archivos» de `design.md` (incluido `helpers.ts` por T19a); el lockfile solo añade `@fastify/cors` y sus dependencias. `progress/current.md` es del leader
- C4: [x] sin dominio nuevo; plugin raíz en `plugins/cors.ts` cableado en `app.ts`; errores mediante el `UnauthorizedError`/notFound existentes (problem+json); sin cambios de BD, web ni shared
- C5: [x] sin `any`, sin `@ts-ignore` y sin `console.log` (el `console.log` de `mobile-auth.test.ts:125` es el contenido del asset de prueba); el control de acceso a ficheros no cambia
- C6: [x] `pnpm harness --full` en verde (api 357, web 348, shared 119, e2e 6); SQLite en memoria sin mocks; sin UI, así que no hacen falta capturas
- C7: [x] `impl_mobile-auth-api.md` incluye los archivos, el mapa R→test y la salida; `current.md` está al día; `PLAN.md` no necesita cambios (#49 no cierra la fase 8)

## Hallazgos

Ninguno bloqueante. Puntos de seguridad revisados:

- **CORS sin credenciales:** `plugins/cors.ts` siempre usa `credentials: false`. Un `fetch` con `credentials: 'include'` desde un origen de la lista falla en el preflight (falta `allow-credentials`), así que la cookie del navegador no se puede usar desde esos orígenes.
- **Lista vacía:** `origins.includes()` sobre `[]` siempre es falso, y `trustedOrigins` queda solo con `BASE_URL`. Lo cubren los tests de R15 y R19.
- **Orígenes no listados en el login:** `validateFormCsrf` de Better Auth valida el `Origin` (y `Sec-Fetch-*`) aunque no haya cookie, y lo hace en todos los entornos porque `disableOriginCheck` está fijado a `false`. El patrón de config impide `*`, `null` y rutas.
- **Ficheros con token:** el plugin `bearer` actúa dentro de `auth.api.getSession`, así que la propiedad sigue comprobándose en los servicios (404). Está probado en los tres endpoints.
- **Cuentas desactivadas:** el token es la sesión; al desactivar se borran las sesiones y no hay `cookieCache`. Probado antes y después de reactivar, y también el login (403).
- **Firma del token:** `bearer` verifica el HMAC del token firmado; el crudo se firma en el servidor (decisión 3 del design).

## Avisos para el humano (no bloquean)

1. **`https://localhost` por defecto en `trustedOrigins` de Better Auth:** cualquier página servida en `https://localhost` del navegador del usuario pasa el control de CSRF de Better Auth. La mitigan la cookie `SameSite=Lax` y la falta de `allow-credentials` en CORS, y era la decisión 1/2 del design. Quien no use Android puede quitarlo con `TRUSTED_ORIGINS=capacitor://localhost`; quizá merezca una línea en la doc.
2. **Peticiones sin `Origin`:** Better Auth acepta el login sin `Origin`, `Referer` ni `Sec-Fetch-*` (`curl`, o `CapacitorHttp` nativo), sea cual sea `TRUSTED_ORIGINS`. No cambia respecto a hoy y siguen haciendo falta las credenciales, pero la lista solo limita a clientes de navegador o WebView. A tener en cuenta en #51.
3. **Sin `Vary: Origin` para orígenes no listados:** las respuestas a peticiones sin origen o de un origen no listado no llevan `Vary: Origin`. Sin impacto práctico, porque son respuestas privadas y autenticadas.
4. **`set-auth-token` en otras respuestas:** el hook `after` de `bearer` lo añade a cualquier respuesta de Better Auth que fije la cookie de sesión, también en la web (mismo origen). No expone nada nuevo: el `token` ya iba en el cuerpo.
5. ~~429 con CORS sin test~~ → resuelto en la segunda pasada (T22).

## Segunda pasada (tras Gate 2)

Solo se revisan los cambios hechos desde el primer APPROVED.

- **T22:** `mobile-auth.test.ts:404` › `adds CORS headers to rate-limited responses`. Lanza 300 peticiones a `/api/health` desde `capacitor://localhost`, todas con 200; la siguiente da 429 y el test comprueba `allow-origin` = origen, `expose-headers` exacto y que no hay `allow-credentials`. Comprueba R14 en un 429 con valores concretos. Tanto el texto de T22 como el de `impl_mobile-auth-api.md` dejan claro que el test **no** protege el orden de registro en `app.ts`, porque `@fastify/rate-limit` usa un hook `onRequest` por ruta y este corre después del `onRequest` global de CORS. Es coherente con lo que se pide: el comportamiento queda probado y el orden no importa. Ahora el comentario de `app.ts:92` («Before the rate limit, so a 429… also carries CORS») explica un motivo que no se cumple; no es incorrecto, pero sobra (aviso, no bloquea). El aviso 5 queda cubierto.
- **Docs:** `docs/self-hosting.md:51` añade a la fila de `TRUSTED_ORIGINS` qué origen corresponde a cada plataforma, cómo dejar solo `capacitor://localhost` y cómo dejarla vacía. El aviso 1 queda cubierto. `config-docs.test.ts` sigue en verde.
- **Tasks:** T22 está `[x]` y cita R14; el arnés no da avisos de trazabilidad.
- **`pnpm harness --full`:** en verde (api 358, web 348, shared 119, e2e 6).
- No hay cambios de producción nuevos ni nada fuera del alcance.

## Cambios requeridos

Ninguno.
