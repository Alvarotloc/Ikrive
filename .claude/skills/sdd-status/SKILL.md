---
name: sdd-status
description: Muestra el estado del backlog SDD de Ikrive (features por estado, feature activa, rama, qué espera aprobación). Úsala cuando el usuario pregunte «¿cómo vamos?», «estado de las specs», «qué hay pendiente» o similar.
---

# Estado del backlog SDD

Solo lectura: no cambies ningún archivo.

1. Ejecuta `pnpm harness` y `git status --short --branch`.
2. Lee `feature_list.json` y `progress/current.md`.
3. Responde con:
   - Una tabla `id · name · fase · estado` de las features no `done` (y el nº de `done`).
   - La feature activa, su rama y en qué task va (cuenta `[x]` en `specs/<name>/tasks.md`).
   - Qué espera al humano: specs en `spec_ready` (Gate 1) o feature en `ready_to_merge` (Gate 2), con la ruta a revisar.
   - Errores o avisos de `pnpm harness`, si los hay.
   - El siguiente paso recomendado.
