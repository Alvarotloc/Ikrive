# Review — #10 localize-zod-messages

**Veredicto:** APPROVED

Feature con `"sdd": false`: no hay `specs/`, se juzga contra los `acceptance` de `feature_list.json` (A1–A7, en orden), `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ tests
- A1: [x] Configuración global en `apps/web/src/i18n/zod.ts` (`z.config({ customError })`). Afecta a todos los `zodResolver` de la web, que he localizado con grep: `routes/login.tsx`, `routes/register.tsx`, `routes/_app/settings.tsx` (`userSettingsSchema` de shared), `features/vehicles/vehicle-form.tsx`, `features/vehicles/odometer-form.tsx` y `features/maintenance/maintenance-form.tsx` (esquema derivado de shared). He revisado cada esquema contra el mapa: todos los issues que pueden salir (`invalid_type` vacío/NaN/int, `too_small`/`too_big` de texto y número, `invalid_format` email/date, `invalid_value` de enum, `length(3)` de la moneda) tienen clave propia. `apps/web/src/i18n/zod.test.ts` › `translates %s into Spanish` (14 casos con el texto exacto) y `follows the active language without reconfiguring zod` (inglés, con el número formateado en `en`). `maintenance-form.test.tsx` › `shows field errors without calling the API when the form is invalid` ahora afirma los textos exactos en español. Hay capturas del registro en es y en.
- A2: [x] `apps/web/src/features/vehicles/odometer-form.test.tsx` › `shows the empty-field error in the active language, also after switching it`: mismo formulario montado, envío vacío → «Este campo es obligatorio.», `changeLanguage('en')` → nuevo envío → «This field is required.», y además comprueba que no se ha hecho ningún POST. El `customError` lee `i18n.t` y `i18n.language` cada vez que valida, así que no hace falta listener.
- A3: [x] La sección `validation` tiene las mismas claves en `es.json` y `en.json`, y `locales.test.ts` comprueba la paridad. No hay fallback a los mensajes de zod: cualquier issue que no esté en el mapa da `validation.invalid` (`zod.test.ts` › caso `any other issue`). No quedan `message:` literales en los esquemas web.
- A4: [x] Todo está en `apps/web/src/i18n/zod.ts` y se invoca una sola vez desde `apps/web/src/i18n/index.ts`, que importan tanto `main.tsx` como el setup de tests. Ningún formulario cambia.
- A5: [x] El diff no toca `packages/` ni `apps/api/`. Comprobado con `git diff main...HEAD --stat` (solo `feature_list.json`) y con `git status`. La API corre en su propio proceso y no carga `z.config`, así que sus mensajes no cambian. `zod.test.ts` › `applies to the @ikrive/shared schemas too` verifica que los esquemas compartidos se traducen sin modificarlos.
- A6: [x] Es el mismo test de A2, sobre `OdometerForm`: campo obligatorio vacío en español y en inglés después de cambiar el idioma.
- A7: [x] He ejecutado `pnpm harness --full`: lint, typecheck y tests en verde (api 40/40, web 67/67).

## Tasks
- No aplica (sin `tasks.md`, `sdd: false`).

## Checkpoints
- C1: [x] Harness en verde. Solo #10 está activa. La rama es `feat/localize-zod-messages`.
- C2: [x] Por la excepción `sdd: false` no hay spec. La trazabilidad se hace contra los acceptance, todos cubiertos con tests leídos (ver arriba).
- C3: [x] El diff se limita a `apps/web/src/i18n/*`, dos tests de formularios y `progress/`. No hay refactors ni cambios de otras features.
- C4: [x] La API no cambia. En la web, los textos están en `es.json` y `en.json` y la configuración vive en un único sitio dentro de `i18n/`. No se añade lógica de dominio.
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs. El tipo `Issue` se deriva de `z.core.$ZodErrorMap`.
- C6: [x] Harness completo en verde. Los tests afirman textos exactos. Hay capturas en claro (es), oscuro (en) y móvil (es); he revisado la de claro y muestra los tres mensajes en español.
- C7: [x] `progress/impl_localize-zod-messages.md` incluye los archivos tocados, el mapa de acceptance → test y la salida de la verificación. `progress/current.md` está actualizado. `docs/PLAN.md` no cambia (no hay cambio de decisión ni cierre de fase).

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
1. `apps/web/src/features/vehicles/vehicle-form.tsx:28`: `purchaseDate` es `z.union([z.literal(''), z.iso.date()])`. Con una fecha inválida zod lanza `invalid_union`, que cae en el mensaje genérico «El valor no es válido.» en lugar de «Introduce una fecha válida.». Sale en español, así que no incumple nada. Con `<input type="date">` además es casi imposible de provocar.
2. Ajustes, moneda vacía: `length(3)` muestra «Debe tener exactamente 3 caracteres.» y no «Este campo es obligatorio.». Es razonable.
3. Al cambiar de idioma, un error que ya está en pantalla conserva su texto hasta la siguiente validación (con `reValidateMode` por defecto, al editar el campo o al reenviar). Cumple A2, que habla de los mensajes «siguientes».
4. `Intl.NumberFormat` con `useGrouping: 'min2'` requiere navegadores de 2023 o posteriores. En los más antiguos el valor cuenta como `true` y simplemente agrupa también los números de 4 cifras (p. ej. «1.886»), sin romper nada.
5. Las capturas están en el scratchpad de la sesión (`/tmp/...`), que es efímero. Si se quieren conservar, habría que copiarlas al repo.
6. Los textos en español me parecen naturales para un usuario final («Este campo es obligatorio.», «Introduce un número válido.», «No puede superar los 60 caracteres.», «El valor máximo es 9.999.999.»).

## Cambios requeridos
Ninguno.
