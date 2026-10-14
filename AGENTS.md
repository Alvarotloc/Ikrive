# AGENTS.md: mapa para agentes

> Punto de entrada para cualquier agente. Es un mapa, no un reglamento: lee cada documento cuando lo necesites.

## 1. Al empezar

1. `pnpm harness`: tiene que terminar en verde. Si falla, para y arregla el estado antes de tocar nada.
2. Lee `progress/current.md` para saber dónde quedó la última sesión.
3. Lee `feature_list.json`. Toda feature con `"sdd": true` sigue el flujo de `docs/sdd.md`.

## 2. Mapa

| Archivo / carpeta                  | Qué contiene                                                         | Cuándo leerlo                      |
|------------------------------------|----------------------------------------------------------------------|------------------------------------|
| `feature_list.json`                | Backlog y estado de cada feature                                     | Siempre, al empezar                |
| `progress/current.md`              | Estado vivo de la sesión                                             | Siempre, al empezar                |
| `progress/history.md`              | Bitácora append-only                                                 | Si necesitas contexto histórico    |
| `docs/sdd.md`                      | Flujo SDD, puertas humanas, git por spec, formato de los specs       | Antes de tocar un spec o una feature |
| `docs/verification.md`             | Cómo demostrar que algo funciona                                     | Antes de declarar algo terminado   |
| `docs/PLAN.md`                     | Fases, decisiones, modelo de datos, stack, diseño                    | Antes de redactar o implementar    |
| `CONTRIBUTING.md`                  | Arquitectura por capas, convenciones, tests                          | Antes de escribir código           |
| `CHECKPOINTS.md`                   | Criterios objetivos de «estado final correcto»                       | Para autoevaluarte / revisar       |
| `specs/<name>/`                    | `requirements.md`, `design.md`, `tasks.md` de cada feature           | Antes de implementar esa feature   |
| `.claude/agents/`                  | `leader`, `spec-author`, `implementer`, `reviewer`                   | Si orquestas trabajo               |
| `scripts/harness/`                 | `check.mjs` (pnpm harness) y los hooks `guard.mjs` y `stop.mjs`      | Si el arnés se comporta raro       |

## 3. Reglas duras

- **Una sola feature activa.** No mezcles cambios de varias features en la misma rama.
- **Sin spec aprobado no hay código.** El hook `guard.mjs` bloquea las ediciones en `apps/`, `packages/` y `docker/` si no hay una feature `in_progress`.
- **Sin tu aprobación no hay merge.** Nada llega a `main` sin pasar por Gate 2.
- **Nada es `done` con checks en rojo.** `pnpm harness --full` en verde antes del reviewer y antes de Gate 2.
- **Documenta mientras trabajas** en `progress/current.md`, no al final.
- **Si no sabes algo, búscalo en `docs/`, `CONTRIBUTING.md` o el código** antes de inventarlo. Si sigue sin estar claro, pregunta.

## 4. Flujo

```
pending → [spec-author] → spec_ready → ⏸ GATE 1 → in_progress (feat/<name>)
        → [implementer → reviewer] → ready_to_merge → ⏸ GATE 2 → done (merge a main)
```

Detalle en `docs/sdd.md`.

## 5. Cierre de sesión

1. `pnpm harness` en verde (el hook `Stop` lo comprueba).
2. `progress/current.md` refleja dónde se queda el trabajo, o vuelve a la plantilla si la feature se cerró (su resumen pasa a `progress/history.md`).
3. Sin archivos temporales, `console.log` de depuración ni TODOs sin contexto.

## 6. Si te bloqueas

No improvises un workaround: anota el bloqueo en `progress/current.md`, marca la feature `blocked` con `blockedReason` y para.
