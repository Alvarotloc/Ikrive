# Contribuir a Ikrive

Al participar en el proyecto aceptas su [código de conducta](CODE_OF_CONDUCT.md).

## Estructura

```
apps/api         API (Fastify 5 + Drizzle ORM + SQLite + Better Auth)
apps/web         SPA (React 19 + Vite + TanStack Router/Query + Tailwind 4)
packages/shared  Esquemas zod, enums y lógica de dominio pura compartida
packages/db      Esquema Drizzle y migraciones SQL (los usan la API y el modo local del móvil)
e2e/             Tests E2E con Playwright contra el build de producción
docker/          Dockerfile multi-stage (una sola imagen sirve API + SPA)
```

La imagen solo instala los paquetes que no se pueden empaquetar (`RUNTIME_EXTERNALS` en `apps/api/tsup.config.ts`: binarios nativos o con `require` dinámicos); todo lo demás va en el bundle de tsup. Para añadir uno, inclúyelo en `RUNTIME_EXTERNALS` y como dependencia de `apps/api` con versión exacta, y comprueba que el smoke test (`docker/smoke.mjs`) y el límite de tamaño siguen en verde.

### API

Cada dominio vive en `apps/api/src/modules/<dominio>/` con tres capas:

- `routes.ts`: HTTP. Valida con los esquemas de `@ikrive/shared` y llama al servicio.
- `service.ts`: lógica de negocio y reglas de propiedad (un usuario solo accede a sus datos).
- `repository.ts`: acceso a datos con Drizzle.

Las dependencias se conectan a mano en `src/app.ts` (composition root), así los servicios son fáciles de testear. Los errores se lanzan como `AppError` (`src/lib/errors.ts`) y se serializan como RFC 7807.

### Base de datos

1. Modifica el esquema en `packages/db/src/schema/` (la API lo importa con `apps/api/src/db/schema.ts`).
2. Genera la migración: `pnpm db:generate` (crea SQL en `packages/db/migrations/`).
3. Las migraciones se aplican solas al arrancar el servidor (el build las copia a `dist/migrations`) y al abrir la base local de la app móvil (`apps/web/src/lib/data-source/local/migrations.ts` las empaqueta con Vite).

El esquema es el mismo en el servidor y en el teléfono: no añadas columnas ni tablas solo para uno de los dos.

### Web

- Rutas por fichero en `apps/web/src/routes/` (el árbol `routeTree.gen.ts` lo genera el plugin de Vite).
- El código de cada dominio va en `src/features/<dominio>/` (queries, componentes).
- Los `queries.ts` y `lib/client-config.ts` acceden a los datos con `dataSource()` (`src/lib/data-source/`), nunca con `api` directamente: la implementación HTTP es `http.ts` y la del modo local del móvil, `local/`. Las query keys y las invalidaciones se quedan en los `queries.ts`. Una operación nueva se añade a `DataSource` (`types.ts`), a `http.ts` y a `local/` (o allí rechaza con `unsupported()`, un Problem 501). `no-direct-api.test.ts` falla si un `queries.ts` importa `@/lib/api-client`.
- **DataSource local** (`src/lib/data-source/local/`, modo «En este teléfono» de la app nativa): un fichero por dominio que replica la orquestación del `service.ts`/`repository.ts` de la API sobre `drizzle-orm/sqlite-proxy` (async, `db.transaction(async (tx) => …)`), con las mismas reglas de `@ikrive/shared`, los mismos textos de error y DTO que cumplen el esquema de respuesta. Las entradas se validan con `parseInput` (400 `Validation failed`) y cada método pasa por una cola (`serial.ts`) para que dos operaciones no intercalen sus sentencias. Si cambias una regla en un servicio de la API, cámbiala también aquí. En el dispositivo el motor es `@capacitor-community/sqlite` (`lib/native-sqlite.ts`); en los tests, better-sqlite3 en memoria (`createMemorySqlite` de `src/test/memory-sqlite.ts`). Los ficheros (foto y adjuntos) y el procesado de imágenes llegan como `LocalDeps` (`createLocalDataSource(db, { files, images })`, interfaces en `local/files.ts`): en el dispositivo, `createDeviceFileStore()` (`lib/native-storage.ts`, `@capacitor/filesystem` en `Directory.Data` bajo `uploads/<clave>`, las mismas claves que la API) y `createCanvasImages()` (`local/canvas-images.ts`, `createImageBitmap` + `<canvas>` a WebP en lugar de `sharp`); en los tests, `createMemoryFileStore()` (`src/test/memory-file-store.ts`, con `keys()` para afirmar lo que hay «en disco») y `fakeImages()` (`src/test/fake-images.ts`). El informe de venta se genera en el teléfono con el mismo módulo que la API, `@ikrive/shared/sale-report-pdf` (maquetación con react-pdf, anexos con pdf-lib y el bucle de presupuesto y omisión de facturas; las fuentes y el normalizador de imágenes se inyectan): la API le pasa rutas de disco y `sharp`, y el modo local (`local/sale-report.ts`) las `.woff` de `@fontsource` como URLs y `LocalImages.toAnnexImage` (canvas). Ese módulo pesa ~1,6 MB, así que el modo local lo carga con `import()` a través de `LocalDeps.saleReportPdf` (por defecto, el chunk `local/sale-report-pdf.ts`; en los tests, el kit de Node de `src/test/node-sale-report-pdf.ts`). Los DTO llevan URLs opacas `local://…` que solo resuelve `files.get`; la web las carga como `blob:` (`filesViaDataSource()` en `lib/api-files.ts`). El modo se guarda en `localStorage` (`lib/app-mode.ts`) y lo que necesita servidor se oculta con `isLocalMode()`.
- Los textos van siempre en `src/i18n/locales/{es,en}.json`.
- El código exclusivo de la app nativa (Capacitor y sus plugins, `src/lib/native-*.ts`) se carga solo con `import()` tras `isNativeApp()`; nunca con un import estático (`import type` sí vale). Motivo: el build web manda esos chunks a `assets/native/`, que el service worker no precachea (`NATIVE_ONLY_MODULES` en `src/features/pwa/config.ts`). Con un import estático la web cargaría ese chunk en todas las páginas y dejaría de funcionar offline.
- Al añadir un `lib/native-*.ts` o un plugin en `apps/mobile/package.json`, añádelo a `NATIVE_ONLY_MODULES` (y el plugin también al `package.json` de la web). `src/features/pwa/native-only.test.ts` falla si falta o si la web lo importa de forma estática.
- Un punto de entrada que solo carga el modo local con `import()` y que arrastra muchas dependencias (hoy, el PDF del informe: `local/sale-report-pdf.ts`) va en `NATIVE_ONLY_ENTRIES` del mismo fichero: su chunk va a `assets/native/` sea cual sea su contenido. La web solo llega a `@ikrive/shared/sale-report-pdf`, `@react-pdf/renderer`, `pdf-lib` y a ese chunk con `import()` (`import type` sí vale); `native-only.test.ts` lo comprueba.

### Diseño

La interfaz sigue la identidad de la landing (ikrive.com). Los tokens están en `apps/web/src/index.css`:

- Colores: tinta `#2d3a3a` (primario), menta `#c5e8e0` (acento), fondo `#f9fafb`; el modo oscuro deriva de la misma paleta.
- Tipografías autoalojadas: **Outfit** para títulos (`font-display`) y **Plus Jakarta Sans** para texto (`font-sans`).
- Radios de 8, 12, 16 y 24 px; tarjetas con borde fino; botones con elevación de 1px al pasar el ratón.
- Utilidades propias: `eyebrow`, `label-caps`, `glow-shell` (resplandor menta) y `reveal` (animación de entrada).
- Componentes de marca reutilizables: `Brand`, `PageHeader`, `Badge` (`status` y `stamp`) y `CheckItem`.
- Listas con badge inicial (`components/ui/badge-list.ts`): `badgeListClassName` en la lista y `badgeListRowClassName` en cada fila alinean la columna del badge en toda la lista desde `sm` (CSS `subgrid`).

## Flujo de trabajo

Las features nuevas siguen el flujo de [docs/sdd.md](docs/sdd.md): se añaden a `feature_list.json`, se especifican en `specs/<name>/` (requirements en EARS, design y tasks), se implementan en una rama `feat/<name>` y se integran en `main` con un merge `--no-ff` tras la revisión. Con Claude Code, el arnés (`AGENTS.md`, `.claude/agents/`, hooks) automatiza el flujo y para en las dos aprobaciones humanas.

### PRs de Dependabot

Dependabot (`.github/dependabot.yml`) solo actualiza las GitHub Actions, fijadas por SHA con su `# vX.Y.Z`. Las versiones menores y los parches llegan juntos en un PR agrupado; cada versión mayor, en un PR propio por acción.

- **Menores y parches:** intégralos si CI pasa.
- **Mayores:** lee el changelog de la acción (cambios de inputs, de versión de Node, de comportamiento por defecto) y comprueba los jobs que la usan. En el PR corren `check`, `e2e`, `docker` (construye la imagen sin publicarla) y `android`, pero `release.yml` solo corre al etiquetar una versión: las acciones que solo usa él (`docker/login-action`, `docker/metadata-action`, la publicación en GHCR y la firma del APK) no se prueban hasta el próximo tag. Si el job que la usa no se ha ejecutado o no cubre el cambio, revísalo a mano antes de integrar.

## Tests

- Unitarios para la lógica pura (`packages/shared` y `apps/web/src/features/**`, `*.test.ts`). Corren en Node.
  - Para comparar bytes de más de unos KB usa `expectSameBytes` (`src/test/bytes.ts` de `packages/shared` y de `apps/web`), no `toEqual`: Vitest recorre un `Uint8Array` elemento a elemento (~1,6 s por MB) y un test con un fichero de 1 MB supera el timeout de 5 s en una CI cargada.
- De integración en la API con `app.inject()` sobre SQLite en memoria (`apps/api/test/`).
- De componentes en la web con Vitest + jsdom + Testing Library (`*.test.tsx`, junto al componente). Escríbelos cuando un componente tenga comportamiento propio que la lógica pura no cubre: errores de la API mapeados a un campo, validación visible, estados vacío/cargando/error, accesibilidad (`role`, `aria-*`). No para maquetación estática.
  - Renderiza con `renderWithProviders` de `apps/web/src/test/render.tsx` (QueryClient nuevo sin reintentos, i18n en español) y simula la API con `mockApi({ 'POST /vehicles/v1/odometer': { status: 409, body: problem } })`, que sustituye `fetch`. Nada de servidor ni MSW. Una petición a una ruta no declarada (o sin `mockApi`) no sale a la red: falla el test con su método y URL, así que declara todas las que haga el componente, incluso las que deban responder 404. `src/test/setup.ts` instala ese `fetch` diferido antes de importar la app (también lo usa `authClient`, que captura `fetch` al importarse y por eso se importa ahí) y anula `window.scrollTo`, que jsdom no implementa.
  - Para probar una página con el árbol de rutas real (guards, loaders, layout), usa `await renderApp('/ruta')` de `apps/web/src/test/render-app.tsx` en vez de montar `RouterProvider` a mano: carga antes de renderizar los chunks de las rutas, que son code-split, y no vuelve hasta que el router ha pintado la primera página, para que el arranque en frío de la app no consuma el timeout de 1 s de los `findBy*`. Si el test necesita una primera navegación que no termina (un loader retenido a propósito), monta el router a mano.
  - Busca por rol, etiqueta o texto (`getByRole`, `getByLabelText`) e interactúa con el `user` que devuelve el helper (`user-event`). Afirma lo que ve el usuario con los matchers de `jest-dom`.
  - Ejemplos: `apps/web/src/features/vehicles/odometer-form.test.tsx` y `apps/web/src/components/form-field.test.tsx`.
  - Configuración en `apps/web/vitest.config.ts`: proyecto `unit` (`*.test.ts`, Node, `src/test/setup-unit.ts`) y `dom` (`*.test.tsx`, jsdom, `src/test/setup.ts`). Ambos setups fijan i18n a `es`: los tests corren siempre en español sea cual sea el idioma del sistema (en CI es en-US), así que los textos esperados se escriben en español.
- E2E con Playwright en `e2e/` (paquete `@ikrive/e2e`): `pnpm test:e2e` construye el build de producción y lo prueba como la imagen Docker (API sirviendo la SPA, BD temporal). Detalle en `docs/verification.md`.
  - El proyecto `setup` (`tests/auth.setup.ts`) registra al primer usuario (admin) por la UI y guarda su sesión en `e2e/.auth/admin.json`; los demás tests la reutilizan.
  - Para añadir uno, crea `e2e/tests/<flujo>.spec.ts` e importa `test`, `expect` y los helpers de `tests/fixtures.ts`, no de `@playwright/test`: `test` da a cada test una IP de cliente propia (`x-forwarded-for`) para que no compartan el rate limit. Cada test crea sus propios datos (`createVehicle(page.request, …)` con `uniquePlate(testInfo)`) y nunca depende de otro, porque corren en paralelo. Cuidado al contar filas en `/vehicles`: el export incluye todos los vehículos del admin compartido, así que un import en paralelo los duplica (por eso `data-portability` es un proyecto aparte con `workers: 1`); busca por matrícula única o usa `.first()`.
  - Localiza por rol o etiqueta con los textos de i18n (`t('clave')` lee `es.json`), no con selectores CSS ni textos copiados. Espera solo con aserciones web-first (`toBeVisible`, `toHaveURL`) y eventos (`waitForEvent('download')`); nada de esperas fijas.
  - Ejemplos: `e2e/tests/maintenance.spec.ts` (adjunto) y `e2e/tests/sale-report.spec.ts` (descarga).
- Capturas del README: `pnpm screenshots` las regenera en `docs/screenshots/` con Playwright (`e2e/screenshots.config.ts`, specs en `e2e/screenshots/`) sobre un build de producción con datos de ejemplo propios. No forman parte de `pnpm test:e2e`; regenéralas cuando cambie la UI.

## Convenciones

- TypeScript estricto, sin `any`. Formato y lint con Biome (se ejecuta en pre-commit vía lefthook).
- [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).
