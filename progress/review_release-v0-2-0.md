# Review — #78 release-v0-2-0 (ronda 3)

**Veredicto:** APPROVED

`sdd: false`: no hay spec. La guía es el `acceptance` de #78 y el precedente es #42.

## Rondas anteriores (resumen)

- Ronda 1: CHANGES_REQUESTED (A4). `docs/mobile.md` decía que el export y el PDF del informe de venta en modo local «llegarán en próximas versiones», y el README presentaba en futuro el modo «En este teléfono».
- Ronda 2: CHANGES_REQUESTED. Lo de la ronda 1 quedó resuelto, pero entró un error que venía de un aviso mío equivocado: los textos decían que «Añadir al calendario» no estaba en modo local, y sí está.

## Ronda 3: verificación de los cambios pedidos

- `docs/mobile.md` «Qué no está todavía» (l. 51): [x] Ya no dice que «Añadir al calendario» falte. Dice que funciona y que el enlace del evento no abre nada fuera de la app (#77).
- `docs/mobile.md` «Limitaciones conocidas» (l. 75): [x] Está redactado como la limitación del enlace (#77).
- `CHANGELOG.md` `[0.2.0]`: [x] La frase «tampoco está todavía en este modo» ya no aparece. La l. 40 dice «En los dos modos, «Añadir al calendario» ofrece **Calendario del teléfono**…».
- Comprobado en el código:
  - `apps/web/src/features/schedules/schedules-section.tsx:132` pinta `<AddToCalendarMenu>` sin condición de modo.
  - `add-to-calendar.tsx:103` solo distingue con `isNativeApp()`.
- Coherencia: CHANGELOG, `docs/mobile.md` y README coinciden entre sí y con `docs/PLAN.md:239`. Lo que queda pendiente en modo local es el import y los enlaces públicos. Lo que no tiene sentido sin servidor es la cuenta, los usuarios, los canales de notificación y el feed iCal.

## Trazabilidad acceptance ↔ verificación

- A1 (CHANGELOG `[0.2.0]`): [x]
- A2 (enlaces de comparación `[Unreleased]` → `v0.2.0...HEAD` y `[0.2.0]` → `v0.1.0...v0.2.0`): [x]
- A3 (los 7 `package.json` en 0.2.0): [x]
- A4 (docs y README coherentes con la versión): [x]
- A5 (`pnpm harness --full`): [x] Lo he ejecutado yo: EXIT 0, «Arnés en verde».

## Tasks

- No aplica (`sdd: false`).

## Checkpoints

- C1: [x] El arnés está en verde y la rama es `feat/release-v0-2-0`.
- C2: [x] No aplica (sin spec).
- C3: [x] El diff toca solo CHANGELOG, README, `docs/mobile.md`, los 7 `package.json`, `.gitignore` (`*.jks.b64`) y `progress/`.
- C4: [x] No aplica (sin código).
- C5: [x] No aplica (sin código).
- C6: [x] El arnés está en verde.
- C7: [x] `progress/` está al día.

## Ficheros de firma

- `git check-ignore -v`:
  - `ikrive-release.jks` → `.gitignore:19 *.jks`
  - `ikrive-release.jks.b64` → `.gitignore:20 *.jks.b64`
- `git status --ignored` los marca como `!!`.
- `git ls-files | grep jks` sale vacío.
- `git diff --cached` sale vacío.
- No he leído su contenido.

## Hallazgos

- Ninguno.

## Avisos para el humano (no bloquean)

- `docs/self-hosting.md:50` y `:73` siguen con ejemplos `0.1.0`/`v0.1.0`. Son válidos y subirlos es opcional.
- `allowBackup="true"` sigue en `AndroidManifest.xml` (pendiente de #51).
- Antes del tag, configura los cuatro secretos `ANDROID_*`.
- Fecha de `[0.2.0]`: 2026-11-17. Ajústala si el tag sale otro día.

## Cambios requeridos

- Ninguno.
