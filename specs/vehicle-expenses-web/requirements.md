# Requirements — vehicle-expenses-web

> Feature 88 (fase 9). Interfaz de los gastos del vehículo cuya API y DataSource hizo #87: sección «Otros gastos» en la ficha (listado, filtro por categoría, alta, edición y borrado) y gastos en las estadísticas.
> «Gasto» = `Expense` de `@ikrive/shared`. «Ficha» = `/vehicles/$vehicleId`. «Sección» = la tarjeta «Otros gastos» de la ficha. «Formulario» = el diálogo de alta o edición de un gasto. «Estadísticas» = `VehicleStatsSection`. «Modo local» = `dataSource()` en modo «En este teléfono».

## Listado

## R1
CUANDO el usuario abre la ficha, el sistema DEBE mostrar la sección con los gastos de `dataSource().expenses.list`, ordenados por fecha descendente y, a igual fecha, por `createdAt` descendente.

## R2
El sistema DEBE mostrar en cada fila de la sección la categoría con `Badge variant="stamp"`, el título (o, si no tiene, el nombre de la categoría), la fecha y el importe en la moneda del usuario.

## R3
MIENTRAS el vehículo no tiene gastos, el sistema DEBE mostrar en la sección el mensaje «Todavía no hay gastos registrados.» sin filtro de categorías.

## R4
MIENTRAS el vehículo tiene gastos, el sistema DEBE ofrecer un filtro con «Todas» y solo las categorías que tienen gastos, en el orden de `EXPENSE_CATEGORIES`, con la opción elegida marcada con `aria-pressed="true"`.

## R5
CUANDO el usuario elige una categoría del filtro, el sistema DEBE mostrar solo los gastos de esa categoría.

## R6
SI la categoría elegida se queda sin gastos ENTONCES el sistema DEBE volver al filtro «Todas».

## Alta, edición y borrado

## R7
El sistema DEBE mostrar el botón «Añadir gasto» solo mientras el vehículo está activo.

## R8
CUANDO el usuario abre el formulario de alta, el sistema DEBE proponer la fecha de hoy (sin permitir elegir una posterior), la categoría `insurance` y el resto de campos vacíos.

## R9
CUANDO el usuario guarda un alta válida, el sistema DEBE enviar `dataSource().expenses.create` con `date`, `category`, `title`, `description` y `cost` (importe escrito en notación española o inglesa, textos vacíos como `null`), cerrar el formulario y mostrar el aviso «Gasto añadido».

## R10
SI el importe está vacío, es 0, no es un número o el título o la descripción superan 120 o 2000 caracteres ENTONCES el sistema DEBE marcar el campo con `aria-invalid="true"` y su mensaje en `role="alert"` sin llamar a la API.

## R11
CUANDO el usuario edita un gasto, el sistema DEBE abrir el formulario con sus valores, enviar `dataSource().expenses.update` con todos los campos (los textos vaciados como `null`), cerrar el formulario y mostrar el aviso «Gasto actualizado».

## R12
SI al guardar la API responde 400 sin `errors` ENTONCES el sistema DEBE mostrar «La fecha no puede ser futura.» en el campo de fecha y mantener el formulario abierto.

## R13
SI al guardar la API falla por cualquier otro motivo ENTONCES el sistema DEBE mostrar el error genérico en `role="alert"` y mantener el formulario abierto.

## R14
CUANDO el usuario confirma el borrado de un gasto en el diálogo de confirmación, el sistema DEBE enviar `dataSource().expenses.remove` y mostrar el aviso «Gasto eliminado», y nada antes de confirmar.

## R15
SI el borrado de un gasto falla ENTONCES el sistema DEBE mostrar el aviso de error genérico y dejar el gasto en el listado.

## R16
CUANDO se crea, edita o borra un gasto, el sistema DEBE invalidar las queries del vehículo (`queryKeys.vehicles.detail(id)`), de modo que el listado y las estadísticas se vuelvan a pedir.

## Estadísticas

## R17
El sistema DEBE mostrar en la ayuda de «Coste total» el desglose de compra (si hay precio de compra), combustible, mantenimiento y otros gastos (`spending.expenses`).

## R18
El sistema DEBE mostrar la métrica «Otros gastos por {unidad}» con `costPerDistance.expenses` y, cuando es `null`, «—» con la ayuda de `stats.pending.costPerDistance`.

## R19
El sistema DEBE mostrar en la gráfica «Gasto por categoría» las categorías de `spending.byCategory` y de `spending.expensesByCategory` juntas, de mayor a menor total, con dos series («Mantenimiento» y «Otros gastos») y la etiqueta de cada categoría en su namespace.

## R20
MIENTRAS `spending.byCategory` y `spending.expensesByCategory` están vacíos, el sistema DEBE mostrar en «Gasto por categoría» el texto «Hace falta un mantenimiento con coste o un gasto para ver el gasto por categoría.».

## R21
El sistema DEBE apilar en la gráfica «Gasto por mes» la serie «Otros gastos» (`series.spendingByMonth[].expenses`) junto a combustible y mantenimiento, y mostrar el texto vacío «Hace falta un repostaje, un mantenimiento con coste o un gasto para ver el gasto por mes.».

## Modo local

## R22
MIENTRAS está activo el modo local, el sistema DEBE crear y listar los gastos de la ficha en la base de datos del teléfono y contarlos en «Coste total» sin hacer ninguna petición HTTP.

## Textos

## R23
El sistema DEBE definir en `es` y en `en` todos los textos nuevos de la sección, el formulario y las estadísticas, incluida una etiqueta no vacía para cada categoría de `EXPENSE_CATEGORIES` (`other`: «Varios» / «Miscellaneous»).

## Cobertura del acceptance

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Desde la ficha se puede crear, editar y eliminar un gasto | R1, R2, R3, R7, R8, R9, R10, R11, R12, R13, R14, R15, R16, R22 |
| El listado se puede filtrar por categoría | R4, R5, R6 |
| Las estadísticas muestran los gastos en el desglose por categoría y en el coste total | R17, R18, R19, R20, R21 |
| Tests de componente cubren formulario, listado y desglose | R1–R21 (tests de T6, T8 y T12) |
| Todos los textos existen en es y en | R23 |
| `pnpm harness --full` pasa en verde | última task de `tasks.md` |

R22 sale de la descripción de la feature («con servidor y en local»). R18 y R21 salen de `docs/PLAN.md` › Fase 9 («incluidos en el coste total de propiedad y en el coste por km») y de los campos que #87 dejó preparados.
