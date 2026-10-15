# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Publiez les mises à jour de vos extensions Chrome en une seule commande.**
Elle compile, zippe, envoie et soumet à l'examen — et vous prévient *avant l'envoi* si le Chrome Web Store va refuser.

Utilisez-la comme commande, ou comme skill dans Claude Code / Codex : dites simplement « publie mon extension ».

> Les extensions en ligne reçoivent leurs mises à jour directement. Pour une première publication, `xxd-chrome-publish listing` prépare les textes du tableau de bord, les justifications des autorisations, les réponses de confidentialité et le paquet dans chaque langue de la fiche ; vous créez ensuite l'élément dans le tableau de bord Chrome et collez.

![Publish flow: every step before the upload can stop it](assets/diagrams/flow.en.svg)

## Ce qu'elle règle

![The dashboard step moves to before the upload](assets/diagrams/before-after.en.svg)

| Avant | Avec xxd-chrome-publish |
|---|---|
| L'envoi passe, puis la soumission échoue : *« does not meet the requirements »* | On vous dit d'abord quelle autorisation demande une note dans le tableau de bord, et quelle ligne de code l'utilise |
| Des fichiers chargés plus tard par votre code manquent dans le zip, et une fonction casse | Ils sont trouvés et ajoutés |
| Un vieux build part par erreur | Vos scripts de build et de test tournent d'abord ; s'ils échouent, rien n'est envoyé |
| Le numéro de version entre en conflit avec le store | La version suivante est calculée d'après votre code et le store |
| Vous oubliez quelles extensions ont des changements non publiés | Un seul tableau les liste toutes |
| Un paquet multilingue part, mais les pages du store des autres langues restent vides | Chaque langue est listée ; rien ne part tant que vous ne les avez pas vérifiées dans le tableau de bord |
| Les fichiers de licence manquent dans le zip | LICENSE, NOTICE et les licences tierces sont ajoutés automatiquement |

## Démarrer

**1. Installer**

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # comme skill Claude (Codex : ~/.codex/skills)
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # comme commande
```

**2. Connecter votre compte du store** (une fois · [pas à pas](references/setup.md))

```bash
xxd-chrome-publish setup --publisher-id <ID dans l'URL du tableau de bord> --service-account <e-mail>
```

**3. Lier chaque dossier d'extension** (une fois)

```bash
cd mon-extension
xxd-chrome-publish bind --extension-id <ID de l'extension ou lien du store>
```

**4. Publier**

```bash
xxd-chrome-publish
```

## Commandes courantes

| Vous voulez | Tapez |
|---|---|
| Voir ce qui se passerait, sans rien changer | `xxd-chrome-publish preflight` |
| Publier une mise à jour | `xxd-chrome-publish` |
| Soumettre à nouveau après avoir corrigé le tableau de bord | `xxd-chrome-publish submit` |
| Voir où en est l'examen | `xxd-chrome-publish status` |
| Voir quelles extensions ont des changements non publiés | `xxd-chrome-publish scan ~/code` |
| Vérifier que la configuration marche | `xxd-chrome-publish doctor` |
| Première publication : préparer le contenu du tableau de bord et le paquet par langue | `xxd-chrome-publish listing . --locales ja,ko,ar` |

Dans Claude Code / Codex, demandez simplement : *« publie l'extension flomo »*, *« quelles extensions puis-je publier ? »*

## Images de la fiche

Il fait aussi les captures, l'icône et les visuels promotionnels, en un seul ensemble avec l'interface de l'extension : couleurs, polices et coins sont lus sur ses vraies pages, sans palette à part, et le sujet de chaque visuel vient de ce que l'extension fait réellement (ce qu'elle produit, ou le site avec son panneau latéral).

| Vous voulez | Tapez |
|---|---|
| faire les captures d'après un scénario (panneaux latéraux et pop-ups replacés dans une fenêtre de navigateur) | `xxd-chrome-publish shots . --scenario shots.json` |
| lire les couleurs, polices, coins et l'icône actuelle de l'interface | `xxd-chrome-publish style .` |
| créer les icônes 16/32/48/128, l'icône de la fiche et une planche de contrôle | `xxd-chrome-publish icon . --svg icon.svg` |
| rendre un visuel promotionnel et vérifier sa mise en page | `xxd-chrome-publish tile promo.html --size 1400x560 --out promo.png` |
| vérifier tailles et transparence, avec un aperçu de la fiche | `xxd-chrome-publish images .` |

- `--locale ja` fait les captures de la fiche japonaise ; les captures tournent hors ligne, avec des données de démonstration seulement.
- Tout ce qui est envoyé est en PNG 24 bits sans transparence, dans `<dossier de l'extension>-store-assets/upload-files/` sur le Bureau.
- Nécessite Google Chrome ; playwright-core s'installe tout seul au premier usage (dans `~/.cache` — le paquet reste sans dépendance).

## À quoi ressemble une vérification

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
  stages
    ✗ dashboard  NOT done — 1 required item above
    ✗ package    not uploaded
    ✗ review     not submitted
```

Ici, elle a trouvé une nouvelle autorisation pour un site. Ouvrez le lien, écrivez une phrase sur la raison de ce besoin, enregistrez, puis publiez. Les trois dernières lignes séparent les étapes — tableau de bord enregistré, paquet envoyé, soumis à l'examen — pour qu'aucune étape manquante ne passe inaperçue.

## Ce qu'elle ne fait pas

![What the tool does, and what only you can do](assets/diagrams/roles.en.svg)

Google ne propose pas d'API pour ceci, donc ça reste dans le tableau de bord Chrome :

- créer l'élément et coller le contenu de la fiche (préparé par `listing` ; une fois le nouvel ID créé, la première version ici vérifie d'abord les listes d'autorisation de connexion, un compte de test pour les examinateurs et une page d'assistance publique)
- la description et les captures d'écran du store (une page par langue)
- l'onglet confidentialité : notes d'autorisations, utilisation des données, lien vers la politique de confidentialité

L'outil vous dit exactement quoi remplir, et où. Chrome interdit aux extensions de piloter les pages du store : un agent qui tourne comme extension du navigateur ne peut donc pas le faire. Une IA qui contrôle directement l'ordinateur, si : elle saisit, envoie, enregistre, puis relit la page pour vérifier.

## Détails

<details>
<summary><b>Se connecter : deux façons</b></summary>

| Façon | Idéal pour | Ce qu'il faut |
|---|---|---|
| gcloud + compte de service | votre ordinateur, sans fichier secret | Google Cloud SDK, un compte de service |
| Jeton d'actualisation OAuth | la CI (ex. GitHub Actions) | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` |

⚠️ Le compte de service va dans le champ **service account** de la page Account du tableau de bord, **pas** dans « Trusted tester accounts ». Ce champ ne donne pas accès à l'API et vous aurez des erreurs 403.

Étapes complètes : [references/setup.md](references/setup.md)

</details>

<details>
<summary><b>Toutes les options</b></summary>

| Option | Effet |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0 (par défaut 1.2.4) |
| `--set-version 1.5.0` | utilise exactement cette version |
| `--no-bump` | garde la version de manifest.json |
| `--skip-build` / `--skip-checks` | ne lance pas le build / les tests |
| `--dashboard-ready` | le tableau de bord est rempli, on continue |
| `--cancel-pending` | retire la version en examen et soumet celle-ci |
| `--upload-only` | envoie sans soumettre |
| `--staged` | après approbation, attend que vous la mettiez en ligne |
| `--zip fichier.zip` | envoie ce zip au lieu d'en créer un |
| `--commit` | commit git du nouveau numéro de version à la fin |
| `--json` | sortie lisible par un programme |
| `--lang zh` / `--lang en` | langue du bloc REPORT final et du nom de la fiche utilisé pour nommer le ZIP (le nom affiché par Google) ; par défaut, celle du système |

Codes de sortie : `0` terminé · `1` erreur · `2` une autre version est en examen · `3` remplissez d'abord le tableau de bord

</details>

<details>
<summary><b>Réglages par extension</b> (<code>.chrome-publish.json</code>)</summary>

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

| Champ | Signification |
|---|---|
| `extensionId` | l'ID de 32 lettres du lien du store |
| `build` | commande de build, ou `false`. Par défaut : le script `build` de package.json |
| `check` | commande de test, ou `false`. Par défaut : le script `check` de package.json |
| `packageDir` | dossier à zipper, si votre build écrit dans `dist` par exemple |
| `include` / `exclude` | fichiers toujours / jamais inclus |

</details>

<details>
<summary><b>Mettre à jour et développer</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # mettre à jour (le lien de la skill et la commande pointent ici)
npm test                                 # lancer les tests (avec un faux store local)
npm run diagrams                         # régénérer les schémas (après avoir modifié build.mjs)
```

Rédiger des notes d'autorisations acceptées : [references/dashboard.md](references/dashboard.md) ·
Messages d'erreur et solutions : [references/troubleshooting.md](references/troubleshooting.md)

</details>

Licence MIT
