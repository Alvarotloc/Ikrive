# Implementación: #59 native-open-pdf-label (`sdd: false`)

## Cambios por archivo

- `apps/web/src/features/maintenance/maintenance-attachments.tsx`: el aria-label del botón/enlace que abre un PDF adjunto usa `maintenance.attachments.openPdfNative` cuando `isNativeApp()` y `maintenance.attachments.openPdf` («en una pestaña nueva») en la web. Import de `isNativeApp` desde `@/lib/platform`.
- `apps/web/src/i18n/locales/es.json`: nueva clave `maintenance.attachments.openPdfNative` = «Abrir «{{name}}» con el visor del sistema».
- `apps/web/src/i18n/locales/en.json`: nueva clave `maintenance.attachments.openPdfNative` = "Open “{{name}}” with the system viewer".
- `apps/web/src/features/maintenance/maintenance-attachments.test.tsx`: los tests nativos (`native: opens a PDF with the system viewer`, `native: shows an error toast when opening fails`) localizan el botón por la nueva etiqueta; el primero comprueba además que no hay ningún botón con «pestaña nueva». Los tests web existentes siguen cubriendo «en una pestaña nueva» (modo cookie como enlace y modo servidor como botón).

## Trazabilidad (acceptance → test)

| Acceptance | Test |
|---|---|
| App: aria-label con visor del sistema | `maintenance-attachments.test.tsx` › `in the native app` › `native: opens a PDF with the system viewer` (y `native: shows an error toast when opening fails`) |
| Web: sigue «en una pestaña nueva» | `maintenance-attachments.test.tsx` › `lists images with their thumbnail and PDFs with an icon, all linking to the original`; `server mode: opens a PDF with the token in a new tab` |
| Textos en es.json y en.json | `openPdfNative` en ambos locales |
| harness --full en verde | ver abajo |

## Otros sitios con «pestaña nueva»

Revisado: `openPdf` es la única etiqueta i18n que menciona una pestaña nueva. Los otros `target="_blank"` son los enlaces de Google/Outlook Calendar en `features/schedules/add-to-calendar.tsx` (URLs externas, no ficheros; su texto no menciona pestañas) y el `<a>` interno de `lib/download.ts` (sin etiqueta visible; en la app se desvía a `native-files`). No hay más casos iguales que corregir.

## `pnpm harness --full`

```
[OK]    pnpm lint
[OK]    pnpm typecheck
apps/web test:  Test Files  68 passed (68) · Tests 450 passed (450)
apps/api test:  Test Files  38 passed (38) · Tests 368 passed (368)
packages/shared test: Test Files 18 passed (18) · Tests 119 passed (119)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones

Ninguna. Sin cambios de UI visibles (solo aria-label), así que no hay capturas.
