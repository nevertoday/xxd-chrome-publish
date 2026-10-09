# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français** · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Publiez les mises à jour de vos extensions Chrome en une seule commande.**
Elle compile, zippe, envoie et soumet à l'examen — et vous prévient *avant l'envoi* si le Chrome Web Store va refuser.

Utilisez-la comme commande, ou comme skill dans Claude Code / Codex : dites simplement « publie mon extension ».

> Pour les extensions déjà en ligne. La toute première publication se fait toujours dans le tableau de bord Chrome.

## Ce qu'elle règle

| Avant | Avec xxd-chrome-publish |
|---|---|
| L'envoi passe, puis la soumission échoue : *« does not meet the requirements »* | On vous dit d'abord quelle autorisation demande une note dans le tableau de bord, et quelle ligne de code l'utilise |
| Des fichiers chargés plus tard par votre code manquent dans le zip, et une fonction casse | Ils sont trouvés et ajoutés |
| Un vieux build part par erreur | Vos scripts de build et de test tournent d'abord ; s'ils échouent, rien n'est envoyé |
| Le numéro de version entre en conflit avec le store | La version suivante est calculée d'après votre code et le store |
| Vous oubliez quelles extensions ont des changements non publiés | Un seul tableau les liste toutes |

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

Dans Claude Code / Codex, demandez simplement : *« publie l'extension flomo »*, *« quelles extensions puis-je publier ? »*

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
```

Ici, elle a trouvé une nouvelle autorisation pour un site. Ouvrez le lien, écrivez une phrase sur la raison de ce besoin, enregistrez, puis publiez.

## Ce qu'elle ne fait pas

Google ne propose pas d'API pour ceci, donc ça reste dans le tableau de bord Chrome :

- la première publication
- la description et les captures d'écran du store
- l'onglet confidentialité : notes d'autorisations, utilisation des données, lien vers la politique de confidentialité

L'outil vous dit exactement quoi remplir, et où. Un agent de navigateur ne peut pas le faire à votre place : Chrome interdit aux extensions de piloter les pages du store.

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
```

Rédiger des notes d'autorisations acceptées : [references/dashboard.md](references/dashboard.md) ·
Messages d'erreur et solutions : [references/troubleshooting.md](references/troubleshooting.md)

</details>

Licence MIT
