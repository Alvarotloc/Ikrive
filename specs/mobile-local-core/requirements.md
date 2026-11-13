# Requirements — mobile-local-core

> Feature 54 (fase 8, etapa 2, parte 1 de 5). Modo «En este teléfono»: datos en SQLite en el dispositivo (`@capacitor-community/sqlite`), sin cuenta ni servidor, con una implementación local de la `DataSource` de #53. El esquema Drizzle pasa a `packages/db`.
> Fuentes: `progress/explore_mobile-local-mode_{data-source,mobile,export}.md`, `docs/PLAN.md` › Fase 8 › Etapa 2 (decisiones «Motor y esquema», «Enlaces públicos»).
> **Modo local** = app nativa (`isNativeApp()`) con el indicador de modo guardado a `local`. **DataSource local** = la implementación de `DataSource` sobre la base SQLite local. **Usuario local** = la fila sintética de `user` a la que apuntan las FK. **Problem** = `ApiError` con un `Problem` RFC 7807 (`type`, `title`, `status`, `detail`).

## A. Elección y persistencia del modo

## R1
CUANDO, en la app nativa, el usuario pulsa «En este teléfono» en `/welcome`, el sistema DEBE guardar el modo local en el dispositivo y abrir el panel (`/`) sin pasar por `/login` ni `/server` y sin peticiones de red.

## R2
MIENTRAS el modo local está guardado, el sistema DEBE abrir las rutas de la app al arrancar con la DataSource local, sin redirigir a `/welcome` ni a `/login`.

## R3
MIENTRAS la app está en modo local, el sistema DEBE redirigir `/login` y `/register` a `/`.

## R4
MIENTRAS la app está en modo local, `me()` DEBE resolver el usuario local (`id: 'local'`, rol `user`) y `config()` una configuración local, sin peticiones de red.

## R5
CUANDO el usuario sale del modo local, el sistema DEBE borrar el indicador de modo, vaciar la caché de queries, volver a la DataSource HTTP y llevarle a `/welcome`, sin borrar la base de datos local.

## R6
CUANDO el usuario guarda un servidor en `/server`, el sistema DEBE borrar el indicador de modo local.

## R7
DONDE la SPA corre en la web (no nativa), el sistema DEBE ignorar el indicador de modo local y usar la DataSource HTTP.

## B. Motor, esquema y migraciones

## R8
El sistema DEBE definir el esquema Drizzle (con `casing: 'snake_case'`) y las migraciones SQL en `packages/db`, y la API DEBE importarlos de ahí.

## R9
La API DEBE aplicar las migraciones `0000_init` … `0012_data_imports` desde `packages/db` con el mismo contenido que antes del cambio, también en el build (`dist/migrations`).

## R10
CUANDO se abre una base local vacía, el sistema DEBE aplicar las migraciones empaquetadas con Vite y obtener el mismo esquema (`sqlite_master`) que el migrador de la API.

## R11
CUANDO se abre una base local ya migrada, el sistema DEBE aplicar solo las migraciones pendientes, registradas en `__drizzle_migrations`, sin fallar ni repetir ninguna.

## R12
CUANDO se abre la base local, el sistema DEBE asegurar una única fila del usuario local y una única fila de sus ajustes con los valores por defecto de `DEFAULT_USER_SETTINGS`.

## R13
El sistema DEBE serializar las operaciones de la DataSource local, de modo que dos llamadas concurrentes no intercalen sus sentencias ni sus transacciones.

## R14
CUANDO la DataSource local se ejecuta en el dispositivo, el sistema DEBE traducir cada llamada de `drizzle-orm/sqlite-proxy` al plugin `@capacitor-community/sqlite` (consultas con filas como arrays en orden de columna, escrituras sin transacción implícita del plugin y `RETURNING` con sus filas).

## C. Datos en modo local

## R15
SI una entrada de la DataSource local no cumple su esquema zod de `@ikrive/shared` ENTONCES el sistema DEBE rechazar con un Problem 400 `Validation failed` con `errors` (`path` con puntos y `message`) sin escribir nada.

## R16
SI la DataSource local recibe el id de un vehículo, lectura, repostaje, mantenimiento o plan que no existe en ese vehículo ENTONCES el sistema DEBE rechazar con un Problem 404.

## R17
El sistema DEBE leer y actualizar los ajustes del usuario local en SQLite con la forma de `userSettingsSchema`.

## R18
El sistema DEBE crear, listar por estado (`active`, `archived`, `sold`, `all`), leer, editar (incluido archivar) y borrar vehículos en SQLite con la forma de `vehicleSchema`, la lectura inicial de `initialOdometerReading` y `photoUrl: null`.

## R19
CUANDO se borra un vehículo en modo local, el sistema DEBE borrar en cascada sus lecturas, repostajes, mantenimientos y planes.

## R20
El sistema DEBE añadir, listar y borrar lecturas de km en SQLite aplicando `validateOdometerWrite` (400 con fecha futura, 409 con conflicto) y `canDeleteOdometerReading` (409 al borrar una lectura de otro registro).

## R21
El sistema DEBE crear, editar y borrar repostajes en SQLite manteniendo su lectura `fuel` con `validateOdometerWrite`, `fuelReadingChange` y `editedFuelPrices`, en una transacción.

## R22
El sistema DEBE crear, editar y borrar mantenimientos en SQLite manteniendo su lectura `maintenance` (`maintenanceReadingChange`) y la última vez hecho de su plan (`scheduleLastDoneUpdate`), en una transacción.

## R23
SI un mantenimiento en modo local apunta a un plan que no es de su vehículo ENTONCES el sistema DEBE rechazar con un Problem 400 sin escribir nada.

## R24
El sistema DEBE devolver el gasto de mantenimiento de un vehículo como `roundMoney` de la suma de sus costes (0 sin registros).

## R25
El sistema DEBE crear, listar, editar y borrar planes en SQLite con `scheduleDefaults` al crear, `computeScheduleDue` al leer y un Problem 400 si tras editar no queda intervalo (`hasIntervalAfterUpdate`).

## R26
El sistema DEBE calcular las estadísticas de un vehículo con `computeVehicleStats` y las mismas entradas y orden que la API.

## D. Lo que no existe en local

## R27
SI en modo local se llama a una operación sin soporte (foto, adjuntos, `files.get`, informe de venta, enlaces públicos, avisos, canales, feed iCal, import, admin) ENTONCES la DataSource local DEBE rechazar con un Problem 501 sin tocar la base.

## R28
MIENTRAS la app está en modo local, la navegación DEBE ocultar la campana de avisos y «Usuarios» y mostrar «Cambiar de modo» en lugar de «Cerrar sesión».

## R29
MIENTRAS la app está en modo local, la página de ajustes DEBE ocultar los canales de notificación, el feed iCal, los avisos del dispositivo y la sección de datos (export/import), sin pedir sus datos.

## R30
MIENTRAS la app está en modo local, la ficha y la edición de un vehículo DEBEN ocultar el informe de venta (descarga y enlaces públicos) y el selector de foto.

## R31
MIENTRAS la app está en modo local, los mantenimientos DEBEN ocultar los adjuntos (selector del formulario y acceso a las facturas de cada registro).

## R32
MIENTRAS la app está en modo local, el sistema NO DEBE montar la sincronización de avisos del dispositivo (`DeviceNotificationsSync`).

## R34
MIENTRAS la app está en modo local, la página de ajustes DEBE ocultar las preferencias que solo afectan a los recordatorios y al aviso de km (día del aviso de km y hora de los recordatorios) hasta #67, sin cambiar sus valores guardados al guardar el resto de ajustes.

## E. Transversal

## R33
El sistema DEBE definir en `es.json` y `en.json` todos los textos nuevos del modo local.

## R35
El job `android` de CI DEBE ejecutarse cuando cambie `packages/db/**`, porque la APK empaqueta su esquema y sus migraciones.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| En la app móvil, la tarjeta «En este teléfono» de /welcome está activa y elegirla deja la app en modo local, que se recuerda entre arranques, sin login ni servidor | R1, R2, R3, R4, R6, R7 |
| En modo local, ajustes, vehículos, lecturas de km, repostajes, mantenimientos, planes, gasto y estadísticas se guardan en SQLite en el dispositivo mediante una implementación local de la interfaz DataSource de #53 | R10, R11, R12, R13, R14, R17, R18, R19, R20, R21, R22, R24, R25, R26, R35 |
| La implementación local aplica las mismas reglas de packages/shared que la API (…) y rechaza con ApiError/Problem como la HTTP; hay tests unitarios contra una base SQLite en memoria | R15, R16, R20, R21, R22, R23, R24, R25, R26 |
| El esquema Drizzle vive en un paquete compartido que usan la API y el modo local; las migraciones de la API no cambian de comportamiento | R8, R9, R10 |
| En modo local se ocultan login, cuenta, admin, canales de notificación, feed iCal, enlaces públicos, adjuntos, foto del vehículo, export/import y PDF de venta, y las operaciones sin soporte rechazan con un Problem | R3, R27, R28, R29, R30, R31, R32, R34 |
| Se puede salir del modo local hacia /welcome sin borrar los datos locales | R5, R28 |
| Todos los textos están en es.json y en.json | R33 |
| pnpm harness --full pasa en verde | R9 (tests existentes de la API sin cambiar aserciones) y todos |
