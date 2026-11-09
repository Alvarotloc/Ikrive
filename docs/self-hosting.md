# Guía de autoalojamiento

Cómo instalar, configurar, actualizar y hacer copias de seguridad de una instancia de Ikrive, y cómo exponerla a internet para que funcionen los enlaces públicos.

Ikrive se distribuye como una sola imagen Docker (`ghcr.io/alvarotloc/ikrive`) que sirve la API y la web en el puerto `3000`. Todos los datos viven en el volumen `/data`.

## Instalación con docker compose

Requisitos: Docker con el plugin `docker compose`.

1. Descarga el `docker-compose.yml` y el `.env.example` (como `.env`) en una carpeta nueva:

   ```bash
   mkdir ikrive && cd ikrive
   curl -O https://raw.githubusercontent.com/alvarotloc/ikrive/main/docker-compose.yml
   curl -o .env https://raw.githubusercontent.com/alvarotloc/ikrive/main/.env.example
   ```

2. Edita `.env` y fija como mínimo:
   - `BASE_URL`: la URL con la que vas a abrir Ikrive (por ejemplo `http://192.168.1.10:3000` en tu red o `https://ikrive.example.com` detrás de un proxy, ver [Exposición a internet](#exposición-a-internet)).
   - `AUTH_SECRET`: un secreto aleatorio de al menos 32 caracteres. Genéralo con `openssl rand -base64 48`.

3. Arranca:

   ```bash
   docker compose up -d
   ```

   Las migraciones de la base de datos se aplican solas al arrancar. `docker compose logs -f ikrive` muestra el log; si la configuración no es válida, el contenedor no arranca y el log empieza por `Invalid configuration` con la variable que falla.

4. Abre `BASE_URL` en el navegador y crea tu cuenta. **La primera cuenta que se registra es la de administrador**: puede gestionar las demás cuentas en *Usuarios*.

5. Cuando hayas creado todas las cuentas que necesites, cierra los registros: pon `DISABLE_SIGNUP=true` en `.env` y aplica el cambio con `docker compose up -d`.

### Actualizar

```bash
docker compose pull && docker compose up -d
```

Descarga la última imagen y recrea el contenedor; las migraciones nuevas se aplican al arrancar. Haz antes una [copia del volumen](#copia-del-volumen-data). Para fijar una versión concreta en lugar de `latest`, cambia la etiqueta de `image` en `docker-compose.yml` (por ejemplo `ghcr.io/alvarotloc/ikrive:0.1.0` o `:0.1`).

## Variables de entorno

Se leen del `.env` (`env_file` en `docker-compose.yml`). Los booleanos admiten `true`, `false`, `1` y `0`. Un valor no válido impide arrancar (`Invalid configuration`).

| Variable | Por defecto | Descripción |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | URL pública de la instancia, tal como la abres en el navegador. Se usa en las cookies de sesión (con `https://` son `__Secure-`), en los enlaces de las notificaciones y en los enlaces públicos de los informes y del calendario |
| `AUTH_SECRET` | — | Secreto para firmar las sesiones, de al menos 32 caracteres. **Obligatoria en producción**. Si la cambias, se cierran todas las sesiones |
| `TRUSTED_ORIGINS` | `capacitor://localhost,https://localhost` | Orígenes, separados por comas, de los clientes que no se sirven desde `BASE_URL` (la app móvil de Capacitor en iOS y Android). Pueden iniciar sesión y llamar a la API con CORS; la app usa un token de sesión (`Authorization: Bearer`), nunca la cookie. Cada elemento es `esquema://host[:puerto]`, sin ruta ni `*`. Vacía (`TRUSTED_ORIGINS=`) no permite ningún origen. `capacitor://localhost` es la app en iOS y `https://localhost` la de Android: si no usas la app de Android, deja solo `TRUSTED_ORIGINS=capacitor://localhost`, y si no usas ninguna app, déjala vacía. Más en [App móvil](mobile.md#cors-trusted_origins) |
| `DISABLE_SIGNUP` | `false` | Bloquea los registros nuevos. La primera cuenta siempre se puede crear |
| `REMINDERS_ENABLED` | `true` | Programa los jobs horarios de recordatorios de mantenimiento (`reminders`) y de aviso de kilometraje (`odometer-nudge`). No afecta a su [lanzamiento manual](#lanzar-los-jobs-a-mano) |
| `MAX_UPLOAD_MB` | `20` | Tamaño máximo, en MB, de cada adjunto (facturas y fotos) |
| `REPORT_MAX_ANNEX_MB` | `100` | Tope total, en MB, de las facturas anexadas a un informe de venta. Las que no caben se omiten con un aviso en el informe |
| `IMPORT_MAX_MB` | `1024` | Tamaño máximo, en MB, del zip de un export que se importa y de su contenido descomprimido. Cada fichero del zip sigue limitado por `MAX_UPLOAD_MB` |
| `LOG_LEVEL` | `info` | Nivel de log: `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent` |
| `PORT` | `3000` | Puerto HTTP dentro del contenedor. Si lo cambias, ajusta también `ports` en `docker-compose.yml` |
| `TZ` | — | Zona horaria del proceso (fechas del log). Los recordatorios usan la zona y la hora que cada usuario elige en Ajustes |
| `NODE_ENV` | `development` (`production` en la imagen) | Modo de ejecución. **Lo fija la imagen**: no lo cambies |
| `HOST` | `0.0.0.0` | Interfaz en la que escucha el servidor. **Lo fija la imagen**: no lo cambies |
| `DATA_DIR` | `./data` (`/data` en la imagen) | Carpeta de la base de datos y de los ficheros subidos. **Lo fija la imagen**: monta el volumen en `/data` en lugar de cambiarlo |
| `WEB_DIST_DIR` | — (`/app/public` en la imagen) | Carpeta con la web compilada que sirve la API. **Lo fija la imagen**: no lo cambies |
| `IKRIVE_VERSION` | `0.0.0-dev` (`0.0.0` en una imagen construida sin `--build-arg VERSION`) | Versión que muestra la instancia y que se guarda en los exports. **La fija la imagen** al construirse a partir del tag (por ejemplo `v0.1.0`); un `docker build` local sin `--build-arg VERSION=…` la deja en `0.0.0` |

## Copias de seguridad

Hay dos formas complementarias: la copia del volumen guarda la instancia entera; el export guarda los datos de una cuenta y sirve para moverlos a otra cuenta o instancia.

### Copia del volumen `/data`

El volumen (la carpeta `./data` junto al `docker-compose.yml`) contiene todo:

- `ikrive.db`: la base de datos SQLite (cuentas, sesiones, vehículos, ajustes, notificaciones, enlaces públicos…), y `ikrive.db-wal` e `ikrive.db-shm` si existen: forman parte de la base de datos mientras está abierta.
- `uploads/`: facturas adjuntas y fotos de los vehículos.

Para copiarlo de forma consistente, **para el contenedor**: así SQLite vuelca el WAL y nadie escribe durante la copia.

```bash
docker compose stop
tar -czf ikrive-$(date +%F).tar.gz data
docker compose start
```

Para **restaurar**:

```bash
docker compose stop
rm -rf data && tar -xzf ikrive-AAAA-MM-DD.tar.gz
docker compose start
```

El contenedor se ejecuta como el usuario `node` (uid 1000) y es el dueño de los ficheros de `data`: si tu usuario del host no es el uid 1000, borrar o sustituir la carpeta (`rm -rf data`) puede fallar por permisos y necesitar `sudo` (`sudo rm -rf data`). Después de restaurar con otro usuario, devuelve la carpeta a su dueño con `sudo chown -R 1000:1000 data`. Si la copia es de una versión anterior, las migraciones pendientes se aplican al arrancar.

### Export e import por usuario

Cada usuario puede descargar sus datos en *Ajustes › Descargar mis datos* (`GET /api/me/export`): un zip con `data.json` (ajustes, vehículos, lecturas del odómetro, mantenimientos, programaciones, repostajes y canales de notificación) y los ficheros de las facturas y las fotos.

Para restaurarlo, en otra cuenta o en otra instancia, usa *Ajustes › Importar datos*:

- Los datos se **añaden** a la cuenta: no se borra ni se modifica nada de lo que ya tiene.
- La moneda y las unidades del export deben coincidir con las de los ajustes de la cuenta.
- El zip no puede superar `IMPORT_MAX_MB` (ni su contenido descomprimido) y cada fichero sigue limitado por `MAX_UPLOAD_MB`.
- Un mismo export no se importa dos veces en la misma cuenta: el segundo intento se rechaza (`409`) con el aviso «Este export ya se importó en tu cuenta».

El export **no sustituye** a la copia del volumen: no incluye la cuenta ni su contraseña, las sesiones, las notificaciones recibidas, los enlaces públicos de los informes ni la URL del calendario. Los tokens de los canales de notificación no se exportan, así que los canales que tenían token no se importan: vuelve a crearlos en Ajustes.

## Exposición a internet

Ikrive funciona entero en tu red local. Solo necesitas exponerlo a internet si quieres compartir el **enlace público del informe de venta** con un comprador o suscribirte al **calendario** desde un servicio externo como Google Calendar. Las rutas que se sirven sin sesión son:

- `/api/public/reports/:token`: el informe de venta compartido (con el token del enlace).
- `/api/calendar/:file`: el feed iCal de los próximos mantenimientos (con el token privado del usuario).

El resto de la API exige sesión (cookie o token de la app).

La [app de Android](mobile.md) necesita llegar al servidor desde el móvil: en casa le basta la LAN; fuera, una VPN o el proxy inverso con HTTPS de abajo.

### Proxy inverso con HTTPS

Pon un proxy inverso con HTTPS delante del contenedor y fija `BASE_URL` a la URL pública exacta (`BASE_URL=https://ikrive.example.com`). Con [Caddy](https://caddyserver.com/), que obtiene el certificado solo, basta con:

```caddy
ikrive.example.com {
	reverse_proxy ikrive:3000
}
```

(si Caddy corre fuera de la red de compose, usa `127.0.0.1:3000`). Nginx o Traefik sirven igual: reenvía el tráfico a `ikrive:3000` y pasa las cabeceras `Host`, `X-Forwarded-Proto` y `X-Forwarded-For`.

La API confía en las cabeceras del proxy (`trustProxy`) para saber la IP del cliente, que es la que cuenta en los límites de peticiones (por ejemplo, del inicio de sesión y de los enlaces públicos). Por eso:

- **El proxy tiene que sobrescribir `X-Forwarded-For`** con la IP real del cliente, no añadirla a la que envíe el cliente. Caddy y Traefik lo hacen por defecto; en Nginx usa `proxy_set_header X-Forwarded-For $remote_addr;`. Si no, cualquiera puede inventarse la cabecera y saltarse los límites por IP.
- **No expongas el puerto `3000` directamente** a internet: publícalo solo para el proxy (por ejemplo `127.0.0.1:3000:3000` en `ports`, o quita `ports` si el proxy está en la misma red de compose).

Los enlaces públicos se revocan desde la web, en el informe de venta del vehículo, y la URL del calendario se puede regenerar en Ajustes. Si un administrador desactiva una cuenta, sus enlaces públicos y su calendario dejan de servirse.

### Si `BASE_URL` es local

Con una `BASE_URL` local (`localhost`, una IP privada o de Tailscale, un nombre sin dominio o acabado en `.local`) todo funciona en tu red, pero los enlaces públicos que genera Ikrive no se pueden abrir desde fuera: la web lo avisa al compartir el informe. En ese caso, descarga el PDF y envíalo.

Si solo quieres acceder tú desde fuera de casa, una VPN como Tailscale o WireGuard es una alternativa privada que no expone nada a internet, aunque los enlaces públicos seguirán sin funcionar para terceros.

## Lanzar los jobs a mano

Los jobs `reminders` (recordatorios de mantenimiento) y `odometer-nudge` (aviso semanal de kilometraje) se ejecutan cada hora. Para probar la instalación sin esperar, se pueden lanzar a mano. Aplican las mismas reglas que el planificador: solo avisan a los usuarios que ya han pasado su hora de recordatorio (y, en `odometer-nudge`, en su día elegido), y no repiten avisos ya creados. Funcionan aunque `REMINDERS_ENABLED=false`.

Ambas formas devuelven un resumen en JSON: `{"job":"reminders","evaluated":1,"created":1,"failed":0}` (entradas evaluadas, notificaciones creadas y envíos por canal que fallaron).

**Desde el contenedor** (sin credenciales; aplica las migraciones pendientes):

```bash
docker compose exec ikrive node dist/job.js reminders
docker compose exec ikrive node dist/job.js odometer-nudge
```

**Por HTTP**, con la sesión de la cuenta de administrador (copia la cookie `better-auth.session_token`, o `__Secure-better-auth.session_token` con HTTPS, desde las herramientas del navegador):

```bash
curl -X POST https://ikrive.example.com/api/admin/jobs/reminders/run \
  -H 'Cookie: __Secure-better-auth.session_token=<valor>'
```

Responde `401` sin sesión, `403` si la cuenta no es de administrador y `404` si el job no existe.
