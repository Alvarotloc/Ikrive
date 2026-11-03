# Implementación — data-portability-web (#36)

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/features/data-portability/import.ts` | **Nuevo.** `IMPORT_ACCEPT = '.zip,application/zip'` e `importErrorKey(error)`: 400/409/413/415 → `dataPortability.errors.{invalid,settings,tooLarge,fileType}`; otro estado o no-`ApiError` → `common.error`. |
| `apps/web/src/features/data-portability/import.test.ts` | **Nuevo.** Tests unitarios de `IMPORT_ACCEPT` y `importErrorKey`. |
| `apps/web/src/features/data-portability/queries.ts` | **Nuevo.** `EXPORT_URL = '/api/me/export'` y `useImportData()`: `api.post<DataImportSummary>('/me/import', FormData{file})`; `onSuccess` invalida `queryKeys.vehicles.all` y `queryKeys.notificationChannels.all`. |
| `apps/web/src/features/data-portability/data-section.tsx` | **Nuevo.** `DataPortabilitySection`: tarjeta «Tus datos» con enlace `<a href download>` (Button `asChild`), input de fichero oculto + botón «Importar datos» (`Loader2` + «Importando…» y deshabilitado mientras `isPending`), `AlertDialog` controlado por `pending: File \| null`, resumen `<dl>` con 8 contadores (`useFormat().number`) en `grid-cols-2 sm:grid-cols-4`, aviso `role="status"` con plural cuando `skipped.notificationChannels > 0`, toasts de éxito/error (`detail` del problem como descripción). |
| `apps/web/src/features/data-portability/data-section.test.tsx` | **Nuevo.** 7 tests de componente (ver trazabilidad). |
| `apps/web/src/routes/_app/settings.tsx` | Import y `<DataPortabilitySection />` al final, tras «Apariencia». Loader sin cambios. |
| `apps/web/src/features/settings/settings-page.test.tsx` | Test nuevo `shows the data section`. |
| `apps/web/src/i18n/locales/{es,en}.json` | Namespace `dataPortability` (mismas claves en ambos, incluido `skippedChannels_one/_other`). |
| `specs/data-portability-web/tasks.md` | T1–T9 marcadas. |
| `progress/current.md` | Bitácora. |

## Trazabilidad

| R | Test |
|---|---|
| R1 | `features/data-portability/data-section.test.tsx › links to the export download`; `features/settings/settings-page.test.tsx › shows the data section` |
| R2 | `data-section.test.tsx › accepts a single zip file`; `import.test.ts › accepts zip files only` |
| R3 | `data-section.test.tsx › asks for confirmation and sends nothing when cancelled` |
| R4 | `data-section.test.tsx › asks for confirmation and sends nothing when cancelled` |
| R5 | `data-section.test.tsx › imports the zip and shows the summary` (una sola llamada a `POST /api/me/import`, cuerpo `FormData` con `file` = el zip elegido, sin `content-type` manual para que `fetch` ponga el boundary multipart) |
| R6 | `data-section.test.tsx › imports the zip and shows the summary` (respuesta retenida → botón «Importando…» deshabilitado) |
| R7 | `data-section.test.tsx › imports the zip and shows the summary` (toast «Datos importados» y los 8 contadores) |
| R8 | `data-section.test.tsx › warns about skipped notification channels`; ausencia con 0 en `imports the zip and shows the summary` |
| R9 | `data-section.test.tsx › invalidates the vehicle and channel queries after importing` (queries sembradas en `vehicles.list('active')` y `notificationChannels.all` pasan a `isInvalidated`) |
| R10 | `import.test.ts › maps each import error status to its message`; `data-section.test.tsx › shows a rejected import in a toast` (409 → mensaje traducido + `detail`, sin resumen ni invalidación) |
| R11 | `i18n/locales.test.ts › es and en define the same keys` |

## Revisión visual (T8)

Build de la SPA servido por la API (`WEB_DIST_DIR`, mismo origen que `BASE_URL`) porque los puertos 5173/5174 estaban ocupados por otros proyectos. Datos reales: la cuenta A exporta (1 vehículo, 1 canal gotify con token, 1 ntfy sin token) y la cuenta B importa el zip → resumen con 1 canal omitido. Capturas (fuera del repo):

- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/9a27f0cd-a3e0-49bd-b095-d423d52984fe/scratchpad/shots/summary-light.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/9a27f0cd-a3e0-49bd-b095-d423d52984fe/scratchpad/shots/summary-dark.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/9a27f0cd-a3e0-49bd-b095-d423d52984fe/scratchpad/shots/summary-mobile.png`
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/9a27f0cd-a3e0-49bd-b095-d423d52984fe/scratchpad/shots/confirm-{light,dark,mobile}.png` (diálogo de confirmación)
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/9a27f0cd-a3e0-49bd-b095-d423d52984fe/scratchpad/shots/page-{light,dark,mobile}.png` (página completa)

También comprobado con curl: `GET /api/me/export` con sesión → 200 y `content-disposition: attachment; filename="ikrive-export-2026-11-03.zip"`.

## `pnpm harness --full`

```
[OK]    43 features: 35 done, 7 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #36 data-portability-web (in_progress)
[OK]    Rama actual: feat/data-portability-web
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared  Tests 111 passed (111)
apps/web         Tests 299 passed (299)
apps/api         Tests 277 passed (277)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Desviaciones del spec

- **`mutateAsync` + `try/catch` en vez de `importData.mutate(file)` con callbacks** (design › Flujo de UI). Va en la línea del riesgo del propio design («si el usuario sale de Ajustes… el toast sí aparece»): los callbacks de `mutate()` se descartan al desmontar el componente y la promesa de `mutateAsync` no. Es el mismo patrón que `CalendarFeedSection`. La invalidación sigue en el `onSuccess` del `useMutation`, como pide el design.
- **R5, cómo se comprueba el multipart**: el test mira el `FormData` que se pasa a `fetch` (y que no se fija ningún `content-type` a mano), igual que `maintenance-attachments.test.tsx`. No lee `request.formData()`, porque el `FormData` de jsdom y el `Request` de undici no se entienden entre sí en el mock.
