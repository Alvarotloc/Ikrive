# Design — fuel-logs-web

Solo `apps/web`. Sin cambios en la API, la BD ni `packages/shared`: consume el contrato de `fuel-logs-api` (ver `specs/fuel-logs-api/design.md`) y reutiliza `fuelQuantityUnit`, `resolveFuelPrices`, `createFuelLogSchema` y los tipos `FuelLog`, `CreateFuelLogInput` y `UpdateFuelLogInput`. Calca la estructura de `features/maintenance/` (sección + diálogo de formulario + `form.ts` puro).

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| web/lib | `apps/web/src/lib/query-keys.ts` | `vehicles.fuelLogs(id) = ['vehicles','detail',id,'fuel-logs']` (cuelga de `vehicles.all`). |
| web/feature | `apps/web/src/features/fuel/fuel.ts` (nuevo) + `fuel.test.ts` | Lógica pura: `parseFuelNumber`, `sortFuelLogs`, `computeThirdValue`, `formatInputNumber`. |
| web/feature | `apps/web/src/features/fuel/form.ts` (nuevo) + `form.test.ts` | `fuelFormSchema`, `defaultsFrom`, `formErrorFor`. |
| web/feature | `apps/web/src/features/fuel/queries.ts` (nuevo) | `fuelLogsQuery`, `useCreateFuelLog`, `useUpdateFuelLog`, `useDeleteFuelLog` (invalidan `queryKeys.vehicles.all`). |
| web/feature | `apps/web/src/features/fuel/use-fuel-format.ts` (nuevo) | Unidad de cantidad y formateadores de cantidad y precio por unidad. |
| web/feature | `apps/web/src/features/fuel/fuel-log-form.tsx` (nuevo) + `.test.tsx` | `FuelLogFormDialog` (alta y edición). |
| web/feature | `apps/web/src/features/fuel/fuel-logs-section.tsx` (nuevo) + `.test.tsx` | `FuelLogsSection`: lista, vacío, botón de alta, editar, `DeleteFuelLogDialog`. |
| web/route | `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx` | Loader añade `ensureQueryData(fuelLogsQuery)`; `<FuelLogsSection vehicle={vehicle} />` entre la rejilla de 2 columnas y `SchedulesSection`. |
| i18n | `apps/web/src/i18n/locales/{es,en}.json` | Namespace `fuel.*`. |
| i18n | `apps/web/src/i18n/locales.test.ts` | Test de etiqueta por cada `FUEL_QUANTITY_UNITS`. |

## Contrato HTTP consumido

| Llamada | Uso | Errores tratados |
|---|---|---|
| `GET /api/vehicles/:id/fuel-logs` | `fuelLogsQuery` (loader + `useSuspenseQuery`) | 404 → `notFound()` (ya lo hace el loader) |
| `POST /api/vehicles/:id/fuel-logs` | alta; cuerpo con los tres valores (la API los guarda tal cual si llegan ambos precios) | 409 → km · 400 sin `errors` → fecha · resto → raíz `common.error` |
| `PATCH /api/vehicles/:id/fuel-logs/:logId` | edición, cuerpo completo | ídem |
| `DELETE /api/vehicles/:id/fuel-logs/:logId` | borrado | cualquiera → `toast.error(common.error)` |

Sin códigos de error legibles: se ramifica por `problem.status` y presencia de `problem.errors`, igual que `features/maintenance/form.ts`.

## Tipos y firmas

```ts
// fuel.ts
export type FuelValueField = 'quantity' | 'totalPrice' | 'pricePerUnit';
export const FUEL_FRACTION_DIGITS: Record<FuelValueField, number> = { quantity: 3, totalPrice: 2, pricePerUnit: 3 };
/** Un único `.` o `,` es SIEMPRE el separador decimal («1.459» → 1.459, «58,36» → 58.36). Sin reinterpretaciones:
 *  '' (tras trim) → { ok: true, value: null }; `^\d+([.,]\d+)?$` con ≤ maxFractionDigits decimales → { ok: true, value };
 *  más decimales → { ok: false, reason: 'fraction' }; cualquier otra cosa («1.234,56», «5.», «1 459», letras) → { ok: false, reason: 'format' }. */
export type FuelNumberResult = { ok: true; value: number | null } | { ok: false; reason: 'format' | 'fraction' };
export function parseFuelNumber(text: string, maxFractionDigits: number): FuelNumberResult;
export function sortFuelLogs(logs: FuelLog[]): FuelLog[];   // date desc, odometer desc, createdAt desc
/** Con exactamente dos valores positivos y `target` vacío, devuelve el valor de `target`; si no, null.
 *  totalPrice/pricePerUnit vía `resolveFuelPrices`; quantity = round3(totalPrice / pricePerUnit). */
export function computeThirdValue(
  values: Record<FuelValueField, number | null>, target: FuelValueField): number | null;
/** Número para un input en el idioma («1,459» en es), sin agrupación de miles, hasta 3 decimales. */
export function formatInputNumber(value: number, locale: string): string;

// form.ts
/** Texto → number | null con `parseFuelNumber`. 'format' → NaN (mensaje global «Introduce un número válido»);
 *  'fraction' → issue 'custom' con i18n.t('fuel.errors.maxDecimals', { count: digits }) y z.NEVER. */
const fuelNumber = (digits: number) => z.string().transform((text, ctx) => /* … */);
export const fuelFormSchema = z.object({
  date: isoDateSchema,
  odometer: z.string().transform(parseInteger).pipe(odometerValueSchema),
  quantity: fuelNumber(3).pipe(z.number().positive().max(10_000).nullable()),
  totalPrice: fuelNumber(2).pipe(moneySchema.positive().nullable()),
  pricePerUnit: fuelNumber(3).pipe(moneySchema.positive().nullable()),
  fullTank: z.boolean(),
  missedPrevious: z.boolean(),
})
  .superRefine(/* < 2 de los tres → issue 'custom' en cada vacío con i18n.t('fuel.errors.twoOfThree') */)
  .transform(/* completa el que falte con computeThirdValue → los tres number */);
export type FuelFormInput = z.input<typeof fuelFormSchema>;    // strings + booleans
export type FuelFormValues = z.output<typeof fuelFormSchema>;  // asignable a CreateFuelLogInput y UpdateFuelLogInput
export function defaultsFrom(opts: { log?: FuelLog; lastOdometer?: number }): FuelFormInput;
// alta: hoy, odometer = lastOdometer ?? '', valores '', fullTank true, missedPrevious false
export function formErrorFor(error: unknown): { field: 'odometer' | 'date' | 'root'; messageKey: string };
// 409 → odometer 'fuel.errors.odometerConflict'; 400 sin errors → date 'fuel.errors.future'; resto → root 'common.error'

// use-fuel-format.ts
export function useFuelFormat(fuelType: FuelType): {
  unit: FuelQuantityUnit;                        // fuelQuantityUnit(fuelType, settings.volumeUnit)
  unitLabel: string;                             // t(`fuel.units.${unit}`)
  quantity(value: number): string;               // «40,125 L» (hasta 3 decimales)
  pricePerUnit(value: number): string;           // «1,459 €/L» (currency, 2–3 decimales)
};

// componentes (sin dependencias de TanStack Router, testeables aislados)
export function FuelLogsSection(props: { vehicle: Pick<Vehicle, 'id' | 'status' | 'fuelType' | 'odometer'> }): JSX.Element;
export function FuelLogFormDialog(props: {
  vehicle: Pick<Vehicle, 'id' | 'fuelType' | 'odometer'>; log?: FuelLog; open: boolean; onOpenChange(open: boolean): void;
}): JSX.Element;
```

**Parseo de los tres valores**: `parseFuelNumber` es propio de fuel; `parseDecimal` de `features/vehicles/numbers.ts` no se toca (sus llamantes —`vehicle-form.tsx` y `maintenance/form.ts`— siguen leyendo «1.459» como 1459). `formatInputNumber` escribe sin agrupación de miles y con como mucho 3 decimales, así que todo valor calculado o precargado vuelve a parsear igual. Los km siguen con `parseInteger`.

`useFormat()` no expone `volumeUnit`; `useFuelFormat` lee `settingsQuery` (con `DEFAULT_USER_SETTINGS` como respaldo), igual que `maintenance-form.tsx` lee la moneda. No se toca `lib/format.ts`.

## Cálculo del tercer valor (R8, R9)

Estado local `computed: FuelValueField | null` en el formulario. En el `onChange` de cada uno de los tres campos (vía `register(name, { onChange })`):

1. Si el campo editado es `computed`, el usuario lo sobrescribe → `computed = null`.
2. Si `computed` no es `null` → recalcularlo con `computeThirdValue`; si ya no se puede (un origen vacío o inválido), vaciarlo y `computed = null`.
3. Si `computed` es `null` y hay exactamente dos valores válidos con el tercero vacío → `computed = tercero` y escribirlo con `setValue(…, formatInputNumber(v, i18n.language))`.

El campo calculado muestra bajo el input un texto `fuel.computed` («Calculado»), enlazado por `aria-describedby`. En edición `computed` empieza en `null` (los tres vienen del ticket); para recalcular uno el usuario lo vacía, y una pista `fuel.recomputeHint` («Vacía un campo para recalcularlo con los otros dos»), visible solo en edición y enlazada por `aria-describedby` a los tres campos, lo explica (R27). El `transform` del esquema completa igualmente el tercero al enviar, así que el cuerpo siempre lleva los tres valores.

## UI

- **Sección** (`Card` «Repostajes»): cabecera con título y botón `accent` «Añadir repostaje» (solo `status === 'active'`). Lista `<ol className="divide-y">` con el mismo grid de fila que `MaintenanceRow` (móvil: badge y acciones en la primera línea, texto debajo a ancho completo). Izquierda `Badge variant="stamp"` «Lleno» / «Parcial»; centro en negrita precio total · cantidad, debajo en `text-muted-foreground` fecha · km · precio por unidad; derecha botones ghost `Pencil` y `Trash2` (`size-9`, `aria-label` con la fecha).
- **Vacío**: `<p className="py-3 text-sm text-muted-foreground">{t('fuel.empty')}</p>`; carga vía loader + suspense.
- **Formulario**: `Dialog` controlado como `MaintenanceFormDialog` (`max-h-[90dvh] max-w-lg overflow-y-auto`, formulario montado solo mientras está abierto). Orden pensado para el surtidor: km (`inputMode=numeric`, input grande como `OdometerForm`, referencia «Última lectura: X el D»), cantidad, precio total, precio por unidad (los tres `inputMode=decimal`, `enterKeyHint="next"`, rejilla de una columna en móvil y `sm:grid-cols-3`), «Depósito lleno», «Me salté un repostaje anterior» (checkbox nativos), fecha (`type=date`, `max=todayIso()`). Error raíz con `role="alert"`.
- **Borrado**: `AlertDialog` (patrón `DeleteMaintenanceDialog`), acción `destructive`, `toast.success(fuel.deleted)` / `toast.error(common.error)`.
- **Éxito**: `toast.success(fuel.created | fuel.updated)` y cierre.
- Solo tokens semánticos → modo oscuro sin trabajo extra; se verifica con capturas.

## i18n

`fuel.{title, add, edit, empty, created, updated, deleted, deleteTitle, deleteDescription, editLabel, deleteLabel, fullTank, partial, computed, recomputeHint, lastReading, fields.{date, odometer, quantity, totalPrice, pricePerUnit, fullTank, missedPrevious}, units.{l, gal, kwh}, errors.{odometerConflict, future, twoOfThree, maxDecimals}}`. Interpolación `{{unit}}`, `{{currency}}`, `{{date}}`, `{{value}}`, `{{count}}` (`maxDecimals` con plural `_one`/`_other`). Etiquetas: «Cantidad ({{unit}})», «Precio por {{unit}} ({{currency}})».

## Estrategia de tests

- **Unitarios** (proyecto `unit`): `fuel.test.ts` (parseo con un separador, varios separadores y exceso de decimales; orden; cálculo de cada uno de los tres valores y redondeos; `null` con menos de dos valores; formato de input en es/en), `form.test.ts` (parseo, errores de formato y de decimales, error de dos de tres, completado del tercero, defaults, mapeo de errores), `locales.test.ts`.
- **De componente** (proyecto `dom`, `renderWithProviders` + `mockApi`, solo se simula `fetch`): `GET /settings` con `DEFAULT_USER_SETTINGS` (o `volumeUnit: 'gal'` / `currency: 'USD'` / `distanceUnit: 'mi'` donde se prueban unidades). `FuelLogsSection` dentro de `<Suspense>`; `<Toaster />` donde se afirma un toast; fechas pasadas fijas; invalidación con `getQueryState(queryKeys.vehicles.detail('v1')).isInvalidated`; peticiones afirmadas desde `fetchMock.mock.calls`.
- **Ruta de la ficha**: sin test de componente (contexto de router), como en `maintenance-timeline-web`; se valida con `pnpm typecheck` y capturas.

## Alternativas descartadas

- **Página propia `/vehicles/$vehicleId/fuel/new`** o entrada global tipo `/odometer`: enlace directo cómodo desde el móvil, pero dos rutas más y navegación de vuelta; el diálogo sigue el patrón de mantenimientos. Una entrada rápida global puede añadirse después.
- **Calcular el tercer valor solo al enviar** (dejarlo a `createFuelLogSchema` en la API): más simple, pero el usuario no ve el valor antes de guardar y el criterio pide que se calcule en el formulario.
- **Tabla HTML con columnas** para la lista: legible en escritorio, pero obliga a scroll horizontal a 375 px; se usan filas como en mantenimientos.
- **Ampliar `parseDecimal(text, maxFractionDigits)`**: su regla es «el último separador con 1–2 dígitos es el decimal», así que «1.459» en cantidad sería 1459 y con 3 decimales cambiaría «1.234» (hoy 1234) en precio de compra o coste de mantenimiento. Un parser propio con la regla «un separador = decimal» no altera a los llamantes actuales.
- **Reinterpretar «1.234,56» o redondear el exceso de decimales**: más permisivo, pero puede guardar en silencio un valor distinto del escrito; se prefiere un error claro.
- **Añadir `volumeUnit` a `useFormat`**: tocaría un hook compartido por toda la app para un único consumidor; `useFuelFormat` local basta.

## Decisiones a validar (Gate 1)

1. **Km propuestos = valor de la última lectura precargado en el campo** (editable), no solo un placeholder; se muestra la lectura de referencia. Riesgo: guardar sin corregirlo deja un repostaje con los mismos km que la última lectura (la API lo acepta).
2. **Separadores y decimales**: en los tres valores un único `.` o `,` es siempre decimal («1.459» L → 1,459 L); no se aceptan separadores de miles. Máximo de decimales: cantidad 3 (surtidores con 3 decimales), total 2, precio por unidad 3. Más de un separador («1.234,56») → error de número no válido; más decimales de los admitidos → error «como mucho N decimales». Nunca se reinterpreta ni se redondea lo escrito. Al calcular: total a 2 y precio por unidad a 3 (los de `resolveFuelPrices`), **cantidad a 3** (antes 2) para que coincida con lo que se puede escribir. **API**: `createFuelLogSchema.quantity` es `z.number().positive().max(10_000)` sin límite de decimales y la columna `fuel_logs.quantity` es `real` sin redondeo, así que 3 decimales se guardan tal cual; no se cambia la API (el total y el precio por unidad tampoco se redondean si llegan ambos).
3. **En edición no hay recálculo automático** hasta que el usuario vacía uno de los tres valores; una pista lo explica (aprobado por el humano en Gate 1).
4. **Se envían siempre los tres valores** (la API los guarda tal cual), para que lo guardado sea lo que el usuario vio.
5. **«Me salté un repostaje anterior» (`missedPrevious`) está en el formulario**, desmarcado por defecto; la lista no lo muestra.
6. Botón de alta solo para vehículos activos; editar y borrar en cualquier estado (como mantenimientos).
7. Sección colocada **antes** de mantenimientos programados y del historial de mantenimientos (es lo que más se registra).

## Riesgos

- `setValue` en `onChange` puede reentrar en el `onChange` del campo calculado: se escribe con `setValue` (no dispara el `onChange` del `register`), y un test cubre que editar un origen recalcula sin bucles.
- Mensaje custom de zod: el `superRefine` usa `i18n.t` de `@/i18n` para no pasar por el `customError` global.
- Radix en jsdom: mismos polyfills que mantenimientos (ya en `src/test/setup.ts`).

## Fuera de alcance

Estadísticas y consumo (feature 24), gráficos, ticket adjunto, recargas eléctricas de híbridos enchufables, entrada rápida global de repostajes, paginación y filtros de la lista, conversión de unidades.
