# xxd-chrome-publish

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · **Deutsch** · [العربية](README.ar.md)

Veröffentliche Updates für Chrome-Erweiterungen, die **bereits im Chrome Web Store** sind – im Terminal oder
indem du Claude Code / Codex darum bittest. Ein Befehl baut, prüft, paketiert, vergleicht mit der veröffentlichten
Version, lädt hoch und reicht zur Überprüfung ein.

Der Unterschied zu einem gewöhnlichen Upload-Skript ist der **Vorab-Check (preflight)**: Bevor irgendetwas
hochgeladen wird, sagt er dir, was der Web Store ablehnen wird.

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

## Warum

Die Chrome-Web-Store-API kann nur ein Paket hochladen und einreichen. Begründungen für Berechtigungen, Angaben zur
Datennutzung, die URL der Datenschutzerklärung und der Text des Store-Eintrags existieren **nur im
Entwickler-Dashboard**. Jedes Kommandozeilen-Tool (auch chrome-webstore-upload-cli) stößt an diese Grenze; das
typische Symptom ist ein erfolgreicher Upload, gefolgt von `publish failed: does not meet the requirements`.

Dieses Tool lädt das veröffentlichte Paket herunter, vergleicht dessen Manifest mit deinem und listet die neuen
Berechtigungen und Hosts auf, die eine Begründung brauchen – samt den Codezeilen, die sie verwenden. So ist die
Begründung in einer Minute geschrieben. Außerdem behebt es die Paketierungsfehler, die in der Praxis wehtun:

- **Bei Bedarf injizierte Dateien**: Dateien, die per `chrome.scripting.executeScript({ files: [...] })` oder über
  Zuordnungen wie `{ panel: ["build/panel.js"] }` geladen werden, kommen mit ins Paket; Packer, die nur Verweisen folgen, lassen sie stillschweigend weg.
- **Veraltete Builds**: Die `build`- und `check`-Skripte des Projekts laufen zuerst; schlagen sie fehl, wird nichts hochgeladen.
- **Fehlende Dateien**: Verweist das Manifest auf eine nicht vorhandene Datei, wird vor dem Upload abgebrochen.
- **Versionskonflikte**: Die nächste Version wird aus dem lokalen Manifest und dem Store (veröffentlicht und in
  Prüfung) berechnet – ein Store, der deinem lokalen Stand voraus ist, führt also nicht zur Ablehnung.
- **Laufende Prüfungen**: werden gleich zu Beginn erkannt, statt mittendrin zu scheitern.

## Installation

Als Agent-Skill (Claude Code, Codex, …):

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Codex: ~/.codex/skills
```

Liegt das Repository außerhalb des Skills-Ordners und ist dort nur verlinkt, aktualisiert `git pull` den Skill an
Ort und Stelle, und du kannst ihn wie jedes andere Projekt bearbeiten. Danach genügt „Veröffentliche meine
Erweiterung“ oder „Welche meiner Erweiterungen haben unveröffentlichte Änderungen?“.

Als Kommandozeilen-Tool (Node 18+, keine Abhängigkeiten):

```bash
sh ~/code/xxd-chrome-publish/scripts/install.sh   # verlinkt ~/.local/bin/xxd-chrome-publish
```

Später aktualisieren mit `git -C ~/code/xxd-chrome-publish pull` – Skill-Link und Befehl zeigen beide auf das Repository.

## Einmalige Einrichtung

```bash
xxd-chrome-publish setup --publisher-id <ID aus der Dashboard-URL>
xxd-chrome-publish setup --service-account chrome-webstore-publisher@<projekt>.iam.gserviceaccount.com
#   …oder CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN exportieren (OAuth, gut für CI)
cd meine-erweiterung && xxd-chrome-publish bind --extension-id <ID oder Store-URL>
xxd-chrome-publish doctor
```

Die einzelnen Schritte für beide Anmeldearten stehen in [references/setup.md](references/setup.md) (Englisch).
Das Dienstkonto gehört in das Feld **service account** auf der Account-Seite des Dashboards, nicht in „Trusted
tester accounts“ – das ist ein anderes Feld ohne API-Zugriff, und ein Eintrag dort führt zu 403-Fehlern.

## Verwendung

```bash
xxd-chrome-publish preflight        # zeigt, was passieren würde; ändert nichts
xxd-chrome-publish                  # veröffentlichen: bauen → prüfen → paketieren → vergleichen → hochladen → einreichen
xxd-chrome-publish submit           # nach dem Dashboard: den hochgeladenen Entwurf einreichen, ohne erneuten Upload
xxd-chrome-publish scan ~/code      # alle Erweiterungen: lokale und Store-Version, Prüfstatus, unveröffentlichte Commits
xxd-chrome-publish status | pack | cancel | rollout 50
```

Optionen: `--minor`, `--major`, `--set-version X`, `--no-bump`, `--skip-build`, `--skip-checks`,
`--dashboard-ready`, `--cancel-pending`, `--upload-only`, `--staged`, `--zip PFAD`, `--commit`, `--json`.
Exit-Codes: `0` ok · `1` Fehler · `2` eine Prüfung läuft · `3` zuerst ist Arbeit im Dashboard nötig.

Einstellungen pro Erweiterung stehen in `.chrome-publish.json`:

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

## Was es nicht kann

Den ersten Eintrag anlegen, Text oder Screenshots des Store-Eintrags ändern oder den Datenschutz-Tab ausfüllen:
Google bietet dafür keine API, und Chrome verbietet jeder Browser-Erweiterung (auch KI-Browser-Agenten), Seiten
des Web Store zu steuern. Stattdessen sagt dir das Tool genau, was du eintragen musst; Beispiele für Begründungen
findest du in [references/dashboard.md](references/dashboard.md).

## Entwicklung

```bash
npm test   # Unit-Tests + End-to-End-Tests gegen einen lokalen Fake-Web-Store
```

MIT-Lizenz.
