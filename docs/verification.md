# Verificación

> El agente no dice «funciona»: lo demuestra con algo ejecutable.

## Niveles

1. **Estado del arnés** (siempre): `pnpm harness`. Valida `feature_list.json`, los specs, la trazabilidad `R<n> → task` y la rama.
2. **Checks del proyecto** (antes del reviewer y de Gate 2): `pnpm harness --full`, que añade `pnpm lint`, `pnpm typecheck` y `pnpm test`.
3. **Tests por capa** (obligatorio para cada `R<n>`):
   - Lógica pura → tests unitarios junto al código en `packages/shared/src/**` o `apps/web/src/features/**` (`*.test.ts`).
   - API → integración en `apps/api/test/<dominio>.test.ts` con `app.inject()` sobre SQLite en memoria (`test/helpers.ts`). Cada endpoint nuevo cubre el caso feliz, la validación y la autorización (recurso de otro usuario → 404).
   - Cambios de esquema → la migración generada se aplica en los tests (las migraciones corren al construir la app).
4. **Revisión visual** (features con UI): `pnpm dev` y capturas en claro, oscuro y móvil (playwright-core contra `/usr/bin/google-chrome`). Las rutas de las capturas van en `progress/impl_<name>.md`.
5. **Docker** (si la feature toca dependencias, el Dockerfile o el arranque): `docker build -f docker/Dockerfile -t ikrive:dev .` y comprobar `/api/health`.

## Anti-patrones

- ❌ «He añadido el endpoint, debería funcionar» sin un test.
- ❌ Tests que solo comprueban que no se lanza una excepción: hay que afirmar el resultado concreto (estado HTTP, cuerpo, filas en BD, fichero en disco).
- ❌ Mockear la base de datos: se usa SQLite en memoria real.
- ❌ Desactivar o saltarse un test para ponerse en verde.
- ❌ Pasar a `ready_to_merge` con `pnpm harness --full` en rojo.
