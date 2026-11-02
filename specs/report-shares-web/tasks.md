# Tasks — report-shares-web

- [x] T1 — `apps/api/src/lib/base-url.ts` con `isLocalHost` e `isLocalBaseUrl` (design › Cambio en la API). Cubre: R1, R2.
- [x] T2 — Tests en `apps/api/test/base-url.test.ts`:
  - `treats loopback, private and link-local hosts as local` (`localhost`, `app.localhost`, `0.0.0.0`, `127.0.0.1`, `10.1.2.3`, `172.16.0.1`, `172.31.255.255`, `192.168.1.10`, `169.254.1.1`, `[::1]`, `[fd12::1]`, `[fe80::1]`, `[::ffff:192.168.1.10]`, `100.64.0.1`, `100.127.255.255`, `nas.local`, `ikrive.lan`, `router.home.arpa`, `app.internal`, `nas`, mayúsculas `LOCALHOST`).
  - `treats public domains and addresses as not local` (`ikrive.example.com`, `8.8.8.8`, `172.32.0.1`, `192.169.0.1`, `[2001:db8::1]`, `localhost.example.com`, `100.63.255.255`, `100.128.0.1`, `ikrive.tail1234.ts.net`, `example.local.com`).
  - `classifies a full BASE_URL by its host` (`isLocalBaseUrl('http://192.168.1.10:3000')` → `true`, `'https://ikrive.example.com'` → `false`).

  Cubre: R1, R2.
- [x] T3 — `clientConfigSchema` gana `localBaseUrl` (`packages/shared/src/schemas/common.ts`); `clientConfigRoutes` lo recibe y lo devuelve; `apps/api/src/app.ts` pasa `isLocalBaseUrl(config.BASE_URL)`. Si algún mock tipado de `ClientConfig` en la web deja de compilar, añadirle `localBaseUrl: false`. Cubre: R1, R2.
- [x] T4 — Tests en `apps/api/test/client-config.test.ts`: el existente pasa a `returns the upload limit and flags a local BASE_URL` (`{ maxUploadMb: 7, localBaseUrl: true }` con el `BASE_URL` de `createTestApp`); nuevo `does not flag a public BASE_URL` (`BASE_URL: 'https://ikrive.example.com'` → `localBaseUrl: false`). Cubre: R1, R2.
- [x] T5 — Extraer `FeedUrl` a `apps/web/src/components/copy-url-field.tsx` (`CopyUrlField`), usarlo en `calendar-feed-section.tsx` y mover `calendarFeed.copy` a `common.copy`; `apps/web/src/features/calendar-feed/calendar-feed-section.test.tsx` sigue en verde sin cambios de aserciones. Cubre: R5, R7.
- [x] T6 — `queryKeys.vehicles.reportShares` en `apps/web/src/lib/query-keys.ts` y `reportSharesQuery`, `useCreateReportShare`, `useRevokeReportShare` en `apps/web/src/features/reports/queries.ts`, invalidando `reportShares(vehicleId)` en el `onSuccess` de ambas mutaciones. Cubre: R4, R13, R19, R21.
- [x] T7 — `apps/web/src/features/reports/report-shares-section.tsx` (`ReportSharesSection`: ayuda, aviso local, selector + crear con carga y toast de error, `CopyUrlField` con su aviso, listado con estados vacío/carga/error, revocar con `AlertDialog`) y montarlo en `sale-report-dialog.tsx` debajo de la descarga, pasándole las opciones actuales. Cubre: R3, R4, R5, R6, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20.
- [x] T8 — Namespace `reportShares.*` (y `common.copy`) en `apps/web/src/i18n/locales/es.json` y `en.json`; el test `es and en define the same keys` de `apps/web/src/i18n/locales.test.ts` sigue en verde. Actualizar `setup` de `apps/web/src/features/reports/sale-report-dialog.test.tsx` para declarar `GET /config` y `GET /vehicles/v1/report-shares` (lista vacía); sus tests siguen en verde. Cubre: R22.
- [x] T9 — Tests de creación en `apps/web/src/features/reports/report-shares-section.test.tsx` (renderiza `<Toaster />` + `SaleReportDialog`):
  - `offers a 30-day link by default with 7 and 90 days`: selector con las tres opciones y 30 seleccionada; botón «Crear enlace»; texto de accesibilidad desde internet visible.
  - `creates a link with the checked options and lets the user copy it`: marcar Ocultar precios e Incluir facturas, elegir 7 días y «Crear enlace» → un `POST /vehicles/v1/report-shares` con cuerpo `{ hidePrices: true, hidePlate: false, hideVin: false, includeInvoices: true, expiresInDays: 7 }`; aparece la URL de la respuesta en un campo de solo lectura y el aviso de que no se podrá volver a ver; «Copiar» llama a `navigator.clipboard.writeText(url)` y muestra el toast «Enlace copiado».
  - `disables the create button while the link is being created`: con el POST retenido, botón deshabilitado con «Creando…».
  - `shows an error toast when creating the link fails`: POST 500 → toast `reportShares.createError`, diálogo abierto y sin campo de URL.

  Cubre: R3, R4, R5, R6, R7, R8, R9, R10.
- [x] T10 — Tests del aviso local en `report-shares-section.test.tsx`:
  - `warns that a local BASE_URL is not reachable from outside`: `GET /config` → `{ maxUploadMb: 1, localBaseUrl: true }` → aviso visible.
  - `does not warn with a public BASE_URL`: `localBaseUrl: false` → sin aviso.

  Cubre: R11, R12.
- [x] T11 — Tests del listado en `report-shares-section.test.tsx`:
  - `lists the links with their options, expiry and status`: tres enlaces (`active`, `expired`, `revoked`) → cada fila muestra su estado («Activo», «Caducado», «Revocado»), su fecha de caducidad formateada y sus opciones («Sin precios», «Con facturas», «Informe completo»); solo la activa tiene «Revocar».
  - `shows an empty state without links` (lista vacía).
  - `shows an error when the links cannot be loaded`: GET 500 → mensaje `reportShares.loadError`; «Descargar» y «Crear enlace» siguen habilitados.
  - `refreshes the list after creating a link`: el segundo `GET /vehicles/v1/report-shares` devuelve el enlace nuevo y aparece en la lista (dos llamadas al GET).

  Cubre: R13, R14, R15, R16, R17, R21.
- [x] T12 — Tests de revocación en `report-shares-section.test.tsx`:
  - `revokes an active link after confirming`: «Revocar» abre un `alertdialog`; «Cancelar» lo cierra sin `DELETE`; al confirmar → un `DELETE /vehicles/v1/report-shares/s1`, se vuelve a pedir el listado y la fila pasa a «Revocado».
  - `shows an error toast when revoking fails`: DELETE 500 → toast `reportShares.revokeError`.

  Cubre: R16, R18, R19, R20, R21.
- [x] T13 — Revisión visual con `pnpm dev` y playwright-core: diálogo con aviso local, URL creada y listado con los tres estados, en claro, oscuro y móvil. Rutas de las capturas en `progress/impl_report-shares-web.md`. Cubre: R3, R5, R11, R13.
- [x] T14 — `docs/PLAN.md`: fase 6 → «✅ Hecha» en la tabla de estado. Cubre: — (acceptance «docs/PLAN.md marca la fase 6 como hecha»).
- [x] T15 — Ejecutar `pnpm harness --full` y documentar trazabilidad en `progress/impl_report-shares-web.md`. Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R21, R22.
