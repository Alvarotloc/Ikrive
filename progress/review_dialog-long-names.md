# Review — #82 dialog-long-names

**Veredicto:** APPROVED

`sdd: false`: no hay `specs/dialog-long-names/`; la guía son los `acceptance` de `feature_list.json`. C2 se evalúa contra ellos.

## Trazabilidad acceptance ↔ tests
- A1 (nombre de 255 caracteres sin espacios: el título se parte y el diálogo no pasa de 360 px): [x] `apps/web/src/components/ui/dialog.test.tsx` › `uses a 255-character name without spaces` (longitud 255, sin `\s`), `lets the title and description break long words and shrink` (`wrap-anywhere` + `min-w-0` en título y descripción, localizados por rol/texto con el nombre real), `keeps the content within the viewport with a shrinkable single column` (`min-w-0`, `grid-cols-[minmax(0,1fr)]`, `w-[calc(100%-2rem)]`, `max-w-md` en el `alertdialog`). jsdom no hace layout, así que el ancho real se comprobó a mano (ver abajo).
- A2 (los botones siguen visibles y caben enteros): [x] `dialog.test.tsx` › `keeps both buttons rendered inside a shrinkable footer` (los dos botones se renderizan en el mismo footer `min-w-0`) + medidas visuales («Eliminar» 45–315 px dentro de la tarjeta 16–344 a 360 px; antes 45–2874).
- A3 (test del componente con clases de corte de palabra y ancho mínimo en título y contenido): [x] el mismo fichero.
- A4 (harness en verde): [x] he lanzado `pnpm harness --full` yo mismo: verde (web 706, api 373 tests).

## Tasks
- No aplica (`sdd: false`, sin `tasks.md`).

## Checkpoints
- C1: [x] el arnés está en verde, hay una sola feature activa (#82 `in_progress`) y la rama es `feat/dialog-long-names`.
- C2: [x] no aplica (`sdd: false`). Cada acceptance tiene un test real (ver arriba).
- C3: [x] el diff solo toca `components/ui/dialog.tsx`, su test nuevo, el retoque en `maintenance-attachments.tsx` y los ficheros de rastro (`feature_list.json` y `progress/`). Ningún refactor ajeno.
- C4: [x] el arreglo va en el componente compartido, como pide la `description`. No añade textos, así que i18n no se ve afectado. No toca la API ni la BD.
- C5: [x] no hay `any`, `console.log` ni código comentado. El comentario de `dialog.tsx` explica el porqué.
- C6: [x] el harness está en verde y los tests afirman clases concretas. Hay comprobación visual con el CSS real compilado (`app.css` contiene `.wrap-anywhere{overflow-wrap:anywhere}` y `.grid-cols-[minmax(0,1fr)]`), con capturas en claro, oscuro, 360 px y 1280 px, antes y después, referenciadas en el impl. He revisado `after-dark-360.png`: el título se parte en varias líneas y los botones «Eliminar» y «Cancelar» caben enteros dentro de la tarjeta.
- C7: [x] `progress/impl_dialog-long-names.md` está completo (causa, ficheros, trazabilidad y salida del harness). `progress/current.md` está al día. `docs/PLAN.md` no se toca porque la feature no cierra fase.

## Comprobaciones pedidas
- **El arreglo está en el diálogo compartido:** sí. `contentClassName` (lo comparten `DialogContent` y `AlertDialogContent`) recibe `min-w-0 grid-cols-[minmax(0,1fr)]`. Los cuatro Title/Description reciben `min-w-0 wrap-anywhere`. `DialogFooter` recibe `min-w-0 sm:flex-wrap`. El diagnóstico es correcto: la columna implícita `auto` crecía hasta el min-content del nombre, y `break-word` no reduce el min-content, `anywhere` sí.
- **`maintenance-attachments.tsx`:** quitar `break-words` está justificado y no rompe nada. El título y la descripción heredan ahora `wrap-anywhere`, que es más fuerte. No hay pérdida.
- **Otros diálogos:** borrar vehículo, marcar vendido (`vehicles/vehicle-actions.tsx`), borrar usuario y autodegradarse (`admin-users/user-row.tsx`) usan los componentes sin `className`, así que heredan el arreglo. Los `className` que se pasan a `DialogContent` (`max-h-[90dvh] max-w-lg overflow-y-auto`) y el `border-t pt-5` de `DialogFooter` en `sale-report-dialog.tsx` no chocan con las clases nuevas. `attachment-viewer.tsx:57` sigue pasando `break-words`: tailwind-merge conserva las dos clases, pero en el CSS compilado `.wrap-anywhere` va después de `.break-words` (offset 22167 frente a 22129) y gana, así que no se anula el arreglo.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- Las capturas están en el scratchpad de la sesión (`/tmp/...`), fuera del repo, y pueden desaparecer. Si las quieres conservar, cópialas antes de cerrar.
- La comprobación visual se hizo sobre un DOM replicado con el CSS real, no sobre la app en marcha. Merece la pena hacer una prueba rápida en el móvil con una factura de nombre largo antes del merge.
- El test cubre `AlertDialog`, pero no `Dialog` (no alert) ni `sm:flex-wrap` del footer. Ambos comparten las constantes probadas, así que el riesgo es bajo.
- `attachment-viewer.tsx:57` conserva un `break-words` que ahora sobra. Habría que limpiarlo en otra feature, no en esta.

## Cambios requeridos
Ninguno.
