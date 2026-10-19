# Review — #11 persist-user-locale

**Veredicto:** APPROVED

Feature `sdd: false`: sin `specs/`; se juzga contra los `acceptance` (A1–A7) de `feature_list.json`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ tests
- A1: [x] `apps/web/src/features/settings/use-user-locale.test.tsx` › `shows the authenticated app in the locale saved in the settings`: con i18n en `es` (afirmado al inicio) y `GET /settings` con `locale: 'en'`, renderiza el `routeTree` real y comprueba «Hi, Ana», el enlace «Vehicles», «Log out», `i18n.language === 'en'` y `localStorage['ikrive.locale'] === 'en'`. La sincronización está en el layout `_app`, así que cubre toda la zona autenticada.
- A2: [x] `use-user-locale.test.tsx` › `switches and remembers the language saved in Settings`: guarda `en` en Ajustes y comprueba el toast «Settings saved», la navegación en inglés y el valor en localStorage. Al recargar aplican A1/A3. Los mensajes de validación (`i18n/zod.ts`, de #10) y `useFormat` (`lib/format.ts:16`) leen `i18n.language` en cada uso, así que siguen al idioma aplicado.
- A3: [x] `apps/web/src/i18n/locale.test.ts` › `pickInitialLocale`: valor guardado sobre el del navegador, vuelta al navegador con `null`, `'fr'` y `''`, y vuelta a `es` con un idioma desconocido o `undefined`. `getStoredLocale`/`storeLocale` usan try/catch y `storeLocale` descarta valores no soportados (`isLocale` contra `LOCALES`). `login`/`register` cargan `@/i18n`, que arranca con el valor guardado (capturas `login-remembered-en.png`).
- A4: [x] `useUserLocale()` solo se llama en `routes/_app.tsx`. `settings.tsx` deja de llamar a `changeLanguage`. Fuera de los tests, el único `changeLanguage` está en `use-user-locale.ts:17`.
- A5: [x] El diff no toca `apps/api` ni `packages/shared` (solo se importa `LOCALES`).
- A6: [x] Test de componente (es + ajustes en → inglés) y test unitario de `pickInitialLocale`, ver A1 y A3.
- A7: [x] `pnpm harness --full` en verde (shared 11, api 40, web 75).

## Comprobaciones pedidas
- Al recargar con sesión, el locale de los ajustes se aplica en toda la zona autenticada: sí, porque el hook va en `AppLayout`, que envuelve todas las rutas `/_app/*`.
- No hay bucles ni cambios de idioma espurios. El efecto depende solo de `settings.locale` y no cambia nada si coincide con `i18n.language`. Con `languageChanged` solo se escribe en localStorage, que no realimenta la query. Al guardar en Ajustes, `useUpdateSettings` hace `setQueryData` y el hook aplica el idioma una sola vez. Si se vuelven a pedir los ajustes y el locale es el mismo, no hay cambio. Si el PATCH falla, no hay cambio. El test `keeps the active language when it already matches the settings` cubre el caso «sin cambio».
- localStorage se lee y escribe con try/catch y el valor se valida tanto al leer (`pickInitialLocale`) como al escribir (`storeLocale`).
- Login y registro usan el último idioma: sí, porque el `lng` inicial sale de localStorage. Al cerrar sesión el valor se conserva, que es lo esperado.
- La API y `@ikrive/shared` no cambian.

## Tasks
- No aplica: sin `tasks.md` (`sdd: false`).

## Checkpoints
- C1: [x] Arnés en verde, una sola feature activa (#11 `in_progress`), rama `feat/persist-user-locale`.
- C2: [x] No aplica (sin spec, `sdd: false`). En su lugar, cada acceptance tiene evidencia concreta (ver arriba).
- C3: [x] El diff se limita a i18n y a la sincronización de los ajustes, más `progress/`. No hay refactors ajenos.
- C4: [x] Web: el hook está en `features/settings/` y reutiliza `settingsQuery` (`queryOptions`). No hay textos nuevos. No hay cambios de API ni de BD.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs. No hay fechas, kilometrajes ni ficheros implicados.
- C6: [x] `pnpm harness --full` en verde. Los tests afirman resultados concretos. Capturas en claro, oscuro, móvil y login referenciadas en el informe.
- C7: [x] `progress/impl_persist-user-locale.md` incluye archivos, mapa acceptance → evidencia y la salida del arnés. `progress/current.md` refleja la sesión. `docs/PLAN.md` no necesita cambios.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- En la primera carga sin valor en localStorage, si los ajustes tienen otro idioma, se ve un instante el idioma del navegador hasta que responde `GET /api/settings`. Está documentado en el informe y es aceptable según A3.
- El try/catch de `getStoredLocale`/`storeLocale` (almacenamiento no disponible) no tiene test propio. A6 solo exige el test de la elección inicial.
- `apps/web/src/test/setup.ts` llama a `changeLanguage('es')`, lo que ahora escribe `ikrive.locale` en el localStorage de jsdom de cada fichero de test. Hoy es inocuo porque `use-user-locale.test.tsx` limpia en `afterEach`, pero conviene tenerlo en cuenta si un test futuro afirma que el valor está vacío.

## Cambios requeridos
Ninguno.
