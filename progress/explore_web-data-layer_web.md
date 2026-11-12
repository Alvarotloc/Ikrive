# Explore #53 web-data-layer: how apps/web reaches data today

> Written by the leader from the Explore agent's report (Explore is read-only). Paths relative to `apps/web/src`.

## 1. Transport stack (lib/)
| File | Role |
|---|---|
| `lib/server.ts` | `apiFetch(path, init)` (~l.95) is the only route to the network. Same-origin: `fetch(path, {credentials:'include'})` with cookie. Server mode (`localStorage['ikrive.serverUrl']`, mobile): `fetch(serverUrl+path, {credentials:'omit'})` + `Authorization: Bearer <ikrive.sessionToken>`. Exports `getServerUrl/setServerUrl/normalizeServerUrl/getSessionToken/setSessionToken/isServerMode/apiUrl`. |
| `lib/api-client.ts` | `ApiError(problem)` (l.5), `request()` (l.21): JSON or FormData pass-through, `undefined` on 204, `toApiError` for problem+json. `download(path)`/`downloadUrl(url)` (l.39-50) → `{blob, fileName}` from `Content-Disposition` (imports `fileNameFromContentDisposition` from `features/reports/sale-report.ts`: lib depends on a feature). Exports `api = {get, post, patch, put, delete, download, downloadUrl}`. |
| `lib/api-files.ts` | `useApiFileSrc(url)` (l.23): same-origin returns `/api/...` as-is; server mode `useQuery(['api-file', serverUrl, url])` over `api.downloadUrl` → `blob:` URL. Also `saveApiFile`, `openApiFile`. |
| `lib/download.ts` | `downloadBlob`, `openBlob` (web `<a download>`/new tab; native via `native-files.ts`). |
| `lib/auth-client.ts` | better-auth client, `customFetchImpl: apiFetch`, stores set-auth-token in server mode. |
| `lib/client-config.ts` | `clientConfigQuery`: GET /config (`maxUploadMb`, `localBaseUrl`), `staleTime: Infinity`. |
| `lib/query-keys.ts` | Central `queryKeys` tree; everything per-vehicle under `['vehicles','detail',id]`, so invalidating `vehicles.all` refreshes it all. |

## 2. Every queries.ts
Pattern: `queryOptions({queryKey, queryFn: () => api.get(...)})` + local `useXMutation(mutationFn)` with `onSuccess`/`onSettled` invalidation. Paths relative to `/api`.

| File | Reads | Writes | Cache effect |
|---|---|---|---|
| `features/auth/queries.ts` | `meQuery` GET /me (401 → null, l.11-13) | - | - |
| `features/settings/queries.ts` | GET /settings | PATCH /settings | `setQueryData` |
| `features/vehicles/queries.ts` | GET /vehicles?status=; /vehicles/:id; /vehicles/:id/odometer | POST /vehicles; PATCH; **PUT photo (FormData)** l.50-54; DELETE photo; DELETE vehicle; POST/DELETE odometer | `setQueryData(detail)` + invalidate `vehicles.all`; delete `removeQueries` |
| `features/fuel/queries.ts` | GET fuel-logs | POST, PATCH, DELETE | `vehicles.all` |
| `features/maintenance/queries.ts` | GET maintenance; spending; attachments | POST/PATCH/DELETE; **POST attachments (FormData)** l.61-67; DELETE attachment | `vehicles.all`; `attachments(id,rid)` |
| `features/schedules/queries.ts` | GET schedules | POST, PATCH, DELETE | `schedules(id)`; delete → `detail(id)` |
| `features/stats/queries.ts` | GET stats | - | - |
| `features/reports/queries.ts` | GET report-shares | **`api.download` sale-report PDF** (l.22-28; path in `reports/sale-report.ts:12`); POST/DELETE shares | `reportShares(id)` |
| `features/notifications/queries.ts` | GET /notifications (`refetchInterval: 60_000`) | PATCH :id/read; POST read-all | `notifications.all` |
| `features/notification-channels/queries.ts` | GET | POST, PATCH, DELETE, POST :id/test | `notificationChannels.all` |
| `features/calendar-feed/queries.ts` | GET /me/calendar-feed | POST (secret url), DELETE | `setQueryData` |
| `features/data-portability/queries.ts` | `EXPORT_URL='/api/me/export'` const | **POST /me/import (FormData zip)** | `vehicles.all` + `notificationChannels.all` |
| `features/admin-users/queries.ts` | GET /admin/users | PUT role; POST disable/enable; DELETE | `adminUsers` |
| `lib/client-config.ts` | GET /config | - | - |

## 3. Other direct users of api/auth
- **authClient:** `routes/login.tsx:40`, `routes/register.tsx:42`, `features/auth/use-logout.ts:15`. Login/register `beforeLoad` use `ensureQueryData(meQuery)` and `requireServer` (`features/mobile/require-server.ts`).
- **Session bootstrap:** `features/auth/start-session.ts`, `routes/_app.tsx:14-20`, `routes/_app/admin/users.tsx`, `features/admin-users/user-row.tsx:68`, `features/notifications/notification-tap-handler.tsx:26`, `features/navigation/app-navigation.tsx:22`.
- **Raw fetch on purpose:** `features/mobile/check-server.ts:36` (`/api/health`).
- **File URLs as opaque `/api/...` strings in DTOs:** `vehicle.photoUrl` (shared `schemas/vehicles.ts:77`), `attachment.url` (shared `schemas/attachments.ts:15`); rendered via `components/api-image.tsx` (`useApiFileSrc`) in `vehicles/dossier.tsx:69`, `maintenance/maintenance-attachments.tsx:170`, `maintenance/attachment-viewer.tsx:66`. Downloads branch on `isServerMode()`: `maintenance-attachments.tsx:135-214` (+ `inlineUrl()`), `attachment-viewer.tsx:78-96`, `data-portability/data-section.tsx:84-101`.
- **`ApiError`/status checks (~10):** `fuel/form.ts:98`, `maintenance/form.ts:57`, `maintenance/attachments.ts:21`, `vehicles/odometer-form.tsx:51`, `vehicles/photo-picker.tsx:26`, `admin-users/errors.ts:5`, `data-portability/import.ts:27`, `data-portability/data-section.tsx:70`, `pwa/network-error.ts:8` (TypeError = offline), `routes/_app/vehicles/$vehicleId/index.tsx:41` (404), `auth/queries.ts:13` (401).
- **`getServerUrl()` outside lib:** `schedules/add-to-calendar.tsx:59`, `mobile/server-link.tsx`, `routes/server.tsx`, `mobile/use-change-server.ts`.
- **Route loaders** `ensureQueryData` + components `useSuspenseQuery` with the same factories.

## 4. How tests mock the API
- No msw. `test/setup.ts` installs a deferred fetch; unmocked requests fail (`test/unmocked-requests.ts`).
- `test/render.tsx:63` `mockApi({'METHOD /path': {status, body, headers} | fn})` stubs global `fetch`; Blob bodies for PDF/zip; problem+json errors. Also `setServerMode` (l.107), `mockObjectUrls` (l.117), `createTestQueryClient`. ~41 test files use `mockApi`, plus `test/render-app.tsx`.
- `vi.mock` only for native/download modules, never the api client.
- Consequence: tests assert at HTTP level, so they keep passing against an HTTP implementation of a new interface unchanged.

## 5. What makes a swappable interface awkward
1. Multipart uploads build `FormData` inside queries.ts → interface should take `File`/`Blob`.
2. Files as URL strings in DTOs (`photoUrl`, `attachment.url`, `EXPORT_URL`, `inlineUrl()`); `useApiFileSrc` caches by URL. Local mode has no URLs → needs `getFile(ref) → Blob` / `resolveFileSrc(ref)`; the `isServerMode()` branches would collapse into it.
3. Blob downloads relying on `Content-Disposition` (PDF, attachments, zip) → `{blob, fileName}`; locally PDF/zip would be generated client-side.
4. Errors are `ApiError` with HTTP `Problem`; ~10 sites branch on status → local impl emits the same Problem shape, or a domain error type.
5. Auth/session coupling: better-auth, `meQuery` 401 → null guard, token in localStorage, `startSession`/`useLogout`. Local mode needs a fake `me`, no login; `requireServer` and `/welcome` need rethinking.
6. Server-computed derived data (stats, spending, next-due, odometer side effects of writes).
7. Notifications polling (`refetchInterval`) of server-generated rows; no job runner locally.
8. `lib/api-client.ts` depends on `features/reports/sale-report.ts`.
9. Keys and invalidation live with the transport call. Least invasive cut: replace only `queryFn`/`mutationFn` bodies (e.g. `dataSource.vehicles.list(status)`), keep keys and invalidation in place.

## 6. Calls local mode would hide or disable
- Report shares (`reports/queries.ts` CRUD, `report-shares-section.tsx`).
- iCal feed (`calendar-feed/*`). Device calendar add still works, but its `baseUrl` comes from `getServerUrl() ?? origin`.
- Admin (`admin-users/*`, `routes/_app/admin/users.tsx`).
- Auth (login, register, logout, `routes/server.tsx`, `features/mobile/*` server switching).
- Notification channels (server-side send); in-app notifications generated by jobs (local: computed on app open, per PLAN decision).
- `/config` → local defaults.
- Kept but needing local generation: export zip / import, sale-report PDF.
