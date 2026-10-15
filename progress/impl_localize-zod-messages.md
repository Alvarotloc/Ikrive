# Implementación: #10 `localize-zod-messages` (`sdd: false`)

Guiada por los `acceptance` de `feature_list.json`, numerados A1–A7 en el orden en que aparecen.

## Decisión de diseño

Se usa un **`customError` global propio** (`z.config({ customError })`) con claves `validation.*` en `es.json`/`en.json`. No se usan los locales incluidos en zod (`z.locales.es()`/`en()`), por tres motivos:

1. **Textos técnicos.** El locale `es` de zod da cosas como «Demasiado pequeño: se esperaba que texto tuviera >=1 caracteres» o «Entrada inválida: se esperaba número, recibido nulo» para los casos más comunes (campo vacío, número mal escrito).
2. **Coherencia.** Así todos los mensajes viven en los JSON de i18next, igual que el resto de textos de la UI, y el test de paridad de claves de `locales.test.ts` cubre también los nuevos.
3. **Tamaño del bundle.** `z.locales` reexporta los ~50 locales.

**Sin listener de `languageChanged`.** El `customError` se llama cada vez que se valida y lee `i18n.t`/`i18n.language` en ese momento, así que tras un `changeLanguage` la siguiente validación ya sale en el nuevo idioma sin reconfigurar nada. Un error que ya estaba en pantalla mantiene su texto hasta que se vuelve a validar, igual que ahora con el resto de errores de formulario. A2 habla de los mensajes «siguientes», así que esto lo cumple.

**Sin fallback a los mensajes de zod.** El mapa siempre devuelve un texto propio. Cualquier issue que no esté contemplado (p. ej. `invalid_union` o `regex`) sale como `validation.invalid` («El valor no es válido.»), así que el inglés por defecto de zod no puede llegar a la UI.

Casos que cubre el mapa (cubren todos los esquemas de los formularios web):

| Issue de zod | Clave | es |
|---|---|---|
| `invalid_type` / `invalid_format` con entrada vacía (`undefined`, `null`, `''`), `too_small` de texto con mínimo 1 | `validation.required` | Este campo es obligatorio. |
| `too_small` / `too_big` de texto (`min`, `max`, `length`) | `validation.minLength` / `maxLength` / `exactLength` (con plural) | Debe tener al menos 8 caracteres. |
| `too_small` / `too_big` de número | `validation.min` / `max` (número formateado según el idioma, agrupando a partir de 5 cifras: «1886», «9.999.999») | El valor máximo es 9.999.999. |
| `invalid_type` de número (NaN) / entero | `validation.number` / `integer` | Introduce un número válido. |
| `invalid_format` email / fecha | `validation.email` / `date` | Introduce un email válido. |
| `invalid_value` (enum) | `validation.option` | Elige una opción válida. |
| Cualquier otro | `validation.invalid` | El valor no es válido. |

Como `@ikrive/shared` y `apps/web` resuelven la misma instancia de zod (`zod@4.6.7`), la configuración global también traduce los esquemas compartidos (mantenimiento y ajustes) sin tocarlos. Lo verifica un test.

Se revisaron los esquemas de `apps/web`: ninguno lleva mensajes literales en inglés. Los únicos `message:` son `setError` con `t(...)`, que ya estaban traducidos. `vehicles/index.tsx` solo valida la query string con `.catch`, que nunca muestra mensajes.

## Cambios por archivo

- `apps/web/src/i18n/zod.ts` (nuevo): `validationMessage(issue, i18n)` (traduce el issue) y `configureZodMessages(i18n)` (registra el `customError` en `z.config`).
- `apps/web/src/i18n/index.ts`: llama a `configureZodMessages(i18n)` una vez tras `init`. Lo importan tanto `main.tsx` como `test/setup.ts`, así que la app y los tests usan la misma configuración.
- `apps/web/src/i18n/locales/es.json`, `en.json`: nueva sección `validation` con las mismas claves en los dos idiomas.
- `apps/web/src/i18n/zod.test.ts` (nuevo): tests unitarios del mapa (cada caso en español), el cambio de idioma y los esquemas de `@ikrive/shared`.
- `apps/web/src/features/vehicles/odometer-form.test.tsx`: nuevo test de componente con el campo vacío en español → `changeLanguage('en')` → nuevo envío en inglés, sin volver a montar el formulario. Un `afterEach` vuelve a poner `es`.
- `apps/web/src/features/maintenance/maintenance-form.test.tsx`: el test de formulario inválido ahora también comprueba los textos en español («Introduce un número válido.», «Este campo es obligatorio.»).

No cambian ni `packages/`, ni `apps/api`, ni los formularios.

## Trazabilidad

| Acceptance | Evidencia |
|---|---|
| A1: errores del cliente en español con la UI en español y en inglés con la UI en inglés, en todos los formularios | Config global en `apps/web/src/i18n/zod.ts` (afecta a todos los `zodResolver`: login, registro, ajustes, vehículo, odómetro, mantenimiento). `i18n/zod.test.ts` › «translates %s into Spanish» (14 casos, que cubren todos los tipos de issue de esos esquemas) y «follows the active language without reconfiguring zod» (inglés). `maintenance-form.test.tsx` › «shows field errors without calling the API when the form is invalid». Capturas del registro (abajo). |
| A2: tras cambiar de idioma, los siguientes mensajes salen en el nuevo idioma sin recargar | `odometer-form.test.tsx` › «shows the empty-field error in the active language, also after switching it»; `i18n/zod.test.ts` › «follows the active language without reconfiguring zod» |
| A3: mensajes propios en es.json y en.json; nada del inglés por defecto de zod con la UI en español | Sección `validation` en los dos JSON. `locales.test.ts` › «es and en define the same keys». Fallback `validation.invalid` en `zod.ts`; `zod.test.ts` › caso «any other issue» |
| A4: configuración en un único sitio | `apps/web/src/i18n/zod.ts`, llamado solo desde `apps/web/src/i18n/index.ts`; ningún formulario cambia |
| A5: sin cambios en los esquemas de `@ikrive/shared` ni en los mensajes de la API | `git status`: ningún cambio en `packages/` ni en `apps/api/`. `zod.test.ts` › «applies to the @ikrive/shared schemas too» |
| A6: test de componente con el obligatorio vacío en español y luego en inglés | `apps/web/src/features/vehicles/odometer-form.test.tsx` › «shows the empty-field error in the active language, also after switching it» |
| A7: `pnpm harness --full` en verde | Ver abajo |

## Verificación visual

`pnpm dev` (Vite en :5175 porque :5173/:5174 estaban ocupados. El :3000 lo ocupa otro proceso ajeno, así que la API de Ikrive no arrancó y las llamadas a `/api` se simularon en Playwright con un 401 de `/api/me`). Página `/register` enviada con nombre vacío, email «nope» y contraseña «abc»:

- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/768dedfa-42fe-43a2-81ef-aac08b975ec5/scratchpad/shots/register-es-light.png`: «Este campo es obligatorio.», «Introduce un email válido.», «Debe tener al menos 8 caracteres.»
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/768dedfa-42fe-43a2-81ef-aac08b975ec5/scratchpad/shots/register-en-dark.png`: «This field is required.», «Enter a valid email.», «Must be at least 8 characters long.»
- `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/768dedfa-42fe-43a2-81ef-aac08b975ec5/scratchpad/shots/register-es-mobile.png`

## `pnpm harness --full`

```
[OK]    pnpm lint       (biome check: 132 files, no fixes)
[OK]    pnpm typecheck  (shared, api, web)
[OK]    pnpm test       shared 11/11 · api 40/40 · web 67/67 (9 files)
[OK]    Arnés en verde.
```

## Desviaciones

Ninguna respecto a los acceptance. La única decisión propia es la de arriba: `customError` con claves i18n en lugar de los locales de zod, y sin fallback a ellos.
