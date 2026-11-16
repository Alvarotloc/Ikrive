# Design — android-back-button

Solo web y proyecto Android. Sin cambios en API, BD ni `packages/shared`.

## Contexto investigado

- **Capas.** Todos los diálogos, hojas, menús y popovers son Radix (`components/ui/{dialog,sheet,dropdown-menu,popover}.tsx`; `Sheet` es un `Dialog`). No hay overlays con estado propio fuera de Radix (`AttachmentViewer` es un `Dialog` apilado). `Select` es un `<select>` nativo: su selector lo cierra Android antes de que llegue el evento.
- **Escape en Radix** (`@radix-ui/react-dismissable-layer` 1.2.1): solo la capa más alta escucha `keydown` en `document` (captura); con `key === 'Escape'` llama a `onEscapeKeyDown` y, si nadie hizo `preventDefault`, hace `event.preventDefault()` y se cierra. Los formularios que no deben cerrarse mientras guardan (`fuel-log-form.tsx`, `maintenance-form.tsx`) hacen `preventDefault` en `onEscapeKeyDown`. Por tanto **`dispatchEvent` de un `keydown` Escape cancelable devuelve `false` si y solo si hay una capa abierta** (se haya cerrado o haya rehusado cerrarse). No hace falta registro de capas.
- **Native-only.** `isNativeApp()` (`lib/platform.ts`) es un flag de build. El código nativo vive en `lib/native-*.ts`, solo se carga con `import()` tras `isNativeApp()`, y `NATIVE_ONLY_MODULES` (`features/pwa/config.ts`) lo manda a `assets/native/`, excluido del precache (`globIgnores`). `native-only.test.ts` falla si un `lib/native-*.ts` o una dependencia de `apps/mobile` no está cubierta, o si se importa estáticamente. `apps/mobile/test/config.test.mjs` exige las mismas versiones en web y mobile. Los `.gradle` de Capacitor están versionados y se regeneran con `cap sync android`.
- **Patrón de listener nativo:** `NotificationTapHandler` (montado en `routes/__root.tsx` con `isNativeApp() &&`) + `onNotificationTap` en `lib/native-notifications.ts`, que devuelve la función para quitar el listener; maneja el doble efecto de StrictMode con `active`.
- **Pantallas raíz.** Modo servidor y modo local entran por `/` (panel, `routes/_app/index.tsx`); sin modo elegido, `/` redirige a `/welcome`. Los redirects de TanStack Router usan `replace`, así que no dejan entradas intermedias. En modo servidor sin sesión todo acaba en `/login` (`useLogout` y `useChangeServer` hacen `navigate({ to: '/login' })` sin `replace`), por eso `/login` también es raíz (pedido en Gate 1). `router.history.canGoBack()` (`@tanstack/history`, por `__TSR_index`) dice si hay entrada anterior, también con `createMemoryHistory` en tests.
- **`@capacitor/app` 8.1.2** (última 8.x, peer `@capacitor/core >=8`). Con un listener de `backButton` registrado, el plugin desactiva el comportamiento por defecto: la app decide todo, salir incluido.

## Archivos

| Capa | Archivo | Cambio |
|---|---|---|
| Dependencias | `apps/web/package.json`, `apps/mobile/package.json` | `"@capacitor/app": "8.1.2"` en `dependencies`. |
| Android | `apps/mobile/android/capacitor.settings.gradle`, `apps/mobile/android/app/capacitor.build.gradle` | Regenerados con `pnpm --filter @ikrive/mobile exec cap sync android`. |
| Test mobile | `apps/mobile/test/config.test.mjs` | `@capacitor/app` en la lista obligatoria de `declares the web's Capacitor plugins with the same versions`. |
| Native-only | `apps/web/src/features/pwa/config.ts` | Añadir `back-button` a la regex de `NATIVE_ONLY_MODULES`: `native-(files\|calendar\|notifications\|sqlite\|storage\|back-button)`. |
| Módulo nativo | `apps/web/src/lib/native-back-button.ts` (nuevo) | Envoltorio fino de `App`. |
| Lógica | `apps/web/src/features/mobile/back-button.ts` (nuevo) | Puro, sin Capacitor. |
| Montaje | `apps/web/src/features/mobile/back-button-handler.tsx` (nuevo) | Componente sin render. |
| Ruta raíz | `apps/web/src/routes/__root.tsx` | `{isNativeApp() && <BackButtonHandler />}` junto a `NotificationTapHandler`. |

Sin textos nuevos (sin i18n).

## Tipos y firmas

```ts
// lib/native-back-button.ts — solo por import() en la app nativa
/** Llama a `listener` en cada pulsación de atrás; resuelve a la función que deja de escuchar. */
export function onBackButton(listener: () => void): Promise<() => Promise<void>>;
/** `App.minimizeApp()`: manda la app al fondo (Android `moveTaskToBack`). */
export function minimizeApp(): Promise<void>;

// features/mobile/back-button.ts
export const ROOT_PATHS: ReadonlySet<string>; // new Set(['/', '/welcome', '/login'])

/** Envía un keydown Escape cancelable al elemento con foco (o a body); true si una capa de Radix lo tomó. */
export function closeTopLayer(doc?: Document): boolean;

export type BackAction = 'layer' | 'back' | 'minimize';
export interface BackContext {
  closeTopLayer(): boolean;
  pathname: string;
  canGoBack: boolean;
}
/** Decide y aplica: capa → back (si no es raíz y hay historial) → minimize. No ejecuta efectos nativos. */
export function resolveBack(ctx: BackContext): BackAction;
```

`BackButtonHandler` (patrón de `NotificationTapHandler`): `useRouter()`; en el efecto, `import('@/lib/native-back-button')`, `onBackButton(() => { const action = resolveBack({ closeTopLayer, pathname: router.state.location.pathname, canGoBack: router.history.canGoBack() }); if (action === 'back') router.history.back(); else if (action === 'minimize') void native.minimizeApp().catch(() => {}); })`. Guarda `stop` con el flag `active`; en el cleanup lo llama (si el desmontaje llega antes, lo llama al resolver). Errores del `import()`/plugin se ignoran (atrás vuelve al comportamiento por defecto de Capacitor).

`closeTopLayer` construye `new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })` y devuelve `!target.dispatchEvent(event)`. Radix escucha en captura en `document`, así que lo recibe sea cual sea el target.

## Salir o mandar al fondo: `minimizeApp`

Se elige **`App.minimizeApp()`**:

- Es lo que hace Android desde la versión 12 con atrás en la actividad raíz de una app: la tarea va al fondo, no se destruye. Es «como cualquier app Android».
- Al volver, la app sigue donde estaba: no repite el arranque (abrir y migrar la SQLite del modo local, `ensureQueryData` de la sesión, caché de React Query) y no se pierde un formulario.
- `exitApp()` termina la actividad: el siguiente arranque es en frío y, si el usuario volvía rápido, parece que la app «se cierra sola», que es justo el fallo que se reporta.

## Impacto en UI

Ninguno visible. En la web y la PWA no se monta nada (R8). Escritorio, modo oscuro y móvil web sin cambios.

## Tests

- `features/mobile/back-button.test.ts` (unitario, jsdom): `resolveBack` con contextos fabricados y `closeTopLayer` con un listener de `keydown` en captura que hace o no `preventDefault`.
- `features/mobile/back-button-handler.test.tsx` (componente): `vi.mock('@/lib/native-back-button')` con un plugin simulado que guarda el listener (como `notification-tap-handler.test.tsx`) y `minimizeApp: vi.fn()`; router en memoria con rutas `/`, `/welcome`, `/login`, `/vehicles`, `/vehicles/$id` y una página con un `Dialog` y un `DropdownMenu` **reales** de `components/ui` (y un `Dialog` cuyo `onEscapeKeyDown` hace `preventDefault`). Pulsar atrás = llamar al listener guardado. Se afirma la ruta (`router.state.location.pathname`), lo visible (`queryByRole('dialog')`, `queryByRole('menu')`) y las llamadas a `minimizeApp`.
- `features/pwa/native-only.test.ts` ya cubre R10 al existir `lib/native-back-button.ts` y `@capacitor/app` en `apps/mobile`; además se añade una aserción explícita para el nuevo módulo y el paquete.
- R8 con `renderApp('/login')` sin `MODE=native` y un flag `loaded` en el mock (patrón de `settings-page.test.tsx`).

## Checklist manual en el dispositivo (antes de Gate 2)

APK debug (artefacto `ikrive-debug-apk` del CI de la rama o `build:web` + `cap sync` + `gradlew assembleDebug`). Con botón y con gesto atrás:

1. Primera ejecución (`/welcome`): atrás manda la app al fondo; al volver, sigue en `/welcome`.
2. «Mi servidor» → `/server`: atrás vuelve a `/welcome`. Conectar → `/login`: atrás manda al fondo (no vuelve a `/server`); «Cambiar servidor» lleva a `/server`.
3. Login → panel: atrás en el panel manda al fondo (no vuelve al login).
4. Panel → vehículo → «Cerrar sesión» → `/login`: atrás manda la app al fondo a la primera pulsación (no recorre las pantallas de la sesión); al volver, sigue en `/login`.
5. Panel → vehículo → editar: atrás, atrás vuelven a vehículo y panel.
6. Menú móvil (hoja) abierto: atrás lo cierra sin navegar. Igual con el menú «Añadir al calendario», un `InfoPopover`, el diálogo de un repostaje y el visor de una factura sobre el diálogo de facturas (cierra solo el visor).
7. Formulario guardando (subida de factura): atrás no hace nada.
8. Modo local: repetir 3, 5 y 6 (el panel es la raíz) y «Cambiar de modo» → `/welcome` → atrás manda al fondo.
9. Abrir la app desde una notificación con enlace a un vehículo: atrás vuelve al panel si hay historial; si no, manda al fondo.

## Alternativas descartadas

- **Registro de capas propio** (contexto React o pila global que cada `DialogContent`/`SheetContent`/menú registra con su `onOpenChange`). Duplica lo que Radix ya sabe (qué capa es la más alta, apilado del visor sobre el diálogo, formularios que rehúsan cerrarse) y obliga a tocar cada primitiva y cada uso controlado. El Escape sintético reutiliza exactamente el camino del teclado, ya probado en la web.
- **Consultar el DOM** (`[role=dialog][data-state=open]`, `[data-radix-popper-content-wrapper]`) y luego Escape: dos fuentes de verdad; con `dispatchEvent` el propio valor de retorno ya dice si había capa.
- **Usar `canGoBack` del evento (historial del WebView) y `window.history.back()`**: equivalente hoy, pero el router es la fuente de las rutas y `router.history.canGoBack()` se prueba con historial en memoria sin simular el WebView.
- **`App.exitApp()`** en la raíz: ver la sección anterior.

## Decisiones a validar (Gate 1)

1. **Mandar al fondo (`minimizeApp`) en vez de salir (`exitApp`)** en `/`, `/welcome` y `/login`, y también fuera de la raíz sin historial (R5): sin listener Capacitor cerraría, pero con listener la pulsación no haría nada.
2. **`/login` es raíz; `/server` y `/register` no** (resuelto en Gate 1): atrás en `/login` manda al fondo siempre. Así, tras «Cerrar sesión» o «Cambiar de servidor», atrás no recorre las pantallas de la sesión anterior (que redirigirían con `replace` otra vez a `/login`, haciendo falta varias pulsaciones). `navigate({ replace: true })` al cerrar sesión no bastaría: solo reemplaza la entrada actual, y las anteriores de la sesión (panel, vehículo…) seguirían en el historial. Consecuencia: atrás desde `/login` ya no vuelve a `/server`; para cambiar de servidor o de modo está el enlace «Cambiar servidor» de `ServerLink` (`features/mobile/server-link.tsx`, en `/login` de la app nativa; siempre visible porque `requireServer` manda a `/welcome` si no hay servidor), que lleva a `/server`, y desde ahí el enlace «Volver» a `/welcome`. `/register` no es raíz: atrás vuelve a `/login`.
3. **Capa que rehúsa cerrarse consume atrás** (R2): coherente con Escape mientras se guarda; no se navega con un guardado en curso.

## Riesgos

- Si Radix cambia cómo trata Escape (dejar de hacer `preventDefault`), R1 se rompería en silencio: los tests usan las primitivas reales de `components/ui`, así que lo detectarían.
- Una pulsación antes de que termine el `import()` del módulo nativo usa el comportamiento por defecto de Capacitor (`webView.goBack()` o cerrar). Ventana de milisegundos en el arranque.
- Atrás en `/login` ya no lleva a `/server`: si el usuario lo esperaba, el único camino es el enlace «Cambiar servidor» de `ServerLink` (existe; se comprueba en la checklist, paso 2).
- El teclado en pantalla y los selectores nativos consumen atrás en Android antes que el WebView: comportamiento esperado.

## Fuera de alcance

- iOS (sin botón atrás) y el gesto de deslizar del navegador en la PWA.
- Cambiar la navegación de logout/cambio de servidor (`replace`): innecesario con `/login` como raíz.
- Confirmación «pulsa otra vez para salir».
- Documentación de usuario: el comportamiento es el estándar de Android.
