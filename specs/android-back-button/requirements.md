# Requirements — android-back-button

> Feature 74 (fase 8). Detectada al probar #65 en un móvil: el botón (o gesto) atrás de Android casi siempre cierra la app.
> **App nativa** = el build `--mode native` (`isNativeApp()`). **Atrás** = el evento `backButton` de `@capacitor/app`. **Capa abierta** = un `Dialog`, `AlertDialog`, `Sheet`, `DropdownMenu` o `Popover` de Radix (`apps/web/src/components/ui/`) abierto. **Pantalla raíz** = `/` (panel, en ambos modos), `/welcome` (elección de modo) o `/login` (inicio de sesión, modo servidor). **Mandar al fondo** = `App.minimizeApp()`.

## A. Qué hace atrás

## R1
CUANDO el usuario pulsa atrás en la app nativa con una capa abierta, el sistema DEBE cerrar la capa de más arriba (como la tecla Escape) sin cambiar de ruta.

## R2
SI la capa de más arriba ignora Escape en ese momento (p. ej. un formulario guardando) ENTONCES el sistema DEBE consumir la pulsación sin cambiar de ruta ni mandar la app al fondo.

## R3
CUANDO el usuario pulsa atrás en la app nativa sin capas abiertas, fuera de una pantalla raíz y con una entrada anterior en el historial del router, el sistema DEBE volver a esa entrada.

## R4
CUANDO el usuario pulsa atrás en la app nativa sin capas abiertas en una pantalla raíz (`/`, `/welcome` o `/login`), el sistema DEBE mandar la app al fondo sin navegar, aunque haya historial.

## R5
SI el usuario pulsa atrás en la app nativa sin capas abiertas, fuera de una pantalla raíz y sin entrada anterior en el historial ENTONCES el sistema DEBE mandar la app al fondo.

## R6
MIENTRAS la app nativa está en modo local, el sistema DEBE tratar atrás igual que en modo servidor (R1–R5), sin leer el modo.

## B. Ciclo de vida y plataformas

## R7
CUANDO el manejador de atrás se desmonta, el sistema DEBE quitar su listener del plugin, también si se desmonta antes de terminar de suscribirse (doble efecto de StrictMode).

## R8
MIENTRAS la SPA corre como web o PWA, el sistema NO DEBE cargar el módulo nativo del botón atrás ni `@capacitor/app`.

## R9
El sistema DEBE declarar `@capacitor/app` con la misma versión exacta en `apps/web` y `apps/mobile`, e incluirlo en el proyecto Android (`cap sync`).

## R10
El sistema DEBE emitir `lib/native-back-button.ts` y `@capacitor/app` en chunks de `assets/native/`, fuera del precache del service worker.

## Acceptance → requirements

| Criterio de `feature_list.json` | Requirements |
|---|---|
| Con un diálogo, hoja o menú abierto, atrás lo cierra sin cambiar de pantalla | R1, R2 |
| Sin nada abierto, vuelve a la pantalla anterior del router si hay historial dentro de la app | R3, R5 |
| En la pantalla raíz (panel o elección de modo; también `/login`, pedido en Gate 1) sale o manda al fondo (el spec decide) | R4 |
| Funciona igual en modo servidor y local, y no cambia nada en la web ni en la PWA | R6, R7, R8 |
| El plugin nuevo va en el build nativo y fuera del precache de la PWA (native-only) | R9, R10 |
| `pnpm harness --full` en verde, tests con plugin simulado y checklist manual en el dispositivo | R1–R10 (T9, T10) |
