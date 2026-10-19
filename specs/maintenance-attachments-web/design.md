# Design — maintenance-attachments-web

Sobre todo `apps/web`, más un endpoint pequeño en `apps/api` y su esquema en `packages/shared` para que la web conozca `MAX_UPLOAD_MB`. Sin cambios de BD. Consume el contrato de `maintenance-attachments-api` (`Attachment`, `ATTACHMENT_MIME_TYPES`). Reutiliza el patrón de `PhotoPicker` (input `file` oculto + `FormData` + `api.post`), el de `DeleteMaintenanceDialog` (`AlertDialog` + toasts) y el de `healthRoutes`/`meRoutes` para el endpoint.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/common.ts` | `clientConfigSchema = z.object({ maxUploadMb: z.number().int().positive() })` y `type ClientConfig`. Exportado por `index.ts` (ya reexporta `common`). |
| api | `apps/api/src/modules/client-config/routes.ts` (nuevo) | `clientConfigRoutes: FastifyPluginAsyncZod<{ maxUploadMb: number }>`: `GET /config` con `preHandler: app.authenticate` y `response: { 200: clientConfigSchema }`. Sin service/repository: solo devuelve configuración. |
| api | `apps/api/src/app.ts` | `api.register(clientConfigRoutes, { maxUploadMb: config.MAX_UPLOAD_MB })` junto a `healthRoutes`. |
| api/test | `apps/api/test/client-config.test.ts` (nuevo) | Integración con `createTestApp({ MAX_UPLOAD_MB: '7' })` + `signUp`. |
| web/lib | `apps/web/src/lib/query-keys.ts` | `config: ['config']` y `vehicles.attachments(id, recordId) = ['vehicles','detail',id,'maintenance',recordId,'attachments']` (cuelga de `vehicles.all` y de `maintenance(id)`: borrar o crear un mantenimiento ya las invalida). |
| web/lib | `apps/web/src/lib/client-config.ts` (nuevo) | `clientConfigQuery` (`staleTime: Infinity`: solo cambia al reiniciar el servidor). |
| web/feature | `apps/web/src/features/maintenance/attachments.ts` (nuevo) | Lógica pura: `ATTACHMENT_ACCEPT`, `exceedsUploadLimit`, `uploadErrorKey`, `uploadSequentially`. |
| web/feature | `apps/web/src/features/maintenance/attachments.test.ts` (nuevo) | Tests unitarios. |
| web/feature | `apps/web/src/features/maintenance/use-attachment-upload.ts` (nuevo) | Hook compartido por el diálogo y el alta: filtro por tamaño, subida en serie y toasts. |
| web/feature | `apps/web/src/features/maintenance/queries.ts` | `attachmentsQuery`, `useUploadAttachment`, `useDeleteAttachment`. |
| web/feature | `apps/web/src/features/maintenance/attachment-picker.tsx` (nuevo) | `AttachmentPicker`: input `file` oculto + botón + ayuda con tipos y límite (R23). Lo usan el diálogo y el alta. |
| web/feature | `apps/web/src/features/maintenance/maintenance-attachments.tsx` (nuevo) | `MaintenanceAttachmentsDialog`: lista, subida y `DeleteAttachmentDialog`. |
| web/feature | `apps/web/src/features/maintenance/maintenance-attachments.test.tsx` (nuevo) | Tests de componente. |
| web/feature | `apps/web/src/features/maintenance/maintenance-form.tsx` | Solo en alta: `AttachmentPicker` + lista de elegidos con quitar; tras crear, `uploadFiles(record.id, files)`. |
| web/feature | `apps/web/src/features/maintenance/maintenance-form.test.tsx` | Tests del alta con facturas; `setup` añade `GET /config`. |
| web/feature | `apps/web/src/features/maintenance/maintenance-timeline.tsx` | Botón `Paperclip` en `MaintenanceRow` y estado `attachmentsFor?: MaintenanceRecord` en `MaintenanceSection` que monta el diálogo. |
| web/feature | `apps/web/src/features/maintenance/maintenance-timeline.test.tsx` | Test de apertura del diálogo desde la fila. |
| web/test | `apps/web/src/test/render.tsx` | `MockRoutes`: el handler en forma de función puede devolver `Promise<MockResponse>` (para retener una subida en curso en R6/R30). Retrocompatible. |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | `maintenance.attachments.*`. |
| docs | `docs/PLAN.md` | Una línea en la fase 3: `GET /api/config` expone `maxUploadMb`. |

## Contrato HTTP

**Nuevo — `GET /api/config`** (autenticado)

| Respuesta | Cuerpo |
|---|---|
| 200 | `{ "maxUploadMb": 20 }` (`clientConfigSchema`; valor = `MAX_UPLOAD_MB`) |
| 401 | `application/problem+json` (sin sesión, vía `app.authenticate`) |

**Consumido** — `B = /vehicles/:id/maintenance/:recordId/attachments` (relativo a `/api`, como el resto de `api-client`). `url`/`thumbnailUrl` ya vienen con `/api` y se usan tal cual.

| Llamada | Uso | Errores tratados |
|---|---|---|
| `GET /config` | `clientConfigQuery` con `useQuery` en el diálogo y en el alta | cualquiera → la web «no conoce el límite»: sin ayuda de límite, sin filtro en cliente, 413 con mensaje sin MB |
| `GET B` | `attachmentsQuery` con `useQuery` (no suspense: el diálogo se abre bajo demanda) | cualquiera → `common.error` en el diálogo (R19) |
| `POST B` multipart `file` | una petición por fichero (la API registra multipart con `files: 1`) | 415 → tipo · 413 → tamaño (red de seguridad) · resto → `common.error`, todos con `toast.error` |
| `DELETE B/:attachmentId` | borrado | cualquiera → `toast.error(common.error)` |
| `GET url` / `GET thumbnailUrl` | `<a href>` y `<img src>`; mismo origen, cookie de sesión | — (el navegador descarga por `Content-Disposition: attachment`) |

### Dónde exponer el límite: `GET /api/config` nuevo

- `GET /api/health` es la sonda de vida del `HEALTHCHECK` de Docker y de monitores externos: pública, mínima y estable. Meter configuración de la app ahí la acopla a la sonda y la publica sin sesión.
- `/api/settings` son preferencias editables por usuario (con `PATCH`); el límite es del servidor y no se edita.
- `/api/config` agrupa configuración de servidor de solo lectura que necesita la SPA; hoy solo `maxUploadMb`. Autenticado porque su único consumidor está tras el login (ver decisión 4).

## Tipos y firmas

```ts
// packages/shared — schemas/common.ts
export const clientConfigSchema = z.object({ maxUploadMb: z.number().int().positive() });
export type ClientConfig = z.infer<typeof clientConfigSchema>;

// web — lib/client-config.ts
export const clientConfigQuery = queryOptions({ queryKey: queryKeys.config, queryFn: () => api.get<ClientConfig>('/config'), staleTime: Infinity });

// web — attachments.ts (puro)
export const ATTACHMENT_ACCEPT = ATTACHMENT_MIME_TYPES.join(',');
export const exceedsUploadLimit = (file: File, maxUploadMb: number) => file.size > maxUploadMb * 1024 * 1024; // mismo cálculo que multipart en la API
export function uploadErrorKey(error: unknown, maxUploadMb?: number):
  | 'maintenance.attachments.errors.type' | 'maintenance.attachments.errors.size'
  | 'maintenance.attachments.errors.sizeUnknownLimit' | 'common.error';
// ApiError 415 → type · 413 → size si hay límite, sizeUnknownLimit si no · resto → common.error
export async function uploadSequentially(
  files: File[], upload: (file: File) => Promise<unknown>,
): Promise<{ uploaded: number; failures: { file: File; error: unknown }[] }>;
// await de uno en uno; un fallo se acumula y se sigue con el siguiente

// web — queries.ts
export const attachmentsQuery = (vehicleId: string, recordId: string) => queryOptions({ … api.get<Attachment[]>(B) });
export const useUploadAttachment = (vehicleId: string) // ({ recordId, file }) => FormData 'file' → api.post<Attachment>(B, body)
export const useDeleteAttachment = (vehicleId: string, recordId: string) // (attachmentId) => api.delete<void>(…)
// invalidan solo queryKeys.vehicles.attachments(vehicleId, recordId)
// (recordId va en las variables de la subida porque en el alta no se conoce hasta crear)

// web — use-attachment-upload.ts
export function useAttachmentUpload(vehicleId: string): {
  maxUploadMb: number | undefined;                  // undefined mientras carga o si /config falla
  acceptFiles(files: File[]): File[];               // toast.error de tamaño por cada fichero > límite; devuelve el resto
  uploadFiles(recordId: string, files: File[]): Promise<{ uploaded: number; failed: number }>;
  // uploadSequentially + toast.error(t(uploadErrorKey(e, max), { name, max })) por fallo + toast.success(uploaded) si > 0; nunca lanza
};

// web — attachment-picker.tsx
export function AttachmentPicker(props: { maxUploadMb?: number; disabled?: boolean; busy?: boolean; onFiles(files: File[]): void }): JSX.Element;
// input type=file multiple accept=ATTACHMENT_ACCEPT sr-only con aria-label; vacía el input tras cada selección

// web — maintenance-attachments.tsx (sin dependencias de TanStack Router)
export function MaintenanceAttachmentsDialog(props: {
  vehicleId: string; record: Pick<MaintenanceRecord, 'id' | 'title'>; open: boolean; onOpenChange(open: boolean): void;
}): JSX.Element;
```

**Flujo en el diálogo**: `onFiles` → `acceptFiles` (descarta los grandes con toast, R24) → `uploadFiles(record.id, accepted)`. Botón `disabled` durante la tanda (estado local `uploading`, no `isPending`, que parpadea entre ficheros).

**Flujo en el alta** (`MaintenanceForm` sin `record`):
1. `onFiles` → `acceptFiles` → se añaden a un estado `pending: File[]`, mostrado como lista de nombres con botón quitar (`X`, `aria-label` «Quitar {{name}}»).
2. `onSubmit`: `try { record = await create.mutateAsync(values) } catch → setError como hoy, return` (un fallo del alta no sube nada).
3. `toast.success(maintenance.created)`; si hay `pending`, `const { failed } = await uploadFiles(record.id, pending)`; si `failed > 0`, `toast(t('maintenance.attachments.retryHint'))`.
4. `onDone()` siempre: el mantenimiento ya existe; dejar el formulario abierto invitaría a guardar otra vez y duplicarlo.

Todo ocurre dentro de `handleSubmit`, así que `isSubmitting` cubre alta + subidas y el botón de guardar ya queda `disabled` (R30); su texto pasa a «Subiendo facturas…» mientras suben. El diálogo sigue montado hasta el final, de modo que no hay mutaciones huérfanas tras desmontar.

### ¿Facturas también en la edición? No

En edición el registro ya tiene `recordId` y su diálogo de facturas está a un clic, en la misma fila. Meter el selector en el formulario de edición mezclaría dos semánticas (los campos se guardan al pulsar «Guardar», las facturas se subirían o borrarían al momento o habría que diferirlas también, sin poder borrar las existentes desde ahí) y duplicaría la gestión que ya hace el diálogo. En el alta sí aporta: es el único sitio donde, sin él, hacen falta dos pasos (crear, cerrar, abrir facturas).

## UI

- **Entrada**: en `MaintenanceRow`, botón ghost icono `Paperclip` (`size-9`, `aria-label` «Facturas de {{title}}») antes de editar y borrar. Visible en cualquier estado del vehículo (como editar).
- **Diálogo**: `Dialog` controlado (`DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto"`), título «Facturas» + título del registro. El contenido se monta solo abierto, así las queries se lanzan al abrir.
- **Lista**: `<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">`; cada factura es una tarjeta (`rounded-lg border`): un `<a href={url}>` que envuelve la miniatura (`<img src={thumbnailUrl} alt={originalName} loading="lazy" className="aspect-square w-full object-cover">`) o un bloque `aspect-square` con el icono `FileText` (`aria-hidden`) para PDF, y el nombre (`text-sm truncate`, `title` con el nombre completo). Botón ghost `Trash2` con `aria-label` «Eliminar {{name}}» que abre el `AlertDialog`.
- **Estados**: cargando → `common.loading`; error → `common.error` (`role="alert"`); vacío → `maintenance.attachments.empty`.
- **`AttachmentPicker`**: input `type="file" multiple accept={ATTACHMENT_ACCEPT}` `sr-only` con `aria-label` propio y un `Button` («Subir facturas» con `Upload` en el diálogo, variante `accent`; «Añadir facturas» `outline` en el alta) que lo dispara; debajo, `text-xs text-muted-foreground` «PDF, JPG, PNG o WebP · máx. {{max}} MB» (solo si se conoce el límite).
- **Alta**: bloque «Facturas» entre la descripción y el checkbox del informe: picker + `<ul>` de nombres (`truncate`) con botón quitar. No aparece en edición (R31).
- Tokens semánticos solo → modo oscuro sin trabajo extra. Fila de la timeline con 3 iconos a 375 px: se revisa en capturas.

## i18n

`maintenance.attachments.{open, title, empty, upload, add, uploading, uploadingInvoices, fileInput, help, remove, uploaded_one, uploaded_other, retryHint, deleted, deleteLabel, deleteTitle, deleteDescription, sectionTitle, errors.{type, size, sizeUnknownLimit}}`. Interpolación `{{title}}`, `{{name}}`, `{{count}}`, `{{max}}`. La paridad la cubre el test existente `es and en define the same keys` de `i18n/locales.test.ts`.

## Estrategia de tests

- **API** (`apps/api/test/client-config.test.ts`): `returns the upload limit configured in MAX_UPLOAD_MB` (`MAX_UPLOAD_MB: '7'` → `{ maxUploadMb: 7 }`) y `requires a session` (401 problem+json). No hay recurso de otro usuario: es configuración global.
- **Unitarios** (`attachments.test.ts`): mapeo 415/413 (con y sin límite)/otros, `exceedsUploadLimit` en el borde (`limit` bytes no excede, `limit + 1` sí), secuencialidad y continuidad tras un fallo, `ATTACHMENT_ACCEPT`.
- **Componente** (`maintenance-attachments.test.tsx`, `maintenance-form.test.tsx`), patrón actual: `renderWithProviders` + `mockApi` con `GET /config` → `{ maxUploadMb: 1 }` (los ficheros «grandes» son de `1 MiB + 1` bytes; no hace falta reservar 20 MB en jsdom), `<Toaster />`, `toast.dismiss()` en `afterEach`. Ficheros con `new File([...], 'factura.pdf', { type: 'application/pdf' })` y `user.upload(input, [a, b])`. Las subidas se afirman con `fetchMock.mock.calls`: `init.body` es el `FormData` y se comprueba `body.get('file').name` (helper propio: el `requests()` actual hace `JSON.parse` del cuerpo y no sirve para multipart). R6/R30: el handler del `POST` devuelve una promesa que el test resuelve después de afirmar `disabled`.
- **Timeline**: un test nuevo abre el diálogo desde la fila y ve su título.
- **Revisión visual**: diálogo con imágenes y PDFs, alta con facturas elegidas y la timeline con el botón nuevo, en claro, oscuro y 375 px (R18).

## Alternativas descartadas

- **Subida en paralelo** (`Promise.all` de los `POST`): la API guarda cada fichero en un buffer en memoria de hasta `MAX_UPLOAD_MB`, genera la miniatura con `sharp` (CPU y memoria) y escribe en SQLite, que tiene un único escritor. En servidores self-hosted pequeños (Raspberry Pi, NAS) varias subidas a la vez multiplican el pico de memoria y compiten por CPU y por el bloqueo de escritura, y lo normal son 1–3 facturas por mantenimiento: el paralelo apenas ahorra tiempo. En serie, además, los toasts salen en orden.
- **Exponer `maxUploadMb` en `GET /api/health`**: ver «Dónde exponer el límite».
- **Límite fijo en la web (constante de 20 MB en `@ikrive/shared`)**: falla en cuanto el operador cambia `MAX_UPLOAD_MB`; la API es la fuente de verdad.
- **Galería inline en cada fila de la timeline**: un `GET B` por registro al cargar la ficha (N+1; el DTO de mantenimiento no trae adjuntos ni contador). Se carga bajo demanda.
- **Un único `POST` con varios ficheros**: la API acepta un fichero por petición (`files: 1`) y el acceptance de la feature 5 lo fija así.
- **Validar el tipo en cliente más allá de `accept`**: la API detecta el tipo por contenido; el `accept` solo filtra el selector y el 415 sigue siendo la fuente de verdad.
- **Deshacer el alta si falla una factura** (borrar el mantenimiento): perdería datos ya válidos por un fallo de un fichero que se puede reintentar.

## Decisiones a validar (Gate 1)

1. Facturas en un **diálogo propio** abierto con un botón de clip en cada fila; la timeline no muestra cuántas facturas tiene cada registro (la API no lo expone).
2. Se pueden subir y borrar facturas en **cualquier estado** del vehículo (vendido/archivado incluidos), igual que editar.
3. Varios ficheros → **un `POST` por fichero, en serie** (confirmado en Gate 1); un fallo no para el resto; un `toast.error` por fichero fallido y un único `toast.success` con el total.
4. El límite se expone en **`GET /api/config` nuevo y autenticado** (401 sin sesión). Si en el futuro la pantalla de login necesita configuración (p. ej. `DISABLE_SIGNUP`), se decidirá entonces si hacerlo público.
5. **Si `/config` aún no ha llegado o falla**, la web no bloquea: no muestra el límite, no filtra en cliente y el 413 usa un mensaje sin MB (`errors.sizeUnknownLimit`).
6. El filtro en cliente usa `size > maxUploadMb · 1024 · 1024`, el mismo cálculo que el `fileSize` de multipart en la API, y se aplica **al elegir** los ficheros (en el alta, el fichero grande ni siquiera entra en la lista).
7. Pulsar una factura **sigue el enlace `url`**: la API responde `Content-Disposition: attachment`, así que se descarga; la previsualización es la feature 12.
8. **Alta con facturas**: primero se crea el mantenimiento y después se suben en serie con el nuevo `recordId`. Si alguna falla, el mantenimiento se queda, el formulario se cierra y, además de los toasts por fichero, sale un aviso único: «Algunas facturas no se han subido. Puedes volver a subirlas desde las facturas del mantenimiento». Si falla el alta, no se sube nada. El formulario sigue abierto (botón deshabilitado) hasta acabar las subidas.
9. **La edición no tiene selector de facturas**: se gestionan desde el diálogo (ver «¿Facturas también en la edición?»).
10. Se amplía `mockApi` para aceptar handlers asíncronos (solo para R6 y R30).

## Riesgos

- `user.upload` (v14) descarta por defecto los ficheros que no casan con `accept` (`applyAccept`): los tests de 415/413 suben ficheros con un `type` admitido y es `mockApi` quien responde el error (en la realidad la API decide por contenido).
- `<img>` en jsdom no carga nada: se afirma `src` y `alt`, no la imagen. La carga real se ve en las capturas.
- Tres botones icono en la fila a 375 px pueden apretar el título; si las capturas lo muestran, se agrupan los iconos en una segunda línea en móvil.
- Ficheros grandes: no hay barra de progreso (fetch no la da); solo el botón deshabilitado. En el alta el formulario espera a todas las subidas; con varias facturas grandes en una conexión lenta el usuario ve «Subiendo facturas…» un rato. Cerrar el diálogo a mano (Escape/fuera) durante la subida lo desmonta: las peticiones en curso terminan, pero los toasts posteriores de esa tanda podrían perderse. Mitigación: mientras `isSubmitting`, `onOpenChange` ignora el cierre.
- Margen entre filtro en cliente y API: un multipart con cabeceras añade unos bytes, pero el límite de la API es sobre el fichero (`fileSize`), no sobre el cuerpo, así que coinciden; el 413 queda como red de seguridad.
- Los tests existentes del formulario y de la timeline no mockean `GET /config`: `mockApi` responde 404, la web lo trata como límite desconocido y no rompe; aun así se añade a `setup` del formulario.

## Fuera de alcance

- **Previsualizar una factura sin descargarla** (visor de imágenes, PDF en pestaña): feature 12 `attachment-preview`.
- Selector de facturas en la edición (decisión 9), arrastrar y soltar, barra de progreso, contador de facturas en la timeline, adjuntos en repostajes (fase 5) y gasto acumulado (feature 8).
- Otra configuración en `/api/config` aparte de `maxUploadMb`.
