# Implementación: #83 release-v0-3-0

`sdd: false`, sin spec: guía = `acceptance` de #83. Precedente: #78 `release-v0-2-0` (y sus avisos de revisión). Sin commits ni tag.

## Cambios por archivo

- `CHANGELOG.md`: nueva sección `## [0.3.0] - 2026-11-20` encima de `[0.2.0]`; `[Unreleased]` vacío. Fuentes: `git log v0.2.0..main` (merges #74–#81 de GitHub = features #73, #75, #71, #77, #79, #81, #82, #80), `progress/history.md` desde #73 y specs.
  - **Added › Cámara**: «Hacer foto» en foto del vehículo y facturas (también en el alta), en la app (servidor y local) y en la web con pantalla táctil (`useCanCapture` = nativo o `pointer: coarse`) (#73); permiso de cámara y aviso si se deniega (#73); recuperación de la foto si Android mata la app (#81); limpieza de fotos al arrancar (#79).
  - **Changed**: export local por partes y lecturas por rangos, zip idéntico (#75, #80).
  - **Fixed**: AVIF aceptado en API y local, HEIC sigue rechazado (#71); eventos de calendario en local sin enlace a la ficha (#77); diálogos con nombres largos (#82).
  - Fuera: harness, refactors (`base64ToBytes`), tests de import por trozos, docs de prueba en dispositivo.
  - Enlaces: `[Unreleased]` → `compare/v0.3.0...HEAD`; nuevo `[0.3.0]` → `compare/v0.2.0...v0.3.0`.
- `package.json` (raíz), `apps/api`, `apps/web`, `apps/mobile`, `packages/db`, `packages/shared`, `e2e`: `"version": "0.3.0"` (los 7 de `git ls-files`). El lockfile no guarda versiones de workspace.
- `docs/PLAN.md`: fase 8 `✅ Hecha`; «Usos nativos previstos» → «Usos nativos: … (#52), y fotos con la cámara (#73)»; nueva subsección «Después de v0.2.0 (v0.3.0)» con #71–#82 y cierre de la fase (quedan fuera, según las decisiones de la etapa 2 ya escritas, los enlaces públicos en local y el paso servidor → teléfono).
- `README.md`: estado «**v0.3.0**, con app de Android … y fotos con la cámara del móvil»; roadmap de la app móvil marcado `[x]`, sin «siguen pendientes partes de la fase 8».
- `docs/mobile.md` (desactualizado por #77, que ya está integrado):
  - «Qué no está todavía» y «Limitaciones conocidas»: ya no dicen que el evento incluye un enlace que no abre nada (#77); ahora, que en local el evento no lleva el enlace.
  - «Calendario del teléfono»: «enlace a la ficha del vehículo» → «y, con servidor, enlace a la ficha del vehículo».
- `docs/self-hosting.md`: ejemplos `ghcr.io/alvarotloc/ikrive:0.1.0`/`:0.1` → `0.3.0`/`:0.3` y tag de ejemplo `v0.1.0` → `v0.3.0` (el reviewer de #78 lo dejó como opcional; lo subo por el acceptance 5).
- `progress/current.md`: línea en la bitácora.

## Trazabilidad acceptance → verificación

| Acceptance | Dónde |
|---|---|
| A1 CHANGELOG `[0.3.0]` con fecha, Added/Changed/Fixed por tema, `[Unreleased]` vacío | `CHANGELOG.md` l. 7–31 |
| A2 enlaces de comparación con v0.3.0 | `CHANGELOG.md`, final |
| A3 los `package.json` en 0.3.0 | 7 ficheros; `git ls-files \| grep package.json$ \| xargs grep '"version"'` |
| A4 PLAN fase 8 hecha; README app móvil hecha, sin pendientes de la fase 8, estado v0.3.0 | `docs/PLAN.md:46`, `README.md:12`, `README.md:76` |
| A5 sin referencias desactualizadas ni futuros que ya existen | `docs/mobile.md` (#77), `docs/self-hosting.md`, `docs/PLAN.md` «Usos nativos» |
| A6 arnés | ver abajo |

## Referencias revisadas y conservadas

- `README.md:75` y `docs/PLAN.md:45`/`:204` («release v0.1.0»): historia de la fase 7.
- `docs/PLAN.md` etapa 1 (#51: «En este teléfono» como «próximamente» hasta la etapa 2): describe lo que hizo #51, en pasado de plan.
- `docs/mobile.md` «Qué no está todavía» (import y enlaces públicos en local) y «Copia de seguridad» («Todavía no se puede importar en el propio teléfono»): siguen siendo ciertos.
- `docs/mobile.md` usa `vX.Y.Z` genérico. Fixtures de tests con `0.1.0`: datos de prueba.
- Facturas en local «PDF, JPG, PNG o WebP»: correcto, #71 solo afecta a la foto del vehículo.

## Verificación

`pnpm harness --full`: exit 0, «[OK] Arnés en verde». Lint y typecheck OK; tests: shared 190, db 3, api 373, web 715, mobile 31, e2e 6.

## Desviaciones

Ninguna respecto al acceptance. Sin UI que capturar. Tocados `docs/mobile.md` y `docs/self-hosting.md` por el acceptance 5.

## Avisos para el leader

- `allowBackup="true"` sigue en `AndroidManifest.xml` (pendiente de #51).
- Fecha `[0.3.0]`: 2026-11-20; ajústala si el tag sale otro día.
- La subsección nueva de `docs/PLAN.md` es redacción mía a partir de `history.md`; si se prefiere solo el cambio de estado, se puede quitar sin afectar al acceptance.

## Ronda 2

Cambios pedidos en `progress/review_release-v0-3-0.md`:

- **Cambio requerido (`CHANGELOG.md`, Changed):** la segunda frase ya no dice que Android cerraba la app. Ahora dice: «Así, exportar cientos de MB de facturas ya no exige tener el zip ni cada factura enteros en memoria, que en un móvil con poca RAM podía dejar la app sin memoria; el zip es el mismo y se importa igual en un servidor.»
- **Aviso 1 (`CHANGELOG.md`, recuperación de la foto, #81):** añadido «En el alta se pierden las otras facturas pendientes, y la app avisa para volver a añadirlas; en la foto del vehículo, los cambios del formulario sin guardar.» Coincide con `docs/mobile.md` («Si Android cierra la app con la cámara abierta») y con `camera.restoredLostInvoices`.
- **Aviso 2 (`docs/mobile.md`):** el tono ya no presenta como pendiente lo que la fase 8 cerrada deja fuera.
  - «Qué no está todavía: …; mientras, no aparecen» → «Qué no está: …; no aparecen».
  - «Copia de seguridad»: «Todavía no se puede importar» → «No se puede importar».
  - «Limitaciones conocidas»: «todavía faltan el import y los enlaces públicos» → «no hay import ni enlaces públicos».
  - Los «aún»/«mientras» que quedan (permiso de cámara y de notificaciones) no hablan de funciones pendientes; no se tocan.
  - `apps/mobile/test/docs.test.mjs` no comprueba ninguno de esos textos, así que no hace falta cambiarlo.

No se ha tocado nada más.

### Verificación ronda 2

`pnpm harness --full`: exit 0, «[OK] Arnés en verde». Tests: api 373, web 715 y el resto en verde.
