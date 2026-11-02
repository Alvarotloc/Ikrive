# Implementación — report-shares-web (#33)

Estado: **done**. T1–T15 marcadas en `specs/report-shares-web/tasks.md`. Sin commits ni cambios de rama.

## Cambios por archivo

### API / shared
- `apps/api/src/lib/base-url.ts` (nuevo): `isLocalHost(hostname)` e `isLocalBaseUrl(baseUrl)`. Quita los corchetes de IPv6, pasa a minúsculas y quita el punto final. Clasifica IPv4 (`0.0.0.0/32`, `127/8`, `10/8`, `172.16/12`, `192.168/16`, `100.64/10`, `169.254/16`) e IPv6 (`::1`, `fc00::/7`, `fe80::/10`, y las IPv4 mapeadas tanto en forma punteada como en la hex que serializa `new URL`: `[::ffff:c0a8:10a]`). Para los nombres: los de una sola etiqueta y los sufijos `localhost`, `local`, `lan`, `home.arpa` e `internal`, comparados por etiqueta completa. Sin DNS.
- `packages/shared/src/schemas/common.ts`: `clientConfigSchema` gana `localBaseUrl: z.boolean()`.
- `apps/api/src/modules/client-config/routes.ts`: opciones `{ maxUploadMb, localBaseUrl }`; responde las dos.
- `apps/api/src/app.ts`: registra `clientConfigRoutes` con `localBaseUrl: isLocalBaseUrl(config.BASE_URL)` (se calcula una vez, al construir la app).
- `apps/api/test/base-url.test.ts` (nuevo) y `apps/api/test/client-config.test.ts` (el test existente se renombra y se añade el caso con BASE_URL público).

### Web
- `apps/web/src/components/copy-url-field.tsx` (nuevo): `CopyUrlField({ url, label, hint, copiedMessage })`, extraído de `FeedUrl`.
- `apps/web/src/features/calendar-feed/calendar-feed-section.tsx`: usa `CopyUrlField`; se borran `FeedUrl` y los imports que ya no hacen falta.
- `apps/web/src/lib/query-keys.ts`: `vehicles.reportShares(id)`.
- `apps/web/src/features/reports/queries.ts`: `reportSharesQuery`, `useCreateReportShare` y `useRevokeReportShare`. Las dos mutaciones invalidan `reportShares(vehicleId)` en su `onSuccess`.
- `apps/web/src/features/reports/report-shares-section.tsx` (nuevo): `ReportSharesSection` con:
  - cabecera `h3` y texto de ayuda (R10);
  - el `Warning` si `localBaseUrl` (R11);
  - `Select` de 7, 30 o 90 días, con 30 por defecto, y el botón «Crear enlace» con su estado de carga y el toast de error;
  - `CopyUrlField`;
  - el listado `ShareList` con sus estados de carga, error y vacío;
  - las filas `ShareRow`, con el `Badge` de estado, «Caduca el …» y las opciones como `stamp`;
  - `RevokeDialog`, un `AlertDialog` que solo aparece en las filas activas.
- `apps/web/src/features/reports/warning.tsx` (nuevo): el `Warning` que antes estaba dentro de `sale-report-dialog.tsx` (ver desviaciones).
- `apps/web/src/features/reports/sale-report-dialog.tsx`: dentro del `<form>` el orden es: opciones y avisos, `<hr />`, `ReportSharesSection` (recibe `options`) y, al final, el `DialogFooter` («Cancelar» / «Descargar») con `border-t pt-5`. Importa `Warning` desde `./warning`.
- `apps/web/src/i18n/locales/{es,en}.json`: namespace `reportShares.*` (`days` con plural `_one`/`_other`). `calendarFeed.copy` pasa a `common.copy`.
- `apps/web/src/features/reports/report-shares-section.test.tsx` (nuevo): 12 tests.
- `apps/web/src/features/reports/sale-report-dialog.test.tsx`: `setup` declara `GET /config` y `GET /vehicles/v1/report-shares` (`[]`). El test de foco no cambia: «Descargar» sigue siendo el último elemento enfocable (espera antes a que cargue el listado vacío).

### Docs
- `docs/PLAN.md`: fase 6 pasa a «✅ Hecha».

## Trazabilidad

| R | Test |
|---|---|
| R1 | `apps/api/test/base-url.test.ts` › treats loopback, private and link-local hosts as local; › classifies a full BASE_URL by its host · `apps/api/test/client-config.test.ts` › returns the upload limit and flags a local BASE_URL |
| R2 | `base-url.test.ts` › treats public domains and addresses as not local; › classifies a full BASE_URL by its host · `client-config.test.ts` › does not flag a public BASE_URL |
| R3 | `report-shares-section.test.tsx` › offers a 30-day link by default with 7 and 90 days |
| R4 | › creates a link with the checked options and lets the user copy it |
| R5 | › creates a link with the checked options and lets the user copy it (campo `readonly` con la URL y botón «Copiar») |
| R6 | › creates a link with the checked options… (`toHaveAccessibleDescription` con el aviso) |
| R7 | › creates a link with the checked options… (`writeText(url)` + toast «Enlace copiado») · `calendar-feed-section.test.tsx` (sin cambios, en verde) |
| R8 | › disables the create button while the link is being created |
| R9 | › shows an error toast when creating the link fails |
| R10 | › offers a 30-day link by default…; › does not warn with a public BASE_URL |
| R11 | › warns that a local BASE_URL is not reachable from outside |
| R12 | › does not warn with a public BASE_URL |
| R13 | › lists the links with their options, expiry and status |
| R14 | › shows an empty state without links |
| R15 | › shows an error when the links cannot be loaded |
| R16 | › lists the links with their options, expiry and status; › revokes an active link after confirming |
| R17 | › lists the links with their options, expiry and status (sin «Revocar» en las filas caducada y revocada) |
| R18 | › revokes an active link after confirming («Cancelar» no hace `DELETE`) |
| R19 | › revokes an active link after confirming (un `DELETE …/s1`) |
| R20 | › shows an error toast when revoking fails |
| R21 | › refreshes the list after creating a link; › revokes an active link after confirming (2 `GET` y la fila pasa a «Revocado») |
| R22 | `apps/web/src/i18n/locales.test.ts` › es and en define the same keys |

Comprobación extra: si se quita la invalidación de las mutaciones, fallan los tests de R21. Se restauró después.

## Revisión visual (T13)

Montaje aislado, sin tocar el `pnpm dev` del humano. La SPA se compiló con `vite build` en el scratchpad y la API la sirvió (`WEB_DIST_DIR`) en `127.0.0.1:3419`, con `BASE_URL=http://127.0.0.1:3419` (local, así que sale el aviso) y `DATA_DIR` también en el scratchpad. Datos sembrados por la API: un vehículo y tres enlaces, de los que uno se revocó por la API. Otro se marcó como caducado editando `expires_at` en la BD del scratchpad, porque la API no permite caducidades en el pasado. Las capturas se hicieron con playwright-core contra `/usr/bin/google-chrome` en `es-ES`. En cada variante se abre el diálogo, se marca «Ocultar precios», se pulsa «Crear enlace» y luego «Copiar» (el portapapeles queda con la URL y sale el toast), y se abre la confirmación de «Revocar» y se cancela. El listado crece con cada enlace creado, lo que confirma la invalidación en real. La API ya está parada.

Directorio: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/f13fd9e6-1e37-403f-b29d-03ee4489c08b/scratchpad/shots/`

| Variante | Listado | URL creada | Final del listado | Confirmar revocación |
|---|---|---|---|---|
| Claro 1280 | `light-1280-list.png` | `light-1280-created.png` | `light-1280-bottom.png` | `light-1280-revoke.png` |
| Oscuro 1280 | `dark-1280-list.png` | `dark-1280-created.png` | `dark-1280-bottom.png` | `dark-1280-revoke.png` |
| Móvil 375 claro | `mobile-375-light-list.png` | `mobile-375-light-created.png` | `mobile-375-light-bottom.png` | `mobile-375-light-revoke.png` |
| Móvil 375 oscuro | `mobile-375-dark-list.png` | `mobile-375-dark-created.png` | `mobile-375-dark-bottom.png` | `mobile-375-dark-revoke.png` |

Retoque tras la primera tanda de capturas: con una sola fila `flex-wrap`, «Revocar» caía a una línea propia y las filas quedaban irregulares. Ahora la fila tiene dos columnas: a la izquierda el estado y la fecha con las opciones debajo (las dos partes con `flex-wrap`), y a la derecha «Revocar» (`shrink-0`). A 375 px se ve bien.

## `pnpm harness --full`

```
[OK]    33 features: 32 done, 0 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #33 report-shares-web (in_progress)
[OK]    Rama actual: feat/report-shares-web
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Tests 105 passed (105)
apps/web         Tests 289 passed (289)   (+12 nuevos)
apps/api         Tests 238 passed (238)   (+4 nuevos)
[OK]    pnpm test
[OK]    Arnés en verde.
```

Nota: dos ejecuciones anteriores fallaron por `Test timed out in 5000ms` y `Failed to start forks worker`, con la máquina a un load average de 200–265 en 28 núcleos. Eran errores de arranque y de tiempo, no aserciones. Por separado, `apps/web` (289/289) y `apps/api` (238/238) pasaban. Con la carga ya baja (unos 19), la ejecución completa sale en verde sin tocar nada.

## Desviaciones del spec

1. **`apps/web/src/features/reports/warning.tsx` (archivo nuevo, no listado en el design).** El design pide reutilizar «el `Warning` existente del diálogo» en `ReportSharesSection`. Era una función local de `sale-report-dialog.tsx`, y exportarla desde ahí habría creado un import circular (el diálogo importa la sección y la sección importaría el diálogo). Se ha movido tal cual a su propio archivo y lo importan los dos. El componente no cambia.
2. *(Retirada tras el cambio de Gate 2: el test de foco vuelve a usar «Descargar» como último elemento.)*
3. **`type="button"` en el botón «Copiar» de `CopyUrlField`.** El design habla de «mismo DOM» que `FeedUrl`, pero dentro del `<form>` del informe un botón sin `type` haría submit y descargaría el PDF. Para el feed iCal el único cambio es ese atributo, y su test sigue en verde sin cambios.
4. **`GET /settings` en `report-shares-section.test.tsx`.** `format.dateTime` usa `useFormat`, que pide los ajustes del usuario. Para que los tests del diálogo con el listado vacío no necesiten esa petición, `useFormat` se llama en `ShareRow` y no en la sección. Solo los tests de la sección declaran `GET /settings`.
5. **i18n:** `days` se define como plural i18next (`days_one`/`days_other`), que es la forma de expresar «`days` con `{{count}}`». Las claves coinciden en es y en.

## Cambio pedido en Gate 2 (2026-11-02)

Petición del humano: el `DialogFooter` («Descargar» / «Cancelar») quedaba a media altura del diálogo, con los enlaces debajo.

- `sale-report-dialog.tsx`: el `DialogFooter` pasa al final del `<form>`, después de `ReportSharesSection`. El `<hr />` sigue entre las opciones y la sección. El footer lleva `border-t pt-5` para separarse del listado. «Descargar» sigue siendo el `type="submit"` del formulario.
- `specs/report-shares-web/design.md` › UI › Ubicación: actualizado con el nuevo orden.
- `sale-report-dialog.test.tsx`: el test del focus trap vuelve a su forma original (Tab desde «Descargar», ahora de nuevo el último elemento, va a la primera casilla). Se mantiene la espera al listado vacío para que el orden de foco sea el definitivo.
- Tests: `reports` + `calendar-feed`, 30/30 en verde.
- Capturas nuevas en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/f13fd9e6-1e37-403f-b29d-03ee4489c08b/scratchpad/shots-gate2/`. Son los mismos 16 archivos de la tabla anterior (`{light-1280,dark-1280,mobile-375-light,mobile-375-dark}-{list,created,bottom,revoke}.png`). En `*-bottom.png` se ve el footer al final, tras el listado. El montaje es el mismo que en T13, con los enlaces sembrados reducidos otra vez a 3 (activo, caducado y revocado). En cada variante, después de las capturas se pulsa «Descargar»: Chrome descarga `ikrive-senor-clio-2026-11-02.pdf` y el diálogo se cierra, así que el submit sigue funcionando. La API ya está parada.
- `pnpm harness --full`: en verde (shared 105, web 289, api 238; lint y typecheck OK).
