# Design — web-api-base-url

Una sola puerta de red para toda la SPA: `apiFetch` en `lib/server.ts`. Lee en cada llamada la URL base y el token del dispositivo y decide el modo. `api`, `authClient` y los ficheros pasan por ella. En modo mismo origen hace exactamente lo de hoy.

## Inventario de accesos por URL en `apps/web/src`

| # | Sitio | Hoy | Modo servidor |
|---|---|---|---|
| 1 | `lib/api-client.ts` › `request` / `download` | `fetch('/api'+path, { credentials: 'include' })` | `apiFetch` (R1, R3, R4). Cubre también las subidas `FormData` (foto, facturas, import), el informe PDF (`reports/queries.ts` → `api.download`) y `client-config.ts` |
| 2 | `lib/auth-client.ts` (`signIn.email` en `routes/login.tsx`, `signUp.email` en `routes/register.tsx`, `signOut` en `features/auth/use-logout.ts`) | `createAuthClient({ basePath: '/api/auth' })`, `fetch` capturado al importar | `customFetchImpl` → `apiFetch`; `onSuccess` guarda `set-auth-token` (R8) |
| 3 | `features/vehicles/dossier.tsx` › `VehiclePhoto` (`<img src={photoUrl}>`; lo usan `vehicle-card.tsx`, `photo-picker.tsx`, `routes/_app/vehicles/$vehicleId/index.tsx`, `routes/_app/odometer.tsx`) | `src` directo | `ApiImage` (R10, R11) |
| 4 | `features/maintenance/maintenance-attachments.tsx` › miniatura `<img src={thumbnailUrl}>` | `src` directo | `ApiImage` (R10, R11) |
| 5 | idem › PDF `<a href={inlineUrl(url)} target="_blank">` | enlace | botón → `openApiFile` (R14, R16) |
| 6 | idem › descargar `<a href={url} download>` | enlace | botón → `saveApiFile` (R13, R16) |
| 7 | `features/maintenance/attachment-viewer.tsx` › `<img src={inlineUrl(url)} onError>` | `src` directo | `ApiImage` con `onError` (R10, R12) |
| 8 | idem › descargar `<a href={url} download>` | enlace | `saveApiFile` (R13, R16) |
| 9 | `features/data-portability/data-section.tsx` › export `<a href={EXPORT_URL} download>` | enlace (streaming) | botón → `saveApiFile('/api/me/export')` (R15, R16) |
| 10 | `features/schedules/add-to-calendar.tsx` › `baseUrl: window.location.origin` | origen de la web | `getServerUrl() ?? window.location.origin` (R17) |
| — | `.ics` de «Añadir al calendario» (`calendar/actions.ts`) | generado en cliente (`downloadBlob`) | sin cambios: no pide nada al servidor |
| — | URL del feed iCal (`calendar-feed-section.tsx`) y de los enlaces públicos del informe (`report-shares-section.tsx`) | absolutas, las construye la API con su `BASE_URL` | sin cambios |
| — | `features/pwa/config.ts` › `API_PATH` (caché del service worker) | `/^\/api\//` | sin cambios: la APK no lleva service worker (#51) y las peticiones a otro origen no pasan por esa regla |

Las URL de ficheros de los DTO son rutas `/api/…` (`vehicles/service.ts` › `photoUrlOf`, `attachments/service.ts` › `toDto`); no cambian.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web | `src/lib/server.ts` (nuevo) | URL base y token en `localStorage`; `apiUrl`, `apiFetch` (ver Tipos) |
| web | `src/lib/api-client.ts` | `request` y `download` usan `apiFetch`; `download` acepta además una ruta `/api/…` completa (`api.downloadUrl(url)`) para los ficheros de los DTO |
| web | `src/lib/auth-client.ts` | `fetchOptions: { customFetchImpl, onSuccess }` (ver abajo) |
| web | `src/lib/api-files.ts` (nuevo) | `useApiFileSrc`, `saveApiFile`, `openApiFile` |
| web | `src/lib/download.ts` | `openBlob(blob)`: `<a target="_blank" rel="noopener">` temporal con `URL.createObjectURL`, revocado más tarde (60 s: la pestaña nueva lo necesita) |
| web | `src/components/api-image.tsx` (nuevo) | `<ApiImage>` (ver UI) |
| web | `src/features/auth/use-logout.ts` | `try { await authClient.signOut() } finally { setSessionToken(null) }` (R9) |
| web | `src/features/vehicles/dossier.tsx`, `src/features/maintenance/maintenance-attachments.tsx`, `src/features/maintenance/attachment-viewer.tsx`, `src/features/data-portability/data-section.tsx`, `src/features/schedules/add-to-calendar.tsx` | sitios 3–10 del inventario |
| web | `src/i18n/locales/{es,en}.json` | `common.fileError`: «No se ha podido abrir el archivo» / «The file could not be opened» |
| test | `src/test/render.tsx` | helper `setServerMode(url, token?)` que guarda URL base y token; `src/test/setup.ts`: `localStorage.clear()` en `afterEach` |

Sin cambios en la API, BD, `packages/shared`, `e2e/` ni Docker.

## Tipos y firmas

```ts
// lib/server.ts
const SERVER_URL_KEY = 'ikrive.serverUrl';
const TOKEN_KEY = 'ikrive.sessionToken';

export function getServerUrl(): string | null;          // sin barra final
/** Valida http(s) (lanza TypeError si no), guarda origin + pathname del URL parseado (sin barras finales, query ni hash); null la borra. Si cambia, borra el token (R7). */
export function setServerUrl(url: string | null): void;
export function getSessionToken(): string | null;
export function setSessionToken(token: string | null): void;
export const isServerMode = () => getServerUrl() !== null;

/** '/api/…' → '<URL base>/api/…' en modo servidor; igual en mismo origen. */
export function apiUrl(path: `/api/${string}`): string;
/**
 * Única puerta a la API. Mismo origen: fetch(path, { ...init, credentials: 'include' }).
 * Servidor: fetch(apiUrl(path), { ...init, credentials: 'omit', headers: + Authorization si hay token }).
 * Lee `globalThis.fetch` en cada llamada.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response>;

// lib/api-files.ts
/** Mismo origen: { src: url } al instante. Servidor: useQuery(['api-file', url]) → Blob (staleTime Infinity) + object URL revocado al desmontar. */
export function useApiFileSrc(url: string): { src: string | undefined; isError: boolean };
/** Mismo origen: no se usa (los enlaces siguen). Servidor: api.downloadUrl(url) → downloadBlob(fileName ?? fallbackName). */
export function saveApiFile(url: string, fallbackName: string): Promise<void>;
export function openApiFile(url: string): Promise<void>; // → openBlob
```

## `authClient`

```ts
createAuthClient({
  basePath: '/api/auth',
  fetchOptions: {
    // better-fetch pasa '/api/auth/…' (string) o un URL; se normaliza a la ruta.
    customFetchImpl: (input, init) => apiFetch(pathOf(input), init),
    onSuccess: ({ response }) => {
      const token = response.headers.get('set-auth-token');
      if (token && isServerMode()) setSessionToken(token);
    },
  },
});
```

better-fetch fija `credentials: 'include'` por defecto; `apiFetch` lo sustituye por `'omit'` en modo servidor (la API de #49 no permite credenciales en CORS y el navegador rechazaría la respuesta). Como `apiFetch` lee `fetch` en cada llamada, `authClient` deja de capturarlo al importarse; el import adelantado de `test/setup.ts` puede quedarse.

## Impacto en UI

- **`ApiImage`** (`src`, `alt`, `className`, `loading`, `onError`): en mismo origen pinta `<img src={src}>` igual que hoy (R2). En modo servidor, mientras carga, un `<span className={cn('block', className, 'bg-muted')} aria-hidden />` (span y no div: va dentro del `<button>` de la miniatura) (R11); con el blob, `<img src="blob:…">` (R10); si la petición falla, llama a `onError` (R12) y deja el placeholder. `VehiclePhoto`, la miniatura y el visor solo cambian `<img>` por `<ApiImage>`.
- **Descargas y PDF** en modo servidor: el mismo `Button` (mismas clases, icono, `aria-label` y texto) con `asChild` sobre `<a>` en mismo origen y como `<button type="button">` en modo servidor, con `onClick` → `saveApiFile` / `openApiFile` y `toast.error(t('common.fileError'))` si falla (R16). Mientras se descarga no hay estado extra (las facturas son pequeñas; el export se nota más, ver Riesgos).
- Sin pantallas nuevas, sin cambios visuales en mismo origen. Claro/oscuro/móvil: solo el placeholder `bg-muted`, que ya es el fondo de las miniaturas y del visor.

## Decisiones a validar

1. **Modo = hay URL base.** «Cuando no hay cookie» se interpreta como «hay URL base»: la web nunca mezcla modos (no intenta cookie y luego token).
2. **Almacenamiento: `localStorage`** con claves `ikrive.serverUrl` y `ikrive.sessionToken`, API síncrona. En la WebView de Capacitor persiste. Si #51 prefiere `@capacitor/preferences` o un almacén seguro, solo cambia `lib/server.ts`.
3. **Cambiar de servidor borra el token** (R7): no se envía el token de un servidor a otro.
4. **Se guarda el token de la cabecera `set-auth-token`** (el firmado, el que documenta #49), no el `token` del cuerpo.
5. **Enlace del evento de calendario** (R17): apunta a la web del servidor (`<URL base>/vehicles/<id>`), no al origen de la WebView (`https://localhost`), que fuera de la app no lleva a nada.
6. **Sin UI para fijar la URL base** en esta feature: la pondrá la primera pantalla de #51. Aquí solo existe `setServerUrl` (y los tests).
7. **Toast genérico `common.fileError`** para fallos de descarga/apertura en modo servidor (hoy un enlace roto lo gestiona el navegador).

## Alternativas descartadas

- **URL base en tiempo de compilación (`VITE_API_BASE_URL`):** la APK es una sola para todos los servidores; el usuario elige el suyo al abrirla. Tiene que ser en tiempo de ejecución.
- **Token en la query de `<img src>`:** ya descartado en #49 (logs y caché); además la API no lo acepta.
- **Recrear `authClient` cuando cambia la URL base (`baseURL` de Better Auth):** obliga a exportar un getter y cambiar los tres usos; con `customFetchImpl` el cliente es único y la URL se resuelve por petición.
- **Pedir los ficheros con `fetch` también en mismo origen:** unifica el código, pero cambia el comportamiento de la web (caché del navegador, `loading="lazy"`, export en streaming), contra el criterio «la web funciona como hoy».

## Riesgos

- **Export en modo servidor va a memoria** (blob) en lugar de streaming; con muchas facturas pesa. Aceptable para la APK; en mismo origen sigue en streaming.
- **`openBlob` tras un `await`** puede caer en el bloqueador de ventanas emergentes en navegadores de escritorio; en Capacitor no hay pestañas y #51 tendrá que abrir/compartir el fichero con un plugin nativo. `lib/api-files.ts` es la única costura que tendrá que cambiar.
- **`<a download>` con `blob:` en la WebView de Android** no descarga sin ayuda nativa; mismo caso, lo resuelve #51 en la misma costura.
- **Fotos en listas:** cada `VehiclePhoto` hace un `fetch`; la caché de TanStack Query por URL (que incluye `?v=`) evita repetirlo entre pantallas.
- **jsdom no implementa `URL.createObjectURL`/`revokeObjectURL`:** los tests los simulan con `vi.stubGlobal`/`vi.spyOn`.

## Fuera de alcance

- Pantalla para elegir servidor, validación con `/api/health`, proyecto Capacitor y gestión nativa de ficheros (#51).
- Limpiar el token cuando la API responde 401 (sesión caducada): `meQuery` ya devuelve `null` y lleva al login, y el siguiente login lo sobrescribe.
- Cambios en la API, en el service worker o en los E2E.
