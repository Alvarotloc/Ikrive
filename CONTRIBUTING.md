# Contribuir a Ikrive

## Estructura

```
apps/api         API (Fastify 5 + Drizzle ORM + SQLite + Better Auth)
apps/web         SPA (React 19 + Vite + TanStack Router/Query + Tailwind 4)
packages/shared  Esquemas zod, enums y lógica de dominio pura compartida
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

1. Modifica el esquema en `apps/api/src/db/schema/`.
2. Genera la migración: `pnpm db:generate` (crea SQL en `src/db/migrations/`).
3. Las migraciones se aplican solas al arrancar el servidor.

### Web

- Rutas por fichero en `apps/web/src/routes/` (el árbol `routeTree.gen.ts` lo genera el plugin de Vite).
- El código de cada dominio va en `src/features/<dominio>/` (queries, componentes).
- Los textos van siempre en `src/i18n/locales/{es,en}.json`.

### Diseño

La interfaz sigue la identidad de la landing (ikrive.com). Los tokens están en `apps/web/src/index.css`:

- Colores: tinta `#2d3a3a` (primario), menta `#c5e8e0` (acento), fondo `#f9fafb`; el modo oscuro deriva de la misma paleta.
- Tipografías autoalojadas: **Outfit** para títulos (`font-display`) y **Plus Jakarta Sans** para texto (`font-sans`).
- Radios de 8, 12, 16 y 24 px; tarjetas con borde fino; botones con elevación de 1px al pasar el ratón.
- Utilidades propias: `eyebrow`, `label-caps`, `glow-shell` (resplandor menta) y `reveal` (animación de entrada).
- Componentes de marca reutilizables: `Brand`, `PageHeader`, `Badge` (`status` y `stamp`) y `CheckItem`.

## Flujo de trabajo

Las features nuevas siguen el flujo de [docs/sdd.md](docs/sdd.md): se añaden a `feature_list.json`, se especifican en `specs/<name>/` (requirements en EARS, design y tasks), se implementan en una rama `feat/<name>` y se integran en `main` con un merge `--no-ff` tras la revisión. Con Claude Code, el arnés (`AGENTS.md`, `.claude/agents/`, hooks) automatiza el flujo y para en las dos aprobaciones humanas.

## Tests

- Unitarios para la lógica pura (`packages/shared` y `apps/web/src/features/**`, `*.test.ts`). Corren en Node.
- De integración en la API con `app.inject()` sobre SQLite en memoria (`apps/api/test/`).
- De componentes en la web con Vitest + jsdom + Testing Library (`*.test.tsx`, junto al componente). Escríbelos cuando un componente tenga comportamiento propio que la lógica pura no cubre: errores de la API mapeados a un campo, validación visible, estados vacío/cargando/error, accesibilidad (`role`, `aria-*`). No para maquetación estática.
  - Renderiza con `renderWithProviders` de `apps/web/src/test/render.tsx` (QueryClient nuevo sin reintentos, i18n en español) y simula la API con `mockApi({ 'POST /vehicles/v1/odometer': { status: 409, body: problem } })`, que sustituye `fetch`. Nada de servidor ni MSW. Una petición a una ruta no declarada (o sin `mockApi`) no sale a la red: falla el test con su método y URL, así que declara todas las que haga el componente, incluso las que deban responder 404. `src/test/setup.ts` instala ese `fetch` diferido antes de importar la app (también lo usa `authClient`, que captura `fetch` al importarse y por eso se importa ahí) y anula `window.scrollTo`, que jsdom no implementa.
  - Para probar una página con el árbol de rutas real (guards, loaders, layout), usa `await renderApp('/ruta')` de `apps/web/src/test/render-app.tsx` en vez de montar `RouterProvider` a mano: carga antes de renderizar los chunks de las rutas, que son code-split, para que su importación en frío no consuma el timeout de 1 s de los `findBy*`.
  - Busca por rol, etiqueta o texto (`getByRole`, `getByLabelText`) e interactúa con el `user` que devuelve el helper (`user-event`). Afirma lo que ve el usuario con los matchers de `jest-dom`.
  - Ejemplos: `apps/web/src/features/vehicles/odometer-form.test.tsx` y `apps/web/src/components/form-field.test.tsx`.
  - Configuración en `apps/web/vitest.config.ts`: proyecto `unit` (`*.test.ts`, Node, `src/test/setup-unit.ts`) y `dom` (`*.test.tsx`, jsdom, `src/test/setup.ts`). Ambos setups fijan i18n a `es`: los tests corren siempre en español sea cual sea el idioma del sistema (en CI es en-US), así que los textos esperados se escriben en español.

## Convenciones

- TypeScript estricto, sin `any`. Formato y lint con Biome (se ejecuta en pre-commit vía lefthook).
- [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).
