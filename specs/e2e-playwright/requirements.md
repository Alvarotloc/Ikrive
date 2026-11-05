# Requirements — e2e-playwright

> Feature 41 (fase 7). Tests E2E con Playwright contra el build de producción: `apps/api/dist/server.js` (bundle de tsup) sirviendo `apps/web/dist`, igual que la imagen Docker, con una BD temporal.
> «Suite» = los tests Playwright de `e2e/tests/`. «Servidor E2E» = el proceso que arranca `pnpm test:e2e`. «Setup» = el proyecto Playwright `setup` (registro del admin), del que dependen los demás. «Sesión del admin» = el `storageState` que guarda el setup.

## Arranque

## R1
CUANDO se ejecuta `pnpm test:e2e` en la raíz, el sistema DEBE construir el build de producción (`pnpm build`) y después ejecutar la suite con la configuración de `e2e/playwright.config.ts`.

## R2
CUANDO se ejecuta la suite, el sistema DEBE arrancar el servidor E2E con `node apps/api/dist/server.js`, `NODE_ENV=production` y `WEB_DIST_DIR=apps/web/dist`, de modo que la SPA y la API se sirvan desde el mismo origen.

## R3
CUANDO arranca el servidor E2E, el sistema DEBE usar como `DATA_DIR` un directorio nuevo y vacío creado bajo el directorio temporal del sistema.

## Flujos

## R4
CUANDO el setup registra una cuenta desde `/register` sobre la BD vacía, el sistema DEBE mostrar el panel con el acceso a la gestión de usuarios y listar esa cuenta en `/admin/users` como administradora.

## R5
CUANDO un test crea un vehículo desde el formulario de `/vehicles/new`, el sistema DEBE mostrar su ficha con marca, modelo y matrícula, y el vehículo DEBE aparecer en `/vehicles`.

## R6
CUANDO un test añade desde la ficha del vehículo un mantenimiento con una imagen adjunta, el sistema DEBE mostrar el mantenimiento en el historial con el nombre del adjunto.

## R7
CUANDO un test añade desde la ficha del vehículo dos repostajes de depósito lleno, el sistema DEBE mostrar los dos en la sección de repostajes y el consumo medio calculado en Estadísticas en lugar de «—».

## R8
CUANDO un test descarga el informe de venta desde su diálogo, el sistema DEBE entregar una descarga `.pdf` cuyo contenido empieza por `%PDF-`.

## R9
CUANDO un test pulsa «Exportar» en Ajustes, el sistema DEBE entregar una descarga `.zip` cuyo contenido empieza por `PK`.

## R10
CUANDO un test importa en Ajustes el zip exportado y confirma, el sistema DEBE mostrar el resumen del import y el vehículo exportado DEBE aparecer dos veces en `/vehicles`.

## Independencia y estabilidad

## R11
El sistema DEBE ejecutar cada test de la suite (salvo el setup) con datos propios creados por él mismo, de modo que cada test pase ejecutado en solitario y en paralelo con los demás.

## R12
El sistema NO DEBE usar esperas fijas (`waitForTimeout`, `setTimeout`, `sleep`) en los ficheros de la suite.

## R13
SI un test de la suite falla ENTONCES el sistema DEBE conservar su traza de Playwright y una captura de pantalla en `e2e/test-results/`.

## R14
El sistema NO DEBE ejecutar la suite E2E dentro de `pnpm test` (ni, por tanto, de `pnpm harness --full`).

## CI

## R15
CUANDO se ejecuta `ci.yml` (push a `main` o pull request), el sistema DEBE ejecutar un job `e2e` que instala Chromium y corre `pnpm test:e2e`.

## R16
SI el job `e2e` falla ENTONCES el sistema DEBE subir como artefacto `e2e/test-results/` y el informe HTML de Playwright.

## Docs

## R17
El sistema DEBE documentar `pnpm test:e2e`, dónde viven los E2E y cómo añadir uno en `docs/verification.md`, `CONTRIBUTING.md` y `docs/PLAN.md`.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Configuración de Playwright y `pnpm test:e2e` que levanta el servidor con un `DATA_DIR` temporal | R1, R2, R3, R17 |
| Flujos: registro del primer usuario (admin), vehículo, mantenimiento con adjunto, repostaje y estadísticas, informe de venta, exportar e importar | R4, R5, R6, R7, R8, R9, R10 |
| Tests independientes y estables (sin sleeps fijos) | R11, R12 |
| Job de CI que ejecuta los E2E y guarda trazas y capturas si fallan | R13, R15, R16 |
| `pnpm harness --full` en verde | R14 (y T última) |
