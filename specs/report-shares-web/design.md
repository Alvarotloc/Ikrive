# Design — report-shares-web

Web sobre la API de #32 (sin cambios en sus endpoints) más un campo nuevo en `GET /api/config`. Sin cambios de BD.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| shared | `packages/shared/src/schemas/common.ts` | `clientConfigSchema` gana `localBaseUrl: z.boolean()`. |
| api/lib | `apps/api/src/lib/base-url.ts` (nuevo) | `isLocalHost(hostname)` y `isLocalBaseUrl(baseUrl)`, lógica pura con `node:net` (`isIP`). |
| api | `apps/api/src/modules/client-config/routes.ts` | Opciones `{ maxUploadMb, localBaseUrl }`; responde ambos. |
| api | `apps/api/src/app.ts` | Registra `clientConfigRoutes` con `localBaseUrl: isLocalBaseUrl(config.BASE_URL)` (se calcula una vez al arrancar). |
| api/test | `apps/api/test/base-url.test.ts` (nuevo), `apps/api/test/client-config.test.ts` | Unitarios del clasificador; el test existente pasa a esperar `{ maxUploadMb: 7, localBaseUrl: true }` y se añade el caso público. |
| web/components | `apps/web/src/components/copy-url-field.tsx` (nuevo) | `CopyUrlField`: el `FeedUrl` de `calendar-feed-section.tsx` extraído con props (`label`, `hint`, `copiedMessage`). |
| web | `apps/web/src/features/calendar-feed/calendar-feed-section.tsx` | Usa `CopyUrlField` (mismo DOM y textos; su test sigue en verde). |
| web | `apps/web/src/lib/query-keys.ts` | `vehicles.reportShares(id) = ['vehicles', 'detail', id, 'report-shares']`. |
| web | `apps/web/src/features/reports/queries.ts` | `reportSharesQuery(vehicleId)`, `useCreateReportShare(vehicleId)`, `useRevokeReportShare(vehicleId)`. |
| web | `apps/web/src/features/reports/report-shares-section.tsx` (nuevo) | `ReportSharesSection` (crear, URL, avisos, listado, revocar). |
| web | `apps/web/src/features/reports/sale-report-dialog.tsx` | Monta `ReportSharesSection` debajo de la descarga y le pasa las opciones actuales. |
| web/test | `apps/web/src/features/reports/report-shares-section.test.tsx` (nuevo) | Tests de componente (renderizan `SaleReportDialog`). |
| web/test | `apps/web/src/features/reports/sale-report-dialog.test.tsx` | `setup` mockea `GET /config` y `GET /vehicles/v1/report-shares` (ahora el diálogo los pide y `mockApi` rechaza rutas no declaradas). |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | Namespace `reportShares.*`. |
| docs | `docs/PLAN.md` | Fase 6 → ✅ Hecha. |

## Cambio en la API: `GET /api/config`

```ts
// packages/shared — clientConfigSchema
{ maxUploadMb: number; /** BASE_URL points to a host only reachable from the local network. */ localBaseUrl: boolean }

// apps/api/src/lib/base-url.ts
export function isLocalHost(hostname: string): boolean;   // R1, R2
export const isLocalBaseUrl = (baseUrl: string) => isLocalHost(new URL(baseUrl).hostname);
```

`isLocalHost`: quita los corchetes de IPv6 (`new URL('http://[::1]').hostname === '[::1]'`), pasa a minúsculas y quita un punto final y devuelve `true` para: nombres `localhost`, `*.localhost`, `*.local`, `*.lan`, `*.home.arpa`, `*.internal` y nombres de una sola etiqueta sin punto (`nas`); IPv4 `0.0.0.0`, `127/8`, `10/8`, `172.16/12`, `192.168/16`, `100.64/10` (CGNAT/Tailscale), `169.254/16`; IPv6 `::1`, `fc00::/7`, `fe80::/10` e IPv4 mapeadas (`::ffff:192.168.1.10`, se clasifican por su IPv4). Los sufijos se comparan por etiqueta completa (`example.local.com` no es local). Cualquier otro nombre de dominio (p. ej. `*.ts.net` de Tailscale Funnel) o IP → `false`. `BASE_URL` ya viene validado como URL por `config.ts`.

Contrato: `GET /api/config` → 200 `{ maxUploadMb, localBaseUrl }`; 401 sin sesión (sin cambios).

## Contrato consumido (de #32, sin cambios)

| Llamada | Uso |
|---|---|
| `POST /api/vehicles/:id/report-shares` `{ hidePrices, hidePlate, hideVin, includeInvoices, expiresInDays }` → 201 `ReportShareSecret` | Crear; la `url` solo existe en esta respuesta. |
| `GET /api/vehicles/:id/report-shares` → 200 `ReportShare[]` (más reciente primero, `status` calculado por el servidor) | Listado. |
| `DELETE /api/vehicles/:id/report-shares/:shareId` → 204 | Revocar (idempotente). |

Errores `application/problem+json` (400/401/404): un toast genérico por acción; no hay errores de campo (las opciones y la caducidad salen de controles cerrados).

## Tipos y firmas (web)

```ts
// features/reports/queries.ts
export const reportSharesQuery = (vehicleId: string) =>
  queryOptions({ queryKey: queryKeys.vehicles.reportShares(vehicleId),
                 queryFn: () => api.get<ReportShare[]>(`/vehicles/${vehicleId}/report-shares`) });
export function useCreateReportShare(vehicleId: string):
  UseMutationResult<ReportShareSecret, unknown, CreateReportShare>;   // onSuccess → invalidate reportShares (R21)
export function useRevokeReportShare(vehicleId: string):
  UseMutationResult<void, unknown, string /* shareId */>;            // onSuccess → invalidate reportShares (R21)

// features/reports/report-shares-section.tsx
export function ReportSharesSection(props: { vehicleId: string; options: SaleReportOptions }): JSX.Element;

// components/copy-url-field.tsx
export function CopyUrlField(props: { url: string; label: string; hint: string; copiedMessage: string }): JSX.Element;
```

`EXPIRY_DAYS = [7, 30, 90] as const` y `DEFAULT_EXPIRY_DAYS = 30` en `report-shares-section.tsx`.

## UI

- **Ubicación:** dentro del `<form>` de `SaleReportForm`, entre las opciones (y sus avisos) y el `DialogFooter`, separada de las opciones por `<hr>`. El `DialogFooter` («Cancelar» / «Descargar») queda al final del diálogo, después de la sección, con un borde superior (cambio pedido en Gate 2); sigue siendo el `submit` del formulario de descarga. `ReportSharesSection` recibe `options` del estado del formulario, así que «Crear enlace» usa siempre lo que está marcado (R4). Al estar dentro de `DialogContent`, se desmonta al cerrar: la URL creada desaparece (coherente con R6) y el listado solo se pide con el diálogo abierto.
- **Cabecera de la sección:** `h3` «Compartir con un enlace» + texto de ayuda `text-sm text-muted-foreground` (R10). Si `useQuery(clientConfigQuery).data?.localBaseUrl`, el `Warning` existente del diálogo (icono `TriangleAlert`, fondo `bg-warning/15`) con el aviso local (R11); mientras `/config` carga o falla no se muestra.
- **Crear:** `Label` «Caducidad» + `Select` nativo (`components/ui/select.tsx`) con «7 días», «30 días», «90 días»; `Button type="button" variant="outline"` con icono `Link`. Pendiente: `disabled` + `Loader2` + «Creando…» (R8). Error: `toast.error(t('reportShares.createError'))` (R9).
- **URL creada (R5–R7):** `CopyUrlField` con label «Enlace público», hint «Cópialo ahora: por seguridad no se podrá volver a ver cuando cierres este diálogo.» y toast «Enlace copiado». Igual que el feed iCal, el botón «Copiar» solo aparece si existe `navigator.clipboard` (contexto seguro); si no, el campo se selecciona al enfocarlo. Crear otro enlace sustituye la URL mostrada.
- **Listado (R13–R17):** `ul` con una fila por enlace: `Badge` de estado (`active` → `status`, `expired` → `warning`, `revoked` → `danger`), «Caduca el {fecha}» (`format.dateTime(expiresAt)`), y las opciones como `Badge variant="stamp"` («Sin precios», «Sin matrícula», «Sin VIN», «Con facturas»; «Informe completo» si no hay ninguna). Carga: `common.loading`. Vacío: «Todavía no has creado ningún enlace para este vehículo.» Error: «No se han podido cargar los enlaces.» en `text-destructive`; el resto del diálogo sigue operativo (R15).
- **Revocar (R16–R20):** botón `ghost` destructivo «Revocar» solo en filas `active`, con `AlertDialog` (patrón de `channels-section.tsx`): título «¿Revocar este enlace?», descripción «Quien lo tenga dejará de poder abrir el informe. No se puede deshacer.», acciones «Cancelar» / «Revocar» (`destructive`). Error → `toast.error(t('reportShares.revokeError'))`. El éxito se ve en la fila, que pasa a «Revocado» tras refrescar (sin toast).
- Móvil: la fila es `flex-wrap`; el selector y el botón de crear se apilan. Modo oscuro: solo tokens del tema. El diálogo ya tiene `max-h-[90dvh] overflow-y-auto`.

### i18n (`reportShares.*`)

`title`, `description` (R10), `localWarning` (R11), `expiry`, `days` (con `{{count}}`), `create`, `creating`, `createError`, `urlLabel`, `urlHint`, `copied`, `empty`, `loadError`, `expiresOn`, `status.{active,expired,revoked}`, `options.{hidePrices,hidePlate,hideVin,includeInvoices,full}`, `revoke`, `revokeTitle`, `revokeDescription`, `revokeError`. El botón «Copiar» reutiliza el texto del feed (`calendarFeed.copy` pasa a `common.copy` al extraer `CopyUrlField`).

## Tests (estrategia)

- **API:** `base-url.test.ts` (unitario, sin app) con tablas de hosts locales y públicos; `client-config.test.ts` con `createTestApp()` (BASE_URL `http://localhost:3000` → `true`) y `createTestApp({ BASE_URL: 'https://ikrive.example.com' })` → `false`.
- **Web:** `report-shares-section.test.tsx` renderiza `<Toaster />` + `SaleReportDialog` con `mockApi` (`GET /config`, `GET /vehicles/v1/report-shares`, `POST …`, `DELETE …/s1`). El portapapeles se espía como en `calendar-feed-section.test.tsx` (`vi.spyOn(navigator.clipboard, 'writeText')`). La invalidación se comprueba contando las llamadas `GET /vehicles/v1/report-shares` y viendo la fila nueva/actualizada que devuelve el segundo handler.

## Alternativas descartadas

- **Exponer `BASE_URL` en texto en `/api/config` y clasificarlo en la web:** daría una URL que la web no necesita y movería al navegador una lógica que depende solo de la configuración del servidor; el booleano es el «indicador equivalente» que permite el acceptance y no amplía lo expuesto.
- **Llamarlo `publicUrlReachable`:** el servidor no puede saber si es accesible desde internet (un dominio puede no tener proxy); solo sabe si `BASE_URL` es local. El nombre describe lo que se comprueba.
- **Resolver DNS del dominio para detectar IPs privadas:** coste y fallos de red al arrancar a cambio de un aviso orientativo; se clasifica solo el literal del host.
- **Pestañas «Descargar» / «Compartir» en el diálogo:** más clics y duplica la explicación de las opciones, que son comunes a las dos acciones.
- **Una página/tarjeta propia de enlaces en la ficha:** el acceptance los sitúa en el diálogo del informe.

## Decisiones a validar

1. El indicador es `localBaseUrl: boolean` en `GET /api/config` (no la URL), calculado al arrancar.
2. Hosts considerados locales: los de la cabecera de `requirements.md` (ampliados en Gate 1): además de loopback, privadas, link-local y ULA, `100.64.0.0/10` (CGNAT/IPs de Tailscale), los sufijos `.local`, `.lan`, `.home.arpa` e `.internal` y los nombres sin punto. Los dominios `*.ts.net` de Tailscale Funnel siguen siendo públicos.
3. Con `BASE_URL` local se puede crear el enlace igualmente (solo se avisa): sirve dentro de la LAN o si el host es accesible por otro medio.
4. La sección de enlaces va en el mismo diálogo, debajo del botón «Descargar», y usa las mismas casillas.
5. La URL creada solo se ve hasta cerrar el diálogo; crear otro enlace la sustituye.
6. Revocar no muestra toast de éxito (la fila cambia a «Revocado»); crear tampoco (aparece la URL).
7. Los enlaces caducados y revocados siguen en el listado (la API no los purga) sin acciones.
8. `FeedUrl` del feed iCal se extrae a `components/copy-url-field.tsx` para reutilizarlo; la clave `calendarFeed.copy` pasa a `common.copy`.

## Riesgos

- El diálogo crece: con muchos enlaces el scroll vive en `DialogContent` (`max-h-[90dvh]`). Aceptable; sin paginación.
- Los tests existentes de `SaleReportDialog` necesitan declarar las dos peticiones nuevas (`mockApi` rechaza las no declaradas).
- El aviso local es orientativo: un dominio público mal configurado no se detecta (por eso R10 se muestra siempre).

## Fuera de alcance

Página pública en la SPA, editar o renovar enlaces, purgar caducados, contador de visitas, QR del enlace, cambios en los endpoints de #32 o en el PDF, documentar proxies/túneles en el README.
