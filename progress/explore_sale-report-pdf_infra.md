# explore_sale-report-pdf_infra

> Hallazgos del agente Explore (solo lectura), guardados por el leader.

## 1. Build, ejecución y tsconfig de la API
- `apps/api/package.json`: `"type": "module"`. dev `tsx watch --env-file-if-exists=../../.env src/server.ts`; build `tsup`; start `node dist/server.js`; typecheck `tsc --noEmit`; test `vitest run`.
- `apps/api/tsup.config.ts`: entries `src/server.ts`, `src/job.ts`; esm, node22, `noExternal: ['@ikrive/shared']` (las deps npm quedan externas → @react-pdf/renderer y @fontsource/* se cargan de node_modules en runtime). `onSuccess` copia `src/db/migrations` → `dist/migrations` (patrón de assets en runtime; ver lookup con `import.meta.url` en `apps/api/src/db/client.ts:22`).
- `apps/api/tsconfig.json`: extiende `tsconfig.base.json` (ES2023, strict, verbatimModuleSyntax, isolatedModules, noUncheckedIndexedAccess); `module: ESNext`, `moduleResolution: Bundler`, `noEmit`, `types: ["node"]`, include `["src","test","*.config.ts"]`. **Sin `jsx`** → añadir `"jsx": "react-jsx"` (como `apps/web/tsconfig.json`).
- Vitest (`apps/api/vitest.config.ts`): include `test/**/*.test.ts`, `src/**/*.test.ts`. Un `.tsx` importado desde un test `.ts` se transforma; un `*.test.tsx` solo corre si se amplía el include.
- tsup/tsx (esbuild) aceptan `.tsx`; con `react-jsx` se emiten imports de `react/jsx-runtime` → `react` debe ser dependencia runtime de apps/api.
- Biome (`includes: ["**"]`) y el glob de lefthook (`*.{js,ts,tsx,json,css}`) ya cubren `.tsx`.
- Cambios para TSX: `jsx: react-jsx`; deps `react`, `@react-pdf/renderer`; dev `@types/react`; opcionalmente ampliar include de vitest. No añadir lib DOM (verificar).

## 2. Dockerfile (`docker/Dockerfile`)
- Build: manifests + `pnpm install --frozen-lockfile`, `COPY . .`, build web y api, `pnpm --filter @ikrive/api deploy --prod --legacy /out`, `cp -r apps/api/dist /out/dist`, `cp -r apps/web/dist /out/public`.
- Runtime: `/app` con `node_modules`, `package.json`, `dist`, `public`; CMD `node dist/server.js`.
- Fuentes @fontsource: llegan a `/app/node_modules` si están en `dependencies` (no dev; `deploy --prod` poda dev). Resolver en runtime con `createRequire(import.meta.url).resolve('@fontsource/outfit/files/outfit-latin-400-normal.woff')`; no rutas relativas a `src/` (el bundle vive en `dist/`).
- Alternativa: `apps/api/assets/fonts` copiado en `onSuccess` a `dist/fonts` (como migraciones). `.dockerignore` no lo excluiría.
- Las fuentes de la web son solo woff2; fontkit soporta TTF/WOFF y woff2 no es fiable → usar `.woff` de @fontsource.
- @react-pdf/renderer v4 es ESM-only: compatible (API ESM, dep externa). yoga-layout es wasm, sin build nativo (`allowBuilds` de `pnpm-workspace.yaml` no cambia). Verificar que `pnpm deploy --legacy` resuelve las transitivas (`@react-pdf/*`, `fontkit`, `yoga-layout`).

## 3. Respuestas binarias existentes
- `apps/api/src/modules/attachments/routes.ts`:
  - `contentDisposition(filename, disposition = 'attachment')` (RFC 6266/5987, fallback ASCII que sustituye no imprimibles, `"` y `\` por `_`, más `filename*=UTF-8''…`). Reutilizable; mejor moverlo a `src/lib/` si se comparte.
  - `userContentPolicy(mimeType)`: rama PDF con `object-src 'self'`.
  - GET: `reply.type(...).header('content-length').header('content-disposition', …).header('cache-control', IMMUTABLE).header('x-content-type-options','nosniff').header('content-security-policy', …).send(stream)`; disposición por `request.query.inline === '1'`.
- Foto de vehículo: `apps/api/src/modules/vehicles/routes.ts:56`.
- iCal: `apps/api/src/modules/calendar/routes.ts`, ruta `/calendar/:file` con comprobación manual del sufijo `.ics`; `text/calendar; charset=utf-8` y `cache-control: private, no-store`. Para `/vehicles/:id/report.pdf` el punto va en segmento estático (debería ir bien en find-my-way; probarlo). Informe generado → `private, no-store`.
- Tests: `apps/api/test/attachments.test.ts` usa `response.rawPayload.equals(buffer)` (l. 210, 226, 270, 414) y aserta `content-disposition` exacto; `inline` inválido → 400 (l. 275+). Imágenes con `sharp(rawPayload).metadata()`.

## 4. Dependencias
- apps/api: @fastify/helmet, multipart, rate-limit, static, better-auth, better-sqlite3, croner, drizzle-orm, fastify 5, fastify-plugin, fastify-type-provider-zod 7, sharp 0.35.5, zod 4. Dev: @ikrive/shared, @types/better-sqlite3, drizzle-kit, tsup, tsx. Root dev: biome, @types/node, lefthook, typescript ^7.0.2, vitest ^5.0.4.
- **Ninguna librería PDF** en el workspace. Para extraer texto en tests hace falta devDep nueva: `unpdf` (ESM, `extractText`) o `pdfjs-dist/legacy`. react-pdf comprime los streams → no vale buscar en el buffer crudo; la extracción depende de los ToUnicode que fontkit incrusta.
- React: solo `react@19.3.0` (web). @react-pdf/renderer v4 acepta peer react ^19 → añadir `react@^19.3.0` a apps/api mantiene una sola copia; no necesita react-dom.

## 5. Registro de rutas y query params
- Módulos `modules/<x>/{repository,service,routes}.ts`; rutas `FastifyPluginAsyncZod<{ service }>` con `app.addHook('preHandler', app.authenticate)` y `currentUser(request).id`.
- Composición en `apps/api/src/app.ts`: servicios a partir de repos (vehiclesRepo, maintenanceRepo, fuelLogsRepo, settingsService, attachmentsRepo…) y `await api.register(xRoutes, { service })` dentro del bloque con prefijo `/api`.
- Rate limit solo global (`max: 300 / '1 minute'` para `/api/*`, `app.ts:77`); ninguna ruta usa `config.rateLimit`. Para un render pesado: `config: { rateLimit: { max: N, timeWindow: '1 minute' } }`.
- Esquemas de query en `packages/shared/src/schemas/*`, exportados desde `@ikrive/shared`. No hay helper booleano compartido:
  - `attachmentFileQuerySchema = z.object({ inline: z.enum(['0','1']).optional() })` (`packages/shared/src/schemas/attachments.ts:34`).
  - `vehicleListQuerySchema` con `z.enum([...]).default('active')` (`packages/shared/src/schemas/vehicles.ts:85`).
  - Números con `z.coerce.number()` (`packages/shared/src/schemas/notifications.ts:19`). Nadie usa `z.coerce.boolean` ni `stringbool`.
- Errores: problem+json (`apps/api/src/plugins/errors.ts`); `NotFoundError` / `BadRequestError` en `apps/api/src/lib/errors.ts`.
