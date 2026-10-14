# Contribuir a Ikrive

## Estructura

```
apps/api         API (Fastify 5 + Drizzle ORM + SQLite + Better Auth)
apps/web         SPA (React 19 + Vite + TanStack Router/Query + Tailwind 4)
packages/shared  Esquemas zod, enums y lógica de dominio pura compartida
docker/          Dockerfile multi-stage (una sola imagen sirve API + SPA)
```

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

## Tests

- Unitarios para la lógica pura (`packages/shared`).
- De integración en la API con `app.inject()` sobre SQLite en memoria (`apps/api/test/`).

## Convenciones

- TypeScript estricto, sin `any`. Formato y lint con Biome (se ejecuta en pre-commit vía lefthook).
- [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`…).
