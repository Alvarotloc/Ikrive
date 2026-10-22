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
| `REMINDERS_ENABLED` | `true` | Programa el job horario que crea los recordatorios de mantenimiento (`true`, `false`, `1`, `0`) |
| `MAX_UPLOAD_MB` | `20` | Tamaño máximo de los adjuntos |
| `PORT` | `3000` | Puerto HTTP |
| `DATA_DIR` | `/data` | Carpeta de datos |
| `LOG_LEVEL` | `info` | Nivel de log |

## Desarrollo

Requisitos: Node 24 y pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev          # API en :3000 y web en :5173 (con proxy de /api)
pnpm test         # tests
pnpm lint         # Biome
pnpm typecheck
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
