# Review — #25 vehicle-stats-web

**Veredicto:** APPROVED

## Trazabilidad requirements ↔ tests

SF = `apps/web/src/features/stats/format.test.ts`, VS = `apps/web/src/features/stats/vehicle-stats-section.test.tsx`.

- R1: [x] VS:107 › `shows the key figures in the user's units and currency`: comprueba el heading «Estadísticas» y la petición a `/api/vehicles/v1/stats`. El montaje en la ruta (`$vehicleId/index.tsx`, loader + sección entre Mantenimientos y «Gestionar») está revisado en el diff y se ve en las capturas.
- R2: [x] VS:107: localiza las cinco cifras por su etiqueta y comprueba su valor formateado (14.600 mi, 6,54 gal/100 mi, $/mi ×2, total USD), además del desglose y de que no aparece «—».
- R3: [x] VS:143 › `explains what is missing for each empty figure`: «—» y el texto `pending.perYear` dentro de la tarjeta.
- R4: [x] VS:143: «—» y el texto `pending.consumption`.
- R5: [x] VS:143: «—» y el texto `pending.costPerDistance` en las dos tarjetas de coste por distancia, y el total muestra un importe sin «—».
- R6: [x] VS:183 › `renders the four charts when there is data`: el `figure` «Distancia por mes» tiene SVG y no muestra estado vacío.
- R7: [x] VS:183: el `figure` «Consumo por tramo» tiene SVG. El punto en `endDate` está en el código (`stats-charts.tsx:118`, `dataKey="endDate"`) y se ve en las capturas (ver avisos).
- R8: [x] VS:183: el `figure` «Gasto por mes» tiene SVG. El apilado está en el código (`stackId="spending"`, l. 166–173) y se ve en las capturas.
- R9: [x] VS:183: «Neumáticos» y «Aceite» aparecen dentro del `figure` «Gasto por categoría».
- R10–R13: [x] VS:197 › `explains what is missing for each empty chart`: cada `figure` muestra su texto exacto de `stats.empty.*` y no tiene `svg`.
- R14: [x] SF:16 (separadores es/en) y VS:107 («14.600 mi»).
- R15: [x] SF:21 (L/gal/kWh, km/mi, como máximo 2 decimales), VS:107 y VS:137 (kWh/100 mi).
- R16: [x] SF:28 (EUR/USD, 2–3 decimales, /km y /mi), VS:107 y VS:173 (desglose sin compra).
- R17: [x] SF:35 (`ene 2025` / `Jan 2025`, `1 mar` / `Mar 1`). Lo he vuelto a ejecutar con `TZ=America/Los_Angeles`: en verde.
- R18: [x] `apps/web/src/i18n/locales.test.ts` › `es and en define the same keys`. Las claves `stats.*` se añadieron en los dos idiomas con la misma estructura.

## Tasks
- T1..T12: [x]

## Checkpoints
- C1: [x] Arnés en verde, solo #25 está activa (`in_progress`) y la rama es `feat/vehicle-stats-web`.
- C2: [x] El spec está completo y en EARS, y la tabla de acceptance lo cubre todo. Tasks marcadas `[x]`. Cada R tiene un test, que he abierto y leído.
- C3: [x] El diff solo toca los archivos del design: shared `DAY_MS`, deps, query-keys, `features/stats/*`, la ruta e i18n. Hay además `progress/*`, que es documentación.
- C4: [x] Sin cambios en la API ni en la BD (no aplica). En la web: el código está en `features/stats/`, `statsQuery` usa `queryOptions`, los textos están en es/en y se reutilizan `Card` y `Metric`. La clave cuelga de `vehicles.all`, que ya invalidan las mutaciones de fuel, maintenance y vehicles (lo he comprobado).
- C5: [x] Sin `any`, `@ts-ignore`, `console.log` ni TODOs. Las fechas `YYYY-MM-DD` y `YYYY-MM` se tratan en UTC. No se convierten unidades. No aplica a ficheros.
- C6: [x] He ejecutado `pnpm harness --full` y está en verde (shared 75, api 194, web 244). Los tests afirman texto concreto y solo se mockea `fetch`. Hay capturas en claro, oscuro y móvil en el scratchpad, y he revisado `desktop-dark-data.png` y `mobile-375-light-empty.png`.
- C7: [x] `impl_vehicle-stats-web.md` está completo y `current.md` está al día. PLAN.md no cambia: la fase 5 sigue «En curso» porque quedan features pendientes.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
- R7 y R8: el test de componente solo afirma que existe el SVG de cada gráfico. Que el punto esté en `endDate` y que las barras vayan apiladas se comprueba por el código y las capturas, no con un test. El design (sección Tests) lo acepta así porque jsdom no pinta el contenido del SVG de forma fiable.
- R17: `format.test.ts` solo detecta una regresión de zona horaria si se ejecuta en una zona al oeste de UTC. La de la máquina o la CI puede no detectarla. Se podría fijar `TZ` en el proyecto `unit` de vitest más adelante.
- En modo oscuro, las barras de mantenimiento (`--color-accent-strong`) tienen poco contraste con la tarjeta. El implementer ya lo señala.
- Se añade `react-is@19` como dependencia explícita (desviación 1, justificada: sin ella Recharts recibe `react-is@17`). Recharts aumenta el bundle de la página del vehículo, riesgo ya asumido en el design.
- Hay dos ficheros nuevos sin trackear, `progress/explore_vehicle-stats-web_*.md`. Hay que decidir si se commitean al cerrar.

## Cambios requeridos
Ninguno.
