---
name: sdd-new
description: Añade una feature nueva al backlog SDD de Ikrive (feature_list.json) a partir de una descripción del usuario. Úsala cuando el usuario pida «añade una feature», «nueva spec», «quiero hacer X» o quiera planificar trabajo nuevo.
---

# Nueva feature en el backlog

Argumentos: descripción libre de la feature (puede venir vacía; entonces pregunta qué quiere).

1. Lee `feature_list.json`, `docs/sdd.md` y las secciones relevantes de `docs/PLAN.md`.
2. Comprueba que no existe ya una feature equivalente. Si existe, díselo y para.
3. Si la descripción abarca varias capas grandes o más de ~1 día de trabajo, propón partirla en varias features (una por spec/merge) y confirma con el usuario.
4. Redacta la entrada:
   - `id`: el siguiente entero libre.
   - `name`: kebab-case corto (será la carpeta `specs/<name>/` y la rama `feat/<name>`).
   - `phase`, `title`, `description`.
   - `acceptance`: criterios observables y verificables con un test (endpoint y respuesta, comportamiento en la UI, tests que deben existir). Nada de criterios vagos («funciona bien»).
   - `"sdd": true` salvo que el usuario diga que es un arreglo menor (`"sdd": false`).
   - `"status": "pending"`.
5. Enséñale al usuario la entrada y, si la confirma, añádela a `feature_list.json` y ejecuta `pnpm harness`.
6. No lances al spec-author: dile que puede pedir «siguiente feature» (skill `sdd-next`) cuando quiera.
