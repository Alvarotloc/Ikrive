# Implementación — web-api-base-url (#50)

Rama `feat/web-api-base-url`. Tasks T1–T17 marcadas en `specs/web-api-base-url/tasks.md`. Solo `apps/web`; sin cambios en la API, BD, `packages/shared`, `e2e/` ni Docker.

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/lib/server.ts` (nuevo) | URL base y token en `localStorage` (`ikrive.serverUrl`, `ikrive.sessionToken`); `setServerUrl` valida `http:`/`https:` (`TypeError` sin tocar lo guardado), quita barras finales y borra el token si cambia; `apiUrl`; `apiFetch` (mismo origen: `credentials: 'include'`; servidor: `<URL base><path>`, `credentials: 'omit'`, `Authorization: Bearer` si hay token). Lee `fetch` en cada llamada. |
| `apps/web/src/lib/api-client.ts` | `request` y `download` por `apiFetch`; nuevo `api.downloadUrl(url)` para rutas `/api/…` completas (`download(path)` delega en él). Tipo `DownloadedFile`. |
| `apps/web/src/lib/auth-client.ts` | `fetchOptions.customFetchImpl` → `apiFetch(pathOf(input))`; `onSuccess` guarda `set-auth-token` solo en modo servidor. |
| `apps/web/src/lib/download.ts` | `openBlob(blob)`: `<a target="_blank" rel="noopener">` temporal, URL revocada a los 60 s. |
| `apps/web/src/lib/api-files.ts` (nuevo) | `useApiFileSrc` (mismo origen: la URL; servidor: `useQuery(['api-file', url])` + object URL revocado al desmontar), `saveApiFile`, `openApiFile`. |
| `apps/web/src/components/api-image.tsx` (nuevo) | `<ApiImage>`: `<img>` directo en mismo origen; placeholder `bg-muted` `aria-hidden` mientras carga, `blob:` al cargar y `onError` si falla en modo servidor. |
| `apps/web/src/features/auth/use-logout.ts` | `try { signOut } finally { setSessionToken(null) }`. |
| `apps/web/src/features/vehicles/dossier.tsx` | `VehiclePhoto` usa `ApiImage`. |
| `apps/web/src/features/maintenance/maintenance-attachments.tsx` | Miniatura con `ApiImage`; en modo servidor el PDF y la descarga son `<button>` (mismas clases, icono y `aria-label`) con `openApiFile`/`saveApiFile` y toast `common.fileError` si fallan. |
| `apps/web/src/features/maintenance/attachment-viewer.tsx` | Imagen con `ApiImage` (`onError` → mensaje `role="alert"`); «Descargar» como botón con `saveApiFile` en modo servidor + toast. |
| `apps/web/src/features/data-portability/data-section.tsx` | Export como botón con `saveApiFile('/api/me/export', 'ikrive-export.zip')` en modo servidor + toast; enlace en mismo origen. |
| `apps/web/src/features/schedules/add-to-calendar.tsx` | `baseUrl: getServerUrl() ?? window.location.origin`. |
| `apps/web/src/i18n/locales/{es,en}.json` | `common.fileError`. |
| `apps/web/src/test/render.tsx` | `setServerMode(url, token?)` y `mockObjectUrls()` (ver desviaciones). |
| `apps/web/src/test/setup.ts` | `localStorage.clear()` en `afterEach`; comentario del import adelantado de `authClient` actualizado. |
| `apps/web/src/test/setup.test.tsx` | La petición de `authClient` en mismo origen ahora es la ruta relativa `/api/auth/sign-out` (R1). |
| Tests nuevos | `lib/server.test.tsx`, `lib/api-client.test.tsx`, `lib/auth-client.test.tsx`, `features/auth/use-logout.test.tsx`, `components/api-image.test.tsx`; casos nuevos en `vehicle-card`, `maintenance-attachments`, `data-section` y `add-to-calendar`. |

## Trazabilidad

| R | Test(s) |
|---|---|
| R1 | `lib/api-client.test.tsx` › same origin: sends relative requests with cookies and no Authorization; `lib/auth-client.test.tsx` › same origin: signs in with cookies and stores no token; `test/setup.test.tsx` › sends the auth client requests… |
| R2 | `components/api-image.test.tsx` › same origin: renders the URL directly without fetching; `maintenance-attachments.test.tsx` › lists images with their thumbnail and PDFs with an icon, all linking to the original (+ opens an image in the viewer, offers the download…); `data-section.test.tsx` › links to the export download |
| R3 | `api-client.test.tsx` › server mode: sends requests to the server without cookies; `auth-client.test.tsx` › server mode: signs in against the server and stores the set-auth-token |
| R4 | `api-client.test.tsx` › server mode: adds the bearer token to JSON, FormData and download requests; `use-logout.test.tsx` › clears the stored token on logout (Authorization en sign-out); `api-image.test.tsx` › server mode: loads the image with the bearer token as a blob URL |
| R5 | `api-client.test.tsx` › server mode: uses a new server URL on the next request; `server.test.tsx` › stores the server URL without trailing slashes; › stores the server URL without query or hash |
| R6 | `server.test.tsx` › rejects a server URL that is not http(s) |
| R7 | `server.test.tsx` › clears the token when the server URL changes or is removed |
| R8 | `auth-client.test.tsx` › server mode: signs in… stores the set-auth-token; › server mode: stores the token of sign-up; › server mode: does not store a token on a failed sign-in |
| R9 | `use-logout.test.tsx` › clears the stored token on logout; › clears the stored token even if sign-out fails |
| R10 | `api-image.test.tsx` › server mode: loads the image…; `vehicle-card.test.tsx` › server mode: shows the photo loaded with the token; `maintenance-attachments.test.tsx` › server mode: shows thumbnails loaded with the token |
| R11 | `api-image.test.tsx` › server mode: shows the placeholder while loading |
| R12 | `api-image.test.tsx` › server mode: calls onError when the request fails; `maintenance-attachments.test.tsx` › server mode: shows the viewer error when the image request fails |
| R13 | `maintenance-attachments.test.tsx` › server mode: downloads an invoice with the token (Content-Disposition y originalName) |
| R14 | `maintenance-attachments.test.tsx` › server mode: opens a PDF with the token in a new tab |
| R15 | `data-section.test.tsx` › server mode: downloads the export with the token |
| R16 | `maintenance-attachments.test.tsx` › server mode: shows an error toast when a download fails; `data-section.test.tsx` › server mode: shows an error toast when the export fails |
| R17 | `add-to-calendar.test.tsx` › server mode: links the event to the server |

## Revisión visual (T16)

`pnpm dev` equivalente: API con `tsx src/server.ts` (`DATA_DIR` temporal, `TRUSTED_ORIGINS=http://localhost:5173`) + Vite en 5173; playwright-core contra `/usr/bin/google-chrome`. Modo servidor: `localStorage ikrive.serverUrl=http://localhost:3000` e inicio de sesión desde la web (sin cookie; token guardado). Datos: vehículo con foto, mantenimiento con factura PNG y PDF.

- Mismo origen, claro: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/8ac3528d-4ade-49bb-b0db-af76a71ad82a/scratchpad/shots/same-origin-light-{dossier,invoices,viewer,settings}.png`
- Servidor, claro: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/8ac3528d-4ade-49bb-b0db-af76a71ad82a/scratchpad/shots/server-light-{dossier,invoices,viewer,settings}.png`
- Servidor, oscuro: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/8ac3528d-4ade-49bb-b0db-af76a71ad82a/scratchpad/shots/server-dark-{dossier,invoices,viewer,settings}.png`
- Servidor, móvil (390×844): `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/8ac3528d-4ade-49bb-b0db-af76a71ad82a/scratchpad/shots/server-mobile-{dossier,invoices,viewer,settings}.png`

En modo servidor la foto, las miniaturas y el visor se pintan con `blob:` y se ven igual que en mismo origen. Comprobación manual adicional en modo servidor: «Descargar mis datos» descarga `ikrive-export-2026-11-09.zip` y «Cerrar sesión» deja `ikrive.sessionToken` a `null` (conserva la URL base).

## `pnpm harness --full`

```
[OK]    54 features: 49 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #50 web-api-base-url (in_progress)
[OK]    Rama actual: feat/web-api-base-url
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:       Tests  6 passed (6)
packages/shared test:       Tests  119 passed (119)
apps/web test:       Tests  375 passed (375)
apps/api test:       Tests  358 passed (358)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones del spec

- **`mockObjectUrls()` en `test/render.tsx`**: además de `setServerMode`, un helper que simula `URL.createObjectURL`/`revokeObjectURL` con una subclase de `URL` vía `vi.stubGlobal` (mismo patrón que `add-to-calendar.test.tsx`), para no repetirlo en cuatro ficheros de test. El design ya preveía simularlos con `vi.stubGlobal`.
- **`test/setup.test.tsx`**: su test de `authClient` esperaba la URL absoluta `http://localhost:3000/api/auth/sign-out`; con `apiFetch` el mismo origen envía la ruta relativa (R1), así que se ajustó la expectativa. El comentario de `setup.ts` sobre el import adelantado se actualizó (el import se mantiene, como dice el design).
- **Clave de caché `['api-file', url]`** definida en `lib/api-files.ts` y no en `lib/query-keys.ts` (que no está en la tabla de archivos del design).
- **Nombre de respaldo del export** `ikrive-export.zip` (`saveApiFile` exige uno; la API siempre manda `Content-Disposition`).

## Cambios pedidos en Gate 2 (avisos 1 y 2 de la review)

- **`components/api-image.tsx`**: el placeholder pasa de `<div>` a `<span className={cn('block', className, 'bg-muted')} aria-hidden />`: va dentro del `<button>` de la miniatura de `maintenance-attachments.tsx` y un `<div>` ahí no es HTML válido. `block` va primero para que un `className` con otro `display` lo sustituya (tailwind-merge); sin cambio visual. `api-image.test.tsx` › server mode: shows the placeholder while loading comprueba ahora que es un `SPAN` con `block`.
- **`lib/server.ts`**: `normalizeServerUrl` devuelve `origin + pathname` del `URL` parseado sin barras finales, descartando `?query` y `#hash` (antes recortaba la cadena de entrada). Nuevo test `server.test.tsx` › stores the server URL without query or hash (`https://x.example.com/?a=1#b` → `https://x.example.com`; con ruta `/ikrive/?a=1#b` → `https://x.example.com/ikrive`).
- **`specs/web-api-base-url/design.md`**: actualizados el contrato de `setServerUrl` y la descripción del placeholder. `tasks.md` sin cambios (las tasks ya estaban hechas).
- `pnpm harness --full` en verde de nuevo (web 375 tests).
