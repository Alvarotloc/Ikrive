# Requirements — mobile-shell-android

> Feature 51 (fase 8, etapa 1 «Mi servidor»). Proyecto Capacitor en `apps/mobile` que empaqueta la SPA, primera pantalla con los dos modos, conexión a un servidor validada con `/api/health` y APK firmada en la GitHub Release del tag. Se apoya en #49 (bearer + CORS) y #50 (`lib/server.ts`, `apiFetch`, `useApiFileSrc`).
> **App nativa** = la SPA del build nativo (`vite build --mode native`) dentro de la APK. **Web** = la SPA servida por la API (la de hoy). **Servidor guardado** = la URL de `getServerUrl()` (#50). **Build nativo** = `apps/web/dist-native`.

## Empaquetado

## R1
El proyecto Capacitor de `apps/mobile` DEBE empaquetar como contenido web el build nativo de `apps/web` (`webDir` → `apps/web/dist-native`).

## R2
El build nativo NO DEBE contener service worker ni manifiesto PWA: ni `sw.js`, `registerSW.js`, `workbox-*.js` ni `manifest.webmanifest`, ni `<link rel="manifest">` en `index.html`.

## R3
La app Android DEBE servirse desde el origen `https://localhost` (`androidScheme: 'https'`), que es el que la API admite por defecto en `TRUSTED_ORIGINS`.

## R4
La app Android DEBE permitir conectar con servidores `http:` además de `https:` (contenido mixto y tráfico en claro habilitados).

## Primera pantalla

## R5
MIENTRAS se ejecute la app nativa sin servidor guardado, CUANDO se abre una ruta de la app, `/login` o `/register`, el sistema DEBE redirigir a `/welcome` antes de pedir nada a la API.

## R6
CUANDO se muestra `/welcome`, el sistema DEBE ofrecer las opciones «Mi servidor», que lleva a `/server`, y «En este teléfono».

## R7
MIENTRAS el modo local no exista, el sistema DEBE mostrar «En este teléfono» deshabilitada y con la etiqueta «Próximamente».

## R8
MIENTRAS se ejecute la web, CUANDO se abre `/welcome` o `/server`, el sistema DEBE redirigir a `/login`.

## «Mi servidor»

## R9
CUANDO el usuario envía una URL en `/server`, el sistema DEBE pedir `GET <URL>/api/health` sin cookies ni cabecera `Authorization` y con un límite de 10 s.

## R10
CUANDO la URL enviada no lleva esquema, el sistema DEBE completarla con `https://` antes de comprobarla.

## R11
SI la URL enviada no es una URL `http:` o `https:` válida ENTONCES el sistema DEBE mostrar el error en el campo sin hacer ninguna petición.

## R12
SI `GET /api/health` falla sin respuesta (red, CORS o tiempo agotado) ENTONCES el sistema DEBE mostrar un error «no responde» que menciona `TRUSTED_ORIGINS`, sin cambiar el servidor guardado.

## R13
SI `GET /api/health` responde con un estado no 2xx o con un cuerpo que no cumple `healthSchema` ENTONCES el sistema DEBE mostrar un error «no es un servidor de Ikrive», sin cambiar el servidor guardado.

## R14
CUANDO `GET /api/health` responde 2xx con un cuerpo que cumple `healthSchema`, el sistema DEBE guardar la URL normalizada y navegar a `/login`.

## R15
MIENTRAS se ejecute la app nativa, el sistema DEBE mostrar en `/login` el servidor guardado y un enlace «Cambiar servidor» a `/server`.

## R25
MIENTRAS el valor del campo de `/server`, tras completar el esquema (R10) y normalizarlo, sea una URL `http:`, el sistema DEBE mostrar un aviso visible, que no impide conectar, de que la conexión no está cifrada y la contraseña y el token viajarán en claro, recomendando HTTPS o una VPN.

## R16
MIENTRAS se ejecute la app nativa, SI una ruta no carga por un error de red ENTONCES la pantalla de error DEBE ofrecer «Cambiar servidor» además de «Reintentar».

## Cambio de servidor y caché

## R17
CUANDO se guarda un servidor desde `/server`, el sistema DEBE vaciar la caché de TanStack Query (`queryClient.clear()`).

## R18
El sistema DEBE incluir el servidor guardado en la clave de la caché de ficheros (`['api-file', <servidor | null>, url]`).

## Publicación

## R19
CUANDO se empuja un tag `v*.*.*`, el workflow de release DEBE compilar la APK de release y firmarla con el keystore guardado en los secretos del repositorio.

## R20
CUANDO la APK firmada está lista, el workflow DEBE subir `ikrive-<tag>.apk` y `ikrive-<tag>.apk.sha256` (formato `sha256sum`) a la GitHub Release del tag, creándola si no existe.

## R21
El workflow DEBE fijar en la APK `versionName` = tag sin `v` y `versionCode` = `major·10000 + minor·100 + patch`.

## R22
SI falta algún secreto de firma ENTONCES el workflow DEBE fallar antes de compilar, sin publicar nada.

## Documentación e i18n

## R23
La documentación DEBE explicar cómo instalar la APK (descarga, verificación con `sha256sum -c`, orígenes desconocidos), la configuración de CORS que necesita (`TRUSTED_ORIGINS` con `https://localhost`) y la alternativa PWA en iPhone.

## R24
El sistema DEBE tener todos los textos nuevos en `es.json` y `en.json`.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Existe `apps/mobile` con Capacitor que empaqueta el build de `apps/web`, sin PWA ni service worker dentro de la APK | R1, R2, R3, R4 |
| La primera pantalla ofrece «Mi servidor» y «En este teléfono»; el segundo como próximamente | R5, R6, R7, R8 |
| «Mi servidor» pide la URL, la valida con `/api/health` (error claro si no responde o no es Ikrive), la recuerda y muestra el login de esa instancia; se puede cambiar de servidor | R9, R10, R11, R12, R13, R14, R15, R16, R25 (pedido en Gate 1) |
| Workflow que compila la APK al empujar un tag, la firma con secretos y la sube a la Release con su `.sha256` | R19, R20, R21, R22 |
| Doc de instalación de la APK, CORS y alternativa PWA en iPhone | R23 |
| Todos los textos en `es.json` y `en.json` | R24 |
| Cambiar de servidor no muestra fotos ni facturas en caché del servidor anterior (clave con el servidor o `queryClient.clear()`) | R17, R18 (las dos) |
| `pnpm harness --full` pasa en verde | última task de `tasks.md` |
