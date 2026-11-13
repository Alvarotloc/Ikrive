# Explore: mobile side of mobile-local-mode (#54)

## 1. Mobile app today
- `apps/mobile` is only a Capacitor 8 shell around the SPA built with `vite build --mode native --outDir dist-native` (`isNativeApp()` in `apps/web/src/lib/platform.ts`). No build/typecheck script on purpose (no Android SDK in CI/harness/Docker).
- Plugins (exact versions): core/android 8.6.0, filesystem 8.1.5, local-notifications 8.3.1, share 8.0.3, community file-opener 8.0.1, `@ebarooni/capacitor-calendar` 8.10.0. Same packages listed in `apps/web/package.json`.
- `capacitor.config.json`: appId `com.ikrive.app`, webDir `../web/dist-native`, androidScheme https.
- Specs: `specs/{mobile-shell-android,mobile-auth-api,web-api-base-url,mobile-native-files,mobile-native-calendar-notifications}/`; user docs `docs/mobile.md`.
- Server selection (`apps/web/src/lib/server.ts`): localStorage `ikrive.serverUrl`, `ikrive.sessionToken`; `apiFetch` same-origin+cookie or `<server>/api` + Bearer.
- Mode screen exists: `apps/web/src/routes/welcome.tsx` — «Mi servidor» → `/server`; «En este teléfono» disabled with `mobile.welcome.comingSoon` badge (spec'd in `specs/mobile-shell-android/requirements.md:29`).
- `apps/web/src/features/mobile/`: `check-server.ts`, `use-change-server.ts`, `require-server.ts` (`requireServer()` beforeLoad of `_app`, `/login`, `/register` → `/welcome` when native without server; `requireNative()`), `server-link.tsx`.
- Only mode signal today: `getServerUrl() !== null`. Local mode needs a persisted flag (e.g. `ikrive.mode = 'server' | 'local'`), and `requireServer` / `_app` `meQuery` must accept it.
- Native helpers to reuse: `lib/native-files.ts` (`saveFile`, `openFile`, `blobToBase64`, `safeFileName`), `lib/native-notifications.ts`, `lib/native-calendar.ts`.
- Deferred to #54 in `progress/explore_web-data-layer_rules.md`: import doc builder (#17), export doc builder (#18), `sanitizeFileName` (#19), local schema/migrations/FK cascades/transactions (#3, #20).

## 2. On-device SQLite
- No on-device SQLite plugin installed. Only `better-sqlite3` in `apps/api`; drizzle-orm 0.45.4 / drizzle-kit 0.31.11 only in api.
- `apps/api/src/db/client.ts`: better-sqlite3, `casing: 'snake_case'`, WAL, `foreign_keys=ON`; node migrator.
- `apps/api/src/db/schema/*.ts` (12 files) import only `drizzle-orm/sqlite-core` + shared enums → browser-safe, movable to a shared package. Caveat: nearly every table FKs to `user.id` → local mode needs a synthetic user row or a stripped schema.
- Migrations `0000_init.sql`…`0012_data_imports.sql` include Better Auth tables.
- API repositories are sync-only (~104 `.all/.get/.run`, sync `db.transaction`) and services depend on node fs, sharp, PDF libs → not reusable; only schema, shared domain rules and zod schemas carry over.
- Options (from general knowledge, unverified for Capacitor 8):
  - A. `@capacitor-community/sqlite` — native SQLite, optional SQLCipher, rows as objects (sqlite-proxy needs arrays; alias duplicate column names). Check Capacitor 8 support.
  - B. `@capawesome-team/capacitor-sqlite` — likely sponsorware; licence check.
  - C. WASM SQLite in WebView (sql.js / wa-sqlite / official + OPFS) — no Android code, easy vitest; durability/eviction risk.
- Drizzle on device: `drizzle-orm/sqlite-proxy` with A (async; transactions via begin/commit through proxy → serialize access). `sqlite-proxy/migrator` uses `node:fs` → bundle migrations via `import.meta.glob('?raw')` + `_journal.json`, split on `--> statement-breakpoint`. `drizzle-orm/sql-js` with C is sync but persisting = exporting whole DB per write.
- Recommended: move schema to a shared package, new async local `DataSource` reusing `@ikrive/shared`, bundle migrations with Vite, decide on Better Auth tables / user FK.

## 3. PLAN phase 8, stage 2 (docs/PLAN.md 205–234)
- Two modes on first screen; staged, each stage releasable.
- Stage 1 (#49–#52) done; #53 done.
- Decisions 2026-11-12: reminders/km nudge computed on open/foreground with shared pure functions, stored in local inbox, shown with #52 local notifications. Local mode hides report share link and iCal feed; PDF download and native «Añadir al calendario» stay. No server → phone migration; only local → server via zip.

## Open points
- PDF report generation on the client.
- Image processing (thumbnails) substitute or skip; blobs in Filesystem `Directory.Data`, local URLs resolved in `files.get`.
- Client-side zip + export doc builder.
- Synthetic `me()`; hide admin, channels, calendar feed, report shares; local branch in `requireServer`, `_app`, `/login`, `/register`; enable welcome tile.
