# Requirements — data-portability-web

> Feature 36 (fase 7). Sección «Tus datos» en Ajustes: descarga el export (#34, `GET /api/me/export`) e importa un zip (#35, `POST /api/me/import`).
> «Sección» = la tarjeta «Tus datos» de `/settings`. «Resumen» = el `DataImportSummary` de la respuesta 201. «Problem» = cuerpo `application/problem+json` de una respuesta de error.

## Exportar

## R1
El sistema DEBE mostrar en la página de Ajustes una sección «Tus datos» con un enlace «Descargar mis datos» que apunta a `/api/me/export` con el atributo `download`.

## Importar: elegir y confirmar

## R2
El sistema DEBE ofrecer en la sección un botón «Importar datos» que abre un selector de un único fichero limitado a `.zip`.

## R3
CUANDO el usuario elige un fichero, el sistema DEBE abrir un diálogo de confirmación con el nombre del fichero que explica que los datos se añaden a la cuenta sin borrar ni modificar nada y que la moneda y las unidades del export deben coincidir con las de sus ajustes.

## R4
CUANDO el usuario cancela el diálogo de confirmación, el sistema NO DEBE enviar ninguna petición a `POST /api/me/import`.

## R5
CUANDO el usuario confirma, el sistema DEBE enviar `POST /api/me/import` en `multipart/form-data` con el fichero elegido en el campo `file`.

## R6
MIENTRAS el import está en curso, el sistema DEBE deshabilitar el botón «Importar datos» y mostrar en él «Importando…».

## Importar: resultado

## R7
CUANDO la API responde 201, el sistema DEBE mostrar un toast de éxito y, en la sección, el resumen con el número de vehículos, lecturas de odómetro, programaciones, mantenimientos, repostajes, adjuntos, fotos y canales de notificación importados.

## R8
DONDE el resumen tiene `skipped.notificationChannels > 0`, el sistema DEBE mostrar junto al resumen un aviso con ese número que explica que esos canales no se importaron porque necesitan un token y hay que volver a crearlos.

## R9
CUANDO la API responde 201, el sistema DEBE invalidar las queries bajo `queryKeys.vehicles.all` y `queryKeys.notificationChannels.all`.

## R10
SI la API responde con un error ENTONCES el sistema DEBE mostrar un toast de error con un mensaje traducido según el estado (400 export no válido, 409 moneda o unidades distintas, 413 demasiado grande, 415 fichero de tipo no admitido, cualquier otro el error genérico) y el `detail` del problem como descripción cuando lo trae, sin mostrar resumen ni invalidar queries.

## i18n

## R11
El sistema DEBE definir todos los textos nuevos de la sección en `es.json` y en `en.json` con las mismas claves.

## Acceptance → requirements

| Acceptance (`feature_list.json` #36) | Requirements |
|---|---|
| Ajustes tiene una sección «Tus datos» con un botón para descargar el export | R1 |
| Importar permite elegir un zip, explica que se añade sin borrar nada y pide confirmación antes de enviarlo | R2, R3, R4, R5, R6 |
| Tras importar se muestra el resumen y se invalidan las queries afectadas; los errores de la API se muestran en un toast | R7, R8, R9, R10 |
| Todos los textos nuevos en `es.json` y `en.json` | R11 |
| Tests de componente cubren exportar, importar con éxito y un import rechazado | T6, T7 (R1, R4, R5, R7–R10) |
| `pnpm harness --full` en verde | T9 |
