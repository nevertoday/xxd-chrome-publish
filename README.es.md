# xxd-chrome-publish

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

Publica actualizaciones de extensiones de Chrome que **ya están en la Chrome Web Store**, desde la terminal
o pidiéndoselo a Claude Code / Codex. Un solo comando compila, verifica, empaqueta, compara con la versión
publicada, sube el paquete y lo envía a revisión.

Lo que la distingue de un script de subida normal es la **comprobación previa (preflight)**: antes de subir
nada, te dice qué va a rechazar la tienda.

```
$ xxd-chrome-publish preflight
Image Crop Tool · ~/code/crop · phdjhhjbapkmagifbejfabimojmjngbe
  store     PUBLISHED 1.0.26
  version   1.0.26 → 1.0.27
  package   27 files · 249 KB
  manifest  vs store: +hosts https://api.example.com/*
  dashboard 1 to-do:
    [required] Justify the new host permissions
    open https://chrome.google.com/webstore/devconsole/…/edit/privacy
  => NEEDS DASHBOARD — fill the [required] items, Save draft, then publish with --dashboard-ready
```

## Por qué

La API de la Chrome Web Store solo puede subir un paquete y enviarlo a revisión. Las justificaciones de
permisos, las declaraciones de uso de datos, la URL de la política de privacidad y el texto de la ficha existen
**solo en el panel de desarrollador**. Todas las herramientas de línea de comandos (incluida
chrome-webstore-upload-cli) chocan con ese límite, y el síntoma habitual es una subida que funciona seguida de
`publish failed: does not meet the requirements`.

Esta herramienta descarga el paquete publicado, compara su manifest con el tuyo y enumera los permisos y hosts
nuevos que necesitan justificación, junto con las líneas de tu código que los usan, para que escribirla te lleve
un minuto. También corrige los errores de empaquetado que más duelen en la práctica:

- **Archivos inyectados bajo demanda**: se incluyen los que cargas con `chrome.scripting.executeScript({ files: [...] })`
  o con mapas como `{ panel: ["build/panel.js"] }`; los empaquetadores que solo siguen referencias los pierden sin avisar.
- **Builds desactualizados**: primero se ejecutan los scripts `build` y `check` del proyecto; si fallan, no se sube nada.
- **Archivos que faltan**: si el manifest apunta a un archivo inexistente, se detiene antes de subir.
- **Conflictos de versión**: la siguiente versión se calcula a partir del manifest local y de la tienda
  (publicada y en revisión), así que una tienda más avanzada que tu copia local no provoca un rechazo.
- **Revisiones en curso**: se detectan al principio en lugar de fallar a mitad de camino.

## Instalación

Como skill de un agente (Claude Code, Codex, …):

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Codex: ~/.codex/skills
```

Con el repositorio fuera de la carpeta de skills y enlazado dentro, `git pull` actualiza la skill en su sitio y
puedes editarla como cualquier otro proyecto. Después basta con decir «publica mi extensión» o «¿qué extensiones
tienen cambios sin publicar?».

Como CLI (Node 18 o superior, sin dependencias):

```bash
sh ~/code/xxd-chrome-publish/scripts/install.sh   # enlaza ~/.local/bin/xxd-chrome-publish
```

Para actualizar: `git -C ~/code/xxd-chrome-publish pull`; tanto el enlace de la skill como la CLI apuntan al repositorio.

## Configuración (una sola vez)

```bash
xxd-chrome-publish setup --publisher-id <ID de la URL del panel>
xxd-chrome-publish setup --service-account chrome-webstore-publisher@<proyecto>.iam.gserviceaccount.com
#   …o exporta CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN (OAuth, ideal para CI)
cd mi-extension && xxd-chrome-publish bind --extension-id <ID o URL de la tienda>
xxd-chrome-publish doctor
```

Los pasos detallados de ambos métodos de autenticación están en [references/setup.md](references/setup.md) (en inglés).
La cuenta de servicio va en el campo **service account** de la página Account del panel, no en «Trusted tester
accounts»: ese es otro campo, no da acceso a la API y ponerla ahí provoca errores 403.

## Uso

```bash
xxd-chrome-publish preflight        # muestra lo que pasaría; no modifica nada
xxd-chrome-publish                  # publicar: compilar → verificar → empaquetar → comparar → subir → enviar
xxd-chrome-publish submit           # tras completar el panel: envía el borrador ya subido, sin volver a subirlo
xxd-chrome-publish scan ~/code      # todas las extensiones: versión local y en tienda, revisión, commits sin publicar
xxd-chrome-publish status | pack | cancel | rollout 50
```

Opciones: `--minor`, `--major`, `--set-version X`, `--no-bump`, `--skip-build`, `--skip-checks`,
`--dashboard-ready`, `--cancel-pending`, `--upload-only`, `--staged`, `--zip RUTA`, `--commit`, `--json`.
Códigos de salida: `0` correcto · `1` error · `2` hay una revisión en curso · `3` antes hay que completar el panel.

La configuración de cada extensión va en `.chrome-publish.json`:

```json
{
  "extensionId": "abcdefghijklmnopabcdefghijklmnop",
  "build": "npm run build",
  "check": false,
  "packageDir": "dist",
  "include": ["assets/models/**"],
  "exclude": ["fixtures/**"]
}
```

## Lo que no hace

Crear la primera ficha, editar el texto o las capturas de la ficha, ni rellenar la pestaña de privacidad: Google
no ofrece API para eso, y Chrome impide que cualquier extensión del navegador (incluidos los agentes de IA)
controle las páginas de la Web Store. En su lugar, la herramienta te dice exactamente qué rellenar; hay ejemplos
de justificaciones en [references/dashboard.md](references/dashboard.md).

## Desarrollo

```bash
npm test   # pruebas unitarias + pruebas de extremo a extremo contra una Web Store falsa local
```

Licencia MIT.
