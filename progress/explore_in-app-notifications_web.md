# Explore: in-app-notifications (web)

Paths relative to `apps/web/`.

## 1. App header / layout
- `src/routes/_app.tsx` holds the authenticated layout (`AppLayout`, L31-72). No separate header component exists.
  - `beforeLoad` (L12-16) runs `ensureQueryData(meQuery)` and redirects to `/login`. `loader` (L18-20) prefetches `settingsQuery` without awaiting it.
  - `<aside>` (L45) is a single bar. On **mobile** it is a sticky top row (`sticky top-0 z-10 flex items-center … border-b bg-card/90 backdrop-blur`). On **md+** it becomes a left sidebar (`md:h-dvh md:flex-col md:border-r`, grid `md:grid-cols-[16rem_1fr]` on L44).
  - Order inside it: Brand link (L46) → `<nav class="flex flex-1 justify-end …">` with `navItems` (L24-29, lucide icons; labels are `hidden sm:inline`, so phones show icons only) → logout `Button variant="ghost" size="sm"` (L62-65).
  - **Where the bell fits:** put it next to the logout button, e.g. right after `</nav>` (L61) or wrapping the bell and logout in one group. On mobile it is an icon at the right of the top bar. On desktop it sits at the bottom of the sidebar, so the panel must open sideways or upwards (Radix `side="right"`/`"top"` with `align="end"`, or simply `side="bottom" align="end"` with collision handling). Keep an icon-only trigger with an `aria-label` (count included) and the same ghost-button styling.
- **Dark mode:** class strategy. `@custom-variant dark` in `src/index.css:4`, `.dark { … }` tokens at L63-82, applied by `src/lib/theme.ts` (`applyTheme`). Use only semantic tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `border`, `bg-accent`, `bg-destructive`, `shadow-float`, `bg-muted`). They flip automatically, so no `dark:` utilities are needed.
- Root route `src/routes/__root.tsx` renders `<Outlet/>` plus a sonner `<Toaster position="top-right">`.

## 2. Data fetching (TanStack Query v5)
- QueryClient in `src/main.tsx:12-14` with defaults `retry: 1, refetchOnWindowFocus: false` (so freshness on focus is OFF globally). The router context carries `queryClient` (`__root.tsx` `RouterContext`).
- API wrapper `src/lib/api-client.ts`: `api.get/post/patch/put/delete<T>(path)` prefixes `/api`, sends cookies, throws `ApiError(problem)` (RFC 7807) and returns `undefined` on 204.
- Keys are centralised in `src/lib/query-keys.ts` (`queryKeys.me`, `settings`, `vehicles.{all,list,detail,…}`). Add e.g. `notifications: { all: ['notifications'] as const, list: …, unreadCount: … }` there.
- Feature folder convention (`CONTRIBUTING.md` §Web): `src/features/<domain>/queries.ts` plus components plus co-located tests. Model to copy: `src/features/schedules/queries.ts`:
  - `export const xQuery = (…) => queryOptions({ queryKey: queryKeys…, queryFn: () => api.get<T>(…) })` (L10-14)
  - mutation hooks with `useMutation` + `onSuccess: () => queryClient.invalidateQueries({ queryKey })` (L17-47). Alternatively use `setQueryData` as in `src/features/settings/queries.ts` (`useUpdateSettings`).
  - Types come from `@ikrive/shared` (zod-inferred). No notification schemas exist yet in `packages/shared` (only `NotificationChannelType` in `packages/shared/src/enums.ts:52`).
- Pages use `useSuspenseQuery` with route loaders `ensureQueryData` (`routes/_app/vehicles/$vehicleId/index.tsx:23-30`). For the bell in the layout, prefer **plain `useQuery`** (non-suspense) so the header never suspends or blocks navigation and a failed notifications request does not break the shell. This mirrors how `settingsQuery` is used non-blocking in `useFormat` (`src/lib/format.ts:199`).
- Suggested: one `notificationsQuery` (list including `readAt`, unread count derived client-side) or a separate count. Mark-read mutation: `api.post`/`patch` then invalidate `queryKeys.notifications.all` (or an optimistic `setQueryData`).

## 3. UI primitives / icons
- Headless library: the umbrella **`radix-ui`** package (^1.8.1). It exports `Popover` and `DropdownMenu` (checked in node_modules), but neither is wrapped yet. Wrappers in use: `Dialog`/`AlertDialog` (`src/components/ui/dialog.tsx`), `Slot` (button), `Label`.
  - Recommend adding `src/components/ui/popover.tsx` in the same style as `dialog.tsx` (re-export `Popover.Root/Trigger`, `PopoverContent` with `Portal`, `rounded-xl border bg-card text-card-foreground shadow-float`, `z-50`).
- `src/components/ui/button.tsx`: variants `default|accent|outline|ghost|destructive`, sizes `default|sm|icon` (`size-11`), and `asChild` support.
- `src/components/ui/badge.tsx`: pill variants `status|warning|danger|stamp` all have a `before:` dot and padding, so they don't suit a count bubble. Use a small custom span instead (e.g. `absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-destructive px-1 text-[0.625rem] font-bold text-white`, capped at "9+").
- Other: `card.tsx`, `brand.tsx`, `page-header.tsx`, `check-item.tsx`. `cn()` lives in `src/lib/utils.ts`.
- Icons: **lucide-react** (`Bell`, `BellDot`, `Check`, `CheckCheck` available), imported with `aria-hidden`.
- Toasts: `sonner`.

## 4. Routing
- **TanStack Router** with file routes in `src/routes/` (generated `routeTree.gen.ts`). The router lives in `src/main.tsx:16-21` (`defaultPreload: 'intent'`).
- Vehicle detail: `src/routes/_app/vehicles/$vehicleId/index.tsx`, path `/vehicles/$vehicleId`. Navigate programmatically with `const navigate = useNavigate(); await navigate({ to: '/vehicles/$vehicleId', params: { vehicleId } })` (see `routes/_app/vehicles/new.tsx:29`, `features/vehicles/vehicle-actions.tsx:128-154`).
- Notification `link` is likely a plain string (PLAN.md L135: "enlace"). For a stored string like `/vehicles/abc`, `navigate({ to: link })` works at runtime but is untyped (it needs a cast or `router.history.push`). Alternatively the API can store a typed shape. Decide this in the spec. Use `<Link to=…>` only if the link is typed. Otherwise use a button that marks the notification read and then navigates (close the popover first).
- Other paths: `/`, `/vehicles`, `/odometer`, `/settings`, `/vehicles/$vehicleId/edit`.

## 5. i18n
- `src/i18n/index.ts`: i18next + react-i18next, single `translation` namespace, `fallbackLng: 'es'`, inline resources.
- Files: `src/i18n/locales/es.json`, `src/i18n/locales/en.json`. Top-level keys are per domain: `app, nav, auth, dashboard, settings, units, locales, weekdays, common, validation, vehicles, odometer, maintenance, schedules`. Add a `notifications` block (e.g. `notifications.title`, `.open` with `{{count}}`, `.empty`, `.markAllRead`, `.error`). Use i18next plurals (`_one`/`_other`) for counts.
- `src/i18n/locales.test.ts` enforces that **es and en have identical key sets**.
- Dates: `useFormat()` in `src/lib/format.ts:197-216` (locale from `i18n.language`). `date(iso)` formats **date-only as UTC `dateStyle: 'medium'`**. There is **no relative-time helper** (no `Intl.RelativeTimeFormat` anywhere). For notification `createdAt` timestamps either add `relative`/`dateTime` to `useFormat` (`Intl.RelativeTimeFormat(locale, { numeric: 'auto' })`) or use a `DateTimeFormat` with time, **not** the UTC date-only formatter. Keep it deterministic in tests (inject `now` or use `vi.useFakeTimers` / fixed dates).
- `useUserLocale()` (`src/features/settings/use-user-locale.ts`) is called in the layout and syncs the language from settings.

## 6. Component testing
- Config: `vitest.config.ts`. Project `unit` covers `*.test.ts` (Node, `src/test/setup-unit.ts`) and project `dom` covers `*.test.tsx` (jsdom, `src/test/setup.ts`). **Both force `es`.** `setup.ts` also handles cleanup, `vi.unstubAllGlobals`, `restoreAllMocks`.
- Tests sit next to the component (`features/<domain>/x.test.tsx`).
- Helpers in `src/test/render.tsx`:
  - `renderWithProviders(ui, { queryClient? })` wraps in QueryClientProvider (fresh client, no retries) and I18nextProvider, and returns `{ user, queryClient, ...render }`. **It does not include a router.**
  - `mockApi({ 'GET /notifications': { body: [...] }, 'POST /notifications/n1/read': { status: 204 } })` stubs global `fetch`. **No MSW.** Unknown routes return 404 problem+json. A function handler can inspect the `Request` or hold it in flight. It returns the `vi.fn` so tests can assert calls (see the `calls()` helper in `features/schedules/schedules-section.test.tsx:78-81`).
- Examples to mimic: `features/schedules/schedules-section.test.tsx` (fixtures factory, `setup()` with `mockApi` + `renderWithProviders`, Spanish text assertions, Toaster/sonner handling L93-96), `features/vehicles/odometer-form.test.tsx`, `components/form-field.test.tsx`.
- **Router in tests:** the bell uses `useNavigate`/`Link`, so it needs a router. The only precedent is `features/settings/use-user-locale.test.tsx:12-21`, which renders the **full app** with `createRouter({ routeTree, context: { queryClient }, history: createMemoryHistory({ initialEntries: [path] }) })` inside `renderWithProviders(<RouterProvider …/>)` and mocks `GET /me`, `GET /vehicles`, `GET /settings`. Two options for the bell:
  1. The full-app pattern: render `/` and assert that clicking a notification ends on the vehicle page (mock `GET /vehicles/v1`, odometer, maintenance, spending and schedules too), or check `router.state.location.pathname`.
  2. A minimal router (`createRootRoute({ component: () => <NotificationBell/> })` + a `/vehicles/$vehicleId` child) for an isolated test. Consider adding a `renderWithRouter` helper to `src/test/render.tsx`.
- ⚠️ Once the layout fetches notifications, `use-user-locale.test.tsx` `renderApp` gets a 404 for `GET /notifications` unless it is added to its mocks. That is harmless with a non-suspense `useQuery` that tolerates errors, but cleaner to add.
- Radix Popover works in jsdom (Dialog is already tested). Query the trigger by role/name, e.g. `getByRole('button', { name: /notificaciones/i })`, and the count via its accessible name or text.

## 7. Polling / refetch
- No `refetchInterval` anywhere. `refetchOnWindowFocus: false` globally (`main.tsx:13`). staleTime precedents: `meQuery` uses 5 min (`features/auth/queries.ts:17`), `client-config.ts:10` uses Infinity.
- Recommendation: the notifications query sets its own `refetchInterval` (e.g. 60 s, since the reminders job is daily) and optionally `refetchOnWindowFocus: true`. Polling stops on logout because `queryClient.clear()` runs (`_app.tsx:39`).
