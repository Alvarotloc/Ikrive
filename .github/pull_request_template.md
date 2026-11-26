<!--
English or Spanish, both are fine. / Puedes escribir en inglés o en español.
Security issues: do not open a PR, follow SECURITY.md. / Fallos de seguridad: no abras un PR, sigue SECURITY.md.
-->

## What and why / Qué y por qué

<!-- What does this PR change and why? Link the issue it closes (Closes #123). / ¿Qué cambia y por qué? Enlaza el issue que cierra (Closes #123). -->

## How to test / Cómo probarlo

<!-- Steps to check the change by hand, and the deployment it affects (Docker, APK «Mi servidor» / «En este teléfono»). / Pasos para comprobarlo a mano y el despliegue al que afecta. -->

## Checklist

- [ ] `pnpm harness --full` passes / pasa en verde (lint, typecheck, tests)
- [ ] Tests added or updated for the new behavior / Tests nuevos o actualizados para el comportamiento nuevo
- [ ] Every new UI text exists in `es` and `en` / Todos los textos nuevos existen en `es` y en `en`
- [ ] Works in server mode and in local mode («En este teléfono»), if it touches data / Funciona con servidor y en local, si toca datos
- [ ] Screenshots attached if the UI changes / Capturas adjuntas si cambia la interfaz
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/) in English / Commits en Conventional Commits y en inglés
- [ ] Docs updated if behavior or configuration changes (`README`, `docs/self-hosting.md`, `CHANGELOG.md` › `[Unreleased]`) / Documentación al día si cambia el comportamiento o la configuración
