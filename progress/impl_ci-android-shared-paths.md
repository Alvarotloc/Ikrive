# Implementación: #69 ci-android-shared-paths (`sdd: false`)

## Cambios por archivo

- `.github/workflows/ci.yml`: en el job `changes`, filtro `android` de `dorny/paths-filter`, se añade `'packages/shared/**'` justo después de `'packages/db/**'` (orden: apps, packages alfabético, lockfile, workflow). Una línea; ningún otro job tocado.
- `progress/current.md`: línea en la bitácora.

El comentario sobre el job `changes` no enumera rutas, así que sigue siendo coherente y no se modifica.

## Revisión de dependencias del workspace

Workspace (`pnpm-workspace.yaml`): `apps/*`, `packages/*`, `e2e`.

| Paquete | Dependencias `@ikrive/*` |
|---|---|
| `apps/mobile` | ninguna directa; `build:web` ejecuta `@ikrive/web build:native` (por eso vigila `apps/web/**`) |
| `apps/web` | `@ikrive/db`, `@ikrive/shared` |
| `packages/db` | `@ikrive/shared` |
| `packages/shared` | ninguna |

Cierre transitivo de la APK: `apps/mobile`, `apps/web`, `packages/db`, `packages/shared`. `apps/api` y `e2e` no forman parte. Con el cambio, el filtro cubre los cuatro; no falta ningún otro paquete.

## Trazabilidad de acceptance

| Criterio | Evidencia |
|---|---|
| El filtro incluye `packages/shared/**` | `.github/workflows/ci.yml`, job `changes`, filtro `android` |
| Cubre todos los paquetes de los que depende la APK | tabla de arriba |
| YAML válido y el resto de jobs no cambia | `yaml.safe_load` OK; `git diff` en `ci.yml`: +1 línea |
| `pnpm harness --full` en verde | abajo |

No hay test automatizado: el cambio es de configuración de CI y no tiene superficie testeable en el repo.

## `pnpm harness --full`

```
[OK]    69 features: 64 done, 4 pending, 0 spec_ready, 0 blocked
[OK]    Feature activa: #69 ci-android-shared-paths (in_progress)
[OK]    Rama actual: feat/ci-android-shared-paths
[OK]    pnpm lint
[OK]    pnpm typecheck
[OK]    pnpm test   (db 3, web 520, api 368)
[OK]    Arnés en verde.
```

## Desviaciones

Ninguna.
