# Ikrive

**Tus vehículos, tus datos.** Ikrive es una aplicación open source y autoalojada para gestionar tus vehículos de forma privada:

- 🚗 **Vehículos**: marca, modelo, matrícula, VIN, kilometraje…
- 🔧 **Mantenimiento**: cambios de aceite, neumáticos, ITV, averías… con sus facturas adjuntas.
- ⏰ **Recordatorios** por fecha o por kilometraje, con aviso semanal para actualizar los km (in-app y push vía ntfy, Gotify o Apprise).
- 📊 **Estadísticas**: km al año, consumo, coste por km y coste total de propiedad.
- 📄 **Informe de venta**: un PDF (y un enlace público) con todo el historial y las facturas para vender mejor y más rápido.

> Estado: en desarrollo temprano. Ver [roadmap](#roadmap).

## Instalación con Docker

```bash
curl -O https://raw.githubusercontent.com/alvarotloc/ikrive/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/alvarotloc/ikrive/main/.env.example
# Edita .env: como mínimo BASE_URL y AUTH_SECRET (openssl rand -base64 48)
docker compose up -d
```

Abre `http://localhost:3000` y crea tu cuenta. **La primera cuenta es la de administrador.** Cuando hayas creado todas las cuentas que necesites, pon `DISABLE_SIGNUP=true`.

Todos los datos (la base de datos SQLite y los ficheros subidos) se guardan en el volumen `/data`, así que para hacer copia de seguridad basta con copiar esa carpeta.

### Configuración

| Variable | Por defecto | Descripción |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | URL pública de la instancia |
| `AUTH_SECRET` | — (obligatoria en producción) | Secreto para firmar sesiones |
| `TZ` | — | Zona horaria del proceso (logs). Los recordatorios usan la zona y la hora que cada usuario elige en Ajustes |
| `DISABLE_SIGNUP` | `false` | Bloquea nuevos registros tras el primero |
| `REMINDERS_ENABLED` | `true` | Programa los jobs horarios de recordatorios de mantenimiento (`reminders`) y de aviso de kilometraje (`odometer-nudge`) (`true`, `false`, `1`, `0`). No afecta a su lanzamiento manual |
| `MAX_UPLOAD_MB` | `20` | Tamaño máximo de los adjuntos |
| `PORT` | `3000` | Puerto HTTP |
| `DATA_DIR` | `/data` | Carpeta de datos |
| `LOG_LEVEL` | `info` | Nivel de log |

### Lanzar los jobs a mano

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

## Desarrollo

Requisitos: Node 24 y pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev          # API en :3000 y web en :5173 (con proxy de /api)
pnpm test         # tests
pnpm lint         # Biome
pnpm typecheck
pnpm --filter @ikrive/api job reminders   # lanza un job contra la BD de DATA_DIR (reminders | odometer-nudge)
```

Más detalles sobre la arquitectura y cómo contribuir en [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- [x] Fundaciones: monorepo, API, auth multiusuario, ajustes, Docker y CI
- [ ] Vehículos y odómetro
- [ ] Mantenimiento y facturas
- [ ] Recordatorios y notificaciones (in-app, ntfy, Gotify, Apprise)
- [ ] Repostajes y estadísticas
- [ ] Informe de venta (PDF y enlace público)
- [ ] Exportar/importar, PWA y release v0.1.0

## Licencia

[AGPL-3.0](LICENSE)
