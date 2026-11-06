# Requirements — release-v0-1-0

> Feature 42 (fase 7). Documentación de usuario y preparación de la v0.1.0. El tag `v0.1.0` y cualquier publicación (push del tag, imagen en GHCR, GitHub Release) quedan **fuera** de la implementación: se hacen solo tras el «merge» explícito del humano en Gate 2.
> «Script de capturas» = `pnpm screenshots`. «Guía» = `docs/self-hosting.md`. «Esquema de entorno» = el `z.object` de `apps/api/src/config.ts`.

## Capturas

## R1
CUANDO se ejecuta `pnpm screenshots`, el sistema DEBE construir el build de producción y generar con Playwright las capturas PNG en `docs/screenshots/`, contra `e2e/server.mjs` (bundle de producción sobre un `DATA_DIR` temporal).

## R2
CUANDO el script de capturas arranca, el sistema DEBE crear por la API sus propios datos de ejemplo (primer usuario, un vehículo con mantenimientos, una programación y repostajes) con fechas relativas al día de ejecución, sin depender de datos previos ni del proyecto `setup` de los E2E.

## R3
El script de capturas DEBE generar exactamente estos ficheros: `dashboard.png`, `vehicles.png`, `vehicle-detail.png`, `vehicle-stats.png` y `settings.png` en escritorio y tema claro, `vehicle-detail-dark.png` en tema oscuro y `mobile-dashboard.png` en viewport móvil.

## R4
El script de capturas NO DEBE usar esperas fijas (`waitForTimeout`, `setTimeout`, `sleep`).

## R5
El script de capturas NO DEBE ejecutarse dentro de `pnpm test:e2e`, `pnpm test` ni `pnpm harness --full`.

## R6
El README DEBE mostrar las siete capturas de R3 con rutas relativas a `docs/screenshots/` que existen en el repositorio.

## Documentación

## R7
La guía DEBE describir la instalación con `docker compose`: descargar `docker-compose.yml` y `.env.example`, fijar `BASE_URL` y `AUTH_SECRET`, arrancar, crear la primera cuenta (admin), cerrar registros con `DISABLE_SIGNUP` y actualizar la imagen (`docker compose pull && docker compose up -d`).

## R8
La guía DEBE tener una tabla de variables de entorno con cada clave del esquema de entorno más `TZ` e `IKRIVE_VERSION`, cada una con su valor por defecto y su descripción, indicando cuáles fija la imagen y no conviene cambiar.

## R9
La guía DEBE describir la copia de seguridad del volumen `/data` (`ikrive.db` con sus ficheros WAL y `uploads/`), con el contenedor parado, y su restauración.

## R10
La guía DEBE describir la copia de seguridad por usuario con el export de Ajustes (`GET /api/me/export`) y su restauración con el import, incluyendo el límite `IMPORT_MAX_MB` y que un mismo export no se importa dos veces.

## R11
La guía DEBE describir la exposición a internet para los enlaces públicos: proxy inverso con HTTPS, `BASE_URL` igual a la URL pública, qué rutas quedan públicas (`/api/public/reports/:token` y `/api/calendar/:file`), que el proxy debe sobrescribir `X-Forwarded-For` y qué ocurre si `BASE_URL` es local.

## R12
El README DEBE enlazar la guía para la configuración, las copias de seguridad, la exposición a internet y el lanzamiento manual de jobs, sin repetir la tabla de variables de entorno.

## R13
El README DEBE reflejar el estado de la v0.1.0: sin el aviso «en desarrollo temprano» y con todas las fases del roadmap marcadas como hechas.

## Release

## R14
El sistema DEBE incluir un `CHANGELOG.md` en la raíz, en formato Keep a Changelog, con una sección `## [0.1.0]` que recoja las funcionalidades de la versión agrupadas por área.

## R15
El sistema DEBE declarar `"version": "0.1.0"` en el `package.json` raíz y en los de `apps/api`, `apps/web`, `packages/shared` y `e2e`.

## R16
`docs/PLAN.md` DEBE marcar la fase 7 como «✅ Hecha» en la tabla de estado.

## R17
CUANDO se ejecuta `pnpm harness --full` en la rama `feat/release-v0-1-0`, el sistema DEBE terminar con código 0.

## Trazabilidad acceptance → requirements

| Criterio de `acceptance` | Requirements |
|---|---|
| El README tiene capturas de las pantallas principales generadas por un script de Playwright reproducible | R1, R2, R3, R4, R5, R6 |
| Documentación de instalación con docker compose, todas las variables de entorno, copias de seguridad (volumen /data y export) y exposición a internet para los enlaces públicos | R7, R8, R9, R10, R11, R12, R13 |
| CHANGELOG.md recoge la v0.1.0 | R14 |
| La versión de los package.json es 0.1.0 y docs/PLAN.md marca la fase 7 como hecha | R15, R16 |
| pnpm harness --full pasa en verde | R17 |
