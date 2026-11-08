# Sesión actual

> Estado vivo. Se actualiza mientras se trabaja, no al final. Al cerrar la feature, su resumen pasa a `history.md` y este archivo vuelve a la plantilla.

- **Feature:** #49 `mobile-auth-api` — API para clientes nativos
- **Rama:** `feat/mobile-auth-api` (se sincroniza con `claude/siguiente-feature-oke4gr` en el remoto)
- **Estado:** in_progress
- **Inicio:** 2026-11-08

## Plan

Tasks de `specs/mobile-auth-api/tasks.md`:

- T1 `@fastify/cors` · T2 `CORS_ORIGINS` en config · T3 docs/self-hosting.md
- T4 `bearer({ requireSignature: true })` + `trustedOrigins` · T5 `isApiRequest` a `lib/http.ts`
- T6 `plugins/cors.ts` con delegator · T7–T16 `test/mobile-auth.test.ts`
- T17 decisión en docs/PLAN.md · T18 `pnpm harness --full` + `progress/impl_mobile-auth-api.md`

## Bitácora

- 2026-11-08: exploración (`progress/explore_mobile-auth-api_*.md`), spec redactado y aprobado (Gate 1). Lanzado el implementer.

## Notas del humano

- Spec aprobado sin cambios.

## Próximo paso

Implementer → `pnpm harness --full` → reviewer → Gate 2.
