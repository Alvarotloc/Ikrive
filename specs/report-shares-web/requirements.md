# Requirements — report-shares-web

> Feature 33 (fase 6, la cierra). Desde el diálogo del informe de venta (#31) se crean, copian, listan y revocan los enlaces públicos de #32. Incluye un cambio pequeño en la API: `GET /api/config` indica si `BASE_URL` es local.
> «Diálogo» = el del informe de venta. «Opciones actuales» = las cuatro casillas del diálogo (`hidePrices`, `hidePlate`, `hideVin`, `includeInvoices`; las no visibles valen `false`). «Host local» = `localhost` o `*.localhost`; nombres terminados en `.local`, `.lan`, `.home.arpa` o `.internal`; nombres de una sola etiqueta sin punto (p. ej. `nas`); loopback (`127.0.0.0/8`, `::1`), `0.0.0.0`, IPv4 privada (`10/8`, `172.16/12`, `192.168/16`), CGNAT/Tailscale (`100.64.0.0/10`), link-local (`169.254/16`, `fe80::/10`) o IPv6 ULA (`fc00::/7`). Cualquier otro dominio (incluidos los `*.ts.net` de Tailscale Funnel) no es local.

## API: indicador de BASE_URL

## R1
CUANDO un usuario autenticado pide `GET /api/config` y el host de `BASE_URL` es un host local, el sistema DEBE incluir `localBaseUrl: true` en la respuesta.

## R2
CUANDO un usuario autenticado pide `GET /api/config` y el host de `BASE_URL` no es un host local (dominio o IP pública), el sistema DEBE incluir `localBaseUrl: false` en la respuesta.

## Crear y copiar

## R3
CUANDO se abre el diálogo, el sistema DEBE mostrar una sección «Compartir con un enlace» con un selector de caducidad de 7, 30 o 90 días (30 preseleccionado) y un botón «Crear enlace».

## R4
CUANDO el usuario pulsa «Crear enlace», el sistema DEBE pedir `POST /api/vehicles/:id/report-shares` con las opciones actuales como booleanos y `expiresInDays` igual a la caducidad seleccionada.

## R5
CUANDO la creación responde 201, el sistema DEBE mostrar la `url` de la respuesta en un campo de solo lectura con un botón «Copiar».

## R6
MIENTRAS se muestra la URL de un enlace recién creado, el sistema DEBE mostrar junto a ella el aviso de que no se podrá volver a ver al cerrar el diálogo.

## R7
CUANDO el usuario pulsa «Copiar», el sistema DEBE escribir la URL en el portapapeles y mostrar un toast de confirmación.

## R8
MIENTRAS la creación del enlace está en curso, el sistema DEBE mostrar el botón «Crear enlace» deshabilitado y con el texto «Creando…».

## R9
SI la creación del enlace falla ENTONCES el sistema DEBE mostrar un toast de error y dejar el diálogo abierto sin mostrar ninguna URL nueva.

## Accesibilidad desde internet

## R10
El sistema DEBE mostrar en la sección de enlaces el texto que explica que el enlace solo funciona si el servidor es accesible desde internet y que, si no lo es, se descargue el PDF y se envíe.

## R11
MIENTRAS `GET /api/config` responde `localBaseUrl: true`, el sistema DEBE mostrar en la sección de enlaces un aviso destacado de que el enlace no será accesible desde fuera de la red local.

## R12
SI `GET /api/config` responde `localBaseUrl: false` ENTONCES el sistema NO DEBE mostrar el aviso de `BASE_URL` local.

## Listado y revocación

## R13
CUANDO se abre el diálogo, el sistema DEBE pedir `GET /api/vehicles/:id/report-shares` y mostrar cada enlace con sus opciones, su fecha de caducidad y su estado (Activo, Caducado o Revocado).

## R14
SI el vehículo no tiene enlaces ENTONCES el sistema DEBE mostrar en la sección un mensaje de estado vacío.

## R15
SI la petición del listado falla ENTONCES el sistema DEBE mostrar un mensaje de error en la sección y mantener disponibles la descarga y la creación de enlaces.

## R16
DONDE un enlace del listado está activo, el sistema DEBE mostrar un botón «Revocar» para ese enlace.

## R17
SI un enlace del listado está caducado o revocado ENTONCES el sistema NO DEBE mostrar el botón «Revocar» para ese enlace.

## R18
CUANDO el usuario pulsa «Revocar», el sistema DEBE pedir confirmación en un diálogo de alerta sin hacer ninguna petición hasta que confirme.

## R19
CUANDO el usuario confirma la revocación, el sistema DEBE pedir `DELETE /api/vehicles/:id/report-shares/:shareId`.

## R20
SI la revocación falla ENTONCES el sistema DEBE mostrar un toast de error.

## R21
CUANDO la creación o la revocación de un enlace termina con éxito, el sistema DEBE volver a pedir el listado de enlaces del vehículo (invalidación de la query) y mostrar el resultado.

## i18n

## R22
El sistema DEBE definir todos los textos nuevos (sección, caducidades, botones, avisos, estados, opciones del listado, confirmación, toasts) en `es.json` y `en.json` con las mismas claves.

## Acceptance → requirements

| Acceptance (`feature_list.json` #33) | Requirements |
|---|---|
| «Crear enlace» con las opciones actuales y caducidad 7/30/90 | R3, R4, R8, R9 |
| URL con botón Copiar (portapapeles y toast) y aviso de que no se podrá volver a ver | R5, R6, R7 |
| Explicación de que solo funciona con el servidor accesible desde internet; sugerir descargar el PDF | R10 |
| Aviso destacado si `BASE_URL` es localhost / 127.0.0.1 / IP privada, vía `GET /api/config` | R1, R2, R11, R12 |
| Lista con opciones, caducidad y estado; revocar activos con confirmación | R13, R14, R15, R16, R17, R18, R19, R20 |
| Refresco de la lista tras crear o revocar | R21 |
| Textos en es.json y en.json | R22 |
| Tests de componente: crear y copiar, listado con los tres estados, revocar | R4, R5, R7, R13, R16, R17, R18, R19, R21 (tasks T9–T12) |
| `docs/PLAN.md` marca la fase 6 como hecha | T14 |
| `pnpm harness --full` en verde | T15 |
