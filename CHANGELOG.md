# Changelog

Todos los cambios relevantes de Ikrive se documentan en este fichero.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Unreleased]

## [0.1.0] - 2026-11-06

Primera versión pública.

### Added

#### Vehículos y odómetro

- Alta, edición, archivo y venta de vehículos: marca, modelo, versión, año, matrícula, VIN, tipo, combustible, datos de compra, notas y foto.
- Lecturas del odómetro manuales y automáticas (desde mantenimientos y repostajes), con validación de que el kilometraje crece con la fecha y una página para actualizar los km de todos los vehículos.
- Expediente del vehículo con kilometraje, media anual, distancia desde la compra y gasto en mantenimiento.

#### Mantenimiento y facturas

- Historial de mantenimientos por categoría (aceite, neumáticos, frenos, ITV, reparaciones…) con taller, coste y kilometraje, agrupado por año y filtrable.
- Facturas adjuntas (PDF e imágenes) con previsualización en el navegador.
- Reglas de mantenimiento por meses y/o distancia con su próxima fecha y kilometraje estimados, y estado «próximo» o «vencido».

#### Recordatorios y notificaciones

- Notificaciones in-app con un job horario de recordatorios según la zona y la hora de cada usuario.
- Canales externos: ntfy, Gotify, Apprise y webhook.
- Aviso semanal para actualizar los kilómetros de los vehículos sin lecturas recientes.
- Feed iCal privado con los próximos mantenimientos, regenerable desde Ajustes.
- Lanzamiento manual de los jobs desde el contenedor (`node dist/job.js`) o por HTTP para el administrador.

#### Repostajes y estadísticas

- Registro de repostajes (cantidad, precio total o por unidad, depósito lleno, repostaje olvidado) en litros, galones o kWh.
- Estadísticas del vehículo: distancia al año, consumo medio, coste de combustible y de mantenimiento por km y coste total de propiedad, con gráficas de distancia, consumo, gasto por mes y por categoría.

#### Informe de venta

- Informe de venta en PDF con el historial del vehículo y, opcionalmente, sus facturas anexadas.
- Enlaces públicos del informe para compartirlo con un comprador, revocables, con aviso cuando `BASE_URL` es local.

#### Exportar e importar

- Export de todos los datos de un usuario en un zip (`data.json` con los ficheros de facturas y fotos).
- Import de un export en otra cuenta o instancia, sin modificar los datos existentes y rechazando un mismo export importado dos veces.

#### Interfaz

- SPA en español e inglés, con el idioma, la moneda y las unidades guardados por usuario.
- Modo claro y oscuro, diseño adaptado al móvil con menú de cabecera.
- PWA instalable, con aviso de versión nueva y pantalla sin conexión.

#### Administración de usuarios

- Varias cuentas por instancia; la primera es la de administrador.
- Gestión de usuarios para el administrador: roles, desactivar y reactivar cuentas (una cuenta desactivada deja de servir sus enlaces públicos y su calendario) y cierre de registros con `DISABLE_SIGNUP`.

#### Imagen Docker y documentación

- Imagen única (API + web) `ghcr.io/alvarotloc/ikrive` para `linux/amd64` y `linux/arm64`, basada en Alpine, sin root y por debajo de 250 MB, con migraciones automáticas al arrancar y healthcheck.
- Guía de autoalojamiento ([docs/self-hosting.md](docs/self-hosting.md)): instalación, variables de entorno, copias de seguridad y exposición a internet.
- Capturas del README generadas con Playwright (`pnpm screenshots`) y tests E2E contra el build de producción.

[Unreleased]: https://github.com/alvarotloc/ikrive/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alvarotloc/ikrive/releases/tag/v0.1.0
