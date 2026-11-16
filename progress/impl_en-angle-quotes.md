# Implementación — #76 `en-angle-quotes`

Feature `sdd: false`: guiada por `description` y `acceptance` de `feature_list.json` (no hay spec).

## Cambios por archivo

- `apps/web/src/i18n/locales/en.json` — `settings.odometerReminderWeekdayInfo`: `«Don't remind me»` → `\"Don't remind me\"` (comillas dobles escapadas en el JSON). Era la única aparición de « o » en `en.json`.
- `apps/web/src/i18n/locales.test.ts` — nuevo test `en uses English quotation marks, not Spanish angle quotes`: serializa `en` y comprueba que no casa con `/[«»]/`.
- `apps/web/src/i18n/locales/es.json` — sin cambios.

## Trazabilidad acceptance → evidencia

| Acceptance | Evidencia |
|---|---|
| `odometerReminderWeekdayInfo` usa `"Don't remind me"` | `en.json` línea 85 |
| `en.json` sin « ni »; `es.json` no cambia | `locales.test.ts › locales › en uses English quotation marks, not Spanish angle quotes`; `git diff es.json` vacío |
| Test que falla si `en.json` contiene « o » | Mismo test; verificado que falla (1 failed) con el `en.json` original |
| `pnpm harness --full` en verde | Ver abajo |

## `pnpm harness --full`

```
apps/web test:  Test Files  87 passed (87) — Tests 576 passed (576)
apps/api test:  Test Files  38 passed (38) — Tests 370 passed (370)
[OK]    pnpm test
[OK]    Arnés en verde.
```

(lint y typecheck en OK.)

## Desviaciones

Ninguna. Sin UI nueva (solo texto), no se han hecho capturas.
