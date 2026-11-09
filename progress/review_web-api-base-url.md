# Review — #50 web-api-base-url

**Veredicto:** APPROVED

> Segunda revisión (2026-11-09), tras los cambios pedidos por el humano en Gate 2 (avisos 1 y 2 de la primera review). Ambos resueltos con test; sin regresiones.

## Segunda revisión — cambios de Gate 2
- Aviso 1 (placeholder dentro de `<button>`): [x] `apps/web/src/components/api-image.tsx:29` pinta ahora `<span className={cn('block', className, 'bg-muted')} aria-hidden />`. Test `api-image.test.tsx` › `server mode: shows the placeholder while loading` comprueba `tagName === 'SPAN'`, clases `block size-10 bg-muted` y `aria-hidden`. Usos (`dossier.tsx:69`, `maintenance-attachments.tsx:166`, `attachment-viewer.tsx:66`) no pasan otro `display`, así que no hay cambio visual.
- Aviso 2 (URL con query/hash): [x] `apps/web/src/lib/server.ts` › `normalizeServerUrl` devuelve `parsed.origin + pathname` sin barras finales. Test nuevo `server.test.tsx` › `stores the server URL without query or hash` (`https://x.example.com/?a=1#b` → `https://x.example.com`; `/ikrive/?a=1#b` → `https://x.example.com/ikrive`). Los tests de R6/R7 (rechazo y conservación del token con la misma URL con barra final) siguen en verde.
- `design.md` actualizado de forma coherente (contrato de `setServerUrl` y placeholder `<span>`); `tasks.md` sin cambios de contenido.
- `pnpm harness --full` en verde, ejecutado por el reviewer: web 375, api 358, shared 119, e2e.

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/web/src/lib/api-client.test.tsx` › `same origin: sends relative requests with cookies and no Authorization` (URL relativa `/api/…`, `credentials: 'include'`, sin `authorization`, también en `download`); `apps/web/src/lib/auth-client.test.tsx` › `same origin: signs in with cookies and stores no token`; `apps/web/src/test/setup.test.tsx` (ruta relativa de `sign-out`)
- R2: [x] `apps/web/src/components/api-image.test.tsx` › `same origin: renders the URL directly without fetching` (`mockApi({})` hace fallar cualquier petición; `src` = ruta); tests existentes de enlaces en `maintenance-attachments.test.tsx` y `data-section.test.tsx` › `links to the export download` siguen en verde
- R3: [x] `api-client.test.tsx` › `server mode: sends requests to the server without cookies` (URL del servidor, `credentials: 'omit'`); `auth-client.test.tsx` › `server mode: signs in against the server…` (URL y `omit`)
- R4: [x] `api-client.test.tsx` › `server mode: adds the bearer token to JSON, FormData and download requests`; `use-logout.test.tsx` › `clears the stored token on logout` (Bearer en `sign-out`); `api-image.test.tsx`, `vehicle-card.test.tsx`, `maintenance-attachments.test.tsx`, `data-section.test.tsx` (Bearer en ficheros)
- R5: [x] `api-client.test.tsx` › `server mode: uses a new server URL on the next request` (dos `api.get` con URLs distintas)
- R6: [x] `apps/web/src/lib/server.test.tsx` › `rejects a server URL that is not http(s)` (`TypeError` y URL guardada intacta para 4 entradas)
- R7: [x] `server.test.tsx` › `clears the token when the server URL changes or is removed` (cambio, borrado y conservación con la misma URL)
- R8: [x] `auth-client.test.tsx` › `server mode: signs in… stores the set-auth-token`, `server mode: stores the token of sign-up`, `server mode: does not store a token on a failed sign-in` (401 con cabecera → no se guarda)
- R9: [x] `apps/web/src/features/auth/use-logout.test.tsx` › `clears the stored token on logout` y `clears the stored token even if sign-out fails` (500)
- R10: [x] `api-image.test.tsx` › `server mode: loads the image with the bearer token as a blob URL` (`src="blob:1"`, revocado al desmontar); `vehicle-card.test.tsx` › `server mode: shows the photo loaded with the token`; `maintenance-attachments.test.tsx` › `server mode: shows thumbnails loaded with the token`
- R11: [x] `api-image.test.tsx` › `server mode: shows the placeholder while loading` (petición retenida: sin `img`, placeholder con `size-10 bg-muted` y `aria-hidden`)
- R12: [x] `api-image.test.tsx` › `server mode: calls onError when the request fails`; `maintenance-attachments.test.tsx` › `server mode: shows the viewer error when the image request fails` (`role="alert"` con el texto)
- R13: [x] `maintenance-attachments.test.tsx` › `server mode: downloads an invoice with the token` (nombre de `Content-Disposition` y `originalName` sin él, Bearer)
- R14: [x] `maintenance-attachments.test.tsx` › `server mode: opens a PDF with the token in a new tab` (`?inline=1`, `<a target="_blank" rel="noopener" href="blob:1">` pulsado)
- R15: [x] `data-section.test.tsx` › `server mode: downloads the export with the token` (URL del servidor, Bearer, nombre de `Content-Disposition`)
- R16: [x] `maintenance-attachments.test.tsx` › `server mode: shows an error toast when a download fails`; `data-section.test.tsx` › `server mode: shows an error toast when the export fails` (texto de `common.fileError`)
- R17: [x] `apps/web/src/features/schedules/add-to-calendar.test.tsx` › `server mode: links the event to the server`

## Tasks
- T1..T17: [x]

## Checkpoints
- C1: [x] harness verde, una sola feature activa (#50 `in_progress`), rama `feat/web-api-base-url`.
- C2: [x] requirements/design/tasks presentes, EARS con un `DEBE` cada uno, tabla cubre los `acceptance`; tasks `[x]`; cada R con test leído.
- C3: [x] Solo `apps/web` + `progress/` + checkboxes de `tasks.md`. Desviaciones (`mockObjectUrls`, ajuste de `setup.test.tsx`, clave de caché en `api-files.ts`, nombre de respaldo del export) justificadas en `impl` y menores.
- C4: [x] Sin cambios de API/BD/shared (N/A). Web: código en `lib/`, `components/` y `features/<dominio>/`; `common.fileError` en `es.json` y `en.json`; `Button` reutilizado.
- C5: [x] Sin `any`/`@ts-ignore`, sin `console.log` ni TODOs. Fechas y ficheros: sin cambios.
- C6: [x] `pnpm harness --full` en verde (ejecutado por el reviewer en la segunda revisión: web 375, api 358, shared 119, e2e 6). Tests afirman resultados concretos (sin BD implicada). Capturas claro/oscuro/móvil referenciadas y existentes.
- C7: [x] `impl_web-api-base-url.md` con archivos, mapa R→test y salida; `progress/current.md` actualizado; PLAN.md sin cambio de decisión.

## Hallazgos
Ninguno bloqueante. Se comprobó además que `fetchOptions.onSuccess` de better-auth 1.7.7 se registra como plugin de ciclo de vida (`client/config.mjs`) y no sustituye ningún hook interno.

## Avisos para el humano (no bloquean)
- ~~Placeholder `<div>` dentro de `<button>`~~ — resuelto en la segunda revisión.
- `apps/web/src/lib/api-files.ts:142` — la clave `['api-file', url]` no incluye la URL del servidor: si #51 cambia de servidor sin `queryClient.clear()`, podría mostrarse un blob en caché del servidor anterior. Hoy el logout limpia la caché; conviene tenerlo en cuenta en #51.
- ~~`normalizeServerUrl` conservaba `?query`/`#hash`~~ — resuelto en la segunda revisión. Nota: al usar `origin`, unas credenciales `user:pass@` en la URL también se descartan (comportamiento deseable).
- La descarga desde el visor (`attachment-viewer.tsx`, `saveApiFile`) no tiene test propio; R13 queda cubierto por la descarga desde la tarjeta, que usa la misma función.
- Las capturas están en el scratchpad de la sesión (efímero); si se quieren conservar, copiarlas antes de cerrar.

## Cambios requeridos
Ninguno.
