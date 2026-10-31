# Implementación — #26 form-field-error-a11y (`sdd: false`)

Guía: `acceptance` de la entrada 26 de `feature_list.json` y aviso 4 de `progress/review_fuel-logs-web.md`.

## Enfoque

`FormField` publica un contexto (`controlId` = su `id`, `errorId` solo si hay error). Los primitivos `Input`, `Select` y `Textarea` leen ese contexto con `useFormFieldControl`: si el control tiene el mismo `id` que el campo y hay error, añaden el id del error a su propio `aria-describedby` y ponen `aria-invalid`. El mensaje de error recibe un id estable y único (`${useId()}-error`).

Por qué contexto y no `cloneElement` sobre `children`: varios formularios envuelven el input (odómetro de repostaje dentro de un `div` con la unidad) o le añaden hermanos (pista «Calculado»). El contexto funciona igual en todos los casos y no depende de la forma del árbol. Comparar por `id` evita marcar otros elementos del campo.

## Cambios por archivo

- `apps/web/src/components/form-field-context.ts` (nuevo): `FormFieldContext` y `useFormFieldControl(props)`, que fusiona `aria-describedby` (conserva el del control y añade el del error) y fuerza `aria-invalid` cuando hay error. Sin error devuelve las props tal cual.
- `apps/web/src/components/form-field.tsx`: genera `errorId` con `useId`, envuelve `children` en el provider, pone `id={errorId}` al `<p role="alert">`. API pública sin cambios.
- `apps/web/src/components/ui/input.tsx`, `ui/select.tsx`, `ui/textarea.tsx`: llaman a `useFormFieldControl` antes de renderizar. Fuera de un `FormField` se comportan igual que antes.
- `apps/web/src/components/form-field.test.tsx`: 7 tests nuevos.

**Formularios:** ningún cambio. Los que ya usan `FormField` con `Input`/`Select`/`Textarea` y el mismo `id` (login, registro, ajustes, vehículo, venta de vehículo, mantenimiento, recordatorios, canales de notificación, repostajes) se benefician directamente. Los `aria-invalid={Boolean(error)}` que ya ponían algunos formularios se mantienen y son coherentes (el hook solo fuerza `true` cuando hay error). Fuera de alcance: `odometer-form.tsx` no usa `FormField` y no se toca.

## Trazabilidad (acceptance → test)

| Acceptance | Test (`apps/web/src/components/form-field.test.tsx`) |
|---|---|
| 1. `aria-describedby` con id estable + `aria-invalid` | `links the error to its input with aria-describedby and aria-invalid`; `gives each field a distinct error id` |
| 2. Se conservan las descripciones previas | `keeps the control own description next to the error` (descripción = «Calculado Importe no válido») |
| 3. Sin error no se referencia ningún id inexistente | `references no missing id without an error` |
| 4. Formularios se benefician sin cambios | `links the error when the input is wrapped in another element`; `links the error to selects and textareas too`; `only links the control whose id matches the field`; las suites existentes de formularios siguen en verde sin tocarlas |
| 5. Tests con `toHaveAccessibleDescription` | Todos los anteriores salvo `only links…` |
| 6. Harness en verde | ver abajo |

## `pnpm harness --full`

```
[OK]    27 features: 25 done, 1 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #26 form-field-error-a11y (in_progress)
[OK]    Rama actual: feat/form-field-error-a11y
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test   (shared 75, api 194, web 251)
[OK]    Arnés en verde.
```

## Desviaciones

- No hay spec (feature `sdd: false`). La única decisión de diseño fuera de `form-field.tsx` es tocar los tres primitivos `ui/` (una línea cada uno) para cumplir «sin cambios en cada formulario».
- Sin capturas: el cambio solo afecta a atributos ARIA, no se ve.
