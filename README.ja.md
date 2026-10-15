# xxd-chrome-publish

[简体中文](README.md) · [繁體中文](README.zh-TW.md) · [English](README.en.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**Chrome 拡張機能をウェブストアに載せて更新し続ける。初めての公開から毎回のリリースまで、コマンドラインで。**

| 初めての公開 | ストア画像 | 毎回の更新 |
|---|---|---|
| コードを読み、ストアの説明文・権限の説明・プライバシーの回答をダッシュボードの順に用意。言語ごとに 1 フォルダ | スクリーンショット・アイコン・プロモ画像を、拡張機能自身の UI の色と書体で。ひとつの製品に見える | ビルド・パッケージ・アップロード・審査提出。**アップロード前に**ストアに却下されるかがわかる |

コマンドとしても、Claude Code / Codex のスキルとしても使えます。「この拡張機能を公開して」「掲載資料を用意して」と言うだけです。
MIT ライセンス。npm の依存はありません。スクリーンショットと画像作成のときだけ、playwright-core をローカルのキャッシュに自動で入れます。

## なくなる手間

| これまで | これから |
|---|---|
| アップロードは成功、提出で *does not meet the requirements* | 事前チェックで、説明が必要な新しい権限と、それを使うコードの行を示す |
| 権限の説明やデータ開示を手探りで書き、コードと食い違う | 先にコードを読む：各権限の用途、通信先のサーバー、リモートコードの有無 |
| 13 言語のパッケージなのに、ストアページは 12 個が空 | 言語ごとに資料フォルダを用意し、リリース前に 1 つずつ確認。パッケージにまだない言語（日本語・韓国語・アラビア語…）も追加できる |
| 幅 400px のサイドパネルが画面いっぱいに引き伸ばされたスクリーンショット | サイドパネルやポップアップはブラウザ画面の中で撮影。デモデータ・オフライン・本物のアカウントには触れない |
| 拡張機能が使っていない色のプロモ画像 | 色・フォント・角丸を、拡張機能のページの実際の表示から読み取る |
| 後から読み込むファイルやライブラリのライセンスが ZIP から漏れる | 見つけて一緒にパッケージする |
| ストアにすでにあるバージョン番号 | コードとストアの両方から次のバージョンを決める |
| どの拡張機能に未公開の変更があるかわからない | 1 枚の表で全部見える |

## 実例

拡張機能「Cover Collage」で実際に作ったもの：

![プロモ画像：色・書体・角は拡張機能の UI から。主役は拡張機能が作るカバー](assets/examples/promo-marquee.en.png)

![ストアのスクリーンショット：サイドパネルを、動作するサイトの横に戻して撮影](assets/examples/screenshot-sidepanel.png)

公開前のチェック：

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

サイトへの権限が 1 つ増えました。リンクを開いて理由を一文書き、保存して公開するだけ。アップロード・提出・却下のあとで知ることはありません。

![公開の流れ：アップロード前のどのステップでも止まれる](assets/diagrams/flow.en.svg)

## はじめかた

**1. インストール**（Node 18 以上）

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # コマンドとして
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Claude のスキルとして（Codex は ~/.codex/skills）
```

**2. ストアのアカウントなしでできること**：拡張機能のフォルダで

```bash
xxd-chrome-publish listing .        # 初めての公開の資料を用意
xxd-chrome-publish style .          # UI の色・フォント・角丸を読み取る
xxd-chrome-publish pack . --patch   # バージョンを上げて、アップロードできる ZIP を作る
```

**3. 公開するときは、ストアのアカウントをつなぐ**（1 回だけ・[手順](references/setup.md)）

```bash
xxd-chrome-publish setup --publisher-id <ダッシュボード URL の ID> --service-account <サービスアカウントのメール>
# 拡張機能フォルダごとに 1 回
xxd-chrome-publish bind --extension-id <拡張機能 ID またはストア URL>
# 公開
xxd-chrome-publish
```

## 3 つの場面と、そのコマンド

### 初めての公開

```bash
xxd-chrome-publish listing . --locales ja,ko,ar   # コードを読み、パッケージし、ダッシュボード順のひな形を作る
xxd-chrome-publish privacy-page .                 # プライバシーポリシーを公開し、URL を資料に入れる
xxd-chrome-publish listing . --check              # 書き残し・Markdown・長すぎる概要・足りないファイルを検査
```

できあがるフォルダ（デスクトップに置き、ソースには入れない）：

```
<拡張機能フォルダ>-store-assets/
├── fill-text.md               ダッシュボードの順に、上から貼り付け
├── upload-files/              アイコン・スクリーンショット・プロモ画像・プライバシーページ・ZIP
├── language-versions/<言語>/  掲載言語ごと：貼り付け用テキスト・詳しい説明・プライバシーポリシー
└── working/listing-facts.md   根拠：各権限を使う行、通信先のサーバー
```

あとはダッシュボードでアイテムを作り、ZIP をアップロードして貼り付けます。ID ができたら `bind`。初回リリースでは、ログインの許可リスト・審査用テストアカウント・公開サポートページを先に確認します。

### ストア画像

| したいこと | コマンド |
|---|---|
| シナリオどおりにスクリーンショットを撮る（`--locale ja` で日本語版） | `xxd-chrome-publish shots . --scenario shots.json` |
| アイコンとプロモ画像のために UI のスタイルを読む | `xxd-chrome-publish style .` |
| 16/32/48/128 アイコン、ストアアイコン、確認用シートを作る | `xxd-chrome-publish icon . --svg icon.svg` |
| プロモ画像を書き出し、はみ出し・切れ・折り返しを検査 | `xxd-chrome-publish tile promo.html --size 1400x560 --out promo.png` |
| サイズと透過を検査し、ストアページをプレビュー | `xxd-chrome-publish images .` |

アップロードする画像はすべて、ストアの求める透過なしの 24 ビット PNG です。スクリーンショットには Google Chrome が必要で、初回に playwright-core を `~/.cache` に入れます。

### 毎回の更新

| したいこと | コマンド |
|---|---|
| 何が起きるか見るだけ（何も変えない） | `xxd-chrome-publish preflight` |
| 更新を公開 | `xxd-chrome-publish` |
| ダッシュボードを直して再提出 | `xxd-chrome-publish submit` |
| 審査の状況 | `xxd-chrome-publish status` |
| フォルダ内のどの拡張機能に未公開の変更があるか | `xxd-chrome-publish scan ~/code` |
| アカウント設定の確認 | `xxd-chrome-publish doctor` |

## AI アシスタントで使う

スキルとして入れたら、そのまま話しかけます：

- 「flomo の拡張機能を公開して」「公開できる拡張機能はどれ？」
- 「この拡張機能の掲載資料を、日本語・韓国語・アラビア語でも用意して」
- 「UI に合わせたスクリーンショット 5 枚とプロモ画像を作って」

公開のたびに、決まった形式のレポートで 3 つの事実を分けて伝えます：ダッシュボードを保存したか、パッケージをアップロードしたか、審査に提出したか。提出を「公開済み」とは言いません。公開は Google の承認のあとです。

## できないこと

![ツールがやること、あなたにしかできないこと](assets/diagrams/roles.en.svg)

Google がこれらの API を用意していないため、Chrome デベロッパー ダッシュボードで行います：アイテムの作成、説明文とプライバシー回答の貼り付け、画像のアップロード。ツールは貼り付けるテキストと画像を順番どおりに用意し、ダッシュボードのリンクを示します。Chrome は拡張機能からストアのページを操作させないため、拡張機能の中の AI アシスタントには入力できません。パソコンを直接操作できる AI なら、入力・保存し、項目ごとに読み返せます。

## 詳細

<details>
<summary><b>ログイン方法：どちらか 1 つ</b></summary>

| 方法 | 向いている場面 | 必要なもの |
|---|---|---|
| gcloud + サービスアカウント | 自分のパソコン。鍵ファイルを置かない | Google Cloud SDK とサービスアカウント |
| OAuth リフレッシュトークン | CI（GitHub Actions など） | `CWS_CLIENT_ID`、`CWS_CLIENT_SECRET`、`CWS_REFRESH_TOKEN` |

⚠️ サービスアカウントはダッシュボードの Account ページの **service account** 欄に入れます。隣の “Trusted tester accounts” **ではありません**。そちらには API 権限がなく、403 が続きます。

手順：[references/setup.md](references/setup.md)

</details>

<details>
<summary><b>公開のオプション一覧</b></summary>

| オプション | 内容 |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0（既定は 1.2.4） |
| `--set-version 1.5.0` | このバージョンにする |
| `--no-bump` | manifest.json のバージョンのまま |
| `--skip-build` / `--skip-checks` | ビルド / チェックのスクリプトを実行しない |
| `--dashboard-ready` | ダッシュボードは完了。続ける |
| `--cancel-pending` | 審査中のバージョンを取り下げ、これを提出 |
| `--upload-only` | アップロードのみ、提出しない |
| `--staged` | 承認後、あなたが公開するまで待つ |
| `--zip file.zip` | パッケージせず、この ZIP をアップロード |
| `--commit` | 公開後、バージョンの変更を git にコミット |
| `--json` | 機械向けの出力 |
| `--lang zh` / `--lang en` | 最後のレポートの言語と、ZIP のファイル名に使うストア名の言語。既定はシステムの言語 |

終了コード：`0` 完了 · `1` エラー · `2` 別のバージョンが審査中 · `3` 先にダッシュボードの作業。
ストア画像コマンドのオプション：`xxd-chrome-publish --help`。

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
| `extensionId` | ストア URL の 32 文字 |
| `build` | ビルドコマンド、または `false`。既定は package.json の `build` スクリプト |
| `check` | テストコマンド、または `false`。既定は package.json の `check` スクリプト |
| `packageDir` | パッケージするフォルダ（ビルド出力が `dist` ならそれ） |
| `include` / `exclude` | 必ず入れる / 必ず除くファイル |

</details>

<details>
<summary><b>審査担当者への書き方と、エラーへの対処</b></summary>

- 初めての公開の各項目：[references/first-listing.md](references/first-listing.md)
- スクリーンショットのシナリオ：[references/screenshots.md](references/screenshots.md) · アイコンとプロモ画像：[references/store-images.md](references/store-images.md)
- 通りやすい権限の説明：[references/dashboard.md](references/dashboard.md)
- エラーと対処：[references/troubleshooting.md](references/troubleshooting.md)

</details>

<details>
<summary><b>更新と開発</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # 更新（スキルのリンクもコマンドもここを指す）
npm test                                # ローカルの偽ストアでテスト。何も公開されない
npm run diagrams                        # build.mjs の文言を変えたら図を作り直す
```

</details>

MIT ライセンス
