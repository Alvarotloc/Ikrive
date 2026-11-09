# Sesión actual

> Estado vivo. Se actualiza mientras se trabaja, no al final. Al cerrar la feature, su resumen pasa a `history.md` y este archivo vuelve a la plantilla.

- **Feature:** #57 data-dir-not-writable (`sdd: false`)
- **Rama:** `feat/data-dir-not-writable`
- **Estado:** in_progress
- **Inicio:** 2026-11-09

## Plan

Guiado por los `acceptance` de `feature_list.json`:

- [ ] Función en apps/api que comprueba/crea DATA_DIR y verifica escritura antes de abrir la BD
- [ ] Salida con código ≠ 0 y un único log claro (ruta, uid/gid, `sudo chown -R 1000:1000 data`)
- [ ] Tests: escribible → sigue; inexistente creable → la crea; sin permiso → error con mensaje
- [ ] docs/self-hosting.md: propietario uid 1000 / `mkdir data` y mensaje esperado
- [ ] Smoke test de Docker y `pnpm harness --full` en verde

## Bitácora

- 2026-11-09: rama creada, feature en `in_progress`, implementer lanzado.

## Notas del humano

_—_

## Próximo paso

Implementer → reviewer → Gate 2.
