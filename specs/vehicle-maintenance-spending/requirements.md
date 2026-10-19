# Requirements — vehicle-maintenance-spending

> Feature 8 (fase 3). Gasto acumulado de mantenimiento de un vehículo, expuesto por la API y mostrado en la ficha.
> El coste de cada mantenimiento es un decimal (`maintenance_records.cost`, `real`, nullable) en la moneda de `user_settings.currency`; no se convierte entre monedas.

## R1
CUANDO el usuario hace `GET /api/vehicles/:id/maintenance/spending` de un vehículo suyo, el sistema DEBE responder 200 con `{ total }`, siendo `total` la suma de `cost` de los mantenimientos de ese vehículo (sin contar los de otros vehículos ni los que tienen `cost: null`).

## R2
SI el vehículo no tiene mantenimientos o ninguno tiene coste ENTONCES el sistema DEBE responder 200 con `{ total: 0 }`.

## R3
El sistema DEBE devolver `total` redondeado a 2 decimales (p. ej. 10,10 + 20,20 → `30.3`, no `30.299999999999997`).

## R4
SI el vehículo de la ruta no existe o pertenece a otro usuario ENTONCES el sistema DEBE responder 404 `application/problem+json` en `GET /api/vehicles/:id/maintenance/spending`.

## R5
CUANDO el usuario abre la ficha de un vehículo, el sistema DEBE mostrar la métrica «Gasto en mantenimiento» con `total` formateado como importe en la moneda de `user_settings.currency` y el idioma de la interfaz.

## R6
MIENTRAS `total` es 0, la ficha DEBE mostrar el importe cero formateado (p. ej. «0,00 €») en lugar de «—».

## R7
CUANDO el usuario crea, edita o borra un mantenimiento desde la ficha, el sistema DEBE volver a pedir el gasto y mostrar el nuevo total sin recargar la página.

## R8
El sistema DEBE traducir la etiqueta de la métrica en `es` y `en`.

## Trazabilidad acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| La API expone el gasto acumulado de mantenimiento de un vehículo (suma de costes; 0 si no hay registros con coste) | R1, R2, R3 |
| La ficha del vehículo muestra ese gasto formateado con la moneda del usuario | R5, R6, R7, R8 |
| Un test de integración cubre la suma, el caso sin mantenimientos y la autorización | R1, R2, R4 (tests en T3–T5) |
