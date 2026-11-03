# Review — #36 data-portability-web

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/web/src/features/data-portability/data-section.test.tsx:64` › `links to the export download` (heading «Tus datos», enlace «Descargar mis datos» con `href="/api/me/export"` y `download`) + `apps/web/src/features/settings/settings-page.test.tsx:105` › `shows the data section` (la sección está montada en la página real de Ajustes)
- R2: [x] `data-section.test.tsx:73` › `accepts a single zip file` (`type=file`, `accept=".zip,application/zip"`, sin `multiple`, botón «Importar datos») + `import.test.ts:8`
- R3: [x] `data-section.test.tsx:83` › `asks for confirmation and sends nothing when cancelled` (el `alertdialog` contiene el nombre del fichero, «no se borra ni se modifica nada» y la frase de moneda/unidades)
- R4: [x] mismo test (tras «Cancelar» el diálogo se cierra y hay 0 llamadas `POST /api/me/import`)
- R5: [x] `data-section.test.tsx:100` › `imports the zip and shows the summary` (exactamente 1 POST, cuerpo `FormData` con `file` = el zip, sin `headers` manuales → boundary multipart lo pone `fetch`; comprobado en `lib/api-client.ts:21-26`)
- R6: [x] mismo test (respuesta retenida → botón «Importando…» `disabled`; tras liberar vuelve a «Importar datos» habilitado)
- R7: [x] mismo test (toast «Datos importados» y los 8 contadores con su valor, emparejados `dt`→`dd`)
- R8: [x] `data-section.test.tsx:144` › `warns about skipped notification channels` (`role="status"`, «2 canales… necesitan un token… vuelve a crearlos»); ausencia con 0 afirmada en `:141`
- R9: [x] `data-section.test.tsx:159` › `invalidates the vehicle and channel queries after importing` (queries sembradas bajo `vehicles.list('active')` y `notificationChannels.all` pasan de `isInvalidated=false` a `true`)
- R10: [x] `import.test.ts:12` › `maps each import error status to its message` (400/409/413/415/500/`Error`) + `data-section.test.tsx:169` › `shows a rejected import in a toast` (409 → mensaje traducido + `detail` como descripción, sin resumen, sin toast de éxito, sin invalidación)
- R11: [x] `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys` (en verde); revisadas a mano las claves de `dataPortability` en ambos idiomas, incluidos `skippedChannels_one/_other`

## Tasks
- T1..T9: [x]

## Checkpoints
- C1: [x] harness OK; única feature activa #36 `in_progress`; rama `feat/data-portability-web`.
- C2: [x] requirements/design/tasks presentes; EARS con un `DEBE` por R; tabla cubre todos los acceptance; tasks `[x]`; cada R con test leído.
- C3: [x] Diff limitado a `features/data-portability/` (nuevo), `routes/_app/settings.tsx` (import + montaje al final), `settings-page.test.tsx`, `es.json`/`en.json`, `tasks.md`, `progress/`. Sin cambios en API, shared ni BD, como dice el design.
- C4: [x] Web en `features/data-portability/`; mutación con `useMutation` e invalidación en `onSuccess`; reutiliza `Card`, `Button asChild`, `AlertDialog*`, `toast`, `ApiError`, `useFormat`. API/BD/propiedad: N/A (sin cambios). Lógica pura (`importErrorKey`) es específica de la web y está testeada.
- C5: [x] Sin `any`/`@ts-ignore`, sin `console.log`, sin TODOs ni código comentado. Fechas/km/subidas: N/A.
- C6: [x] `pnpm harness --full` en verde (shared 111, web 299, api 277). Tests con resultados concretos; sin BD (web, `mockApi`). Capturas claro/oscuro/móvil referenciadas y revisadas (`summary-dark.png`, `summary-mobile.png`: tokens de tema, grid 2 columnas en móvil, botones apilados).
- C7: [x] `impl_data-portability-web.md` con archivos, mapa R→test y salida; `current.md` describe la sesión; `docs/PLAN.md` no requiere cambio (la feature no cierra la fase 7 ni cambia decisiones).

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- Desviación justificada en el impl: `mutateAsync` + `try/catch` en lugar de `mutate()` con callbacks, para que el toast aparezca aunque el usuario salga de Ajustes (coherente con el riesgo descrito en el design). La invalidación sigue en el `onSuccess` del `useMutation`.
- El toast de éxito se muestra tras completar la invalidación (`onSuccess` devuelve la promesa de `invalidateQueries`, que espera al refetch de las queries activas); con muchas queries activas podría retrasarse un instante.
- Las capturas están en el scratchpad de la sesión (`/tmp/...`), fuera del repo: se perderán al cerrar la sesión.
- El test de R5 inspecciona el `FormData` pasado a `fetch` en vez de parsear el multipart (limitación jsdom/undici, documentada); el comportamiento real se verificó a mano en T8.

## Cambios requeridos
Ninguno.
