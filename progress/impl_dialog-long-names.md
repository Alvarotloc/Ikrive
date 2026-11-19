# Implementación — #82 `dialog-long-names`

`sdd: false`: guía = `description` + `acceptance` de `feature_list.json`.

## Causa

`contentClassName` era `grid` sin columnas explícitas: la columna implícita `auto` crece hasta el min-content del hijo más ancho, y los hijos de grid tienen `min-width: auto`. Un nombre de 255 caracteres sin espacios fijaba ese min-content, así que la columna (y título, descripción y footer con «Eliminar») se salían de la tarjeta de 328 px. El `break-words` que llevaba el título de facturas no basta: `overflow-wrap: break-word` no reduce el min-content, `anywhere` sí.

## Cambios por archivo

- `apps/web/src/components/ui/dialog.tsx`
  - Contenido (compartido por `DialogContent` y `AlertDialogContent`): `min-w-0` + `grid-cols-[minmax(0,1fr)]`, de modo que la columna nunca supera `w-[calc(100%-2rem)]` / `max-w-md`.
  - Nuevas constantes `titleClassName` / `descriptionClassName` (usadas por `DialogTitle`, `AlertDialogTitle`, `DialogDescription`, `AlertDialogDescription`): añaden `min-w-0 wrap-anywhere` (utilidad de Tailwind v4 = `overflow-wrap: anywhere`).
  - `DialogFooter`: `min-w-0` y `sm:flex-wrap` para que los botones no empujen fuera en anchos intermedios.
- `apps/web/src/features/maintenance/maintenance-attachments.tsx`: quitado `className="break-words"` del `AlertDialogTitle` de borrar factura y del `DialogDescription` del diálogo de adjuntos. Ahora redundante y, peor, `tailwind-merge` no lo trata como conflicto con `wrap-anywhere` (los conserva los dos; comprobado), así que el `overflow-wrap` que ganara dependería del orden del CSS generado. Quitarlo evita que sobrescriba el arreglo.
- `apps/web/src/components/ui/dialog.test.tsx` (nuevo): test del componente.

Diálogos revisados: borrar factura (`maintenance-attachments.tsx › DeleteAttachmentDialog`), borrar vehículo (`vehicles/vehicle-actions.tsx`), borrar usuario y autodegradarse (`admin-users/user-row.tsx`). Todos usan `AlertDialogContent`/`AlertDialogTitle`/`AlertDialogDescription`/`DialogFooter` sin `className`, así que reciben el arreglo sin cambios. Otros `className` que se pasan a `DialogContent` (`max-h-[90dvh] max-w-lg overflow-y-auto` en formularios) no chocan con las clases nuevas. `attachment-viewer.tsx` conserva `min-w-0 pr-2 break-words` en su `DialogTitle` (va dentro de una cabecera flex con `min-w-0`, donde `break-word` ya funciona); no lo he tocado.

## Trazabilidad

| Acceptance | Archivo › test |
|---|---|
| Nombre de 255 caracteres sin espacios: el título se parte y el diálogo no supera 360 px | `dialog.test.tsx` › `uses a 255-character name without spaces`, `lets the title and description break long words and shrink`, `keeps the content within the viewport with a shrinkable single column`; además, comprobación visual (abajo) |
| Los botones siguen visibles y caben enteros | `dialog.test.tsx` › `keeps both buttons rendered inside a shrinkable footer`; comprobación visual |
| Test del componente con clases de corte de palabra y ancho mínimo en título y contenido | `apps/web/src/components/ui/dialog.test.tsx` (4 tests) |
| `pnpm harness --full` en verde | salida abajo |

## Comprobación visual (real, no simulada)

No arranqué `pnpm dev` (haría falta sesión y una factura con ese nombre). En su lugar: `pnpm --filter ./apps/web build` para sacar el CSS real compilado por Tailwind, y Playwright (Chrome del sistema, headless) renderizando una página con el mismo DOM y las mismas clases que el AlertDialog de borrar factura (título con el nombre de 255 caracteres, descripción, Cancelar + Eliminar), antes y después del cambio, en claro y oscuro, a 360 y 1280 px. Medidas con `getBoundingClientRect`:

| Variante | Ancho | Contenido (left–right) | Alto del título | Botón «Eliminar» (left–right) |
|---|---|---|---|---|
| antes | 360 | 16–344 | 56 px (una línea) | 45–**2874** (cortado) |
| después | 360 | 16–344 | 336 px (varias líneas) | 45–315 |
| antes | 1280 | 416–864 | 56 px | 3173–3274 (fuera) |
| después | 1280 | 416–864 | 252 px | 734–835 |

El «antes» reproduce el bug; el «después» deja título, descripción y botones dentro de la tarjeta. Capturas (fuera del repo):

- /tmp/claude-1000/-home-alvaro-dev-personal-ikrive/5ea92add-99be-4662-bc67-d4154910e19e/scratchpad/dialog/after-light-360.png
- /tmp/claude-1000/-home-alvaro-dev-personal-ikrive/5ea92add-99be-4662-bc67-d4154910e19e/scratchpad/dialog/after-dark-360.png
- /tmp/claude-1000/-home-alvaro-dev-personal-ikrive/5ea92add-99be-4662-bc67-d4154910e19e/scratchpad/dialog/after-light-1280.png
- /tmp/claude-1000/-home-alvaro-dev-personal-ikrive/5ea92add-99be-4662-bc67-d4154910e19e/scratchpad/dialog/after-dark-1280.png
- `before-*.png` en la misma carpeta; script: `.../scratchpad/dialog/shot.mjs`

Limitación: es el DOM replicado a mano con el CSS real, no la app en marcha; los botones llevan la clase base + variante, sin pasar por `Button`.

## `pnpm harness --full`

```
[OK]    82 features: 80 done, 1 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #82 dialog-long-names (in_progress)
[OK]    Rama actual: feat/dialog-long-names
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test      (web 100 files / 706 tests, api 38/373, shared 26/187, db 1/3)
[OK]    Arnés en verde.
```

## Desviaciones

- Usé `wrap-anywhere` (utilidad nativa de Tailwind v4.3, `overflow-wrap: anywhere`) en lugar de la clase arbitraria `[overflow-wrap:anywhere]`: hace lo mismo.
- Apliqué el mismo arreglo a `Dialog` (no alert), porque comparte `contentClassName` en `dialog.tsx` y tiene el mismo problema con `record.title` en el diálogo de adjuntos.
- No hay commit (lo hace el leader).
