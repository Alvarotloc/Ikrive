# Exploración #49 mobile-auth-api: CORS, config y ficheros

## Config
- `apps/api/src/config.ts`: `envObjectSchema` `:9-27`, helper `booleanString` `:3-5` (no hay helper de listas CSV), `ENV_VARIABLES` `:30`, transform `:32-42`.
- `docs/self-hosting.md` «Variables de entorno» `:43`, tabla `:47-63`. `apps/api/test/config-docs.test.ts` falla si una variable no tiene fila `` | `KEY` | ``.

## App (`apps/api/src/app.ts`, `buildApp` `:74`)
Orden: Fastify(`trustProxy`) → errorsPlugin `:83` → helmet `:84-89` (CSP `img-src 'self' data: blob:`; CORP por defecto `same-origin`, bloquearía `<img>` cross-origin pero no fetch+blob) → rate-limit `:92-96` (`allowList: !isApiRequest`) → multipart `:97` → `authPlugin` `:100` (registra `/api/auth/*` fuera del prefijo) → módulos en `prefix: '/api'` `:200-228` → staticSpa `:231` → notFound `:233-241`. `isApiRequest` en `:246` / `src/lib/http.ts`.
- `@fastify/cors` **no instalado**. Ningún código de CORS ni CSRF propio.
- CORS debe registrarse en raíz antes de `authPlugin`, limitado a `/api/` (delegator o hook con `isApiRequest`), con `exposedHeaders: ['set-auth-token']`.

## Rutas de ficheros (todas con `preHandler app.authenticate`, propietario → 404)
| Ruta | Archivo | Web |
|---|---|---|
| `GET /api/vehicles/:id/photo` | `modules/vehicles/routes.ts:53`, `service.ts:114` → `requireOwned :56` | `<img src>` `apps/web/src/features/vehicles/dossier.tsx:67` |
| `GET …/attachments/:attachmentId` (`?inline=1`) | `modules/attachments/routes.ts:78`, `service.ts:110` | `<a href>` `maintenance-attachments.tsx` ~157/175 |
| `GET …/attachments/:attachmentId/thumbnail` | `attachments/routes.ts:98`, `service.ts:116` | `<img src>` ~147 |
| `GET /api/vehicles/:id/report.pdf` | `modules/reports/routes.ts:10` | fetch+blob `lib/api-client.ts:33` |
| `GET /api/me/export` | `modules/data-export/routes.ts:11` | `<a download>` `data-section.tsx:79` |

Ninguna lee token por query. Con `bearer()` todas aceptan Authorization; la web nativa cargará ficheros por fetch+blob (#50).

## Tests
`createTestApp(env)` `test/helpers.ts:17`; `rate-limit.test.ts` sirve de plantilla para «solo en /api» (WEB_DIST_DIR falso). Suites: attachments, vehicles, auth, static-spa, config-docs, reports, data-export.
