# Tasks — release-v0-1-0

- [ ] T1 — Extraer `port`, `baseURL` y `webServer` de `e2e/playwright.config.ts` a `e2e/server-config.ts` sin cambiar el comportamiento de `pnpm test:e2e`. Cubre: R1, R5.
- [ ] T2 — `e2e/screenshots.config.ts` (`testDir: './screenshots'`, `workers: 1`, `es-ES`, `serviceWorkers: 'block'`, mismo `webServer`), script `screenshots` en `e2e/package.json` y `"screenshots": "pnpm build && pnpm --filter @ikrive/e2e screenshots"` en el `package.json` raíz. Cubre: R1, R5.
- [ ] T3 — `e2e/screenshots/seed.ts` con `seedDemoData(request, today)`: registro del primer usuario por API, vehículo, odómetro, mantenimientos (uno con adjunto), programación próxima y repostajes con depósito lleno, con fechas relativas a `today`. Cubre: R2.
- [ ] T4 — `e2e/screenshots/readme.spec.ts`: las 7 capturas de R3 en `docs/screenshots/` (claro escritorio, `vehicle-detail-dark.png` con `colorScheme: 'dark'`, `mobile-dashboard.png` con `devices['Pixel 7']`), con aserciones web-first antes de cada `screenshot`. Cubre: R1, R3, R4.
- [ ] T5 — Ampliar `e2e/no-fixed-waits.test.ts` a `screenshots/` con el test `screenshot script does not use fixed waits`. Cubre: R4.
- [ ] T6 — Ejecutar `pnpm screenshots` dos veces seguidas y versionar los PNG de `docs/screenshots/`; anotar la evidencia en `progress/impl_release-v0-1-0.md`. Cubre: R1, R2, R3.
- [ ] T7 — En `apps/api/src/config.ts`, separar `envObjectSchema` del `transform` y exportar `ENV_VARIABLES`. Cubre: R8.
- [ ] T8 — `docs/self-hosting.md`: instalación con docker compose y actualización, tabla de variables (todas las de `ENV_VARIABLES` + `TZ` + `IKRIVE_VERSION`, marcando las fijadas por la imagen), copias de seguridad del volumen y por export/import, exposición a internet y «Lanzar los jobs a mano» (movido del README). Cubre: R7, R8, R9, R10, R11.
- [ ] T9 — Reescribir `README.md`: capturas, arranque rápido, enlaces a la guía sin la tabla de variables, estado v0.1.0 y roadmap completo; añadir `pnpm test:e2e` y `pnpm screenshots` en Desarrollo. Cubre: R6, R12, R13.
- [ ] T10 — `CHANGELOG.md` (Keep a Changelog) con `## [0.1.0] - 2026-11-06` y `### Added` por área, a partir de `progress/history.md` y `docs/PLAN.md`. Cubre: R14.
- [ ] T11 — `"version": "0.1.0"` en el `package.json` raíz, `apps/api`, `apps/web`, `packages/shared` y `e2e`. Cubre: R15.
- [ ] T12 — `docs/PLAN.md`: fase 7 «✅ Hecha», quitar el pendiente obsoleto del repositorio remoto y mencionar `pnpm screenshots` en Verificación; una línea en `docs/verification.md` y `CONTRIBUTING.md` › Tests sobre cómo regenerar las capturas. Cubre: R16, R5.
- [ ] T13 — Test `documents every environment variable` en `apps/api/test/config-docs.test.ts`. Cubre: R8.
- [ ] T14 — Tests en `e2e/release.test.ts`: `screenshots are not part of the e2e suite or vitest`, `readme shows every generated screenshot`, `self-hosting guide covers install, backups and internet exposure` y `readme links the guide without the env table` (enlace a la guía y sin la tabla de variables). R13, R14, R15 y R16 no tienen test automático (solo valen para esta release): se verifican en la revisión (reviewer / Gate 2) y se anota en `progress/impl_release-v0-1-0.md`. Cubre: R3, R5, R6, R7, R9, R10, R11, R12, R13, R14, R15, R16.
- [ ] T15 — `pnpm test:e2e` en verde (la extracción de T1 no rompe la suite). Cubre: R5.
- [ ] T16 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_release-v0-1-0.md` (sin crear ni empujar el tag `v0.1.0`). Cubre: R17.
