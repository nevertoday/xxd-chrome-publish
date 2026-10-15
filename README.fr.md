# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Mettre une extension Chrome sur le Chrome Web Store et la tenir à jour — de la première publication à chaque version, en ligne de commande.**

| Première publication | Images de la fiche | Chaque mise à jour |
|---|---|---|
| Lit votre code et prépare les textes de la fiche, les justifications d'autorisations et les réponses de confidentialité dans l'ordre du tableau de bord, un dossier par langue | Captures, icônes et visuels promotionnels aux couleurs et à la typographie de l'interface même de l'extension : un seul produit | Construit, empaquette, envoie, soumet à l'examen — et dit **avant l'envoi** si la boutique va refuser |

Utilisable comme commande ou comme skill dans Claude Code / Codex : « publie cette extension », « prépare sa fiche ».
Licence MIT. Aucune dépendance npm ; les captures et images installent playwright-core dans un cache local à la première utilisation.

## Ce qu'elle vous épargne

| Avant | Avec elle |
|---|---|
| L'envoi passe, la soumission échoue : *does not meet the requirements* | La vérification préalable nomme la nouvelle autorisation à justifier et la ligne de code qui l'utilise |
| Justifications et déclarations de données écrites au jugé, en décalage avec le code | Le code est lu d'abord : à quoi sert chaque autorisation, quels serveurs sont appelés, s'il y a du code distant |
| Un paquet en 13 langues, douze pages de fiche vides | Un dossier par langue, confirmé avant publication ; on peut ajouter des langues que le paquet n'a pas encore (japonais, coréen, arabe…) |
| Un panneau latéral de 400 px étiré sur toute la capture | Panneaux latéraux et pop-ups capturés dans une fenêtre de navigateur, avec des données de démonstration, hors ligne, sans vrai compte |
| Des visuels aux couleurs que l'extension n'utilise pas | Couleurs, polices et coins lus sur les pages rendues de l'extension |
| Fichiers chargés plus tard et licences tierces absents du ZIP | Trouvés et empaquetés |
| Un numéro de version que la boutique a déjà | La version suivante calculée d'après le code et la boutique |
| Ne plus savoir quelles extensions ont des changements non publiés | Un seul tableau pour toutes |

## Voyez par vous-même

Réalisé pour l'extension « Cover Collage » :

![Visuel promotionnel : couleurs, typographie et coins droits de l'interface ; le sujet est la couverture qu'elle crée](assets/examples/promo-marquee.en.png)

![Capture de la fiche : le panneau latéral replacé dans une fenêtre de navigateur, à côté du site où il travaille](assets/examples/screenshot-sidepanel.png)

Une vérification avant publication :

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

Une nouvelle autorisation de site. Ouvrez le lien, écrivez une phrase sur sa raison d'être, enregistrez, publiez — au lieu de l'apprendre après l'envoi, la soumission et le refus.

![Déroulé d'une publication : chaque étape avant l'envoi peut l'arrêter](assets/diagrams/flow.en.svg)

## Démarrer

**1. Installer** (Node 18+)

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # comme commande
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # comme skill Claude (Codex : ~/.codex/skills)
```

**2. Sans compte de la boutique**, dans le dossier de l'extension :

```bash
xxd-chrome-publish listing .        # préparer le contenu de la première publication
xxd-chrome-publish style .          # lire couleurs, polices et coins de l'interface
xxd-chrome-publish pack . --patch   # monter la version et créer un ZIP prêt à envoyer
```

**3. Pour publier, reliez votre compte** (une fois — [pas à pas](references/setup.md))

```bash
xxd-chrome-publish setup --publisher-id <ID de l'URL du tableau de bord> --service-account <e-mail du compte de service>
xxd-chrome-publish bind --extension-id <ID de l'extension ou URL de la fiche>   # une fois par dossier
xxd-chrome-publish                                                              # publier
```

## Trois situations, leurs commandes

### Première publication

```bash
xxd-chrome-publish listing . --locales ja,ko,ar   # lit le code, empaquette, prépare le squelette dans l'ordre du tableau de bord
xxd-chrome-publish privacy-page .                 # publie la politique de confidentialité et reporte son URL
xxd-chrome-publish listing . --check              # restes à écrire, Markdown, résumé trop long, fichiers manquants
```

Le dossier créé (sur le Bureau, jamais dans votre code) :

```
<dossier de l'extension>-store-assets/
├── fill-text.md                 à coller de haut en bas, dans l'ordre du tableau de bord
├── upload-files/                icône, captures, visuels, page de confidentialité, ZIP
├── language-versions/<langue>/  par langue de la fiche : texte à coller, notes complètes, politique de confidentialité
└── working/listing-facts.md     les preuves : où chaque autorisation sert, quels serveurs sont appelés
```

Créez ensuite l'élément dans le tableau de bord, envoyez le ZIP et collez. Une fois l'ID obtenu, `bind` ; la première version vérifie d'abord les listes d'autorisation de connexion, un compte de test pour les examinateurs et une page d'assistance publique.

### Images de la fiche

| Vous voulez | Tapez |
|---|---|
| Faire les captures d'après un scénario (`--locale ja` pour le japonais) | `xxd-chrome-publish shots . --scenario shots.json` |
| Lire le style de l'interface pour icônes et visuels | `xxd-chrome-publish style .` |
| Créer les icônes 16/32/48/128, l'icône de la fiche et une planche de contrôle | `xxd-chrome-publish icon . --svg icon.svg` |
| Rendre un visuel et vérifier le texte qui déborde, est coupé ou passe à la ligne | `xxd-chrome-publish tile promo.html --size 1400x560 --out promo.png` |
| Vérifier tailles et transparence, avec un aperçu de la fiche | `xxd-chrome-publish images .` |

Tout ce qui est envoyé est en PNG 24 bits sans transparence, comme le demande la boutique. Les captures nécessitent Google Chrome ; playwright-core s'installe dans `~/.cache` au premier usage.

### Chaque mise à jour

| Vous voulez | Tapez |
|---|---|
| Voir ce qui se passerait, sans rien changer | `xxd-chrome-publish preflight` |
| Publier la mise à jour | `xxd-chrome-publish` |
| Resoumettre après avoir complété le tableau de bord | `xxd-chrome-publish submit` |
| Suivre l'examen | `xxd-chrome-publish status` |
| Voir quelles extensions d'un dossier ont des changements non publiés | `xxd-chrome-publish scan ~/code` |
| Vérifier la configuration du compte | `xxd-chrome-publish doctor` |

## Dans un assistant IA

Installée comme skill, il suffit de dire :

- « Publie l'extension flomo », « Quelles extensions puis-je publier ? »
- « Prépare la fiche de cette extension, aussi en japonais, coréen et arabe »
- « Fais cinq captures et les visuels promotionnels dans le style de l'interface »

Chaque publication se termine par un rapport au format fixe qui sépare trois faits : tableau de bord enregistré, paquet envoyé, soumis à l'examen. Il n'appelle jamais une soumission « publiée » — cela vient après l'approbation de Google.

## Ce qu'elle ne fait pas

![Ce que fait l'outil, et ce que vous seul pouvez faire](assets/diagrams/roles.en.svg)

Google ne propose pas d'API pour cela ; tout se passe dans le tableau de bord développeur Chrome : créer l'élément, coller les textes et les réponses de confidentialité, envoyer les images. L'outil prépare le texte et les images dans l'ordre, avec les liens du tableau de bord. Chrome interdit aux extensions de piloter les pages de la boutique : un assistant IA dans une extension ne peut pas les remplir ; une IA qui contrôle directement l'ordinateur peut remplir, enregistrer et relire chaque champ.

## Détails

<details>
<summary><b>Connexion : choisissez-en une</b></summary>

| Méthode | Pour | Il faut |
|---|---|---|
| gcloud + compte de service | votre machine, sans fichier de clé | le SDK Google Cloud et un compte de service |
| Jeton d'actualisation OAuth | CI (p. ex. GitHub Actions) | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` |

⚠️ Le compte de service va dans le champ **service account** de la page Account du tableau de bord, **pas** dans « Trusted tester accounts » juste à côté : celui-ci ne donne aucun accès à l'API et vous laisse avec des 403.

Pas à pas : [references/setup.md](references/setup.md)

</details>

<details>
<summary><b>Toutes les options de publication</b></summary>

| Option | Effet |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0 (par défaut 1.2.4) |
| `--set-version 1.5.0` | utiliser exactement cette version |
| `--no-bump` | garder la version de manifest.json |
| `--skip-build` / `--skip-checks` | ne pas lancer le script de build / de vérification |
| `--dashboard-ready` | le tableau de bord est fait ; continuer |
| `--cancel-pending` | retirer la version en examen et soumettre celle-ci |
| `--upload-only` | envoyer sans soumettre |
| `--staged` | après approbation, attendre que vous la publiiez |
| `--zip fichier.zip` | envoyer ce ZIP au lieu d'en créer un |
| `--commit` | committer le changement de version ensuite |
| `--json` | sortie lisible par une machine |
| `--lang zh` / `--lang en` | langue du rapport final et du nom de la fiche dans le nom du ZIP ; par défaut, celle du système |

Codes de sortie : `0` terminé · `1` erreur · `2` une autre version est en examen · `3` d'abord le tableau de bord.
Options des commandes d'images : `xxd-chrome-publish --help`.

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
| `extensionId` | les 32 lettres de l'URL de la fiche |
| `build` | commande de build, ou `false` ; par défaut le script `build` de package.json |
| `check` | commande de test, ou `false` ; par défaut le script `check` de package.json |
| `packageDir` | le dossier à empaqueter, p. ex. `dist` pour une sortie de build |
| `include` / `exclude` | fichiers toujours inclus / toujours exclus |

</details>

<details>
<summary><b>Écrire pour les examinateurs, résoudre les erreurs</b></summary>

- Chaque champ de la première publication : [references/first-listing.md](references/first-listing.md)
- Scénarios de captures : [references/screenshots.md](references/screenshots.md) · Icônes et visuels : [references/store-images.md](references/store-images.md)
- Des justifications d'autorisations qui passent : [references/dashboard.md](references/dashboard.md)
- Erreurs et solutions : [references/troubleshooting.md](references/troubleshooting.md)

</details>

<details>
<summary><b>Mettre à jour et développer</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # mettre à jour (le lien du skill et la commande pointent ici)
npm test                                # tests contre une fausse boutique locale ; rien n'est publié
npm run diagrams                        # régénérer les schémas après modification de build.mjs
```

</details>

Licence MIT
