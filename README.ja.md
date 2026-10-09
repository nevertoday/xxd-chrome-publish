# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Chrome 拡張機能のアップデートを、コマンド 1 つで公開。**
ビルド、zip 化、アップロード、審査への提出まで自動。アップロードの前に、ストアに却下されるかどうかを教えてくれます。

コマンドとしても、Claude Code / Codex のスキルとしても使えます。「拡張機能を公開して」と言うだけです。

> すでに公開済みの拡張機能向けです。最初の公開は Chrome のダッシュボードで行ってください。

![Publish flow: every step before the upload can stop it](assets/diagrams/flow.en.svg)

## 何が解決するか

![The dashboard step moves to before the upload](assets/diagrams/before-after.en.svg)

| これまで | これから |
|---|---|
| アップロードは成功したのに、提出で *「does not meet the requirements」* | どの権限にダッシュボードで説明が必要か、コードのどの行で使っているかを先に教えてくれる |
| あとから読み込むファイルが zip に入らず、機能が壊れる | 自動で見つけて同梱する |
| 古いビルドをうっかりアップロード | 先にビルドとテストを実行。失敗したらアップロードしない |
| バージョン番号がストアと重なって却下 | コードとストアの両方を見て、次のバージョンを決める |
| どの拡張機能に未公開の変更があるか忘れる | 表 1 つで全部わかる |

## はじめかた

**1. インストール**

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Claude のスキルとして（Codex は ~/.codex/skills）
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # コマンドとして
```

**2. ストアのアカウントをつなぐ**（1 回だけ・[詳しい手順](references/setup.md)）

```bash
xxd-chrome-publish setup --publisher-id <ダッシュボード URL の ID> --service-account <サービスアカウントのメール>
```

**3. 拡張機能のフォルダごとに ID を登録**（1 回だけ）

```bash
cd my-extension
xxd-chrome-publish bind --extension-id <拡張機能 ID またはストアのリンク>
```

**4. 公開**

```bash
xxd-chrome-publish
```

## よく使うコマンド

| やりたいこと | コマンド |
|---|---|
| 何も変えずに、何が起きるか確認 | `xxd-chrome-publish preflight` |
| アップデートを公開 | `xxd-chrome-publish` |
| ダッシュボードを直してから再提出 | `xxd-chrome-publish submit` |
| 審査状況を見る | `xxd-chrome-publish status` |
| 未公開の変更がある拡張機能を探す | `xxd-chrome-publish scan ~/code` |
| 設定が正しいか確認 | `xxd-chrome-publish doctor` |

Claude Code / Codex なら頼むだけ：*「flomo の拡張機能を公開して」*、*「公開できる拡張機能はどれ？」*

## チェック結果の例

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

この例では、新しいサイトへのアクセス権限が見つかりました。リンクを開き、なぜ必要かを 1 文書いて保存し、公開すれば完了です。

## できないこと

![What the tool does, and what only you can do](assets/diagrams/roles.en.svg)

次のものは Google に API がないため、Chrome のダッシュボードで操作します。

- 最初の公開
- ストアの説明文とスクリーンショット
- プライバシータブ：権限の説明、データの使い方、プライバシーポリシーのリンク

何をどこに入力すればいいかは、ツールが正確に教えてくれます。ブラウザの AI エージェントにも代行できません。Chrome は拡張機能がストアのページを操作することを禁止しているためです。

## 詳細（クリックで開く）

<details>
<summary><b>ログイン方法：2 つから選ぶ</b></summary>

| 方法 | 向いている場面 | 必要なもの |
|---|---|---|
| gcloud + サービスアカウント | 自分のパソコン。秘密鍵ファイル不要 | Google Cloud SDK、サービスアカウント |
| OAuth リフレッシュトークン | CI（GitHub Actions など） | 環境変数 `CWS_CLIENT_ID`、`CWS_CLIENT_SECRET`、`CWS_REFRESH_TOKEN` |

⚠️ サービスアカウントはダッシュボードの Account ページにある **service account** 欄に入れます。「Trusted tester accounts」**ではありません**。そちらには API の権限がなく、403 エラーになります。

詳しい手順：[references/setup.md](references/setup.md)

</details>

<details>
<summary><b>すべてのオプション</b></summary>

| オプション | 動作 |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0（標準は 1.2.4） |
| `--set-version 1.5.0` | このバージョンをそのまま使う |
| `--no-bump` | manifest.json のバージョンを変えない |
| `--skip-build` / `--skip-checks` | ビルド / テストを実行しない |
| `--dashboard-ready` | ダッシュボードは入力済み。そのまま進める |
| `--cancel-pending` | 審査中のバージョンを取り下げて、こちらを提出 |
| `--upload-only` | アップロードだけして提出しない |
| `--staged` | 承認後すぐ公開せず、あなたの操作を待つ |
| `--zip file.zip` | zip を作らず、このファイルをアップロード |
| `--commit` | 公開後に新しいバージョン番号を git にコミット |
| `--json` | プログラムで読みやすい JSON で出力 |

終了コード：`0` 完了 · `1` エラー · `2` 別のバージョンが審査中 · `3` 先にダッシュボードの入力が必要

</details>

<details>
<summary><b>拡張機能ごとの設定</b>（<code>.chrome-publish.json</code>）</summary>

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

| 項目 | 意味 |
|---|---|
| `extensionId` | ストアのリンクにある 32 文字の ID |
| `build` | ビルドコマンド、または `false`。標準は package.json の `build` スクリプト |
| `check` | テストコマンド、または `false`。標準は package.json の `check` スクリプト |
| `packageDir` | zip にするフォルダ。ビルド結果が `dist` などに出る場合に指定 |
| `include` / `exclude` | 必ず入れる / 絶対に入れないファイル |

</details>

<details>
<summary><b>更新と開発</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # 更新（スキルのリンクもコマンドもここを指している）
npm test                                 # テスト実行（ローカルの偽ストアを使うので実際には公開されない）
npm run diagrams                         # 図を作り直す（build.mjs の文言を変えたあと）
```

審査に通りやすい権限の説明の書き方：[references/dashboard.md](references/dashboard.md) ·
エラーと対処法：[references/troubleshooting.md](references/troubleshooting.md)

</details>

MIT ライセンス
