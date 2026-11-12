# App móvil

Ikrive tiene una app para **Android**: la misma web empaquetada con [Capacitor](https://capacitorjs.com/) en una APK. Se conecta a tu instancia («Mi servidor») con un token de sesión. En **iPhone** se usa la web instalada como PWA.

> El modo «En este teléfono» (datos solo en el móvil, sin servidor) aparece como «Próximamente».

## Instalar la APK en Android

1. Descarga de la [página de Releases](https://github.com/alvarotloc/ikrive/releases) los dos ficheros de la versión: `ikrive-vX.Y.Z.apk` y `ikrive-vX.Y.Z.apk.sha256`.
2. Comprueba que la APK no se ha alterado (en un ordenador, con los dos ficheros en la misma carpeta):

   ```bash
   sha256sum -c ikrive-vX.Y.Z.apk.sha256
   # ikrive-vX.Y.Z.apk: OK
   ```

3. Pásala al móvil y ábrela. Android pedirá permiso para **instalar apps de orígenes desconocidos** para la app con la que la abres (Archivos, Chrome…): concédelo solo para esa instalación (*Ajustes › Aplicaciones › Acceso especial › Instalar apps desconocidas*).
4. Para actualizar, instala la APK de la versión nueva encima: se conservan el servidor y la sesión. Todas las APK de las Releases están firmadas con la misma clave; una APK firmada con otra clave (por ejemplo, una compilada por ti) no se instala encima, hay que desinstalar antes.

## Conectar con tu servidor

Al abrir la app, elige **Mi servidor** y escribe la dirección de tu instancia, la misma que abres en el navegador (`BASE_URL`). Sin `http://` ni `https://` se prueba con `https://`. La app pide `GET /api/health` y solo guarda la dirección si responde un Ikrive; después muestra el login de esa instancia. Para cambiar de servidor, usa «Cambiar servidor» en el login (si tienes sesión, cierra sesión antes) o en la pantalla «Sin conexión».

### CORS: `TRUSTED_ORIGINS`

La app de Android se sirve desde el origen `https://localhost` y llama a tu servidor con CORS. El servidor solo le responde si ese origen está en [`TRUSTED_ORIGINS`](self-hosting.md#variables-de-entorno). El valor por defecto ya lo incluye:

```dotenv
TRUSTED_ORIGINS=capacitor://localhost,https://localhost
```

Si lo cambiaste, añade `https://localhost`. Si falta, la app dice que el servidor **no responde** aunque sea alcanzable (el navegador de la app bloquea la respuesta).

Por lo mismo, si escribes la dirección de algo que no es Ikrive (el router, otra web), normalmente verás **no responde** y no «no es un servidor de Ikrive»: esa web no envía cabeceras CORS para `https://localhost` y la app no llega a leer su respuesta.

### El servidor tiene que ser alcanzable desde el móvil

- En casa, por la IP o el nombre de la LAN (`http://192.168.1.10:3000`).
- Fuera de casa, con una VPN (WireGuard, Tailscale…) o exponiendo la instancia con un [proxy inverso con HTTPS](self-hosting.md#proxy-inverso-con-https).

### HTTP o HTTPS

La app acepta servidores `http://` porque en una LAN es habitual no tener certificado. Pero **con `http://` la contraseña y el token de sesión viajan en claro** por la red: la app lo avisa al escribir la dirección. Usa HTTPS (proxy inverso) o una VPN siempre que el tráfico salga de tu red de confianza.

## iPhone: la PWA

No hay app para iOS. Abre tu instancia en **Safari**, pulsa **Compartir › Añadir a pantalla de inicio** y se instala como app (PWA) con su icono, a pantalla completa y con la caché sin conexión. Usa la sesión normal de la web, sin `TRUSTED_ORIGINS`.

## Ficheros

- **Descargar** (una factura, el export en zip de «Descargar mis datos» o el informe de venta) abre la **hoja de compartir** de Android con el fichero y su nombre: desde ella lo guardas en Archivos o Drive, lo envías por correo o mensajería, etc. Si la cierras sin elegir nada, no pasa nada.
- **Abrir una factura PDF** la muestra con el **visor** de PDF del sistema, fuera de la app; al volver, la app sigue donde estaba. Hace falta tener instalada una app que lea PDF (Google Drive, el visor del fabricante…); si no hay ninguna, la app avisa con «No se ha podido abrir el archivo».

La app no pide permisos de almacenamiento: los ficheros se preparan en su caché, que Android vacía cuando necesita espacio.

## Calendario y notificaciones

- **Calendario del teléfono.** En una regla de mantenimiento, «Añadir al calendario» ofrece Google Calendar, Outlook (se abren en el navegador) y **Calendario del teléfono** en lugar de «Descargar .ics». Esta última abre la pantalla de nuevo evento de tu app de calendario con el evento de día completo ya relleno (título, descripción y enlace a la ficha del vehículo); eliges la cuenta y guardas. La app no pide permisos de calendario. Si no hay ninguna app de calendario, avisa con «No se ha podido abrir el calendario del teléfono».
- **Notificaciones.** La primera vez que entras con tu cuenta, la app pide permiso para mostrar notificaciones (Android 13 o posterior) una sola vez. Con el permiso concedido, cada aviso nuevo de la campana sale también como notificación de Android, sin repetirse; los avisos que ya tenías al instalarla no se notifican. Tocar la notificación abre la app en la pantalla del aviso (el vehículo o la página que enlaza) y lo marca como leído; si el aviso ya no existe o la sesión ha caducado, la app se abre en su pantalla de siempre.
- **Ajustes › Notificaciones del teléfono** muestra el estado del permiso. Si aún no lo has decidido, el botón «Permitir notificaciones» lo vuelve a pedir; si lo denegaste, actívalo en *Ajustes › Aplicaciones › Ikrive › Notificaciones* de Android. Sin permiso la app funciona igual y los avisos siguen en la campana.
- **Solo con la app abierta.** Las notificaciones salen de la consulta periódica de la campana (cada 60 s), así que llegan mientras la app está abierta o en la primera consulta al volver a abrirla. Para recibir los avisos con la app cerrada, añade un canal en *Ajustes › Canales de notificación* (ntfy, Gotify, Apprise o webhook): los envía el servidor aunque el móvil no tenga la app abierta.

## Limitaciones conocidas

- Sin modo «En este teléfono».
- Las notificaciones del teléfono solo llegan con la app abierta (ver [Calendario y notificaciones](#calendario-y-notificaciones)); con la app cerrada, usa los canales de notificación.
- La pantalla de arranque es la de Capacitor.

## Publicar una versión (mantenedores)

El workflow `Release` (`.github/workflows/release.yml`), al empujar un tag `vX.Y.Z`, compila la APK de release, la firma con `apksigner` y sube `ikrive-vX.Y.Z.apk` y su `.sha256` a la GitHub Release del tag (la crea con notas generadas si no existe). `versionName` es el tag sin `v` y `versionCode` `X·10000 + Y·100 + Z` (minor y patch menores de 100). Si falta algún secreto de firma, el job falla antes de compilar.

### Clave de firma (una vez)

```bash
keytool -genkeypair -v -keystore ikrive-release.jks -alias ikrive \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 ikrive-release.jks > ikrive-release.jks.b64
```

El keystore es PKCS12: la clave usa la misma contraseña que el almacén. **Guarda el `.jks` y su contraseña fuera del repositorio y con copia de seguridad**: si se pierden, las APK nuevas no se podrán instalar encima de las antiguas. Los `*.jks` y `*.keystore` están en `.gitignore`.

### Secretos del repositorio

En *Settings › Secrets and variables › Actions*:

| Secreto | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Contenido de `ikrive-release.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña del almacén |
| `ANDROID_KEY_ALIAS` | `ikrive` (el `-alias` de `keytool`) |
| `ANDROID_KEY_PASSWORD` | Contraseña de la clave (en PKCS12, la misma que la del almacén) |

### Compilar en local

Requisitos: JDK 21 y el SDK de Android (`ANDROID_HOME`).

```bash
pnpm --filter @ikrive/mobile build:web            # build nativo de la web (sin PWA) en apps/web/dist-native
pnpm --filter @ikrive/mobile exec cap sync android
cd apps/mobile/android && ./gradlew assembleDebug  # app/build/outputs/apk/debug/app-debug.apk
```

En cada PR que toca `apps/mobile`, `apps/web`, el lockfile o `ci.yml`, el CI compila esta APK debug y la deja como artefacto `ikrive-debug-apk`.
