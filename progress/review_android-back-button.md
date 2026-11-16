# Review — #74 android-back-button

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests
- R1: [x] `apps/web/src/features/mobile/back-button-handler.test.tsx:138` › `closes an open dialog without changing the route` y `:151` › `closes an open menu without changing the route`. Usan `Dialog` y `DropdownMenu` reales de `components/ui`. Comprueban que la capa desaparece (`queryByRole('dialog'|'menu')`), que la ruta sigue siendo `/vehicles/v1` y que no se llama a `minimizeApp`. A nivel unitario, `back-button.test.ts:26` (`closeTopLayer` vale `true` solo si un listener en captura hace `preventDefault`) y `:53` (la capa tiene prioridad sobre navegar, también en la raíz y sin historial).
- R2: [x] `back-button-handler.test.tsx:163` › `keeps the route and the app when the dialog refuses to close`. Usa un `Dialog` real con `onEscapeKeyDown` que hace `preventDefault`. Tras dos pulsaciones, el diálogo sigue abierto, la ruta no cambia y `minimizeApp` no se llama.
- R3: [x] `back-button-handler.test.tsx:176` › `goes back to the previous screen`. Con historial `/`, `/vehicles`, `/vehicles/v1`, dos pulsaciones llevan a `/vehicles` y después a `/`: se comprueba el heading y el `pathname`. A nivel unitario, `back-button.test.ts:61`, que también cubre `/server` y `/register`.
- R4: [x] `back-button-handler.test.tsx:190`, `:201` y `:211` (`/`, `/welcome` y `/login` con `canGoBack() === true`, afirmado). En los tres casos se comprueba `minimizeApp` ×1 y que la ruta no cambia. También `back-button.test.ts:67` y `:72`, y `lib/native-back-button.test.ts:37`, que verifica la delegación en `App.minimizeApp` y la propagación del error.
- R5: [x] `back-button-handler.test.tsx:223` › `minimizes without history outside the root screens` (`/vehicles/v1` como única entrada: `minimizeApp` ×1 y la ruta se mantiene). Unitario: `back-button.test.ts:76`.
- R6: [x] `back-button-handler.test.tsx:233` › `behaves the same in local mode`. Con `MODE=native` y `MODE_KEY=local`, recorre capa → atrás → al fondo y afirma cada paso. Además, `resolveBack` no recibe el modo, por diseño.
- R7: [x] `back-button-handler.test.tsx:253` (`stop` ×1 al desmontar) y `:262`, que simula una suscripción pendiente: desmonta, resuelve y comprueba `stop` ×1 y que el listener queda en `null`. También `lib/native-back-button.test.ts:16`, donde `addListener('backButton')` se llama dos veces sin que `remove` se invoque, y `stop()` lo invoca ×1.
- R8: [x] `back-button-handler.test.tsx:127` › `web: never loads the native back button module`. Monta la app real con `renderApp('/login')` sin `MODE=native` y comprueba que la factoría del mock no se ha evaluado (`loaded === false`) y que `onBackButton` no se ha llamado.
- R9: [x] `apps/mobile/test/config.test.mjs:52`: `@capacitor/app` está en la lista obligatoria con la misma versión. El diff de `capacitor.settings.gradle` y de `app/capacitor.build.gradle` incluye `:capacitor-app`. Las dos `package.json` fijan `8.1.2` exacta.
- R10: [x] `apps/web/src/features/pwa/native-only.test.ts:88` › `sends the back button module and @capacitor/app to assets/native/`. Lo complementan los tests genéricos de cobertura y de import estático, además de la comprobación de build descrita en T9.

## Tasks
- T1..T10: [x]

## Checkpoints
- C1: [x] `pnpm harness --full` en verde (lo he ejecutado yo: web 575/575, api 370/370). Solo #74 está `in_progress` y la rama es `feat/android-back-button`.
- C2: [x] Están `requirements.md` (EARS, un `DEBE` por requirement, tabla que cubre todos los `acceptance`), `design.md` y `tasks.md` con todo en `[x]`. He abierto y leído los tests de cada `R<n>`.
- C3: [x] El diff toca exactamente los archivos de la tabla de `design.md`, más `pnpm-lock.yaml`, `native-only.test.ts` (previsto en T2) y `progress/`. No hay refactors ajenos.
- C4: [x] El código está en `features/mobile/` y el módulo nativo en `lib/native-*.ts`, cargado solo por `import()` y cubierto por `NATIVE_ONLY_MODULES`. No hay textos nuevos, así que no aplica i18n. Tampoco hay cambios de API ni de BD.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs. Los `catch` vacíos llevan comentario y siguen el design (los errores se ignoran).
- C6: [x] Los tests afirman resultados concretos (ruta, visibilidad, llamadas) con primitivas Radix reales. Sin capturas: la feature no tiene impacto visible (`design.md` › Impacto en UI).
- C7: [x] `progress/impl_android-back-button.md` incluye archivos, el mapa `R<n> → test`, la salida de la verificación y la checklist manual. `progress/current.md` está actualizado. La feature no cierra la fase 8 (quedan #67, #68, #71, #73, #75 y #76 pendientes), así que `docs/PLAN.md` no requiere cambios.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- **Checklist manual en el dispositivo pendiente.** Los 9 pasos de `progress/impl_android-back-button.md` hay que ejecutarlos con el APK antes de Gate 2. Los tests no pueden verificar el comportamiento real de `backButton` ni el de `minimizeApp` en Android.
- **El test de R8 depende del orden de ejecución.** Tiene que correr el primero del archivo, porque después la caché de módulos deja `loaded` en `true`. El propio test lo documenta en un comentario. Si alguien reordena el archivo o activa `sequence.shuffle`, el test seguiría pasando sin comprobar nada útil.
- **Docker (nivel 6 de `docs/verification.md`) no se ha comprobado.** La feature añade una dependencia a `apps/web`. Sigue el mismo patrón que los otros plugins Capacitor, que ya se empaquetan sin problemas, pero conviene comprobar `docker build` en CI.
- **Efecto de `closeTopLayer` fuera de Radix.** El `keydown` Escape sintético también lo recibe cualquier otro listener de Escape que haya en la página. Hoy no hay ninguno que haga `preventDefault` fuera de Radix. Si en el futuro se añade uno (por ejemplo, un buscador con Escape), atrás quedaría «consumido» en esa pantalla.

## Cambios requeridos
Ninguno.
