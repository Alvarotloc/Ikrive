# Implementación — #48 pre-release-polish

`sdd: false`: esta feature no tiene spec. La guía son los `acceptance` de `feature_list.json` y los avisos 1–5 de `progress/review_release-v0-1-0.md`.

## Cambios por archivo

- `apps/web/src/features/vehicles/vehicle-card.tsx`: **causa:** la fila de cabecera de la tarjeta es un item de grid con `min-width: auto`. Su min-content (el título en `nowrap` más la matrícula) ensanchaba la pista del grid por encima de la columna, y `overflow-hidden` recortaba la matrícula. **Arreglo:** pongo `min-w-0` en el `Link`, en el cuerpo y en la fila de cabecera. La columna del título pasa a `flex-1`. La matrícula lleva `block max-w-[50%] min-w-0 truncate` y `title` con la matrícula completa, así que una matrícula larga se corta con elipsis dentro de la tarjeta. Efecto visible: el subtítulo (versión · año) ahora se trunca cuando no cabe («1.8 Hybrid Active Tec…»). Ya tenía `truncate`, pero antes no llegaba a aplicarse porque la tarjeta se desbordaba.
- `apps/web/src/features/vehicles/dossier.tsx`: `Plate` acepta un `title` opcional (tooltip). El resto de usos no cambia.
- `apps/web/src/features/vehicles/vehicle-card.test.tsx` (nuevo): test de componente con un router en memoria.
- `e2e/screenshots/readme.spec.ts`: `vehicle-detail.png` ya no usa `fullPage`. La nueva función `captureWholePage` amplía el viewport a la altura de la página (`scrollHeight`), espera con `expect.poll` a que la barra lateral (`sticky`, `h-dvh`) mida esa altura y después hace la captura. Así el fondo de la barra lateral cubre toda la columna. Quito de `capture` la opción `fullPage`, que ya no se usa. El cambio no añade esperas fijas.
- `docs/screenshots/*.png`: regeneradas con `pnpm screenshots` (7/7). Cambian `dashboard.png`, `vehicles.png` y `vehicle-detail.png`. Las demás salen idénticas en bytes.
- `docs/self-hosting.md`: en la fila `IKRIVE_VERSION`, el valor por defecto pasa a «`0.0.0-dev` (`0.0.0` en una imagen construida sin `--build-arg VERSION`)», con su explicación. En la restauración aviso de que `rm -rf data` puede necesitar `sudo` si el usuario del host no es el uid 1000.
- `.env.example`: `# DATA_DIR=/data`, con un comentario que indica que dentro de la imagen los datos están en `/data` (el volumen) y no deben cambiarse.

## Trazabilidad acceptance → evidencia

| Acceptance | Evidencia |
|---|---|
| A1: la matrícula no se desborda en inicio ni en /vehicles a ningún ancho | `vehicle-card.tsx` (el mismo componente en las dos rutas). Hice una comprobación ad hoc con Playwright contra el build de producción, con una matrícula de 20 caracteres (el máximo del schema) y otra normal. En 390, 800, 1280 y 1920 px, tanto en `/` como en `/vehicles`, el borde derecho del chip queda dentro del padding de la tarjeta. Las capturas están en `/tmp/claude-1000/-home-alvaro-dev-personal-ikrive/c27393d7-ad45-4b56-a9c2-7c1e75581ce7/scratchpad/platecheck/` (`{390,800,1280,1920}-{home,vehicles}.png`). El script no se queda en el repo |
| A2: test de componente | `apps/web/src/features/vehicles/vehicle-card.test.tsx` › `truncates a long plate inside the card and keeps the full plate as its tooltip`, más `shows no plate chip when the vehicle has no plate` |
| A3: fondo de la barra lateral en vehicle-detail.png | `e2e/screenshots/readme.spec.ts` › `captureWholePage`. He abierto `docs/screenshots/vehicle-detail.png` (1280×3969): la barra lateral cubre toda la altura, con «Cerrar sesión» al pie |
| A4: capturas regeneradas sin la matrícula cortada | `pnpm screenshots`: 7 passed. He abierto `dashboard.png` y `vehicles.png`: «4821 LKP» entero dentro de la tarjeta. `mobile-dashboard.png` sigue bien |
| A5: IKRIVE_VERSION real sin --build-arg | `docs/self-hosting.md`, tabla de variables (`ARG VERSION=0.0.0` en `docker/Dockerfile:35`) |
| A6: DATA_DIR en .env.example | `.env.example` |
| A7: sudo en la restauración | `docs/self-hosting.md` § Copia del volumen `/data` › restaurar |
| A8: harness | Ver abajo |

## `pnpm harness --full`

```
[OK]    48 features: 47 done, 0 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #48 pre-release-polish (in_progress)
[OK]    Rama actual: feat/pre-release-polish
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test   (shared 119, API 336, web 348, e2e 6)
[OK]    Arnés en verde.
```

## Desviaciones y notas

- No hay spec. Para el aviso 2 elegí no cambiar el layout de la app: en un navegador real la barra lateral `sticky` de `100dvh` siempre llena el viewport, así que el defecto solo aparecía en la captura `fullPage`. Lo he corregido en el script de capturas.
- He dejado fuera la matrícula de `/odometer` (`routes/_app/odometer.tsx:49`) y la del detalle: el acceptance se limita a la tarjeta de inicio y de /vehicles.
- No he creado el tag `v0.1.0` y no he hecho commit.
