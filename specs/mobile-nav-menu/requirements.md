# Requirements — mobile-nav-menu

> Feature 27 (fase 5). Por debajo de `md` (48rem = 768 px, el breakpoint de Tailwind) la cabecera de `apps/web/src/routes/_app.tsx` cambia los iconos de navegación sin texto por un botón de menú que abre un panel con la navegación completa. Desde `md` la barra lateral no cambia.
> «Opciones de navegación»: Inicio (`/`), Vehículos (`/vehicles`), Odómetro (`/odometer`, con el texto actual `nav.odometer`) y Ajustes (`/settings`).

## R1
MIENTRAS el viewport mide menos de 768 px, el sistema DEBE mostrar en la cabecera solo la marca, la campana de notificaciones y el botón de menú, sin las opciones de navegación ni «Cerrar sesión».

## R2
El sistema DEBE dar al botón de menú el nombre accesible «Abrir menú» y un `aria-expanded` que vale `true` con el panel abierto y `false` con el panel cerrado.

## R3
CUANDO el usuario pulsa el botón de menú, el sistema DEBE abrir un panel (`role="dialog"`) con las cuatro opciones de navegación y «Cerrar sesión», cada una con su icono y su texto.

## R4
MIENTRAS el panel está abierto, el sistema DEBE resaltar la opción de la ruta activa y marcarla con `aria-current="page"`.

## R5
CUANDO el usuario elige una opción de navegación del panel, el sistema DEBE navegar a su ruta y cerrar el panel.

## R6
CUANDO el usuario pulsa Escape con el panel abierto, el sistema DEBE cerrar el panel.

## R7
CUANDO el usuario pulsa fuera del panel, el sistema DEBE cerrar el panel.

## R8
CUANDO la ruta cambia con el panel abierto por una causa ajena al panel (p. ej. el botón «atrás» del navegador), el sistema DEBE cerrar el panel.

## R9
MIENTRAS el panel está abierto, el sistema DEBE mantener el foco dentro del panel al navegar con Tab y Mayús+Tab.

## R10
CUANDO el panel se cierra, el sistema DEBE devolver el foco al botón de menú.

## R11
CUANDO el usuario pulsa «Cerrar sesión» en el panel, el sistema DEBE cerrar la sesión (`POST /api/auth/sign-out`), vaciar la caché de TanStack Query y navegar a `/login`.

## R12
MIENTRAS el viewport mide 768 px o más, el sistema DEBE mostrar la barra lateral con la marca, las opciones de navegación con texto, «Cerrar sesión» y la campana, con el mismo marcado y estilos que antes de esta feature.

## R13
MIENTRAS el viewport mide 768 px o más, el sistema NO DEBE renderizar el botón de menú.

## R14
El sistema DEBE definir todos los textos nuevos en `apps/web/src/i18n/locales/es.json` y `en.json`.

## Trazabilidad acceptance → requirements

| Acceptance (`feature_list.json`) | Requirements |
|---|---|
| Por debajo de md la cabecera muestra solo la marca, la campana y un botón de menú con nombre accesible y aria-expanded | R1, R2 |
| El botón abre un panel con Inicio, Vehículos, Odómetro, Ajustes y Cerrar sesión, con icono y texto, y la ruta activa resaltada | R3, R4 |
| El panel se cierra al elegir una opción, con Escape, al pulsar fuera y al cambiar de ruta; foco atrapado y vuelta al botón | R5, R6, R7, R8, R9, R10 |
| Desde md la barra lateral se ve igual y el botón de menú no se renderiza ni es accesible | R12, R13 |
| Todos los textos nuevos en es.json y en.json | R14 |
| Tests de componente: abrir y cerrar, navegar a una opción y cerrar sesión desde el menú | R3, R5, R6, R7, R11 (tasks T7–T9) |
| `pnpm harness --full` en verde | todas (task T11) |
