# Explore: notification-channels (web)

## 1. Settings page today
- **Route:** `apps/web/src/routes/_app/settings.tsx:29-32` (`/_app/settings`). Its loader runs `ensureQueryData(settingsQuery)`. There are no tabs. The page is a `div.reveal.grid.gap-8` stack:
  - `PageHeader` (:51)
  - Card "Preferencias": an RHF form using shared `userSettingsSchema`, saved with `useUpdateSettings` (:56-130)
  - Card "Apariencia": theme select, stored in localStorage (:131-155)
- **Nav entry:** `apps/web/src/routes/_app.tsx:29`.
- **Settings queries:** `apps/web/src/features/settings/queries.ts` (`settingsQuery`, `useUpdateSettings`).
- **Where the new section fits:** add a third card `<NotificationChannelsSection/>` after Preferencias (or after Apariencia).
  - Put it in a new feature folder `apps/web/src/features/notification-channels/` with `queries.ts`, `form.ts`, `channel-form.tsx`, `channels-section.tsx` and tests.
  - Prefetch it in the loader next to `settingsQuery`.
  - Wrap it in `<Suspense>` if it uses `useSuspenseQuery`, as `SchedulesSection` does.
- **Existing shared enum:** `packages/shared/src/enums.ts:51-52` already has `NOTIFICATION_CHANNEL_TYPES = ['ntfy','gotify','apprise','webhook']`. There is no channel schema yet in `packages/shared/src/schemas/`.

## 2. Patterns to copy (best model: maintenance schedules)
- **List section** `apps/web/src/features/schedules/schedules-section.tsx`:
  - Card header with title and an "Añadir" button (`variant="accent" size="sm"`, `Plus` icon) (:39-48).
  - Empty state as a muted `<p>` (:50-51).
  - Rows in `<ol className="divide-y">`.
  - `formOpen` / `editing` state with `openForm(item?)` (:30-36).
  - One `ScheduleFormDialog` per section (:65-70).
  - Row actions are ghost icon buttons with `aria-label` from i18n, e.g. `t('schedules.editLabel', {title})` (:129-138).
- **Status badges:** `Badge` variants `status`, `warning`, `danger`, `stamp` (`apps/web/src/components/ui/badge.tsx`). See `STATUS_VARIANT` at `schedules-section.tsx:75-80`.
- **Confirm delete:** `DeleteScheduleDialog` (`schedules-section.tsx:144-186`).
  - Built from `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogTitle`, `AlertDialogDescription`, `DialogFooter`, `AlertDialogCancel` and `AlertDialogAction`, all from `apps/web/src/components/ui/dialog.tsx:35-55`.
  - Runs `mutateAsync` in a try/catch, then `toast.success(t('schedules.deleted'))` or `toast.error(t('common.error'))`.
- **Form dialog** `apps/web/src/features/schedules/schedule-form.tsx`:
  - `Dialog` + `DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto" aria-describedby={undefined}` (:34-41). The inner form is mounted only while open, so each opening starts from fresh values.
  - `useForm<Input, unknown, Output>({ resolver: zodResolver(schema), defaultValues: defaultsFrom(item) })` (:59-62).
  - `field()` / `input()` helpers set `id`, `label`, `error` and `aria-invalid` (:65-74).
  - On submit failure: `form.setError('root', …)`, rendered as `<p role="alert" className="text-sm text-destructive">` (:81-93, :140-144).
  - Footer: `DialogClose` "Cancelar" plus a submit button (:145-154).
- **Form logic** goes in a separate `.ts` file (`apps/web/src/features/schedules/form.ts`):
  - A form schema derived from the shared schema (`createMaintenanceScheduleSchema.shape`).
  - `defaultsFrom()`, `toCreateBody()` and `toUpdateBody()`.
  - Custom refine messages via `i18n.t(...)` (:259-278).
  - For type-specific forms, a discriminated union on `type` plus `useWatch` to switch the fields fits this pattern. No existing example uses `watch`.
- **Data fetching** with TanStack Query v5 (`apps/web/src/features/schedules/queries.ts`):
  - `queryOptions` + `useMutation`, invalidating the key on success (:196-233).
  - Keys are centralised in `apps/web/src/lib/query-keys.ts`. Add e.g. `notificationChannels: { all: ['notification-channels'] }`.
- **API client:** `apps/web/src/lib/api-client.ts`.
  - `api.get/post/patch/put/delete<T>(path)` prefixes `/api`.
  - On a non-OK response it throws `ApiError` carrying an RFC7807 `problem` (`status`, `title`, `detail`).
  - Examples that branch on `problem.status`: `apps/web/src/features/vehicles/odometer-form.tsx:51`, `apps/web/src/features/vehicles/photo-picker.tsx:26`.
- **Toasts:** `sonner` (`toast.success` / `toast.error`). The `<Toaster>` lives in `apps/web/src/routes/__root.tsx:13`.
- **Switch:** none exists. There is no `ui/switch` (ui has badge, button, card, dialog, input, label, popover, select, textarea).
  - The only toggle is a native checkbox at `apps/web/src/features/maintenance/maintenance-form.tsx:222-229` (`className="size-5 cursor-pointer accent-primary"`).
  - `radix-ui` is a dependency, so the spec can add `components/ui/switch.tsx` using Radix Switch (`role="switch"`), or keep a native checkbox.
- **Other components:**
  - `FormField` (`apps/web/src/components/form-field.tsx:11`) takes `id`, `label`, `error`.
  - `Input`, `Select` (native `<select>`), `Textarea`.
- **Date formatting:** `useFormat().dateTime(iso)` (`apps/web/src/lib/format.ts:32`).

## 3. i18n
- **Setup:** `apps/web/src/i18n/index.ts` (i18next + react-i18next, inline resources, `fallbackLng: 'es'`).
- **Locale files:** `apps/web/src/i18n/locales/es.json` and `apps/web/src/i18n/locales/en.json`.
- **Top-level keys:** `app`, `nav`, `auth`, `dashboard`, `settings`, `units`, `locales`, `weekdays`, `common`, `validation`, `vehicles`, `odometer`, `maintenance`, `schedules`, `notifications`.
- **Conventions:**
  - Nested camelCase per feature.
  - `common.{save,cancel,delete,edit,error,loading}`.
  - Feature keys like `schedules.{title,add,edit,empty,created,updated,deleted,editLabel,deleteLabel,deleteTitle,deleteDescription,fields.*,errors.*,status.*}`.
  - Interpolation uses `{{x}}`; plurals use `_one` / `_other`.
  - Enum labels sit under a map keyed by enum value, e.g. `maintenance.categories.<value>`.
- **Suggested keys:** `notificationChannels.*` with `types.{ntfy,gotify,apprise,webhook}`, `fields.*`, `test`, `testOk`, `testFailed`, `lastError`, `enabled`.
- **Tests on the locale files:** `apps/web/src/i18n/locales.test.ts` requires es and en to have identical keys (:13-15). Per-enum label checks exist (:17-24); add one for `NOTIFICATION_CHANNEL_TYPES`.
- **Zod messages:** translated globally through `validation.*` keys (`apps/web/src/i18n/zod.ts`).

## 4. Component tests
- **Vitest projects** (`apps/web/vitest.config.ts`):
  - `unit`: `*.test.ts`, node environment, setup `apps/web/src/test/setup-unit.ts`.
  - `dom`: `*.test.tsx`, jsdom, setup `apps/web/src/test/setup.ts` (forces Spanish, cleanup, unstubs globals).
- **Helpers** in `apps/web/src/test/render.tsx`:
  - `renderWithProviders(ui, {queryClient?})` returns `{user, queryClient, ...}` (:255).
  - `createTestQueryClient()` (:244).
  - `mockApi(routes)` stubs global `fetch` with `{'METHOD /path': {status, body} | (req) => …}`; unknown routes return 404 (:289). MSW is not used.
- **Section example** `apps/web/src/features/schedules/schedules-section.test.tsx`: renders `<Toaster/>` + `<Suspense>` + the section, mocks `GET /settings`, has a `calls(fetchMock, method, path)` helper.
- **Form example:** `apps/web/src/features/schedules/schedule-form.test.tsx`.
- **Full-page example** `apps/web/src/features/settings/settings-page.test.tsx:11-30`: real router with `createMemoryHistory(['/settings'])`; mocks `GET /me`, `GET /notifications`, `GET /settings` — add the channels GET once the section exists.
- **Pure logic:** `form.test.ts` in the unit project.

## 5. In-app notifications UI
- `apps/web/src/features/notifications/notification-bell.tsx`: Popover with unread badge and list, `useQuery` without suspense, polling every 60s; mounted at `apps/web/src/routes/_app.tsx:68`.
- Queries: `apps/web/src/features/notifications/queries.ts`; keys `queryKeys.notifications.*`; i18n `notifications.*`.
- Unaffected by this feature. Its loading / error (`role="alert"`) / empty states are a model if the channels section avoids suspense.
- Shared schema: `packages/shared/src/schemas/notifications.ts`.
