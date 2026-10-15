# Explore: maintenance-timeline-web patterns

## 1. apps/web/src/features/vehicles layout
- **Fetch wrapper:** `apps/web/src/lib/api-client.ts`. `api.get/post/patch/put/delete<T>(path, body?)` → `fetch('/api'+path)`, `credentials: 'include'`, JSON or FormData, 204 → `undefined`. Non-OK throws `new ApiError(problem)`; `ApiError.problem` is the `Problem` from `@ikrive/shared` (`{type, title, status, detail?, errors?: {path, message}[]}`), fallback `{type:'about:blank', title: statusText, status}`.
- **Query keys:** `apps/web/src/lib/query-keys.ts`: `queryKeys.vehicles = { all, list(status), detail(id), odometer(id): ['vehicles','detail',id,'odometer'] }`. Natural new key: `maintenance(id): ['vehicles','detail',id,'maintenance']` (under `vehicles.all`).
- **TanStack Query:** `apps/web/src/features/vehicles/queries.ts`. `queryOptions` factories (`vehicleQuery`, `odometerQuery`) used by route loaders (`ensureQueryData`) and components (`useSuspenseQuery`). Mutations `useAddOdometerReading` / `useDeleteOdometerReading` invalidate `queryKeys.vehicles.all` on success (mileage changes). Maintenance mutations should do the same (they create/move/delete readings with `source: 'maintenance'`).
- **problem+json → field** (model: `features/vehicles/odometer-form.tsx`):
  ```ts
  } catch (cause) {
    const status = cause instanceof ApiError ? cause.problem.status : 0;
    form.setError('value', { message: status === 409 ? t('odometer.errors.backwards')
      : status === 400 ? t('odometer.errors.future') : t('common.error') });
  }
  ```
  Mapping by HTTP status only; no code field; `problem.errors[]` not read anywhere yet. Success → `toast.success(...)` (sonner) + `form.reset(...)`.
- **Forms:** react-hook-form + `zodResolver` (`@hookform/resolvers/zod`, zod v4). `useForm<FormInput, unknown, FormOutput>({resolver, defaultValues})`. Local form schema with string inputs; numbers via `z.string().transform(parseInteger).pipe(z.number()...)` — see `numeric()`, `toText()`, `defaultsFrom()` in `features/vehicles/vehicle-form.tsx`. Parsers in `features/vehicles/numbers.ts` (`parseInteger`, `parseDecimal` handles "1.234,56" and "1,234.56").
- Field wrapper `components/form-field.tsx` (`FormField {id,label,error,children}`, error `role="alert"`). Inputs: `components/ui/input.tsx`, `textarea.tsx`, `select.tsx`, `label.tsx`.
- Other files: `display.ts`, `dossier.tsx` (Plate, Metric, VehicleStatusBadge, VehiclePhoto), `vehicle-actions.tsx`, `odometer-timeline.tsx`, `photo-picker.tsx`, `vehicle-card.tsx`.

## 2. Vehicle detail page
- Route `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx`. Loader: `Promise.all([ensureQueryData(vehicleQuery), ensureQueryData(odometerQuery)])`, ApiError 404 → `notFound()`. Add `maintenanceQuery(vehicleId)`.
- Layout: back/edit buttons → `dossier-paper` section → `grid lg:grid-cols-2` (Odometer Card + "Datos del vehículo" Card) → "Gestión" Card (VehicleActions).
- Placement: full-width Card between the 2-col grid and "Gestión". Create button only when `vehicle.status === 'active'` (like OdometerForm).
- List model: `features/vehicles/odometer-timeline.tsx`: `<ol className="divide-y">`, `li` = `grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3`; left `<Badge variant="stamp" className="min-w-20 justify-center uppercase">`, middle bold value + muted date, right ghost icon Button (`size="icon" className="size-9"`, aria-label). Empty: `<p className="py-3 text-sm text-muted-foreground">`. Its delete has no confirmation.

## 3. UI components
- **Badge** `components/ui/badge.tsx` (cva): `status` (default, mint pill with dot), `stamp` (`border border-dashed border-foreground/35 px-2.5 py-1 tracking-[0.06em] text-foreground`).
- **Dialogs** `components/ui/dialog.tsx` (radix-ui): Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription, DialogFooter, AlertDialog, AlertDialogTrigger/Cancel/Action/Content/Title/Description. Content centered `max-w-md`, `w-[calc(100%-2rem)]` — maintenance form likely needs wider class / scroll on mobile.
  - Delete confirmation example: `DeleteDialog` in `features/vehicles/vehicle-actions.tsx` (AlertDialog, Cancel ghost, Action `variant="destructive"` → `mutateAsync` → `toast.success`).
  - Dialog form example: `SoldDialog` in same file (controlled `open`, `<form>` inside DialogContent, DialogFooter + DialogClose).
- **Select** `components/ui/select.tsx` (native `<select>`). **Button** `components/ui/button.tsx`: default/accent/outline/ghost/destructive; sizes default (min-h-11), sm, icon (size-11); `asChild`. **Card** `components/ui/card.tsx`. Others: `page-header.tsx`, `check-item.tsx`, `brand.tsx`.
- No dedicated empty/loading/error components. Empty = inline muted text or `<Card className="p-8 text-center text-muted-foreground">` (`routes/_app/vehicles/index.tsx`). Loading via loaders + `useSuspenseQuery` (`common.loading` string). Errors `common.error`.
- **Filter chips** in `routes/_app/vehicles/index.tsx`: `<nav aria-label=...>` rounded-full pills `min-h-9 rounded-full border px-4 py-1.5 text-sm font-semibold ... data-[status=active]:bg-primary`, Links driven by search params.
- **Sonner:** `<Toaster position="top-right">` in `routes/__root.tsx`; `import { toast } from 'sonner'`.
- Dark mode: `.dark` class (`@custom-variant dark` in `src/index.css`, `lib/theme.ts`); semantic tokens work. Utilities: `label-caps`, `dossier-paper`, `reveal`, `shadow-soft`, `shadow-float`; `cn` in `lib/utils.ts`.

## 4. i18n and formatting
- `apps/web/src/i18n/index.ts` (i18next, single `translation` namespace, `fallbackLng: 'es'`). Locales `apps/web/src/i18n/locales/{es,en}.json`.
- Keys: nested camelCase per feature (`vehicles.*`, `odometer.*`, `common.*` — save, loading, error, cancel, delete, edit). Enum labels by value (`vehicles.fuels.${fuelType}`, `odometer.sources.${source}`) → `maintenance.categories.${category}`. Errors `<feature>.errors.*`. Interpolation `{{value}}`.
- No `maintenance` namespace yet; only `odometer.sources.maintenance` ("Taller"/"Service"). `odometer.errors.backwards` reusable.
- `apps/web/src/lib/format.ts`: `useFormat()` → `{distanceUnit, number, distance, money, date}`; `money` uses `Intl.NumberFormat(locale, {style:'currency', currency: settings.currency})`; `date` formats ISO date-only in UTC `dateStyle: 'medium'`; `todayIso()`.
- Currency from `settingsQuery` (`features/settings/queries.ts`, `GET /settings`), fallback `DEFAULT_USER_SETTINGS`; `useFormat().money` already uses it.

## 5. Maintenance API contract
- `apps/api/src/modules/maintenance/routes.ts` (authenticated):
  - `GET /vehicles/:id/maintenance` → `MaintenanceRecord[]` ordered date desc, createdAt desc (repository.ts:24).
  - `POST /vehicles/:id/maintenance` (`createMaintenanceRecordSchema`) → 201.
  - `GET /vehicles/:id/maintenance/:recordId`.
  - `PATCH .../:recordId` (`updateMaintenanceRecordSchema`, partial) → 200. `odometer: null` removes the linked reading.
  - `DELETE .../:recordId` → 204 (also deletes attachments).
- `packages/shared/src/schemas/maintenance.ts`: create = `date` (isoDateSchema), `odometer` (int 0..9,999,999, nullable optional), `category` (`z.enum(MAINTENANCE_CATEGORIES)`), `title` (trim 1..120), `description` (optionalText 2000), `workshop` (optionalText 120), `cost` (moneySchema 0..1e9, nullable optional), `includeInReport` (bool default true). Update = partial, no default on includeInReport. Types: `MaintenanceRecord`, `CreateMaintenanceRecord(Input)`, `UpdateMaintenanceRecord(Input)`, `maintenanceRecordSchema`. Record: `{id, vehicleId, date, odometer|null, category, title, description|null, workshop|null, cost|null, includeInReport, createdAt, updatedAt}`.
- `MAINTENANCE_CATEGORIES` (`packages/shared/src/enums.ts`): `oil_change, tires, brakes, inspection, repair, filters, battery, other`.
- `packages/shared/src/schemas/common.ts`: `problemSchema`, `odometerValueSchema`, `moneySchema`, `optionalText`.
- Errors (`apps/api/src/modules/maintenance/service.ts`, serialized by `apps/api/src/plugins/errors.ts`):
  - Odometer conflict: **409** `{type:'about:blank', title:'Conflict', status:409, detail:'The odometer cannot go backwards: there is a reading of X on DATE'}`.
  - Future date: 400 `{title:'Bad Request', detail:'The maintenance date cannot be in the future'}` (today in user's timezone).
  - Zod validation: 400 `{title:'Validation failed', errors:[{path,message}]}`. Not found 404.
  - No machine-readable code; `type` always `about:blank`. Branch on `status === 409`; distinguish future-date 400 from validation 400 by presence of `problem.errors`.
- Client precheck available: `findOdometerConflict(readings, {date, value})` in `packages/shared/src/domain/odometer.ts`. On edit the record's linked reading id isn't in the DTO. API is source of truth.

## 6. Web tests (actualizado tras #9 web-component-testing)
- `apps/web/vitest.config.ts`: proyectos `unit` (node, `*.test.ts`) y `dom` (jsdom, `*.test.tsx`). El script `test` es `vitest run` (sin `--passWithNoTests`).
- Helpers: `apps/web/src/test/render.tsx` (`renderWithProviders`, `mockApi`) y `src/test/setup.ts`. Ejemplos: `features/vehicles/odometer-form.test.tsx`, `components/form-field.test.tsx`.
- Cuándo escribir tests de componentes: `CONTRIBUTING.md` › Tests y `docs/verification.md`.

## Other
- Prior specs: `specs/maintenance-records-api`, `specs/maintenance-attachments-api`.
- No `apps/web/src/features/maintenance` folder yet.
