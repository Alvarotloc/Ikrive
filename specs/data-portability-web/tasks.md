# Tasks — data-portability-web

- [ ] T1 — `apps/web/src/features/data-portability/import.ts`: `IMPORT_ACCEPT` e `importErrorKey(error)` (400/409/413/415 → claves `dataPortability.errors.*`, resto y no-`ApiError` → `common.error`). Cubre: R2, R10.
- [ ] T2 — Test unitario `maps each import error status to its message` en `apps/web/src/features/data-portability/import.test.ts` (los cuatro estados, un 500 y un `Error` cualquiera). Cubre: R10.
- [ ] T3 — `apps/web/src/features/data-portability/queries.ts`: `EXPORT_URL` y `useImportData()` (`api.post<DataImportSummary>('/me/import', formData)` con el fichero en `file`; `onSuccess` invalida `queryKeys.vehicles.all` y `queryKeys.notificationChannels.all`). Cubre: R5, R9.
- [ ] T4 — Textos del namespace `dataPortability` en `apps/web/src/i18n/locales/es.json` y `en.json` (incluido el plural `skippedChannels`). Cubre: R11.
- [ ] T5 — `apps/web/src/features/data-portability/data-section.tsx` (`DataPortabilitySection`: enlace de export, input oculto + botón, `AlertDialog` controlado, estado `Importando…`, resumen, aviso de canales omitidos y toasts) y montarla al final de `apps/web/src/routes/_app/settings.tsx`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R10.
- [ ] T6 — Tests de componente en `apps/web/src/features/data-portability/data-section.test.tsx` con `renderWithProviders` + `mockApi` + `<Toaster />`:
  - `links to the export download` (enlace «Descargar mis datos» con `href="/api/me/export"` y `download`). Cubre: R1.
  - `accepts a single zip file` (input con `accept` de zip y sin `multiple`). Cubre: R2.
  - `asks for confirmation and sends nothing when cancelled` (`user.upload`, el `alertdialog` nombra el fichero y explica que añade sin borrar y lo de moneda/unidades; «Cancelar» → ninguna llamada a `POST /me/import`). Cubre: R3, R4.
  - `imports the zip and shows the summary` (confirmar → una petición multipart con el fichero en `file`; mientras la respuesta está retenida, botón deshabilitado con «Importando…»; luego toast de éxito y los 8 contadores del resumen). Cubre: R5, R6, R7.
  - `warns about skipped notification channels` (`skipped.notificationChannels: 2` → aviso con el número; con 0 no aparece). Cubre: R8.
  - `invalidates the vehicle and channel queries after importing` (`queryClient.invalidateQueries` espiado, o queries sembradas que pasan a `isInvalidated`). Cubre: R9.
  - `shows a rejected import in a toast` (409 con problem → toast con el mensaje traducido y el `detail`; sin resumen ni invalidación). Cubre: R10.
- [ ] T7 — Test `shows the data section` en `apps/web/src/features/settings/settings-page.test.tsx` (la página de Ajustes muestra «Tus datos» y el enlace de export). Cubre: R1.
- [ ] T8 — Revisión visual (claro, oscuro y móvil) de la sección con un resumen y el aviso de canales omitidos; rutas de las capturas en `progress/impl_data-portability-web.md`. Cubre: R7, R8.
- [ ] T9 — Ejecutar `pnpm harness --full` (incluye `es and en define the same keys` de `i18n/locales.test.ts`) y documentar trazabilidad en `progress/impl_data-portability-web.md`. Cubre: R11.
