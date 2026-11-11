# Implementación: #64 native-chunks-guard (`sdd: false`)

Sin spec: guía = `description` y `acceptance` en `feature_list.json` y el plan de `progress/current.md`.

## Cambios por archivo

- `apps/web/src/features/pwa/native-only.test.ts` (nuevo, proyecto `unit`):
  - Descubre `src/lib/native-*.ts` con `readdirSync` (sin los `*.test.ts`) y comprueba que `nativeChunkFileNames` manda cada uno (con su ruta absoluta real) a `assets/native/`.
  - Lee las `dependencies` de `apps/mobile/package.json` y, para cada una, construye el id de módulo que da Rolldown en el store de pnpm (`/node_modules/.pnpm/<scope>+<name>@<v>/node_modules/<scope>/<name>/dist/esm/{index,web}.js`) y exige `assets/native/`.
  - Exclusiones: `@capacitor/android` (es la plataforma Android, proyecto Java/Gradle; nunca se importa desde JS) y `@capacitor/cli` (herramienta de build; hoy está en `devDependencies`, se excluye igualmente por si se moviera). Las demás (`@capacitor/core`, `filesystem`, `share`, `local-notifications`, `@capacitor-community/file-opener`, `@ebarooni/capacitor-calendar`) son plugins/runtime que acaban en el bundle, así que no hay otras que excluir.
  - Guard de imports estáticos (lo pedido como opcional; es barato y robusto): recorre `apps/web/src/**/*.{ts,tsx}` salvo los `lib/native-*.ts`, los `*.test.ts(x)` y `src/test/`, extrae los imports/re-exports estáticos de valor (ignora `import type`/`export type` e `import()`) y falla si alguno apunta a Capacitor (`@capacitor/*` o cualquier dependencia de `apps/mobile`) o a `src/lib/native-*` (resolviendo `@/` y rutas relativas). Un test aparte valida el extractor con un fuente sintético (multilínea, re-export, side-effect, type-only y dinámico) para que el guard no pase en verde por no detectar nada.
  - Limitación conocida: es un análisis por regex, no un parser; no detecta `require()` (la web no lo usa). Las cadenas transitivas sí quedan cubiertas porque se analiza cada archivo de `src`.
- `apps/web/src/features/pwa/config.ts`: JSDoc de `NATIVE_ONLY_MODULES` amplía que la web no importa Capacitor ni `lib/native-*` de forma estática (solo `import()` tras `isNativeApp()`), por qué (el chunk iría a `assets/native/`, fuera del precache, y la web no funcionaría offline) y qué test lo vigila. Sin cambios de código.
- `CONTRIBUTING.md` (sección «Web»): misma regla y su motivo, y qué hacer al añadir un `lib/native-*.ts` o un plugin.

## Trazabilidad

| Acceptance | Test |
|---|---|
| Recorre `src/lib/native-*.ts` y deps de `apps/mobile` (salvo android/cli) y falla si no van a `assets/native/` | `native-only.test.ts` › `finds the native libs and the native app packages`, `sends every lib/native-*.ts to assets/native/`, `sends every package of the native app to assets/native/` |
| Documentado (JSDoc + CONTRIBUTING) que la web no importa Capacitor ni `lib/native-*` estáticamente | `config.ts` JSDoc, `CONTRIBUTING.md` › Web; vigilado por `native-only.test.ts` › `the web imports Capacitor and lib/native-* only through import()` y `detects static imports of native-only code and ignores type-only and dynamic ones` |
| `pnpm harness --full` en verde | ver abajo |

## Comprobación de que los tests fallan (todas revertidas, `git status` limpio salvo el test nuevo)

1. Quitar `calendar` de la regex de `NATIVE_ONLY_MODULES` → falla `sends every lib/native-*.ts…` (`native-calendar.ts: expected 'assets/[name]-[hash].js'`).
2. Quitar `@ebarooni` del scope → falla `sends every package of the native app…` (`@ebarooni+capacitor-calendar@8.10.0/…`).
3. Crear `src/lib/native-foo.ts` sin listarlo → falla `sends every lib/native-*.ts…`.
4. Añadir `import { createDeviceEvent } from '@/lib/native-calendar'` estático en `features/calendar/actions.ts` → falla `the web imports Capacitor and lib/native-* only through import()`.

## `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
e2e test:       Tests  6 passed (6)
packages/shared test:       Tests  119 passed (119)
apps/web test:       Tests  459 passed (459)
apps/api test:       Tests  368 passed (368)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones

- `NATIVE_ONLY_MODULES` no se ha tocado (sigue siendo una lista fija; `config.test.ts` espera que `lib/native-other.ts` mantenga el nombre por defecto). El guard obliga a añadir ahí cada módulo nuevo.
- Sin UI: no aplican capturas.

## Cambios de Gate 2

Avisos 1 y 2 de `progress/review_native-chunks-guard.md`; nada más.

- `apps/web/src/features/pwa/native-only.test.ts`: el JSDoc de `packageModuleId` ya no pone un ejemplo de ruta incorrecto ni dice que sea el id que da Rolldown. Ahora dice que es un id sintético con la forma de los de pnpm, que no se lee del disco y que solo importa su segmento `/node_modules/<name>/` (el que comprueba `NATIVE_ONLY_MODULES`). Sin cambios de código.
- `CONTRIBUTING.md` § Web: la frase de ~90 palabras pasa a dos puntos. (1) La regla (solo `import()` tras `isNativeApp()`, `import type` sí vale) y el motivo (`assets/native/` no se precachea; con un import estático la web cargaría ese chunk en todas las páginas y dejaría de funcionar offline). (2) Qué hacer al añadir un `lib/native-*.ts` o un plugin (añadirlo a `NATIVE_ONLY_MODULES` y el plugin también al `package.json` de la web) y qué test falla si no se hace. Mismo contenido.

`pnpm harness --full`: verde (lint, typecheck, test: web 459, api 368, shared 119).
