# Review — #83 release-v0-3-0

**Veredicto:** CHANGES_REQUESTED

`sdd: false`: no hay spec. La guía es el `acceptance` de #83. El precedente es #78 (`progress/review_release-v0-2-0.md`).

## Trazabilidad acceptance ↔ verificación

- A1 (CHANGELOG `[0.3.0]` con fecha, Added/Changed/Fixed por tema, `[Unreleased]` vacío): [ ] La estructura es correcta, pero una afirmación del apartado Changed no se sostiene. Ver hallazgo 1.
- A2 (enlaces de comparación): [x] `[Unreleased]` apunta a `v0.3.0...HEAD` y `[0.3.0]` a `v0.2.0...v0.3.0`.
- A3 (todos los `package.json` en 0.3.0): [x] Los 7 de `git ls-files | grep package.json$` están en `0.3.0`.
- A4 (PLAN fase 8 hecha; README con la app móvil hecha, sin pendientes de la fase 8 y estado v0.3.0): [x] `docs/PLAN.md:46`, `README.md:12` y `README.md:76`.
- A5 (sin referencias de versión desactualizadas ni futuros que ya existen): [x]
  - `docs/mobile.md` ya no presenta el enlace de #77 como limitación pendiente.
  - `docs/self-hosting.md` está en 0.3.0.
  - PLAN «Usos nativos» ya no está en futuro.
- A6 (`pnpm harness --full`): [x] Lo he ejecutado yo: EXIT 0, «[OK] Arnés en verde».

## Comprobación del CHANGELOG [0.3.0] y de docs/mobile.md contra el código e history.md

- Commits incluidos: `git log --merges v0.2.0..main` trae exactamente los PR #74–#81 de GitHub, que son las features #73, #75, #71, #77, #79, #81, #82 y #80. #74 y #76 (internas) ya estaban en v0.2.0.
- «Hacer foto» en la foto del vehículo y en las facturas, también en el alta del mantenimiento: [x]
  - `PhotoPicker` solo se usa en `routes/_app/vehicles/$vehicleId/edit.tsx`; `new.tsx` no tiene foto.
  - El texto dice «en su alta» refiriéndose al mantenimiento, y `docs/mobile.md` dice «(al editarlo)». Las dos cosas son correctas.
- Web con `pointer: coarse` («desde un móvil o tableta») y permiso con aviso de ajustes: [x]
  - `camera.denied` existe en `es.json:130` y en `en.json`.
- Recuperación tras la muerte del proceso (#81): [x]
  - Hay tres destinos.
  - El toast «No se ha podido recuperar la foto de la cámara» coincide con `es.json:131`; el texto completo sigue con «Vuelve a hacerla.».
  - Según history.md, la causa (iAware/LowMemQuick en HONOR) se observó de verdad en #79.
- Limpieza al arrancar (#79): [x] Conserva las fotos mientras la app está abierta.
- AVIF (#71): [x] «antes se rechazaban aunque el aviso de formatos las incluía» es cierto.
  - En v0.2.0, `apps/api/src/lib/images.ts:14` y `apps/web/src/lib/data-source/local/vehicles.ts:76` ya decían «(JPEG, PNG, WebP, AVIF, GIF or TIFF)», pero `PhotoFormat` y `detectPhotoFormat` no tenían AVIF y `sharp` lo informa como `heif`.
  - HEIC sigue rechazándose.
- Calendario en local (#77): [x] `add-to-calendar.tsx` pasa `baseUrl: null` en modo local, y eso afecta a Google, Outlook y al calendario del teléfono.
- Diálogos (#82): [x]
- Export local (#75, #80): [ ] Ver hallazgo 1.
- `docs/mobile.md`: [x] Las secciones «Cámara», «Si Android cierra la app con la cámara abierta», «Calendario del teléfono» («con servidor, enlace…») y «Limitaciones conocidas» coinciden con el código y con history.md. No queda nada presentado como futuro que ya exista.

## Tasks

- No aplica (`sdd: false`).

## Checkpoints

- C1: [x] El arnés está en verde, la única feature activa es #83 y la rama es `feat/release-v0-3-0`.
- C2: [x] No aplica (sin spec).
- C3: [x] El diff toca solo CHANGELOG, README, `docs/{PLAN,mobile,self-hosting}.md`, los 7 `package.json` y `progress/`. Lo de `main...HEAD` es solo el alta de #83 en `feature_list.json`.
- C4: [x] No aplica (sin código).
- C5: [x] No aplica (sin código).
- C6: [x] `pnpm harness --full` en verde. No hay UI, así que no hacen falta capturas.
- C7: [x] `progress/impl_release-v0-3-0.md` y `progress/current.md` están al día, y `docs/PLAN.md` refleja el cierre de la fase.

## Hallazgos

1. `CHANGELOG.md:24` (A1 y fidelidad del CHANGELOG): la frase «Exportar cientos de MB de facturas ya no hace crecer la memoria de la app hasta que Android la cierra» da por hecho que antes de #75 Android cerraba la app al exportar. No hay constancia de que pasara nunca:
   - La descripción de #75 en `feature_list.json` dice «el WebView **puede** quedarse sin memoria».
   - `specs/mobile-local-export-streaming/requirements.md:3` habla del «riesgo de memoria» de #66.
   - `progress/review_mobile-local-export.md:49` lo trata como «riesgo de memoria ya aceptado».
   - `design.md:122` de #75 dice que el OOM real «no se prueba».
   - En history.md, la única prueba en dispositivo con cientos de MB es la de #75, ya con el arreglo, y el export funcionó. #80 también habla de que «**podría** quedarse sin memoria».

   Además, el pico que midieron #75 y #80 es el del renderer del WebView (~1,07 GB → 284 MB), no el de «la app».

   Consecuencia: el CHANGELOG atribuye a v0.2.0 un fallo que nunca se observó.

## Avisos para el humano (no bloquean)

- `CHANGELOG.md:19` (recuperación de la foto, #81) no dice lo que se pierde en dos casos:
  - En el alta de un mantenimiento, las otras facturas pendientes (`camera.restoredLostInvoices`).
  - En la foto del vehículo, los cambios del formulario sin guardar.

  `docs/mobile.md` sí lo explica. Se podría añadir media frase.
- `docs/mobile.md:51` y `:82` siguen diciendo «todavía» o «todavía faltan» el import y los enlaces públicos en local. En cambio, `docs/PLAN.md` (subsección nueva) da la fase 8 por cerrada y deja eso fuera según las decisiones de la etapa 2. No incumple A5 (no es algo que ya exista), pero el tono de «pendiente» choca con «fase cerrada». Valora si quieres «no está» en vez de «todavía».
- `allowBackup="true"` sigue en `AndroidManifest.xml` (decisión de #78).
- Fecha de `[0.3.0]`: 2026-11-20. Ajústala si el tag sale otro día.

## Cambios requeridos

1. `CHANGELOG.md:24`: reescribir la segunda frase sin afirmar que Android cerraba la app. Debe contar el riesgo real y la mejora medida. Por ejemplo: «Así, exportar cientos de MB de facturas ya no exige tener el zip ni cada factura enteros en memoria, que en un móvil con poca RAM podía dejar la app sin memoria; el zip es el mismo y se importa igual en un servidor.»

---

# Ronda 2

**Veredicto:** APPROVED

## Cambio requerido de la ronda 1

1. `CHANGELOG.md` (Changed): [x] Resuelto. La frase ya no dice que Android cerraba la app. Ahora habla del riesgo («en un móvil con poca RAM podía dejar la app sin memoria») y de la mejora real (el zip y cada factura ya no se cargan enteros en memoria). Encaja con #75 y #80, con `specs/mobile-local-export-streaming/requirements.md` y con history.md.

## Textos nuevos comparados con el código

- `CHANGELOG.md`, recuperación de la foto (#81): [x] «En el alta se pierden las otras facturas pendientes, y la app avisa para volver a añadirlas; en la foto del vehículo, los cambios del formulario sin guardar.» Coincide con `camera.restoredLostInvoices` (`apps/web/src/i18n/locales/es.json:132` y `en.json:132`) y con `docs/mobile.md:65` y `:67`.
- `docs/mobile.md:51`, `:53` y `:82`: [x] Ya no dicen «todavía» ni «mientras» sobre el import y los enlaces públicos en local. Lo que queda es cierto: el import y los enlaces públicos no existen en local, y el evento del calendario no lleva el enlace (`baseUrl: null`). Los «aún» y «mientras» que siguen (`:49`, `:63`, `:77`, `:78`) hablan del permiso o del funcionamiento, no de funciones pendientes.

## Acceptance (repaso completo)

- A1: [x] `[0.3.0] - 2026-11-20` tiene Added (Cámara), Changed y Fixed, y `[Unreleased]` está vacío.
- A2: [x] `[Unreleased]` apunta a `v0.3.0...HEAD` y `[0.3.0]` a `v0.2.0...v0.3.0`.
- A3: [x] Los 7 `package.json` de `git ls-files` están en `"version": "0.3.0"`.
- A4: [x] La fase 8 está marcada como hecha en `docs/PLAN.md`. `README.md:12` dice v0.3.0 y `README.md:76` marca la app móvil con `[x]` y sin pendientes.
- A5: [x] `docs/mobile.md`, `docs/self-hosting.md` (`v0.3.0`) y `PLAN` no tienen referencias desactualizadas ni presentan en futuro cosas que ya existen.
- A6: [x] He ejecutado `pnpm harness --full`: EXIT 0, «[OK] Arnés en verde».

## Alcance

- El diff de trabajo es el mismo que en la ronda 1 más los tres retoques de texto. Sigue tocando solo CHANGELOG, README, `docs/{PLAN,mobile,self-hosting}.md`, los 7 `package.json` y `progress/`. `main...HEAD` sigue siendo solo el alta de #83 en `feature_list.json`.

## Checkpoints

- C1: [x]
- C2: [x] No aplica (sin spec).
- C3: [x]
- C4: [x] No aplica (sin código).
- C5: [x] No aplica (sin código).
- C6: [x] El arnés está en verde y no hay UI.
- C7: [x]

## Avisos para el humano (no bloquean)

- Test inestable: según el leader, `pnpm harness --full` falló una vez y pasó en las tres ejecuciones siguientes sin cambios. Mi única ejecución de esta ronda pasó, así que no he podido identificar qué test falla. Esta feature no toca código, así que la inestabilidad no viene de ella. Conviene apuntar en `progress/current.md` qué test era la próxima vez que falle.
- Siguen vigentes los avisos de la ronda 1: `allowBackup="true"` y la fecha de `[0.3.0]` (2026-11-20), que hay que ajustar si el tag sale otro día.

## Cambios requeridos

Ninguno.
