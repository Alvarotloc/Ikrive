# Review — #48 pre-release-polish

**Veredicto:** APPROVED

`sdd: false`: no hay spec. He revisado contra los `acceptance` de `feature_list.json`, los avisos 1–5 de `progress/review_release-v0-1-0.md`, `CONTRIBUTING.md`, `docs/` y `CHECKPOINTS.md`.

## Trazabilidad acceptance ↔ evidencia
- A1 (la matrícula no se desborda a ningún ancho): [x] `vehicle-card.tsx`. Pone `min-w-0` en el `Link` (item de grid), en el cuerpo y en la fila de cabecera. La columna del título tiene `flex-1` y el chip lleva `block max-w-[50%] min-w-0 truncate` y `title`. El mismo componente se usa en `routes/_app/index.tsx:48` y en `routes/_app/vehicles/index.tsx:57`, los dos dentro de `grid sm:grid-cols-2 lg:grid-cols-3`. He abierto las capturas ad hoc del implementer (`scratchpad/platecheck/390-home.png` y `1280-vehicles.png`): una matrícula de 20 caracteres sale truncada con elipsis dentro de la tarjeta. Las capturas se tomaron durante la animación de entrada y salen con poca opacidad, pero el layout se ve. `mobile-dashboard.png` sigue bien.
- A2 (test de componente): [x] `apps/web/src/features/vehicles/vehicle-card.test.tsx` › `truncates a long plate inside the card…`. Afirma `title` = la matrícula completa, las clases `truncate`/`min-w-0`/`max-w-[50%]` en el chip, `min-w-0` en todas las cajas hasta la tarjeta y `overflow-hidden` y `href` en la tarjeta. Un segundo test cubre que, sin matrícula, no hay chip. Comprueba clases porque jsdom no hace layout, y la comprobación real del layout es la de A1/A4.
- A3 (fondo de la barra lateral en vehicle-detail.png): [x] He abierto `docs/screenshots/vehicle-detail.png` (1280×3969). La barra lateral cubre toda la altura y «Cerrar sesión» aparece al pie. `captureWholePage` amplía el viewport y espera con `expect.poll` a que `aside` mida lo mismo que `scrollHeight`, sin esperas fijas.
- A4 (capturas regeneradas sin la matrícula cortada): [x] He abierto `dashboard.png` y `vehicles.png`: «4821 LKP» se ve entero dentro de la tarjeta, con margen a la derecha. Solo cambian esas dos y `vehicle-detail.png`, que coinciden con lo que toca el diff.
- A5 (IKRIVE_VERSION sin --build-arg): [x] `docs/self-hosting.md:63` indica `0.0.0`, que coincide con `ARG VERSION=0.0.0` del Dockerfile.
- A6 (.env.example): [x] Sugiere `# DATA_DIR=/data` y explica que dentro de la imagen no debe cambiarse.
- A7 (sudo al restaurar): [x] `docs/self-hosting.md:92`.
- A8 (harness): [x] He ejecutado `pnpm harness --full` en esta revisión: «Arnés en verde» (web 348, API 336).

## Tasks
- N/A (`sdd: false`, sin `tasks.md`).

## Checkpoints
- C1: [x] Arnés en verde, una sola feature activa (#48) y la rama es `feat/pre-release-polish`.
- C2: [x] N/A: `sdd: false`. Cada acceptance tiene su evidencia (arriba).
- C3: [x] El diff solo toca la tarjeta, `Plate` (`title` opcional y retrocompatible), el script de capturas, las 3 capturas, `self-hosting.md`, `.env.example`, `current.md` y el estado en `feature_list.json`. No hay refactors ajenos.
- C4: [x] El código web está en `features/vehicles/` y reutiliza el componente de marca `Plate`. No hay textos nuevos de UI que traducir: `title` es la propia matrícula. API y BD: N/A.
- C5: [x] Sin `any`, `@ts-ignore` ni `console.log`. El `throw new Error` de `readme.spec.ts` está en el script e2e de capturas, no llega al cliente.
- C6: [x] Harness en verde. El test afirma resultados concretos. Capturas: claro (`dashboard`, `vehicles`, `vehicle-detail`), oscuro (`vehicle-detail-dark`) y móvil (`mobile-dashboard`, más las ad hoc a 390 px), referenciadas en el impl.
- C7: [x] `impl_pre-release-polish.md` está completo y `current.md` está al día. `PLAN.md` no necesita cambios.

## Comprobaciones pedidas por el leader
- **Matrícula:** ya no sale cortada en `dashboard.png` ni en `vehicles.png`.
- **Barra lateral de la ficha:** cubre toda la altura en `vehicle-detail.png`.
- **Móvil:** `mobile-dashboard.png` muestra la matrícula y el subtítulo completos. Con una matrícula larga a 390 px, el chip se trunca dentro de la tarjeta.
- **Oscuro:** el cambio es solo de layout y no depende del tema. `vehicle-detail-dark.png` sale correcta, pero no hay ninguna captura de la tarjeta en oscuro (ver avisos).
- **Tags:** `git tag -l` y `git ls-remote --tags origin` están vacíos. No se ha creado ningún tag.

## Hallazgos
Ninguno bloqueante.

## Avisos para el humano (no bloquean)
1. Ninguna captura muestra la tarjeta de vehículo en modo oscuro. Las clases que cambian (`min-w-0`, `truncate`, `max-w`) no dependen del tema, así que no espero diferencias.
2. A 1280 px, el subtítulo de la tarjeta ahora se trunca («1.8 Hybrid Active Tec…»). Es lo que cabe esperar al dejar de desbordarse.
3. Las matrículas de `/odometer` y de la ficha quedan fuera, como dice el acceptance.
4. Después del «merge» hay que crear el tag `v0.1.0`. Hay que revisar la fecha del CHANGELOG si el tag cae otro día.
