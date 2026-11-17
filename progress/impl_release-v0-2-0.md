# Implementación: #78 release-v0-2-0

`sdd: false`, sin spec: guía = `acceptance` de #78. Precedente: #42 `release-v0-1-0`. Sin commits ni tag.

## Cambios por archivo

- `CHANGELOG.md`: sección `## [0.2.0] - 2026-11-17` encima de `[0.1.0]`; `[Unreleased]` vacío. Fuentes: `git log --merges v0.1.0..main`, `progress/history.md` (#49–#76, #68) y `docs/PLAN.md` § Fase 8.
  - **Added**, con subtítulos `####`: «App de Android» (APK firmada en GitHub Releases con `.sha256`, elegir modo, botón atrás), «Modo "Mi servidor"» (comprobación de `/api/health`, aviso `http:`, token + CORS con `TRUSTED_ORIGINS`, «Cambiar servidor»), «Modo "En este teléfono"» (SQLite, ficheros, export, recordatorios/aviso de km, PDF del informe de venta, qué no aparece) y «Ficheros, calendario y notificaciones en el teléfono» (hoja de compartir/visor, calendario del teléfono, notificaciones de Android y abrir al tocar).
  - **Changed**: chunks solo nativos fuera del precache de la PWA (#60/#64); comprobación de escritura de `DATA_DIR` al arrancar (#57).
  - **Fixed**: caché de la cuenta anterior al iniciar sesión con otra (#63); comillas angulares en `en.json` (#76).
  - Fuera de la lista: CI, Dependabot, fijación de acciones por SHA, filtros de CI de android, harness y refactors internos (#53 data layer, `packages/db`, guard de chunks nativos, `local-missing-file-404` (interno; solo evita un fallo con un fichero perdido)).
  - Enlaces: `[Unreleased]` → `compare/v0.2.0...HEAD`; nuevo `[0.2.0]` → `compare/v0.1.0...v0.2.0`.
- `package.json` (raíz), `apps/api`, `apps/web`, `apps/mobile`, `packages/db`, `packages/shared`, `e2e`: `"version": "0.2.0"` (los 7 `package.json` del monorepo según `git ls-files`).
- `README.md` línea 12: «Estado: **v0.2.0**, con app de Android (docs/mobile.md)…» (antes «v0.1.0, la primera versión estable»).
- `progress/current.md`: línea en la bitácora.

## Referencias a versión revisadas y conservadas

- `docs/PLAN.md:45` y `:204` («Pulido y release v0.1.0»): historia de la fase 7, correcta.
- `README.md:75` (roadmap «Exportar/importar, PWA y release v0.1.0»): historia de la fase 7, correcta.
- `docs/self-hosting.md:50` (`ghcr.io/alvarotloc/ikrive:0.1.0` o `:0.1`) y `:73` (tag de ejemplo `v0.1.0`): ejemplos genéricos introducidos con «por ejemplo», válidos tras la release (la etiqueta 0.1.0 existe). Se pueden subir a 0.2.0 si el humano lo prefiere.
- `docs/mobile.md` usa `vX.Y.Z` (genérico).
- Fixtures de tests (`version: '0.1.0'` en health de `welcome`/`check-server`/`server-screen`, `appVersion` en `data-export.test.ts`, `androidVersion('v0.1.0')`): datos de prueba, sin relación con la versión del paquete.
- `apps/mobile/android/app/build.gradle`: `versionName`/`versionCode` salen del tag en el workflow (`0.0.0-dev` por defecto); nada que tocar.

## Avisos para el leader (fuera de alcance, no tocados)

1. **`docs/mobile.md` está desactualizado respecto a #66 y #68**: en «En este teléfono» dice «Qué no está todavía: exportar e importar los datos y el PDF del informe de venta llegarán en próximas versiones» y «Copia de seguridad: de momento no hay forma de sacar los datos del teléfono … (llegará con el export)»; y en «Limitaciones conocidas», «todavía faltan export/import y el PDF del informe de venta». Contradice el CHANGELOG 0.2.0 (export e informe de venta ya funcionan en local; import sigue sin estar). No es una referencia de versión, así que no lo he cambiado; recomiendo arreglarlo antes del tag.
2. README, roadmap línea 76: «App móvil: … después, modo «En este teléfono» sin servidor» sigue sin marcar y redactado en futuro, aunque el modo local ya está; la fase 8 figura «En curso» en `docs/PLAN.md` (quedan #71, #73, #75, #77), por eso no lo he marcado.
3. `allowBackup="true"` sigue en el `AndroidManifest.xml` (pendiente anotado en #51); no afecta a esta feature.

## Verificación

`pnpm harness --full`: exit 0, «Arnés en verde». Lint y typecheck OK; tests: API 371, web 620, shared 183, db 3, mobile 27 (todos en verde).

## Desviaciones

Ninguna respecto al acceptance. No hay UI que capturar.

## Ronda 2 (CHANGES_REQUESTED de `progress/review_release-v0-2-0.md`)

- `docs/mobile.md`, sección «En este teléfono»: nueva viñeta **Exportar e informe de venta** («Descargar mis datos» genera el mismo zip que el servidor, importable en una instancia; informe de venta en PDF con facturas hasta 25 MB). «Qué no está todavía» queda en import, enlaces públicos del informe y «Añadir al calendario» (#77), sin fechas. «Copia de seguridad»: el zip del export sirve como copia, y para recuperarlo hay que importarlo en un servidor.
- `docs/mobile.md`, «Limitaciones conocidas»: faltan el import, los enlaces públicos y «Añadir al calendario».
- `README.md:12`: «con app de Android conectada a tu servidor o con los datos solo en el teléfono». Roadmap: «App móvil: app de Android con modo «Mi servidor» y modo «En este teléfono» sin servidor (v0.2.0); siguen pendientes partes de la fase 8». La casilla sigue sin marcar.
- `CHANGELOG.md` `[0.2.0]`, para que cuadre con la guía: en modo local se añade «“Añadir al calendario” tampoco está todavía en este modo», y la entrada del calendario del teléfono pasa a «Con «Mi servidor», …».
- `pnpm harness --full`: exit 0, «Arnés en verde» (shared 183, db 3, web 620, API 371, e2e 6).

## Ronda 3

Corrección de la ronda 2 (la instrucción anterior era errónea): «Añadir al calendario» sí aparece en el modo «En este teléfono» (`schedules-section.tsx` renderiza `AddToCalendarMenu` sin condición), incluido «Calendario del teléfono» en la app nativa.

- `docs/mobile.md` «Qué no está todavía»: quitado «Añadir al calendario» de lo que falta; se indica que funciona pero el enlace a la ficha del vehículo del evento no abre nada fuera de la app (#77).
- `docs/mobile.md` «Limitaciones conocidas»: el mismo cambio, redactado como la limitación del enlace (#77).
- `CHANGELOG.md` `[0.2.0]`: quitada la frase «“Añadir al calendario” tampoco está todavía en este modo»; la entrada de «Calendario del teléfono» pasa a «En los dos modos, …» sin la restricción «Con «Mi servidor»».
- Revisados README, `docs/` y CHANGELOG: no queda nada que diga que el calendario no está en modo local (`docs/PLAN.md` ya decía que queda «Añadir al calendario» nativo).
- `pnpm harness --full`: verde (lint, typecheck; tests: shared 183, db 3, web 620, api 371, e2e 6). En la primera ejecución `check-server.test.tsx › reports unreachable when fetch rejects` dio timeout (5 s) por carga; pasó al relanzarlo solo y en la segunda ejecución completa. Esta ronda no toca código.
