# Implementación — release-v0-1-0

Rama `feat/release-v0-1-0`. Sin commits, sin tag `v0.1.0`, sin push ni publicación.

## Cambios por archivo

### `e2e/`
- `server-config.ts` (nuevo): `port`, `baseURL` y `webServer` (los de antes, sin cambios), compartidos por las dos configs.
- `playwright.config.ts`: importa `baseURL` y `webServer` de `server-config.ts`. Mismo comportamiento (`pnpm test:e2e` 6/6).
- `screenshots.config.ts` (nuevo): `testDir: './screenshots'`, `workers: 1`, `retries: 0`, `es-ES`, `Europe/Madrid`, `serviceWorkers: 'block'`, `reducedMotion: 'reduce'`, proyecto único `screenshots` (Desktop Chrome 1280×800), mismo `webServer`, `outputDir: test-results/screenshots`.
- `screenshots/seed.ts` (nuevo): `signUpDemoUser` (primer usuario por `/api/auth/sign-up/email`) y `seedDemoData(request, today)`: Toyota Corolla `4821 LKP` (híbrido, datos de compra), 3 lecturas, 4 mantenimientos (el de aceite con factura `PNG_8x8`), regla anual que vence en ~15 días y 5 repostajes con depósito lleno. Todas las fechas son `today − n días` y los kilómetros crecen con la fecha.
- `screenshots/readme.spec.ts` (nuevo): `describe.serial`; `beforeAll` registra y siembra en un contexto propio y guarda la sesión en `e2e/.auth/screenshots.json` (gitignored y dockerignored); un test por captura con aserciones web-first antes de `screenshot({ animations: 'disabled' })`. Oscuro con `colorScheme: 'dark'` (comprueba la clase `dark` en `<html>`); móvil con las opciones de `devices['Pixel 7']` salvo `defaultBrowserType`.
- `no-fixed-waits.test.ts`: recorre `tests/` y `screenshots/`; test nuevo `screenshot script does not use fixed waits`.
- `release.test.ts` (nuevo): 4 guardas de contenido (ver tabla).
- `package.json`: `version` 0.1.0 y script `screenshots`.

### API
- `apps/api/src/config.ts`: `envObjectSchema` separado del `transform`; `export const ENV_VARIABLES`. Sin cambio de comportamiento.
- `apps/api/test/config-docs.test.ts` (nuevo): `documents every environment variable`.

### Docs y raíz
- `docs/self-hosting.md` (nueva): instalación, actualización, tabla de 15 variables (marca las 5 que fija la imagen), copia del volumen y restauración, export/import, exposición a internet (Caddy, Nginx/Traefik, `X-Forwarded-For`, puerto 3000, `BASE_URL` local, VPN), jobs a mano (movido del README).
- `README.md`: presentación, 7 capturas, arranque rápido, enlaces a la guía, estado v0.1.0, roadmap completo, `pnpm test:e2e` y `pnpm screenshots` en Desarrollo.
- `CHANGELOG.md` (nuevo): Keep a Changelog, `[Unreleased]` vacío y `## [0.1.0] - 2026-11-06` con `### Added` por área.
- `docs/screenshots/*.png` (7, nuevos, ~1,4 MB en total).
- `package.json` raíz: `version` 0.1.0 y script `screenshots`. `apps/api`, `apps/web` y `packages/shared`: `version` 0.1.0.
- `docs/PLAN.md`: fase 7 «✅ Hecha»; el pendiente obsoleto del repositorio remoto se sustituye por «Ninguno» con la nota de publicación por tag; `pnpm screenshots` en Verificación.
- `docs/verification.md` y `CONTRIBUTING.md` › Tests: una línea cada uno sobre cómo regenerar las capturas.
- `.env.example`: comentario inicial que enlaza la guía (lo permite el design).

## Trazabilidad

| R | Evidencia |
|---|---|
| R1 | Script raíz `screenshots` = `pnpm build && pnpm --filter @ikrive/e2e screenshots`; ejecuciones reales abajo; `e2e/release.test.ts` › `screenshots are not part of the e2e suite or vitest` (comprueba el script) |
| R2 | `e2e/screenshots/seed.ts` (`signUpDemoUser`, `seedDemoData`), sin proyecto `setup`; ejecuciones reales sobre `DATA_DIR` nuevo |
| R3 | `e2e/release.test.ts` › `readme shows every generated screenshot`; ejecuciones reales (7/7) |
| R4 | `e2e/no-fixed-waits.test.ts` › `screenshot script does not use fixed waits` |
| R5 | `e2e/release.test.ts` › `screenshots are not part of the e2e suite or vitest`; `pnpm test:e2e` ejecutó solo los 6 tests de `tests/` |
| R6 | `e2e/release.test.ts` › `readme shows every generated screenshot` |
| R7 | `e2e/release.test.ts` › `self-hosting guide covers install, backups and internet exposure` |
| R8 | `apps/api/test/config-docs.test.ts` › `documents every environment variable` |
| R9 | `e2e/release.test.ts` › `self-hosting guide covers install, backups and internet exposure` |
| R10 | ídem |
| R11 | ídem |
| R12 | `e2e/release.test.ts` › `readme links the guide without the env table` |
| R13 | Manual (abajo) |
| R14 | Manual (abajo) |
| R15 | Manual (abajo) |
| R16 | Manual (abajo) |
| R17 | `pnpm harness --full` (abajo) |

## Ejecuciones de `pnpm screenshots` (T6)

Dos ejecuciones seguidas del comando completo (`pnpm build` + Playwright), cada una con su `DATA_DIR` temporal nuevo creado y borrado por `server.mjs`:

```
ejecución 1: exit 0 — Running 7 tests using 1 worker … 7 passed (4.2s)
ejecución 2: exit 0 — Running 7 tests using 1 worker … 7 passed (4.3s)
  ✓ dashboard · vehicles · vehicle detail · vehicle stats · settings · dark theme › vehicle detail · mobile › dashboard
```

(Una ejecución previa de desarrollo, solo la parte de Playwright, también 7/7.)

Ficheros generados (tamaño, dimensiones):

| Fichero | Bytes | px |
|---|---|---|
| `dashboard.png` | 163 857 | 1280×800 |
| `vehicles.png` | 173 400 | 1280×800 |
| `vehicle-detail.png` | 394 391 | 1280×3969 (fullPage) |
| `vehicle-stats.png` | 60 996 | 944×1000 (locator) |
| `settings.png` | 125 949 | 1280×800 |
| `vehicle-detail-dark.png` | 139 763 | 1280×800 |
| `mobile-dashboard.png` | 304 847 | 1082×2202 (Pixel 7, DPR 2,625) |

Entre las dos ejecuciones, 5 de 7 PNG son idénticos byte a byte; `vehicle-detail-dark.png` y `mobile-dashboard.png` difieren en bytes (degradados del fondo), sin diferencia visual. Revisé visualmente `vehicle-detail.png`, `vehicle-stats.png`, `vehicle-detail-dark.png` y `mobile-dashboard.png`: datos sembrados, estadísticas completas (consumo 4,87 L/100 km, coste/km, gráficas), regla «Próximo», tema oscuro aplicado.

## Comprobación manual de R13–R16

- **R13**: `grep -n "desarrollo temprano\|- \[ \]" README.md` → sin resultados. El README dice «Estado: **v0.1.0**, la primera versión estable» y las 7 fases del roadmap están en `- [x]`.
- **R14**: `CHANGELOG.md` línea 9 `## [0.1.0] - 2026-11-06`, línea 13 `### Added`, con subsecciones por área (vehículos y odómetro, mantenimiento y facturas, recordatorios y notificaciones, repostajes y estadísticas, informe de venta, exportar e importar, interfaz/PWA, administración de usuarios, imagen Docker y documentación) y enlaces de comparación al final.
- **R15**: `"version": "0.1.0"` en `package.json` (raíz), `apps/api/package.json`, `apps/web/package.json`, `packages/shared/package.json` y `e2e/package.json` (comprobado con `grep '"version"'`).
- **R16**: `docs/PLAN.md` línea 45: `| 7. Pulido y release v0.1.0 | ✅ Hecha |`.

## Otras verificaciones

- `pnpm test:e2e`: 6 passed (5.6s) tras la extracción a `server-config.ts` (T15).

## `pnpm harness --full`

```
[OK]    47 features: 46 done, 0 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #42 release-v0-1-0 (in_progress)
[OK]    Rama actual: feat/release-v0-1-0
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (shared 119, API 336, web 346, e2e 6)
[OK]    Arnés en verde.
```

## Desviaciones y notas

- **`reducedMotion: 'reduce'`** en `screenshots.config.ts` (no listado en el design): Recharts y la utilidad `reveal` respetan `prefers-reduced-motion`, así que las gráficas se pintan en su estado final sin esperas fijas. `animations: 'disabled'` solo cubre CSS y no las animaciones JS de Recharts.
- **Sesión en `e2e/.auth/screenshots.json`**: el `beforeAll` la escribe y los tests la cargan con `test.use({ storageState })`; la carpeta ya está en `.gitignore` y `.dockerignore`.
- **Móvil**: `devices['Pixel 7']` sin `defaultBrowserType` (Playwright no permite fijarlo dentro de un `describe`); se aplican viewport, user agent, DPR, `isMobile` y `hasTouch`.
- **Export (R10)**: contrastado con `dataExportSchema`: el export **sí** incluye ajustes y canales de notificación (sin token); en el import se omiten los canales que tenían token. La guía lo dice así, en vez de «no incluye canales», como sugería el design.
- **`docs/PLAN.md`**: el pendiente obsoleto se sustituye por «Ninguno» más la nota de publicación por tag, en lugar de dejar la lista vacía.
- **Peso**: los 7 PNG suman ~1,4 MB; `docs/screenshots/` entra en el contexto de Docker (solo en la etapa `build`, no en la imagen final).
- Fuera de la implementación (leader, tras «merge»): tag `v0.1.0`, push, GitHub Release y ajustar la fecha del CHANGELOG si el tag cae otro día.
