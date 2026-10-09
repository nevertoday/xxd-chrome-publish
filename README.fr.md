# xxd-chrome-publish

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [العربية](README.ar.md)

Publiez les mises à jour d'extensions Chrome **déjà présentes sur le Chrome Web Store**, depuis le terminal ou
en le demandant à Claude Code / Codex. Une seule commande compile, vérifie, empaquette, compare avec la version
en ligne, envoie le paquet et le soumet à l'examen.

Ce qui la distingue d'un simple script d'envoi, c'est la **vérification préalable (preflight)** : avant tout envoi,
elle vous dit ce que le Web Store va refuser.

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

## Pourquoi

L'API du Chrome Web Store sait seulement envoyer un paquet et le soumettre. Les justifications d'autorisations,
les déclarations d'utilisation des données, l'URL de la politique de confidentialité et le texte de la fiche
n'existent **que dans le tableau de bord développeur**. Tous les outils en ligne de commande (chrome-webstore-upload-cli
compris) se heurtent à cette limite, et le symptôme habituel est un envoi réussi suivi de
`publish failed: does not meet the requirements`.

Cet outil télécharge le paquet publié, compare son manifest au vôtre et liste les nouvelles autorisations et les
nouveaux hôtes à justifier, avec les lignes de votre code qui les utilisent : rédiger la justification prend une
minute. Il corrige aussi les erreurs d'empaquetage qui piquent en pratique :

- **Fichiers injectés à la demande** : ceux chargés via `chrome.scripting.executeScript({ files: [...] })` ou des tables
  comme `{ panel: ["build/panel.js"] }` sont inclus ; les outils qui suivent seulement les références les oublient sans prévenir.
- **Builds périmés** : les scripts `build` et `check` du projet tournent d'abord ; en cas d'échec, rien n'est envoyé.
- **Fichiers manquants** : un manifest qui pointe vers un fichier inexistant est refusé avant l'envoi.
- **Conflits de version** : la version suivante est calculée à partir du manifest local et du store (publiée et en
  examen), donc un store en avance sur votre copie locale ne provoque pas de refus.
- **Examens en cours** : détectés dès le départ plutôt qu'en plein milieu.

## Installation

Comme skill d'agent (Claude Code, Codex, …) :

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Codex : ~/.codex/skills
```

En gardant le dépôt hors du dossier des skills et en le liant à l'intérieur, `git pull` met la skill à jour sur
place et vous pouvez la modifier comme n'importe quel projet. Ensuite, dites simplement « publie mon extension » ou
« quelles extensions ont des changements non publiés ? ».

Comme outil en ligne de commande (Node 18 ou plus, sans dépendances) :

```bash
sh ~/code/xxd-chrome-publish/scripts/install.sh   # crée le lien ~/.local/bin/xxd-chrome-publish
```

Pour mettre à jour : `git -C ~/code/xxd-chrome-publish pull` ; le lien de la skill et la commande pointent tous deux vers le dépôt.

## Configuration (une seule fois)

```bash
xxd-chrome-publish setup --publisher-id <ID présent dans l'URL du tableau de bord>
xxd-chrome-publish setup --service-account chrome-webstore-publisher@<projet>.iam.gserviceaccount.com
#   …ou exportez CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN (OAuth, idéal pour la CI)
cd mon-extension && xxd-chrome-publish bind --extension-id <ID ou URL du store>
xxd-chrome-publish doctor
```

Les étapes détaillées des deux méthodes d'authentification sont dans [references/setup.md](references/setup.md) (en anglais).
Le compte de service se met dans le champ **service account** de la page Account du tableau de bord, pas dans
« Trusted tester accounts » : c'est un autre champ, sans accès à l'API, et l'y placer donne des erreurs 403.

## Utilisation

```bash
xxd-chrome-publish preflight        # montre ce qui se passerait ; ne modifie rien
xxd-chrome-publish                  # publier : compiler → vérifier → empaqueter → comparer → envoyer → soumettre
xxd-chrome-publish submit           # après le tableau de bord : soumet le brouillon déjà envoyé, sans renvoi
xxd-chrome-publish scan ~/code      # toutes les extensions : version locale et en ligne, examen, commits non publiés
xxd-chrome-publish status | pack | cancel | rollout 50
```

Options : `--minor`, `--major`, `--set-version X`, `--no-bump`, `--skip-build`, `--skip-checks`,
`--dashboard-ready`, `--cancel-pending`, `--upload-only`, `--staged`, `--zip CHEMIN`, `--commit`, `--json`.
Codes de sortie : `0` succès · `1` erreur · `2` un examen est en cours · `3` le tableau de bord doit d'abord être complété.

Les réglages propres à chaque extension vont dans `.chrome-publish.json` :

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

## Ce qu'il ne fait pas

Créer la première fiche, modifier le texte ou les captures de la fiche, ou remplir l'onglet de confidentialité :
Google ne propose pas d'API pour cela, et Chrome empêche toute extension de navigateur (agents IA compris) de piloter
les pages du Web Store. L'outil vous indique exactement quoi saisir ; des exemples de justifications se trouvent
dans [references/dashboard.md](references/dashboard.md).

## Développement

```bash
npm test   # tests unitaires + tests de bout en bout contre un faux Web Store local
```

Licence MIT.
