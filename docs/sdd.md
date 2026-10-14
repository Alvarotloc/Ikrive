# Spec Driven Development (SDD)

> Flujo requirements → design → tasks → código, con dos puertas humanas: no se escribe código sin un spec aprobado y no llega nada a `main` sin tu visto bueno.
> Una feature = un spec = una rama `feat/<name>` = un merge a `main`.

## Flujo

```
pending ─[spec-author]─▶ spec_ready ─⏸ GATE 1: apruebas el spec─▶ in_progress
        ─[implementer → reviewer]─▶ ready_to_merge ─⏸ GATE 2: apruebas el merge─▶ done
```

| Estado           | Significado                                                                                  | Quién lo pone             |
|------------------|----------------------------------------------------------------------------------------------|---------------------------|
| `pending`        | En el backlog, sin spec.                                                                     | Humano / skill `sdd-new`  |
| `spec_ready`     | Spec redactado en `specs/<name>/`. Esperando **Gate 1**. No se toca código.                  | `spec-author`             |
| `in_progress`    | Spec aprobado. Rama `feat/<name>` creada. El `implementer` trabaja.                          | leader, tras Gate 1       |
| `ready_to_merge` | `reviewer` aprobó y `pnpm harness --full` está en verde. Esperando **Gate 2**.               | leader                    |
| `done`           | Mergeado en `main`.                                                                          | leader, tras Gate 2       |
| `blocked`        | Atascado; el motivo va en `blockedReason` y en `progress/current.md`.                        | cualquiera                |

Reglas:

- Como mucho **una** feature activa (`in_progress` o `ready_to_merge`). Puede haber varias en `spec_ready`.
- El hook `scripts/harness/guard.mjs` **bloquea** cualquier edición en `apps/`, `packages/` o `docker/` si no hay una feature `in_progress`, y siempre a `spec-author`, `reviewer` y `leader`.
- Para un arreglo menor sin spec, crea una feature con `"sdd": false`: pasa directamente de `pending` a `in_progress`, pero sigue teniendo rama, reviewer y Gate 2.

## Las dos puertas humanas

**Gate 1 — spec.** El `spec-author` deja la feature en `spec_ready` y el leader para. Lees `specs/<name>/` y contestas:

- «aprobado» → el leader crea la rama, commitea el spec y lanza al `implementer`.
- «cambios: …» → el leader relanza al `spec-author` con tus comentarios.

**Gate 2 — merge.** Con el `reviewer` en APPROVED y el arnés en verde, el leader pone la feature en `ready_to_merge` y te enseña el `git diff --stat main...` y el enlace a `progress/review_<name>.md`. Contestas:

- «merge» / «aprobado» → commits agrupados por tipo, `done`, entrada en `progress/history.md` y merge a `main`.
- «cambios: …» → vuelve a `in_progress` y el leader relanza al `implementer` con tus comentarios.

## Git: una rama por spec

1. **Gate 1 aprobado.** Con el árbol limpio (si hay cambios ajenos, el leader pregunta antes de tocar nada):
   ```bash
   git switch main && git switch -c feat/<name>
   # status → in_progress en feature_list.json
   git add specs/<name> feature_list.json && git commit -m "docs(specs): add <name> spec"
   ```
2. **Implementación.** El `implementer` no commitea; deja los cambios en el árbol de trabajo.
3. **Gate 2 aprobado.** El leader commitea en la rama, agrupando por tipo (Conventional Commits en inglés): `feat(api): …`, `feat(web): …`, `test(api): …`, `docs: …`. El último commit pone el estado `done` y añade la entrada de `progress/history.md` (`chore(harness): close <name>`).
4. **Integración.**
   - Sin remoto: `git switch main && git merge --no-ff feat/<name>` y se borra la rama. Cada merge en `main` es una feature entregada y revertible de una vez (`git revert -m 1 <merge>`).
   - Con remoto en GitHub: `git push -u origin feat/<name>` y `gh pr create`; la CI (`ci.yml`) es la última puerta y mergeas tú.
5. **Release.** Etiquetar `v*.*.*` en `main` sigue siendo manual (dispara `release.yml`).

## Los tres archivos del spec

```
specs/<name>/
├── requirements.md   # QUÉ (EARS)
├── design.md         # CÓMO (decisiones técnicas)
└── tasks.md          # PASOS (checklist trazable)
```

`<name>` es el `name` de la feature en `feature_list.json` (kebab-case).

### requirements.md — EARS estricto

Cada requirement es una sección `## R<n>` con **un único** `DEBE` / `NO DEBE` y uno de estos patrones:

| Patrón         | Plantilla                                                   |
|----------------|-------------------------------------------------------------|
| **Ubicuo**     | `El sistema DEBE <acción>.`                                 |
| **Evento**     | `CUANDO <disparador>, el sistema DEBE <acción>.`            |
| **Estado**     | `MIENTRAS <estado>, el sistema DEBE <acción>.`              |
| **Opcional**   | `DONDE <feature opcional>, el sistema DEBE <acción>.`       |
| **No deseado** | `SI <evento no deseado> ENTONCES el sistema DEBE <acción>.` |

- Ids estables: `R1`, `R2`… No se renumeran; si se elimina uno, se marca `(retirado)`.
- Cada requirement es verificable por al menos un test concreto (Vitest en la API, `packages/shared` o la web).
- Nada de verbos blandos («podría», «soporta», «debería»).
- Al final, una tabla `acceptance → R<n>` que demuestra que cada criterio de `feature_list.json` está cubierto.

```markdown
## R3
CUANDO el usuario crea un mantenimiento con `km`, el sistema DEBE crear una lectura de odómetro con `source: 'maintenance'` y el mismo valor y fecha.

## R4
SI la lectura de km entra en conflicto con las lecturas vecinas ENTONCES el sistema DEBE responder 409 `application/problem+json` sin guardar el mantenimiento.
```

### design.md — decisiones antes de programar

- Archivos que se crean o modifican, por capa (`packages/shared`, `apps/api/src/modules/<dominio>/{routes,service,repository}.ts`, `db/schema`, `apps/web/src/features/<dominio>/`, rutas, i18n).
- Cambios en la base de datos y migración (`pnpm db:generate`).
- Contrato HTTP: método, ruta, cuerpo, respuestas y errores (`AppError` → RFC 7807).
- Tipos y firmas nuevas.
- Impacto en UI: componentes de marca reutilizados, estados vacío / carga / error, móvil y modo oscuro.
- Al menos **una alternativa descartada** y por qué.
- Riesgos y lo que queda fuera de alcance.

No repite `CONTRIBUTING.md` ni `docs/PLAN.md`: documenta solo dónde la feature toca sus fronteras.

### tasks.md — checklist ejecutable

Pasos pequeños en orden, cada uno con checkbox y los `R<n>` que cubre:

```markdown
- [ ] T1 — Añadir `maintenanceRecordCreateSchema` y `maintenanceRecordSchema` en `packages/shared/src/schemas/maintenance.ts`. Cubre: R1, R2.
- [ ] T2 — Tabla `maintenance_records` en `apps/api/src/db/schema/maintenance.ts` + `pnpm db:generate`. Cubre: R1.
- [ ] T3 — Test `creates a maintenance odometer reading` en `apps/api/test/maintenance.test.ts`. Cubre: R3.
```

El `implementer` marca `[x]` al terminar cada task. `pnpm harness` falla si un `R<n>` no aparece en ninguna task, o si una feature `ready_to_merge`/`done` tiene tasks sin marcar.

## Trazabilidad

- Cada `R<n>` tiene al menos un test. El `implementer` deja el mapa en `progress/impl_<name>.md`:
  ```markdown
  | Requirement | Test |
  |---|---|
  | R3 | `apps/api/test/maintenance.test.ts` › `creates a maintenance odometer reading` |
  ```
- El `reviewer` lo comprueba abriendo cada test y rechaza si falta alguno.

## Rastro en disco

Los subagentes escriben en disco y solo devuelven una línea con la ruta (regla anti-teléfono-descompuesto):

| Archivo                         | Quién lo escribe | Contenido                                          |
|---------------------------------|------------------|----------------------------------------------------|
| `specs/<name>/*.md`             | spec-author      | Requirements, design y tasks                       |
| `progress/spec_<name>.md`       | spec-author      | Solo si se bloquea: preguntas para el humano       |
| `progress/impl_<name>.md`       | implementer      | Archivos tocados, mapa `R<n> → test`, verificación |
| `progress/review_<name>.md`     | reviewer         | Veredicto y checklist                              |
| `progress/current.md`           | leader           | Estado vivo de la sesión                           |
| `progress/history.md`           | leader           | Bitácora append-only, una entrada por feature      |

## Cuándo no aplica

- Preguntas, exploración o revisiones de solo lectura.
- Cambios fuera de `apps/`, `packages/` y `docker/` (docs, `docs/PLAN.md`, `progress/`, configuración del arnés): se pueden editar directamente.
- Las features 1–3 son anteriores al arnés y no tienen spec.
