# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Lleva una extensión de Chrome a la Chrome Web Store y mantenla al día: de la primera publicación a cada versión, desde la línea de comandos.**

| Primera publicación | Imágenes de la tienda | Cada actualización |
|---|---|---|
| Lee tu código y prepara los textos de la ficha, las justificaciones de permisos y las respuestas de privacidad en el orden del panel, una carpeta por idioma | Capturas, iconos e imágenes promocionales con los colores y la tipografía de la propia interfaz, para que parezcan un solo producto | Compila, empaqueta, sube y envía a revisión, y te dice **antes de subir** si la tienda lo va a rechazar |

Úsala como comando o como skill en Claude Code / Codex: «publica esta extensión», «prepárale la ficha».
Licencia MIT. Sin dependencias de npm; las capturas e imágenes instalan playwright-core en una caché local la primera vez.

## Lo que te ahorra

| Antes | Con ella |
|---|---|
| La subida funciona y el envío falla: *does not meet the requirements* | La comprobación previa señala el permiso nuevo que necesita justificación y la línea de código que lo usa |
| Justificaciones de permisos y datos declarados a ojo, que no coinciden con el código | Primero se lee el código: para qué sirve cada permiso, a qué servidores llama, si hay código remoto |
| Un paquete en 13 idiomas y doce páginas de la tienda vacías | Una carpeta de material por idioma, confirmada antes de publicar; también idiomas que el paquete aún no tiene (japonés, coreano, árabe…) |
| Un panel lateral de 400 px estirado en toda la captura | Paneles laterales y ventanas emergentes capturados dentro de una ventana del navegador, con datos de demostración, sin red y sin cuentas reales |
| Imágenes promocionales en colores que la extensión no usa | Colores, fuentes y esquinas leídos de las páginas renderizadas de la extensión |
| Archivos cargados más tarde y licencias de terceros fuera del ZIP | Se encuentran y se empaquetan |
| Un número de versión que la tienda ya tiene | La siguiente versión se calcula a partir del código y de la tienda |
| No saber qué extensiones tienen cambios sin publicar | Una tabla con todas |

## Míralo

Hecho para la extensión «Cover Collage»:

![Imagen promocional: colores, tipografía y esquinas rectas de la interfaz; el protagonista es la portada que crea](assets/examples/promo-marquee.en.png)

![Captura de la tienda: el panel lateral de vuelta en una ventana del navegador, junto a la web donde trabaja](assets/examples/screenshot-sidepanel.png)

Una comprobación antes de publicar:

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

Hay un permiso de sitio nuevo. Abre el enlace, escribe una frase explicando por qué, guarda y publica, en lugar de enterarte tras la subida, el envío y el rechazo.

![Flujo de publicación: cualquier paso antes de la subida puede detenerla](assets/diagrams/flow.en.svg)

## Empezar

**1. Instalar** (Node 18+)

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # como comando
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # como skill de Claude (Codex: ~/.codex/skills)
```

**2. Sin cuenta de la tienda**, en la carpeta de la extensión:

```bash
xxd-chrome-publish listing .        # preparar el material de la primera publicación
xxd-chrome-publish style .          # leer colores, fuentes y esquinas de la interfaz
xxd-chrome-publish pack . --patch   # subir la versión y crear un ZIP listo para subir
```

**3. Para publicar, conecta tu cuenta de la tienda** (una vez, [paso a paso](references/setup.md))

```bash
xxd-chrome-publish setup --publisher-id <ID de la URL del panel> --service-account <correo de la cuenta de servicio>
xxd-chrome-publish bind --extension-id <ID de la extensión o URL de la tienda>   # una vez por carpeta
xxd-chrome-publish                                                               # publicar
```

## Tres situaciones y sus comandos

### Primera publicación

```bash
xxd-chrome-publish listing . --locales ja,ko,ar   # lee el código, empaqueta, prepara el esqueleto en el orden del panel
xxd-chrome-publish privacy-page .                 # publica la política de privacidad y rellena su URL
xxd-chrome-publish listing . --check              # pendientes, Markdown, resumen largo, archivos que faltan
```

La carpeta que crea (en el Escritorio, nunca en tu código):

```
<carpeta de la extensión>-store-assets/
├── fill-text.md                 pegar de arriba abajo, en el orden del panel
├── upload-files/                icono, capturas, imágenes promocionales, página de privacidad, ZIP
├── language-versions/<idioma>/  por idioma de la ficha: texto para pegar, notas completas, política de privacidad
└── working/listing-facts.md     las pruebas: dónde se usa cada permiso, a qué servidores se llama
```

Después crea el elemento en el panel, sube el ZIP y pega. Cuando tenga ID, haz `bind`; la primera versión revisa antes las listas de acceso del inicio de sesión, una cuenta de prueba para los revisores y una página de soporte pública.

### Imágenes de la tienda

| Quieres | Escribe |
|---|---|
| Hacer capturas según un escenario (`--locale ja` para japonés) | `xxd-chrome-publish shots . --scenario shots.json` |
| Leer el estilo de la interfaz para iconos e imágenes | `xxd-chrome-publish style .` |
| Crear iconos 16/32/48/128, el icono de la tienda y una hoja de revisión | `xxd-chrome-publish icon . --svg icon.svg` |
| Renderizar una imagen promocional y revisar texto desbordado, cortado o partido | `xxd-chrome-publish tile promo.html --size 1400x560 --out promo.png` |
| Revisar tamaños y transparencia, con vista previa de la ficha | `xxd-chrome-publish images .` |

Todo lo que se sube es PNG de 24 bits sin transparencia, como pide la tienda. Las capturas necesitan Google Chrome; playwright-core se instala en `~/.cache` la primera vez.

### Cada actualización

| Quieres | Escribe |
|---|---|
| Ver qué pasaría sin cambiar nada | `xxd-chrome-publish preflight` |
| Publicar la actualización | `xxd-chrome-publish` |
| Reenviar tras arreglar el panel | `xxd-chrome-publish submit` |
| Ver la revisión | `xxd-chrome-publish status` |
| Ver qué extensiones de una carpeta tienen cambios sin publicar | `xxd-chrome-publish scan ~/code` |
| Comprobar la configuración de la cuenta | `xxd-chrome-publish doctor` |

## En un asistente de IA

Instalada como skill, basta con decir:

- «Publica la extensión de flomo», «¿Qué extensiones puedo publicar?»
- «Prepara la ficha de esta extensión, también en japonés, coreano y árabe»
- «Haz cinco capturas y las imágenes promocionales con el estilo de la interfaz»

Cada publicación termina con un informe de formato fijo que separa tres hechos: panel guardado, paquete subido, enviado a revisión. Nunca llama «publicado» a un envío: eso ocurre cuando Google lo aprueba.

## Lo que no puede hacer

![Lo que hace la herramienta y lo que solo puedes hacer tú](assets/diagrams/roles.en.svg)

Google no ofrece API para esto; se hace en el panel para desarrolladores de Chrome: crear el elemento, pegar los textos y las respuestas de privacidad, subir las imágenes. La herramienta deja el texto y las imágenes en orden, con los enlaces del panel. Chrome no deja que las extensiones manejen las páginas de la tienda, así que un asistente de IA dentro de una extensión no puede rellenarlas; una IA con control directo del ordenador sí puede rellenar, guardar y releer cada campo.

## Detalles

<details>
<summary><b>Inicio de sesión: elige uno</b></summary>

| Método | Para | Necesita |
|---|---|---|
| gcloud + cuenta de servicio | tu ordenador, sin archivo de clave | Google Cloud SDK y una cuenta de servicio |
| Token de actualización OAuth | CI (p. ej. GitHub Actions) | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` |

⚠️ La cuenta de servicio va en el campo **service account** de la página Account del panel, **no** en “Trusted tester accounts”, justo al lado: ese no da acceso a la API y solo verás errores 403.

Paso a paso: [references/setup.md](references/setup.md)

</details>

<details>
<summary><b>Todas las opciones de publicación</b></summary>

| Opción | Hace |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0 (por defecto 1.2.4) |
| `--set-version 1.5.0` | usar exactamente esta versión |
| `--no-bump` | mantener la versión de manifest.json |
| `--skip-build` / `--skip-checks` | no ejecutar el script de compilación / comprobación |
| `--dashboard-ready` | el panel ya está listo; seguir |
| `--cancel-pending` | retirar la versión en revisión y enviar esta |
| `--upload-only` | subir sin enviar |
| `--staged` | tras la aprobación, esperar a que la publiques tú |
| `--zip archivo.zip` | subir este ZIP en lugar de crear uno |
| `--commit` | hacer commit del cambio de versión al terminar |
| `--json` | salida legible por máquinas |
| `--lang zh` / `--lang en` | idioma del informe final y del nombre de la tienda en el nombre del ZIP; por defecto, el del sistema |

Códigos de salida: `0` hecho · `1` error · `2` otra versión en revisión · `3` antes, tareas en el panel.
Opciones de los comandos de imágenes: `xxd-chrome-publish --help`.

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

| Campo | Significa |
|---|---|
| `extensionId` | las 32 letras de la URL de la tienda |
| `build` | comando de compilación, o `false`; por defecto el script `build` de package.json |
| `check` | comando de pruebas, o `false`; por defecto el script `check` de package.json |
| `packageDir` | la carpeta que se empaqueta, p. ej. `dist` si compilas ahí |
| `include` / `exclude` | archivos que siempre se incluyen / nunca se incluyen |

</details>

<details>
<summary><b>Cómo escribir para los revisores y cómo resolver errores</b></summary>

- Cada campo de la primera publicación: [references/first-listing.md](references/first-listing.md)
- Escenarios de capturas: [references/screenshots.md](references/screenshots.md) · Iconos e imágenes: [references/store-images.md](references/store-images.md)
- Justificaciones de permisos que se aceptan: [references/dashboard.md](references/dashboard.md)
- Errores y soluciones: [references/troubleshooting.md](references/troubleshooting.md)

</details>

<details>
<summary><b>Actualizar y desarrollar</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # actualizar (el enlace del skill y el comando apuntan aquí)
npm test                                # pruebas contra una tienda falsa local; no se publica nada
npm run diagrams                        # regenerar los diagramas tras editar build.mjs
```

</details>

Licencia MIT
