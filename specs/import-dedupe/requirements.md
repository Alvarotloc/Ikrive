# Requirements — import-dedupe

> Feature 44 (fase 7). Evita importar dos veces el mismo export en una cuenta y avisa de vehículos que parecen repetidos. Amplía `POST /api/me/import` (#35) y la sección «Tus datos» de Ajustes (#36).
> «Import» = `POST /api/me/import`. «Huella» = SHA-256 (hex) de los bytes de `data.json` tal como vienen en el zip. «Sin importar nada» = sin filas nuevas en la BD (incluida `data_imports`) y sin ficheros nuevos en `uploads/`. «Problem de import repetido» = 409 `application/problem+json` con `type` igual a `DUPLICATE_IMPORT_PROBLEM_TYPE` (`packages/shared`). «Identificador normalizado» = valor de `normalizeVehicleIdentifier` (R8).

## Huella del import

## R1
CUANDO un import termina bien, el sistema DEBE registrar en `data_imports` una fila con el usuario y la huella de su `data.json`.

## R2
SI la huella del `data.json` recibido ya está registrada para el mismo usuario ENTONCES el sistema DEBE responder con el problem de import repetido sin importar nada.

## R3
SI dos imports del mismo `data.json` en la misma cuenta llegan a la vez ENTONCES el sistema DEBE completar uno (201) y responder al otro con el problem de import repetido sin importar nada de este.

## R4
SI un `data.json` válido es a la vez un import repetido y tiene moneda o unidades distintas de los ajustes del usuario ENTONCES el sistema DEBE responder con el problem de import repetido.

## R5
CUANDO la huella del `data.json` está registrada solo para otra cuenta, el sistema DEBE importarlo en la cuenta del usuario y responder 201.

## R6
SI un import falla ENTONCES el sistema NO DEBE registrar su huella.

## R7
CUANDO se borra una cuenta, el sistema DEBE borrar todas sus huellas.

## Vehículos coincidentes

## R8
El sistema DEBE normalizar matrícula y VIN pasando a mayúsculas y quitando todo carácter que no sea letra o dígito, y tratar como sin valor (`null`) el resultado vacío.

## R9
CUANDO un import termina bien, el sistema DEBE incluir en la respuesta `matchingVehicles`, con una entrada por cada par (vehículo importado, vehículo que la cuenta ya tenía antes del import) cuya matrícula o VIN normalizados coinciden y con los campos que coinciden en `matchedBy`.

## R10
CUANDO hay vehículos coincidentes, el sistema DEBE completar el import (201) sin modificar ni fusionar el vehículo existente ni el importado.

## Web

## R11
CUANDO el import responde con el problem de import repetido, la web DEBE mostrar en un toast el mensaje traducido de «este export ya se importó en tu cuenta», distinto del de ajustes incompatibles.

## R12
CUANDO la respuesta del import trae `matchingVehicles` no vacío, la web DEBE mostrar junto al resumen un aviso (`role="status"`) que nombra cada vehículo importado, el vehículo existente con el que coincide y si coincide por matrícula, por VIN o por ambos.

## R13
El sistema DEBE tener todos los textos nuevos de la web en `es.json` y `en.json`.

## Acceptance → requirements

| Acceptance (`feature_list.json` #44) | Requirements |
|---|---|
| Un `data.json` ya importado en esa cuenta → 409 problem+json sin crear nada | R1, R2, R3, R4, R6 |
| El mismo zip se puede importar en otra cuenta | R5 |
| Misma matrícula o VIN que un vehículo existente → el import se completa y la respuesta lo indica | R8, R9, R10 |
| La web muestra mensajes traducidos para el 409 repetido y el aviso de coincidencias (es/en) | R11, R12, R13 |
| Tests de integración (repetido, otra cuenta, matrícula/VIN) y de componente (mensajes) | T6–T9, T12 |
| `pnpm harness --full` en verde | T14 |
| (Petición del leader: borrar la cuenta limpia las huellas) | R7 |
