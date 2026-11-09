# Requirements — web-api-base-url

> Feature 50 (fase 8, etapa 1 «Mi servidor»). La SPA puede hablar con un servidor de otro origen usando el token de sesión de #49, para que #51 la empaquete en la app de Capacitor. Solo `apps/web`; sin cambios en la API, BD, `packages/shared` ni Docker. Sin UI nueva: la URL base la fijará #51.
> **URL base** = URL del servidor guardada en el dispositivo (`setServerUrl`). **Modo mismo origen** = sin URL base (la web de hoy). **Modo servidor** = con URL base. **Token** = valor de `set-auth-token` del login (#49). **Ficheros** = foto del vehículo (`photoUrl`), miniatura (`thumbnailUrl`) y original de una factura (`url`, con o sin `?inline=1`), todos rutas `/api/…` que devuelve la API.

## Modo mismo origen

## R1
MIENTRAS no haya URL base, el sistema DEBE enviar las peticiones de `api` y `authClient` a rutas relativas `/api/…` con `credentials: 'include'` y sin cabecera `Authorization`.

## R2
MIENTRAS no haya URL base, el sistema DEBE usar la ruta de cada fichero y del export (`/api/me/export`) directamente como `src`/`href`, sin pedirlos antes con `fetch`.

## Modo servidor

## R3
MIENTRAS haya URL base, el sistema DEBE enviar cada petición de `api` y `authClient` a `<URL base>/api/…` con `credentials: 'omit'`.

## R4
MIENTRAS haya URL base y token guardados, el sistema DEBE añadir `Authorization: Bearer <token>` a cada petición de `api`, de `authClient` y de ficheros.

## R5
CUANDO se fija una URL base nueva con `setServerUrl`, el sistema DEBE usarla desde la petición siguiente, sin recargar la app.

## R6
SI la URL que recibe `setServerUrl` no es una URL `http:` o `https:` ENTONCES el sistema DEBE lanzar un error sin cambiar la URL base guardada.

## R7
CUANDO la URL base guardada cambia o se borra, el sistema DEBE borrar el token guardado.

## Sesión

## R8
CUANDO un inicio de sesión o registro en modo servidor responde 2xx con la cabecera `set-auth-token`, el sistema DEBE guardar ese token en el dispositivo.

## R9
CUANDO el usuario cierra sesión, el sistema DEBE borrar el token guardado, aunque falle la petición `POST /api/auth/sign-out`.

## Ficheros en modo servidor

## R10
MIENTRAS haya URL base, el sistema DEBE pintar la foto del vehículo, las miniaturas y la imagen del visor de facturas con una URL `blob:` obtenida mediante una petición autenticada (R3, R4) al fichero.

## R11
MIENTRAS se carga una imagen en modo servidor, el sistema DEBE mostrar un placeholder con las clases del contenedor, sin `<img>`.

## R12
SI la petición autenticada de una imagen falla ENTONCES el sistema DEBE tratarlo como un error de carga de la imagen (el visor muestra su mensaje `role="alert"`).

## R13
CUANDO el usuario descarga una factura en modo servidor, el sistema DEBE pedirla con una petición autenticada y guardarla con el nombre de `Content-Disposition` o, sin él, con su `originalName`.

## R14
CUANDO el usuario abre una factura PDF en modo servidor, el sistema DEBE pedir su URL con `?inline=1` con una petición autenticada y abrir el `blob:` resultante en una pestaña nueva.

## R15
CUANDO el usuario exporta sus datos en modo servidor, el sistema DEBE pedir `GET /api/me/export` con una petición autenticada y guardar el zip con el nombre de `Content-Disposition`.

## R16
SI falla una descarga o apertura autenticada (R13–R15) ENTONCES el sistema DEBE mostrar un toast de error `common.fileError`.

## R17
MIENTRAS haya URL base, el sistema DEBE usarla, en lugar de `window.location.origin`, como enlace a la app en los eventos de «Añadir al calendario».

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| `lib/api-client.ts` y `lib/auth-client.ts` usan una URL base configurable en tiempo de ejecución y, si la hay, envían el token guardado en el dispositivo | R3, R4, R5, R6, R7, R8 (el informe PDF y las subidas usan `api` y quedan cubiertos por R3/R4) |
| Sin URL base, la web funciona como hoy: mismo origen y cookie | R1, R2 (y la suite existente en verde) |
| Fotos, miniaturas, facturas y descargas con una petición autenticada cuando no hay cookie | R10, R11, R12, R13, R14, R15, R16, R17 |
| Cerrar sesión borra el token guardado | R9 |
| Tests de componente o unitarios de los dos modos del cliente y de la carga autenticada de una imagen | R1–R17 (tests en `tasks.md`) |
| `pnpm harness --full` pasa en verde | última task de `tasks.md` |
