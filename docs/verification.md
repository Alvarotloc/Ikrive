# Verificación

> El agente no dice «funciona»: lo demuestra con algo ejecutable.

## Niveles

1. **Estado del arnés** (siempre): `pnpm harness`. Valida `feature_list.json`, los specs, la trazabilidad `R<n> → task` y la rama.
2. **Checks del proyecto** (antes del reviewer y de Gate 2): `pnpm harness --full`, que añade `pnpm lint`, `pnpm typecheck` y `pnpm test`.
3. **Tests por capa** (obligatorio para cada `R<n>`):
   - Lógica pura → tests unitarios junto al código en `packages/shared/src/**` o `apps/web/src/features/**` (`*.test.ts`).
   - Componentes web con comportamiento (errores de la API en un campo, validación, estados vacío/cargando/error, accesibilidad) → test de componente junto al componente (`*.test.tsx`, jsdom + Testing Library) con `renderWithProviders` y `mockApi` de `apps/web/src/test/render.tsx`. Afirma lo que ve el usuario (texto, `role="alert"`, `aria-invalid`) y, si aplica, la petición enviada. Detalle en `CONTRIBUTING.md` › Tests.
   - API → integración en `apps/api/test/<dominio>.test.ts` con `app.inject()` sobre SQLite en memoria (`test/helpers.ts`). Cada endpoint nuevo cubre el caso feliz, la validación y la autorización (recurso de otro usuario → 404).
   - Cambios de esquema → la migración generada se aplica en los tests (las migraciones corren al construir la app).
4. **E2E** (features que cambian un flujo de usuario de punta a punta): `pnpm test:e2e`. Construye el build de producción (`pnpm build`) y Playwright (`e2e/playwright.config.ts`) arranca `e2e/server.mjs`, que ejecuta `apps/api/dist/server.js` sirviendo `apps/web/dist` sobre un `DATA_DIR` temporal en el puerto `3100` (`E2E_PORT`). Para iterar sin reconstruir: `pnpm --filter @ikrive/e2e test:e2e [tests/<f>.spec.ts]`. Si un test falla, su traza (`trace.zip`) y la captura quedan en `e2e/test-results/` (en CI, como artefacto `e2e-results`). No corre dentro de `pnpm test` ni de `pnpm harness --full`. La primera vez instala el navegador: `pnpm --filter @ikrive/e2e exec playwright install chromium`.
5. **Revisión visual** (features con UI): `pnpm dev` y capturas en claro, oscuro y móvil (playwright-core contra `/usr/bin/google-chrome`). Las rutas de las capturas van en `progress/impl_<name>.md`.
6. **Docker** (si la feature toca dependencias, el Dockerfile o el arranque): `docker build -f docker/Dockerfile -t ikrive:dev .` y comprobar `/api/health`.

## Anti-patrones

- ❌ «He añadido el endpoint, debería funcionar» sin un test.
- ❌ Tests que solo comprueban que no se lanza una excepción: hay que afirmar el resultado concreto (estado HTTP, cuerpo, filas en BD, fichero en disco).
- ❌ Mockear la base de datos: se usa SQLite en memoria real.
- ❌ Mockear el componente bajo prueba o sus hooks de datos: en los tests de componentes solo se simula `fetch` (`mockApi`).
- ❌ Desactivar o saltarse un test para ponerse en verde.
- ❌ Esperas fijas en los E2E (`waitForTimeout`, `setTimeout`, `sleep`): usa aserciones web-first. `e2e/no-fixed-waits.test.ts` lo comprueba en `pnpm test`.
- ❌ Pasar a `ready_to_merge` con `pnpm harness --full` en rojo.
