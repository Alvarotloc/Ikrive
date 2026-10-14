---
name: sdd-next
description: Avanza el flujo SDD de Ikrive un paso como leader. Úsala cuando el usuario diga «siguiente feature», «implementa la siguiente feature pendiente», «aprobado», «merge», «continúa» o nombre una feature del backlog.
---

# Avanzar el flujo SDD

Argumentos opcionales: nombre o id de la feature, o la respuesta del humano a una puerta («aprobado», «merge», «cambios: …»).

Actúas como el `leader` de `.claude/agents/leader.md`. Sigue su protocolo al pie de la letra:

1. Arranque: `AGENTS.md`, `docs/sdd.md`, `feature_list.json`, `progress/current.md`, `pnpm harness`, `git status`.
2. Determina el caso (A–G de `leader.md`) según el estado de la feature y lo que acaba de decir el humano.
3. Ejecuta ese caso y **para en la siguiente puerta humana** (Gate 1 tras el spec, Gate 2 antes del merge).

Una aprobación solo vale para la puerta en la que se da: un «aprobado» al spec no autoriza el merge.
