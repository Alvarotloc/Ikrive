# CHECKPOINTS: estado final correcto

> Se evalúa el destino, no el camino. El `reviewer` recorre cada casilla y rechaza si alguna de C1–C7 queda vacía para la feature revisada.

## C1 — Arnés sano

- [ ] `pnpm harness` termina con código 0.
- [ ] Como mucho una feature activa (`in_progress` o `ready_to_merge`).
- [ ] La rama actual es `feat/<name>` de la feature activa.

## C2 — Spec completo y trazable

- [ ] `specs/<name>/` tiene `requirements.md`, `design.md` y `tasks.md`.
- [ ] `requirements.md` está en EARS estricto (un `DEBE` por requirement, sin verbos blandos) y su tabla cubre todos los `acceptance` de `feature_list.json`.
- [ ] Todas las tasks de `tasks.md` están `[x]`, o la excepción está justificada en `progress/impl_<name>.md`.
- [ ] Cada `R<n>` tiene al menos un test concreto que lo verifica (abierto y leído, no solo nombrado).

## C3 — Alcance

- [ ] El diff (`git diff main...` + cambios sin commitear) solo toca lo previsto en `design.md`.
- [ ] No hay cambios de otras features ni refactors no pedidos.

## C4 — Arquitectura (`CONTRIBUTING.md`, `docs/PLAN.md`)

- [ ] API: dominio en `modules/<dominio>/{routes,service,repository}.ts`, cableado en `app.ts`; las rutas validan con esquemas de `@ikrive/shared`.
- [ ] Propiedad: el servicio comprueba el propietario y un recurso ajeno responde 404.
- [ ] Errores como `AppError` (RFC 7807); nada de `throw new Error` hacia el cliente.
- [ ] Cambios de BD: esquema en `db/schema/` y migración SQL generada con `pnpm db:generate` e incluida.
- [ ] Web: código del dominio en `features/<dominio>/`, datos con `queryOptions`, textos en `es.json` y `en.json`, componentes de marca reutilizados.
- [ ] Lógica de dominio pura en `packages/shared` con tests unitarios.

## C5 — Convenciones

- [ ] TypeScript estricto sin `any` ni `@ts-ignore` nuevos.
- [ ] Fechas sin hora como `YYYY-MM-DD`; kilometraje sin convertir de unidad.
- [ ] Sin `console.log` de depuración, código comentado ni TODOs sin contexto.
- [ ] Ficheros subidos con nombre aleatorio y servidos con control de acceso.

## C6 — Verificación real

- [ ] `pnpm harness --full` en verde (lint, typecheck, test).
- [ ] Los tests nuevos afirman resultados concretos y usan SQLite en memoria, sin mocks de BD.
- [ ] Features con UI: capturas en claro, oscuro y móvil referenciadas en `progress/impl_<name>.md`.

## C7 — Rastro

- [ ] `progress/impl_<name>.md` existe con archivos tocados, mapa `R<n> → test` y salida de la verificación.
- [ ] `progress/current.md` describe la sesión activa.
- [ ] `docs/PLAN.md` está actualizado si la feature cierra una fase o cambia una decisión.
