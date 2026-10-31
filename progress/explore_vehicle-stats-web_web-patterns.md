# Explore: vehicle-stats-web, web patterns

## 1. Vehicle detail page
- The route is `apps/web/src/routes/_app/vehicles/$vehicleId/index.tsx`. It is a single scrolling page with no tabs. Other vehicle routes: `edit.tsx` and `../index.tsx`, `new.tsx`.
- The loader (`:26-40`) prefetches with `queryClient.ensureQueryData(...)` inside `Promise.all`. Queries prefetched: vehicle, odometer, maintenance, maintenanceSpending, schedules and fuelLogs. A 404 `ApiError` is turned into `notFound()`. A stats query should be added here.
- `VehiclePage` (`:45`) renders in this order:
  - the `dossier-paper` header section (`:75-116`), with a metrics grid `sm:grid-cols-2 xl:grid-cols-4` (`:92-113`) of `<Metric>` tiles: odometer, perYear, sincePurchase and `<MaintenanceSpendingMetric>` (`:112`);
  - a two-column grid with the Odometer card and the Details card (`:118-163`);
  - `<FuelLogsSection>` (`:165`), `<SchedulesSection>` (`:167`) and `<MaintenanceSection>` (`:169`);
  - a Manage card with `VehicleActions` (`:171`).
  The natural spot for a `VehicleStatsSection` card is after the dossier or after the fuel section.
- Maintenance spending lives in `apps/web/src/features/maintenance/maintenance-spending.tsx:8` (`MaintenanceSpendingMetric`). It uses `useSuspenseQuery(maintenanceSpendingQuery)` and `format.money` and shows 0 as an amount, not "—".
- Fuel logs: `apps/web/src/features/fuel/fuel-logs-section.tsx:29` (`FuelLogsSection`, a Card with an empty state `:52-53`, rows `:67`). Helpers are in `features/fuel/fuel.ts`.
- `Metric`, `Plate`, `VehiclePhoto` and `VehicleStatusBadge` are in `apps/web/src/features/vehicles/dossier.tsx`. `Metric({label, value, hint})` is at `:23`.

## 2. Data fetching
- API client: `apps/web/src/lib/api-client.ts`. `api.get<T>(path)` calls `fetch('/api'+path)` with credentials. Errors are thrown as `ApiError` carrying a `problem` (RFC7807).
- Query keys are centralized in `apps/web/src/lib/query-keys.ts:49-64`, under `['vehicles','detail',id, ...]`.
  - Add something like `stats: (id) => ['vehicles','detail',id,'stats']`. It then sits under `vehicles.all`, so fuel mutations (which invalidate `vehicles.all`, `fuel/queries.ts:17`) refresh it.
  - Maintenance mutations should be checked: do they invalidate only `maintenance(id)` or the whole tree? Their comment at `maintenance/queries.ts:24` says "refresh the whole vehicle tree".
- Pattern from `apps/web/src/features/fuel/queries.ts:6-10`: `export const fuelLogsQuery = (vehicleId) => queryOptions({ queryKey, queryFn: () => api.get<FuelLog[]>(...) })`.
  - Components call `useSuspenseQuery(xQuery(id))`.
  - Mutations go through a `useXMutation` wrapper that invalidates on success (`:13-19`).
  - Spending equivalent: `maintenance/queries.ts:18-22`.
- API: `GET /api/vehicles/:id/stats` (`apps/api/src/modules/stats/routes.ts:10`). Type `VehicleStats` / `vehicleStatsSchema` in `packages/shared/src/schemas/stats.ts:12-44` (see `explore_vehicle-stats-web_api-contract.md`). Values come back in stored units with no conversion. Ratios are null when there isn't enough data.
- Backlog note (`feature_list.json:419`): remove the unused `DAY_MS` at `packages/shared/src/domain/stats.ts:37`.

## 3. Units, currency, formatting
- `apps/web/src/lib/format.ts:78` `useFormat()` reads `settingsQuery` (falling back to `DEFAULT_USER_SETTINGS`) and `i18n.language`, and returns `distanceUnit`, `number` (0 decimals), `distance` (e.g. "12.345 km"), `money` (Intl currency), `date` (date-only, UTC), `dateTime`.
  There is no month formatter yet: a `YYYY-MM` label for chart axes will need one, e.g. `Intl.DateTimeFormat(locale, {month:'short', year:'2-digit', timeZone:'UTC'})`.
- `apps/web/src/features/fuel/use-fuel-format.ts:43` `useFuelFormat(fuelType)` gives `unit` (l/gal/kwh via shared `fuelQuantityUnit`, `packages/shared/src/domain/fuel.ts:7`), `unitLabel` from `fuel.units.*`, `quantity` (≤3 decimals), `pricePerUnit`.
  There is no consumption formatter (e.g. "L/100 km") or cost-per-distance formatter yet, so new helpers are needed.
- Unit enums: `packages/shared/src/enums.ts:4-12`. Settings schema: `packages/shared/src/schemas/settings.ts`.
- Locale: `apps/web/src/features/settings/use-user-locale.ts` applies `settings.locale` to i18n. Input parsers in `features/vehicles/numbers.ts`.

## 4. i18n
- Setup in `apps/web/src/i18n/index.ts`: inline resources, `fallbackLng: 'es'`.
- Strings in `apps/web/src/i18n/locales/es.json` and `en.json`. Nested camelCase keys per feature; namespaces `common`, `units` (`:96`), `vehicles` (`vehicles.metrics.*` `:209`), `odometer`, `maintenance` (`maintenance.categories` `:290`), `fuel` (`:336`, incl. `fuel.units`, `fuel.empty`), `schedules`, etc.
- Empty-state strings use `<feature>.empty` ("Todavía no hay …").
- `apps/web/src/i18n/locales.test.ts` probably checks es/en key parity.
- A new `stats` namespace (or `vehicles.stats`) fits.

## 5. Visual components and tokens
- UI: `components/ui/card.tsx` (Card/CardHeader/CardTitle/CardDescription/CardContent, `p-7`), `badge` (`status`, `stamp`), `button` (`accent`), `popover`, `select`; `components/info-popover.tsx`, `page-header.tsx`.
- Figure tile: `Metric` (`dossier.tsx:23`): `rounded-lg border bg-card/70 p-4`, `label-caps` label, value in `font-display text-2xl tracking-[-0.04em]`, optional hint.
- Empty state: plain `<p className="py-3 text-sm text-muted-foreground">` (`fuel-logs-section.tsx:53`). No dedicated EmptyState component.
- Tokens in `apps/web/src/index.css:10-80`: light ink `#2d3a3a`, mint accent `#c5e8e0` / `--accent-dark #a8d9cd`, deep `#1a3638`, success `#355647`, warning `#8a6100`, muted `#6b7280`, line `rgba(45,58,58,.1)`; `.dark` variant (mint becomes primary). Tailwind vars `--color-primary`, `--color-accent`, `--color-accent-strong`, `--color-deep`… Charts can use `var(--ink)` / `var(--accent-dark)` / `var(--deep)` to follow the theme.
- Utilities: `label-caps`, `eyebrow`, `glow-shell`, `dossier-paper`, `reveal`. Design rules: `docs/PLAN.md:204-217`.
- The landing (`~/dev/personal/Ikrive-landing`, tokens in `src/styles/global.css`) has no charts.

## 6. Testing
- `apps/web/vitest.config.*`, two projects: `unit` (`*.test.ts`, node, `src/test/setup-unit.ts`) and `dom` (`*.test.tsx`, jsdom, `src/test/setup.ts`: jest-dom, forces Spanish, unstubs globals and restores mocks after each test).
- No MSW. `apps/web/src/test/render.tsx`: `renderWithProviders(ui)` (fresh QueryClient no retry + I18nextProvider; returns `user`) and `mockApi({'GET /path': {status?, body} | fn})` (stubs fetch; unknown routes 404).
- Representative test: `apps/web/src/features/maintenance/maintenance-spending.test.tsx` (mocks `GET /settings` with `DEFAULT_USER_SETTINGS`, `<Suspense>`, Intl money helper NBSP→space, finds tiles by label).
- Recharts' `ResponsiveContainer` needs `ResizeObserver`, absent in jsdom and not polyfilled: a stub or fixed size is needed in tests.

## 7. Recharts
Not a dependency anywhere. Must be added to `@ikrive/web`.
