# Implementación: #11 `persist-user-locale`

Feature `sdd: false`: sin spec; guiada por los `acceptance` de `feature_list.json` (numerados A1–A7).

## Cambios por archivo

| Archivo | Cambio |
|---|---|
| `apps/web/src/i18n/locale.ts` (nuevo) | `pickInitialLocale(stored, browserLanguage)` (pura: localStorage válido según `LOCALES` de `@ikrive/shared` → `en*` del navegador → `'es'`), `getStoredLocale()` y `storeLocale()` con try/catch sobre `localStorage` (clave `ikrive.locale`, mismo patrón que `lib/theme.ts`). `storeLocale` ignora valores no soportados. |
| `apps/web/src/i18n/index.ts` | `lng` = `pickInitialLocale(getStoredLocale(), globalThis.navigator?.language)`. Tras `init` (síncrono con recursos inline) se registra `i18n.on('languageChanged', storeLocale)`: se recuerda cada cambio de idioma posterior, pero no el idioma detectado del navegador (sin valor guardado se sigue el navegador). |
| `apps/web/src/features/settings/use-user-locale.ts` (nuevo) | Hook `useUserLocale()`: lee `settingsQuery` y, en un `useEffect` que depende solo de `settings.locale`, llama a `changeLanguage` únicamente si difiere de `i18n.language` (sin bucles ni cambios innecesarios). |
| `apps/web/src/routes/_app.tsx` | `AppLayout` llama a `useUserLocale()` (único punto de sincronización; el layout ya usa `useTranslation`, así que re-renderiza al cambiar el idioma). Comentario del loader actualizado. |
| `apps/web/src/routes/_app/settings.tsx` | Se quita el `i18n.changeLanguage(saved.locale)`: al guardar, `useUpdateSettings` actualiza la caché de `settingsQuery` y el hook del layout aplica el idioma. El toast usa `i18n.getFixedT(saved.locale)` para salir ya en el idioma nuevo. |
| `apps/web/src/i18n/locale.test.ts` (nuevo) | Unitario de `pickInitialLocale`. |
| `apps/web/src/features/settings/use-user-locale.test.tsx` (nuevo) | Test de componente renderizando la app real (`routeTree` + `createMemoryHistory`) con `renderWithProviders` y `mockApi`. `afterEach`: `changeLanguage('es')` y `localStorage.clear()`. |

Sin cambios en `apps/api` ni en `packages/shared` (solo se importa `LOCALES`).

## Trazabilidad acceptance → evidencia

| # | Acceptance | Evidencia |
|---|---|---|
| A1 | Con sesión, al cargar/recargar se usa el locale de los ajustes aunque el navegador sea otro | `use-user-locale.test.tsx` › «shows the authenticated app in the locale saved in the settings» (i18n en 'es', ajustes 'en' → «Hi, Ana», «Vehicles», «Log out»). Playwright con API simulada y navegador `es-ES`: carga y recarga de `/` en inglés (capturas abajo). |
| A2 | Cambiar idioma en Ajustes y recargar lo mantiene, también en validación y formato | `use-user-locale.test.tsx` › «switches and remembers the language saved in Settings» (toast «Settings saved», nav en inglés, `localStorage` = 'en'). Al recargar aplican A1 y A3. Validación (`i18n/zod.ts`) y `useFormat` leen `i18n.language` en cada uso, así que siguen al idioma aplicado (cubierto en #10 por `i18n/zod.test.ts`). |
| A3 | Último idioma en localStorage (try/catch), usado al arrancar y en login/registro; sin valor, idioma del navegador | `i18n/locale.test.ts` › «uses the locale stored in the browser over the browser language», «falls back to the browser language with …» (null, 'fr', ''), «falls back to Spanish for any other or unknown browser language». Persistencia: aserción `localStorage.getItem('ikrive.locale') === 'en'` en los dos tests de componente. Playwright: `/login` sin sesión con `ikrive.locale=en` → botón «Log in»; sin valor guardado y navegador `es-ES` → «Iniciar sesión» y nada se guarda (`null`). |
| A4 | Sincronización en un único sitio | `useUserLocale()` solo se llama en `routes/_app.tsx`; `settings.tsx` ya no cambia el idioma. `grep changeLanguage apps/web/src` (sin tests): solo `use-user-locale.ts`. Test «keeps the active language when it already matches the settings» comprueba que no se cambia sin necesidad. |
| A5 | No cambia la API ni @ikrive/shared | `git diff --stat` sin rutas en `apps/api` ni `packages/shared`. |
| A6 | Test de componente (es + ajustes en → inglés) y unitario de idioma inicial | Ver A1 y A3. Comprobado que los dos tests de cambio de idioma fallan si se comenta `useUserLocale()` en el layout. |
| A7 | `pnpm harness --full` en verde | Ver salida abajo. |

## `pnpm harness --full`

```
[OK]    11 features: 8 done, 2 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #11 persist-user-locale (in_progress)
[OK]    Rama actual: feat/persist-user-locale
[OK]    pnpm lint
[OK]    pnpm typecheck
packages/shared test:       Tests  11 passed (11)
apps/api test:       Tests  40 passed (40)
apps/web test:       Tests  75 passed (75)
[OK]    pnpm test
[OK]    Arnés en verde.
```

## Verificación visual

Contra el `pnpm dev` del humano (web :5174) con **todas** las rutas `/api/**` interceptadas en Playwright (no se tocó su API ni su BD). Navegador en `es-ES`, ajustes simulados con `locale: 'en'`. Script: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/768dedfa-42fe-43a2-81ef-aac08b975ec5/scratchpad/check-locale.mjs`.

- Claro: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/768dedfa-42fe-43a2-81ef-aac08b975ec5/scratchpad/shots/app-light.png`
- Oscuro: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/768dedfa-42fe-43a2-81ef-aac08b975ec5/scratchpad/shots/app-dark.png`
- Móvil: `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/768dedfa-42fe-43a2-81ef-aac08b975ec5/scratchpad/shots/app-mobile.png`
- Login sin sesión con idioma recordado 'en': `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/768dedfa-42fe-43a2-81ef-aac08b975ec5/scratchpad/shots/login-remembered-en.png`

## Desviaciones

- Ninguna funcional. Decisión menor: el idioma detectado del navegador no se persiste (solo los cambios posteriores a `init`), para que «sin valor guardado se sigue usando el idioma del navegador» siga siendo cierto si el usuario cambia el idioma del navegador.
- Limitación conocida: en la primera carga sin valor guardado puede verse un instante el idioma del navegador hasta que responde `GET /api/settings`; en cargas posteriores ya arranca con el idioma recordado.
