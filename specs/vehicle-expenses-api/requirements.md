# Requirements — vehicle-expenses-api

> Feature 87 (fase 9). Gastos del vehículo que no son repostajes ni mantenimientos (seguro, impuesto, peajes, parking, multas y otros): tabla, CRUD en la API y en el DataSource local, estadísticas de coste, zip de export/import e importación CSV. La UI de gastos es #88.
> «Gasto» = fila de `expenses` conforme a `expenseSchema` (`design.md`). «Hoy» = la fecha de hoy en la zona horaria del usuario. «Modo local» = `dataSource()` en modo «En este teléfono». «Importación CSV» = `POST /api/vehicles/:id/csv-import` o `dataSource().csvImport.import(...)` en modo local.

## CRUD en la API

## R1
CUANDO el usuario envía `POST /api/vehicles/:id/expenses` con un cuerpo válido sobre un vehículo suyo, el sistema DEBE guardar el gasto y responder 201 con el gasto conforme a `expenseSchema`.

## R2
CUANDO el usuario pide `GET /api/vehicles/:id/expenses` de un vehículo suyo, el sistema DEBE devolver sus gastos ordenados por fecha descendente y, a igual fecha, por fecha de creación descendente.

## R3
CUANDO el usuario pide `GET /api/vehicles/:id/expenses/:expenseId` de un gasto suyo, el sistema DEBE responder 200 con ese gasto.

## R4
CUANDO el usuario envía `PATCH /api/vehicles/:id/expenses/:expenseId` con un cuerpo válido, el sistema DEBE cambiar solo los campos enviados y responder 200 con el gasto actualizado.

## R5
CUANDO el usuario envía `DELETE /api/vehicles/:id/expenses/:expenseId` de un gasto suyo, el sistema DEBE borrarlo y responder 204.

## R6
SI el cuerpo de un POST o PATCH no cumple `createExpenseSchema` o `updateExpenseSchema` (categoría fuera de `EXPENSE_CATEGORIES`, importe ausente, 0, negativo o mayor que 1e9, fecha no ISO, título de más de 120 caracteres o descripción de más de 2000) ENTONCES el sistema DEBE responder 400 `application/problem+json` sin escribir nada.

## R7
SI la fecha resultante de un POST o PATCH es posterior a hoy ENTONCES el sistema DEBE responder 400 `application/problem+json` con `detail` «The expense date cannot be in the future» sin escribir nada.

## R8
SI el vehículo no existe o pertenece a otro usuario ENTONCES el sistema DEBE responder 404 `application/problem+json` con `detail` «Vehicle not found» en todos los endpoints de gastos.

## R9
SI el gasto no existe o pertenece a otro vehículo ENTONCES el sistema DEBE responder 404 `application/problem+json` con `detail` «Expense not found».

## R10
CUANDO se borra un vehículo, en la API o en modo local, el sistema DEBE borrar todos sus gastos.

## Modo local

## R11
MIENTRAS está activo el modo local, el sistema DEBE ofrecer `expenses.list`, `create`, `update` y `remove` con los mismos DTO y el mismo orden que la API.

## R12
MIENTRAS está activo el modo local, SI una operación de gastos recibe una entrada inválida, una fecha futura o un vehículo o gasto inexistente ENTONCES el sistema DEBE rechazar con un `ApiError` con el mismo estado y `detail` que la API, sin escribir nada.

## Estadísticas

## R13
El sistema DEBE devolver en `spending.expenses` la suma de los importes de los gastos del vehículo, redondeada a céntimos.

## R14
El sistema DEBE calcular `spending.total` como precio de compra + combustible + mantenimiento + gastos.

## R15
El sistema DEBE devolver en `costPerDistance.expenses` los gastos divididos por la distancia recorrida, con 3 decimales, y `null` sin distancia.

## R16
El sistema DEBE devolver en `costPerDistance.total` la suma de combustible, mantenimiento y gastos dividida por la distancia recorrida, con 3 decimales, y `null` sin distancia.

## R17
El sistema DEBE devolver en `spending.expensesByCategory` el total de gastos de cada categoría de `EXPENSE_CATEGORIES` con gastos, de mayor a menor total, sin cambiar `spending.byCategory`.

## R18
El sistema DEBE incluir en cada mes de `series.spendingByMonth` el campo `expenses` con lo gastado ese mes, y contar los meses con gastos al calcular el primer y el último mes de la serie.

## R19
CUANDO se piden las estadísticas de un vehículo con `GET /api/vehicles/:id/stats` o con `dataSource().stats` en modo local, el sistema DEBE calcularlas con los gastos guardados del vehículo.

## Export e import

## R20
CUANDO se genera un export, en la API o en modo local, el sistema DEBE incluir en cada vehículo un array `expenses` con todos los campos de cada gasto.

## R21
CUANDO se importa con `POST /api/me/import` un zip con gastos, el sistema DEBE crearlos en el vehículo importado con ids nuevos y contarlos en `expenses` del resumen.

## R22
CUANDO se importa un zip con `formatVersion: 1` cuyos vehículos no traen `expenses`, el sistema DEBE importarlo como si cada vehículo trajera `expenses: []`.

## R23
SI dos gastos del `data.json` comparten `id` ENTONCES el sistema DEBE responder 400 `application/problem+json` sin importar nada.

## R24
CUANDO termina un import del zip, la sección de datos de la web DEBE mostrar el contador de gastos importados junto a los demás contadores.

## Importación CSV

## R25
CUANDO un CSV de Fuelio trae en `## Costs` una fila que no es plantilla ni ingreso y cuya categoría no corresponde a un mantenimiento, el sistema DEBE convertirla en una fila `expense` con el título `CostTitle` (o, si falta, el nombre de su categoría), la descripción `Notes`, el importe `Cost`, la fecha y el `UniqueId` como `sourceId`.

## R26
CUANDO un CSV de Drivvo trae filas en la sección `##Expense`, también traducida, el sistema DEBE convertir cada una en una fila `expense` con la fecha, el importe «Total cost», el título «Type of expense» y la descripción «Notes».

## R27
CUANDO un CSV de LubeLogger es de impuestos, el sistema DEBE convertir cada fila en una fila `expense` con categoría `tax`, el título `Description`, la descripción `Notes`, el importe `Cost` y la fecha.

## R28
El sistema DEBE asignar la categoría de una fila `expense` de Fuelio o Drivvo con `matchExpenseCategory` sobre la etiqueta de origen (nombre de la categoría de Fuelio, o «Type of expense» de Drivvo), y `other` si no coincide ninguna.

## R29
DONDE el CSV genérico se mapea con `kind: 'expense'`, el sistema DEBE exigir las columnas `date` y `cost` y leer además `category`, `title` y `description`, con la categoría exacta de `EXPENSE_CATEGORIES` o, si no, la de `matchExpenseCategory` o `other`.

## R30
SI una fila `expense` no trae importe o trae 0 ENTONCES el sistema DEBE devolverla en `errors` con `field: 'cost'` y no importarla.

## R31
El sistema DEBE incluir la fecha y el importe de las filas `expense` en las celdas con las que se deducen el formato de fecha y el separador decimal del fichero.

## R32
CUANDO la clave (`expense|fecha|título|importe`) de una fila `expense` coincide con la de un gasto del vehículo o con la de otra fila ya procesada del fichero, el sistema DEBE omitirla y contarla en `duplicates`, en la API y en modo local.

## R33
SI la fecha de una fila `expense` es posterior a hoy ENTONCES el sistema DEBE devolverla en `rejected` con `kind: 'expense'`, `reason: 'future_date'` y `conflict: null`.

## R34
CUANDO se importa una fila `expense`, en la API o en modo local, el sistema DEBE crear el gasto en la misma transacción que el resto de filas, sin lectura de odómetro, y contarlo en `created.expense`.

## R35
El sistema DEBE limitar los motivos de `skipped` a `template` e `income`.

## R36
CUANDO la web calcula los contadores de la vista previa y del resultado de la importación CSV, el sistema DEBE sumar `created.expense` a las filas válidas y creadas.

## R37
El sistema DEBE definir en `es` y en `en` la etiqueta del tipo de fila `expense` de la importación CSV y del contador `expenses` del resumen del import del zip.

## Cobertura del acceptance

| Criterio de `feature_list.json` | Requirements |
|---|---|
| GET/POST/PATCH/DELETE de gastos por vehículo funcionan, y un gasto de otro usuario responde 404 | R1, R2, R3, R4, R5, R6, R7, R8, R9, R10 |
| El coste total de propiedad y el coste por km incluyen los gastos, con tests unitarios de las fórmulas en `packages/shared` | R13, R14, R15, R16, R17, R18, R19 |
| El zip de export/import conserva los gastos, y un zip antiguo sin gastos se sigue importando | R20, R21, R22, R23, R24 |
| El DataSource local ofrece las mismas operaciones y reglas | R10, R11, R12, R19, R20, R32, R34 |
| La importación CSV crea como gastos las filas que #84 omite por no ser mantenimiento (Fuelio, Drivvo, LubeLogger), sin duplicados al repetir la importación y en servidor y en local | R25, R26, R27, R28, R29, R30, R31, R32, R33, R34, R35 |
| `pnpm harness --full` en verde | R36, R37 y la última task de `tasks.md` |

R17 y R18 dejan preparado lo que #88 necesita para el desglose por categoría y el gasto por mes. R29 existe porque `expense` entra en `CsvRowKind` y el CSV genérico admite cualquier tipo de fila (`design.md` › Decisiones). R36 y R37 son los cambios mínimos en la web que exige el contrato nuevo para que el arnés siga en verde.
