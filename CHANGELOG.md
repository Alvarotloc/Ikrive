# Changelog

Todos los cambios relevantes de Ikrive se documentan en este fichero.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Unreleased]

## [0.3.0] - 2026-11-20

Fotos con la cámara del móvil y export del modo «En este teléfono» con mucha menos memoria. Cierra la fase de la app móvil.

### Added

#### Cámara

- **Hacer foto** en la foto del vehículo (con **Elegir de la galería** al lado) y en las facturas de un mantenimiento, también en su alta: abre la cámara y la foto se sube como una imagen elegida, con los mismos límites y avisos. Aparece en la app de Android, con servidor y en el modo «En este teléfono», y en la web desde un móvil o tableta.
- En la app de Android, la primera vez se pide permiso para la cámara; si se deniega, la app explica cómo activarlo en los ajustes de Android y la galería y la subida de archivos siguen funcionando.
- Si Android cierra la app mientras la cámara está abierta (pasa en algunos móviles con poca memoria libre), al volver la app recupera la foto y la lleva a su sitio: la foto del vehículo, las facturas del mantenimiento o el formulario de alta con los campos como estaban. En el alta se pierden las otras facturas pendientes, y la app avisa para volver a añadirlas; en la foto del vehículo, los cambios del formulario sin guardar. Si no se puede recuperar, avisa con «No se ha podido recuperar la foto de la cámara».
- Las fotos que la cámara deja en la carpeta de la app se borran la siguiente vez que arranca; mientras está abierta se conservan para poder reintentar una subida que falló.

### Changed

- El export de «Descargar mis datos» en el modo «En este teléfono» se escribe en el teléfono por partes y lee cada foto y factura a trozos, en lugar de montar el zip entero en memoria. Así, exportar cientos de MB de facturas ya no exige tener el zip ni cada factura enteros en memoria, que en un móvil con poca RAM podía dejar la app sin memoria; el zip es el mismo y se importa igual en un servidor.

### Fixed

- Las fotos del vehículo en AVIF se aceptan, con servidor y en el teléfono; antes se rechazaban aunque el aviso de formatos las incluía. HEIC sigue sin admitirse.
- En el modo «En este teléfono», los eventos de «Añadir al calendario» (Google, Outlook y calendario del teléfono) ya no incluyen un enlace a la ficha del vehículo que no abría nada fuera de la app.
- Los diálogos con nombres largos sin espacios, como el de eliminar una factura hecha con la cámara, ya no se salen de la pantalla en el móvil: el nombre se parte en varias líneas.

## [0.2.0] - 2026-11-17

App de Android con dos modos: conectada a tu servidor o con los datos solo en el teléfono.

### Added

#### App de Android

- APK para Android, la misma web empaquetada con Capacitor. Se publica firmada en [GitHub Releases](https://github.com/alvarotloc/ikrive/releases) junto a su `.sha256`, sin Play Store; las actualizaciones se instalan encima. Guía en [docs/mobile.md](docs/mobile.md). En iPhone se sigue usando la PWA.
- Pantalla de inicio para elegir entre **Mi servidor** y **En este teléfono**; la app recuerda el modo y «Cambiar de modo» vuelve a esa pantalla sin borrar datos.
- El botón atrás de Android cierra primero el diálogo o menú abierto, después vuelve a la pantalla anterior y, en el inicio o el login, minimiza la app en lugar de cerrarla.

#### Modo «Mi servidor»

- Conexión a tu instancia por su dirección: la app la comprueba con `/api/health`, distingue una dirección no válida, un servidor que no responde y uno que no es Ikrive, y avisa si es `http://` (la contraseña y el token viajan en claro).
- La API acepta, además de la cookie de la web, una sesión por token para la app y CORS solo para los orígenes de `TRUSTED_ORIGINS` (por defecto `capacitor://localhost,https://localhost`).
- «Cambiar servidor» en el login y en la pantalla «Sin conexión»; fotos, facturas, informe de venta y export funcionan con el token.

#### Modo «En este teléfono»

- Uso sin cuenta, sin servidor y sin conexión: los datos se guardan en una base SQLite dentro de la app, con las mismas reglas que el servidor (no se puede retroceder el kilometraje, fechas futuras, etc.).
- Ajustes, vehículos, lecturas de km, repostajes, mantenimientos, reglas de mantenimiento, gasto y estadísticas.
- Foto del vehículo (enderezada, reducida a 1600 px y guardada en WebP) y facturas en el almacenamiento privado de la app; se borran con su mantenimiento o vehículo.
- Export de todos los datos en el mismo zip que el servidor, que se puede importar en una instancia para pasar del teléfono a un servidor.
- Recordatorios de mantenimiento y aviso semanal de km en la campana y como notificación de Android, revisados al abrir la app, al volver a ella y cada minuto mientras está abierta, con el día y la hora del aviso de Ajustes.
- Informe de venta en PDF generado en el propio teléfono, con las facturas anexadas (hasta 25 MB de anexos). Sin enlaces públicos.
- Lo que solo tiene sentido con servidor no aparece: cuenta, usuarios, canales de notificación, feed iCal, enlaces públicos e import.

#### Ficheros, calendario y notificaciones en el teléfono

- Descargar una factura, el export o el informe de venta abre la hoja de compartir de Android; las facturas PDF se abren con el visor del sistema.
- En los dos modos, «Añadir al calendario» ofrece **Calendario del teléfono**, que abre la app de calendario con el evento de día completo ya relleno, sin pedir permisos.
- Los avisos nuevos de la campana salen también como notificaciones de Android (sin repetirse y mientras la app está abierta); tocar una abre la pantalla del aviso y lo marca como leído. Estado y permiso en *Ajustes › Notificaciones del teléfono*.

### Changed

- La PWA ya no descarga para uso sin conexión el código que solo usa la app de Android.
- El servidor comprueba al arrancar que puede escribir en `DATA_DIR`; si no, sale con un mensaje que explica cómo dar permisos a la carpeta en lugar de reiniciarse en bucle. La guía de autoalojamiento indica cómo crear `data` con el usuario 1000.

### Fixed

- Al iniciar sesión con otra cuenta (por ejemplo tras caducar la sesión) ya no se ven por un momento los vehículos ni los avisos de la cuenta anterior.
- Textos en inglés con comillas angulares españolas («») en lugar de comillas inglesas.

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

[Unreleased]: https://github.com/alvarotloc/ikrive/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/alvarotloc/ikrive/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/alvarotloc/ikrive/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/alvarotloc/ikrive/releases/tag/v0.1.0
