# Review — #64 native-chunks-guard

**Veredicto:** APPROVED

Feature `sdd: false`: sin `specs/`. Se valida contra `description` y `acceptance` de `feature_list.json`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`. Diff = cambios sin commitear (la rama no tiene commits sobre `main`).

## Trazabilidad acceptance ↔ tests
- A1 (recorre `src/lib/native-*.ts` y las deps de `apps/mobile` salvo android/cli; falla si no van a `assets/native/`): [x]
  - `apps/web/src/features/pwa/native-only.test.ts` › `finds the native libs and the native app packages` (descubrimiento no vacío, excluye `@capacitor/android`)
  - › `sends every lib/native-*.ts to assets/native/` (ruta absoluta real de cada fichero → `toBe('assets/native/[name]-[hash].js')`)
  - › `sends every package of the native app to assets/native/` (id sintético por dependencia → mismo `toBe`)
- A2 (documentado en el JSDoc de `NATIVE_ONLY_MODULES` y en `CONTRIBUTING.md` que la web no importa Capacitor ni `lib/native-*` de forma estática): [x] `config.ts:29-38`, `CONTRIBUTING.md` § Web. Además lo vigila › `the web imports Capacitor and lib/native-* only through import()`, y el extractor tiene su propio test con caso positivo (› `detects static imports…`), así que el guard no pasa por no detectar nada.
- A3 (`pnpm harness --full` en verde): [x] ejecutado por el reviewer: lint, typecheck y test OK (web 459, api 368, shared 119, e2e 6).

## Mutaciones reproducidas por el reviewer
Hechas en una copia de `apps/web/src` + `apps/mobile/package.json` en el scratchpad (sin tocar `apps/`; `git status` igual que antes), con vitest solo sobre `native-only.test.ts`:

| Mutación | Resultado |
|---|---|
| M1 quitar `calendar` de la regex | ✗ `sends every lib/native-*.ts…` (informe #1) |
| M2 quitar `@ebarooni` | ✗ `sends every package…` (informe #2) |
| M3 nuevo `lib/native-foo.ts` sin listar | ✗ `sends every lib/native-*.ts…` (informe #3) |
| M4 import estático de `@/lib/native-calendar` en `features/calendar/actions.ts` | ✗ guard de imports (informe #4) |
| M5 dependencia sin scope `capacitor-plugin-foo` en `apps/mobile` | ✗ `sends every package…` |
| M6 `export * from '@capacitor/share'` en `lib/platform.ts` | ✗ guard de imports |
| M7 `import … from './native-files'` (relativo) en `lib/download.ts` | ✗ guard de imports |
| M8 `import { type X } from '@capacitor/core'` | ✗ guard de imports (es correcto: con `verbatimModuleSyntax` queda un `import {} from`, que no se borra) |
| M9 solo cambia la versión de un plugin | ✓ (no es frágil) |
| M10 import de `@/lib/native-files/helpers` (subcarpeta) | ✓ no se detecta; aceptable, `NATIVE_ONLY_MODULES` tampoco cubre subcarpetas y no existen |

## Tasks
- Sin `tasks.md` (`sdd: false`). Plan de `progress/current.md` (1–3) cumplido.

## Checkpoints
- C1: [x] harness OK; una sola feature `in_progress` (#64); rama `feat/native-chunks-guard`.
- C2: [x] N/A por `sdd: false`; los acceptance se trazan arriba con tests leídos.
- C3: [x] solo test nuevo, JSDoc (sin cambios de código), CONTRIBUTING, `feature_list.json` (status) y `progress/`. Ni refactors ni cambios de otras features.
- C4: [x] test junto a su dominio (`features/pwa/`); proyecto `unit` (Node). Lo de API/BD no aplica.
- C5: [x] sin `any`, `@ts-ignore`, `console.log` ni TODOs.
- C6: [x] harness `--full` en verde; los asserts comprueban valores concretos (`toBe` del nombre de chunk y `toEqual` de la lista de imports). Sin UI.
- C7: [x] `impl_native-chunks-guard.md` con ficheros, trazabilidad y salida; `current.md` al día; PLAN.md sin cambios (no cierra fase).

## Hallazgos
Ninguno bloqueante.

## Respuesta a los puntos pedidos
1. **¿Fallan de verdad?** Sí: reproducidos los 4 del informe y 4 más (tabla).
2. **Robustez del id de pnpm construido a mano:** el id es sintético (`/app/node_modules/.pnpm/<scope>+<name>@<v>/node_modules/<name>/dist/esm/{index,web}.js`) y no se busca en disco, así que **no se rompe** si cambian la versión (M9), el sufijo de peers de pnpm, la ruta `dist/…` o el entorno (CI clona el repo entero; Docker no ejecuta tests). Lo que comprueba en realidad es que el **scope/nombre** de cada dependencia encaja en la regex `/node_modules/(@capacitor|…)/`, que es justo la condición que falla al añadir un scope nuevo (M2, M5). Podría pasar en vacío solo si Rolldown dejara de usar ids con `/node_modules/<name>/`, cosa que no depende de este test. Resolver la ruta real (`createRequire(apps/mobile/package.json).resolve`) daría ids más fieles (p. ej. `@capacitor/core` sale de `dist/index.js`, no de `dist/esm/`), pero haría el test depender de `node_modules` sin cubrir ningún fallo más contra esta regex. **Con lo que hay basta.**
3. **Guard de imports:** las regex cubren imports con nombre, multilínea, default, side-effect, `export … from` y `export *`, el alias `@/` (el único que hay: `tsconfig` `@/*` y Vite `@`) y las rutas relativas. No hay falsos positivos en el código actual (pasa en verde) y los posibles (texto `from '…'` al principio de línea en un comentario o plantilla) son improbables con Biome. Falsos negativos sin importancia: `require()`, varias sentencias en una línea y subcarpetas de `lib/native-*` (M10). Coste: el fichero tarda ~10 ms en recorrer `src` y ~115 ms en total, sin impacto en la suite.
4. **Redacción:** clara y correcta. La frase de CONTRIBUTING es larga, pero da la regla, el motivo y qué hacer al añadir un plugin (ver aviso).

## Avisos para el humano (no bloquean)
- `native-only.test.ts:31` — el JSDoc de `packageModuleId` pone de ejemplo `/@capacitor+share@8.0.3/…`, que no es la forma real (falta `.pnpm/`, el sufijo `_@capacitor+core@…` y `node_modules/<name>/`), y además «Module id Rolldown gives» da a entender que el id es exacto. Sería más honesto decir «id con la forma de los de pnpm (solo importa el segmento `/node_modules/<name>/`)».
- CONTRIBUTING.md § Web: es una sola frase de ~90 palabras; separar la regla del «si añades…» en dos frases se leería mejor.
- Las dependencias transitivas de los plugins (hoy `@capacitor/synapse`, dentro del scope `@capacitor`) no se recorren; si un plugin futuro tira de un paquete fuera de scope, su chunk se mezclaría y acabaría en `assets/` (se precachearía, que es el lado seguro).

## Cambios requeridos
Ninguno.

## Revisión de los cambios de Gate 2

**Veredicto:** APPROVED

Alcance pedido por el humano: solo los avisos 1 y 2.

- Aviso 1: [x] `apps/web/src/features/pwa/native-only.test.ts:31-34`. El JSDoc de `packageModuleId` ya no trae la ruta de ejemplo errónea ni dice que sea el id que da Rolldown. Ahora lo presenta como id sintético con la forma de pnpm, que no se lee del disco y del que solo importa `/node_modules/<name>/`. Encaja con lo que construye la función (`/app/node_modules/.pnpm/<scope>+<name>@<v>/node_modules/<name>/<file>`). El cuerpo de la función no cambia.
- Aviso 2: [x] `CONTRIBUTING.md:36-37`. La frase larga pasa a dos viñetas: (1) la regla, la excepción `import type` y el motivo (`assets/native/` fuera del precache, `NATIVE_ONLY_MODULES`, la web sin offline); (2) qué hacer al añadir un `lib/native-*.ts` o un plugin y qué test falla. No se pierde nada de la regla, el motivo ni el procedimiento.
- Sin más cambios: `git status` muestra los mismos ficheros que en la revisión anterior. `config.ts` y `feature_list.json` siguen igual que entonces, y el diff de `progress/` es solo la bitácora.
- `pnpm harness --full` lo ha ejecutado el reviewer y está en verde: web 459, api 368, shared 119, mobile y e2e OK.
- Los avisos 3 (dependencias transitivas) y los checkpoints C1–C7 siguen como en la revisión anterior.
