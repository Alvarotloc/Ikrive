# Política de seguridad

*English below.*

## Versiones con soporte

Ikrive es un proyecto autoalojado mantenido por una sola persona. Solo se corrigen fallos de seguridad en la última versión publicada (la imagen `ghcr.io/alvarotloc/ikrive:latest` y la última APK de [Releases](https://github.com/Alvarotloc/Ikrive/releases)). Actualiza antes de informar de un fallo, por si ya está corregido.

| Versión               | Soporte |
|-----------------------|---------|
| Última `0.x` publicada | ✅      |
| Anteriores            | ❌      |

## Cómo informar de una vulnerabilidad

**No abras un issue público.** Usa el aviso privado de GitHub: pestaña **Security** › **Report a vulnerability** ([enlace directo](https://github.com/Alvarotloc/Ikrive/security/advisories/new)).

Incluye, si puedes:

- versión de Ikrive y forma de despliegue (Docker, APK en modo «Mi servidor» o «En este teléfono»);
- qué parte se ve afectada (API, web, app Android, imagen Docker) y su impacto;
- pasos para reproducirlo o una prueba de concepto mínima;
- si ya es público o conoces a alguien que lo esté explotando.

## Qué puedes esperar

- Acuse de recibo en un plazo de **7 días**.
- Una primera valoración (si se acepta, su gravedad y un plan) en un plazo de **14 días**.
- Te iré informando en el propio aviso hasta que haya una versión corregida. Cuando esté publicada, el aviso se hace público y se te menciona como descubridor, salvo que prefieras no aparecer.

Es un proyecto voluntario y sin programa de recompensas.

## Alcance

Dentro: el código de este repositorio (`apps/`, `packages/`, `docker/`), la imagen Docker publicada y las APK de Releases.

Fuera:

- la configuración de tu propio servidor (proxy inverso, TLS, cortafuegos, permisos de `/data`, copias de seguridad). Consulta [docs/self-hosting.md](docs/self-hosting.md);
- fallos en dependencias de terceros que no afecten a Ikrive tal como las usa (infórmalos a su proyecto);
- ataques que requieren acceso previo al servidor, al volumen `/data` o a un teléfono desbloqueado;
- denegación de servicio por volumen de peticiones.

---

## English

**Do not open a public issue.** Report vulnerabilities privately through GitHub: **Security** › **Report a vulnerability** ([direct link](https://github.com/Alvarotloc/Ikrive/security/advisories/new)). Only the latest release is supported. Expect an acknowledgement within 7 days and a first assessment within 14 days. This is a volunteer project with no bug bounty. Self-hosting setup (reverse proxy, TLS, `/data` permissions) is out of scope; see [docs/self-hosting.md](docs/self-hosting.md).
