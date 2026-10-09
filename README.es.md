# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Publica las actualizaciones de tus extensiones de Chrome con un solo comando.**
Compila, empaqueta, sube y envía a revisión, y te avisa *antes de subir nada* si la Chrome Web Store la va a rechazar.

Úsala como comando o como skill en Claude Code / Codex: basta con decir «publica mi extensión».

> Para extensiones que ya están publicadas. La primera publicación se sigue haciendo en el panel de Chrome.

![Publish flow: every step before the upload can stop it](assets/diagrams/flow.en.svg)

## Qué resuelve

![The dashboard step moves to before the upload](assets/diagrams/before-after.en.svg)

| Antes | Con xxd-chrome-publish |
|---|---|
| La subida funciona, pero el envío falla: *«does not meet the requirements»* | Te dice primero qué permiso necesita una nota en el panel y qué línea de tu código lo usa |
| Los archivos que tu código carga después no entran en el zip y algo deja de funcionar | Los encuentra y los incluye |
| Subes un build viejo sin darte cuenta | Primero ejecuta tus scripts de build y tests; si fallan, no sube nada |
| El número de versión choca con el de la tienda | Calcula la siguiente versión mirando tu código y la tienda |
| No recuerdas qué extensiones tienen cambios sin publicar | Una tabla te las muestra todas |

## Empezar

**1. Instalar**

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # como skill de Claude (Codex: ~/.codex/skills)
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # como comando
```

**2. Conectar tu cuenta de la tienda** (una vez · [paso a paso](references/setup.md))

```bash
xxd-chrome-publish setup --publisher-id <ID de la URL del panel> --service-account <correo>
```

**3. Vincular cada carpeta de extensión** (una vez)

```bash
cd mi-extension
xxd-chrome-publish bind --extension-id <ID de la extensión o enlace de la tienda>
```

**4. Publicar**

```bash
xxd-chrome-publish
```

## Comandos del día a día

| Quieres | Ejecuta |
|---|---|
| Ver qué pasaría, sin cambiar nada | `xxd-chrome-publish preflight` |
| Publicar una actualización | `xxd-chrome-publish` |
| Volver a enviar tras arreglar el panel | `xxd-chrome-publish submit` |
| Ver el estado de la revisión | `xxd-chrome-publish status` |
| Ver qué extensiones tienen cambios sin publicar | `xxd-chrome-publish scan ~/code` |
| Comprobar que la configuración funciona | `xxd-chrome-publish doctor` |

En Claude Code / Codex, solo pídelo: *«publica la extensión de flomo»*, *«¿qué extensiones puedo publicar?»*

## Así se ve una comprobación

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
  => NEEDS DASHBOARD
```

Aquí encontró un permiso nuevo para un sitio web. Abre el enlace, escribe una frase sobre por qué lo necesita la extensión, guarda y publica.

## Lo que no puede hacer

![What the tool does, and what only you can do](assets/diagrams/roles.en.svg)

Google no ofrece API para esto, así que se queda en el panel de Chrome:

- la primera publicación
- la descripción y las capturas de la tienda
- la pestaña de privacidad: notas de permisos, uso de datos, enlace a la política de privacidad

La herramienta te dice exactamente qué rellenar y dónde. Un agente de navegador tampoco puede hacerlo por ti: Chrome no deja que las extensiones controlen las páginas de la tienda.

## Detalles

<details>
<summary><b>Iniciar sesión: dos formas</b></summary>

| Forma | Ideal para | Qué necesitas |
|---|---|---|
| gcloud + cuenta de servicio | tu ordenador, sin archivos secretos | Google Cloud SDK y una cuenta de servicio |
| Token de actualización OAuth | CI (p. ej. GitHub Actions) | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` |

⚠️ La cuenta de servicio va en el campo **service account** de la página Account del panel, **no** en «Trusted tester accounts». Ese campo no da acceso a la API y verás errores 403.

Pasos completos: [references/setup.md](references/setup.md)

</details>

<details>
<summary><b>Todas las opciones</b></summary>

| Opción | Qué hace |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0 (por defecto, 1.2.4) |
| `--set-version 1.5.0` | usa exactamente esta versión |
| `--no-bump` | mantiene la versión de manifest.json |
| `--skip-build` / `--skip-checks` | no ejecuta el build / los tests |
| `--dashboard-ready` | ya rellenaste el panel: adelante |
| `--cancel-pending` | retira la versión en revisión y envía esta |
| `--upload-only` | sube, pero no envía |
| `--staged` | tras la aprobación, espera a que tú la publiques |
| `--zip archivo.zip` | sube este zip en lugar de crear uno |
| `--commit` | hace un commit en git con la nueva versión al terminar |
| `--json` | salida legible por programas |

Códigos de salida: `0` hecho · `1` error · `2` hay otra versión en revisión · `3` primero rellena el panel

</details>

<details>
<summary><b>Ajustes por extensión</b> (<code>.chrome-publish.json</code>)</summary>

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

| Campo | Significado |
|---|---|
| `extensionId` | el ID de 32 letras del enlace de la tienda |
| `build` | comando de build, o `false`. Por defecto: el script `build` de package.json |
| `check` | comando de tests, o `false`. Por defecto: el script `check` de package.json |
| `packageDir` | carpeta que se empaqueta, si tu build escribe en p. ej. `dist` |
| `include` / `exclude` | archivos que siempre / nunca se empaquetan |

</details>

<details>
<summary><b>Actualizar y desarrollar</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # actualizar (el enlace de la skill y el comando apuntan aquí)
npm test                                 # ejecutar los tests (usa una tienda falsa local)
npm run diagrams                         # regenerar los diagramas (tras editar build.mjs)
```

Cómo escribir notas de permisos que se aprueban: [references/dashboard.md](references/dashboard.md) ·
Mensajes de error y soluciones: [references/troubleshooting.md](references/troubleshooting.md)

</details>

Licencia MIT
