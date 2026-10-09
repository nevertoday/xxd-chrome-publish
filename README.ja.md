# xxd-chrome-publish

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · **日本語** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**すでに Chrome ウェブストアに公開している拡張機能**のアップデートを、ターミナルから、あるいは
Claude Code / Codex に頼むだけで公開できます。ビルド、チェック、パッケージ化、公開中のバージョンとの比較、
アップロード、審査への提出までを 1 コマンドで行います。

ただのアップロードスクリプトとの一番の違いは **プリフライト（事前チェック）** です。アップロードする前に、
ストアに何を理由に却下されるかを教えてくれます。

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

## なぜ作ったのか

Chrome ウェブストア API でできるのは「パッケージのアップロード」と「提出」だけです。権限の使用理由、
データ使用の開示、プライバシーポリシーの URL、ストアの説明文は **デベロッパー ダッシュボードでしか編集できません**。
どの CLI（chrome-webstore-upload-cli も含む）も同じ壁にぶつかり、よくある症状は「アップロードは成功したのに、
提出で `does not meet the requirements` と言われる」というものです。

このツールは公開中のパッケージをダウンロードして manifest を手元のものと比較し、理由の記入が必要な新しい権限や
ホストを一覧にします。その権限を使っているコードの行も表示するので、理由は 1 分で書けます。実際にはまりやすい
パッケージングの落とし穴も解消しています。

- **遅延注入されるファイル** — `chrome.scripting.executeScript({ files: [...] })` や
  `{ panel: ["build/panel.js"] }` のような書き方で読み込むファイルも含めます。参照をたどるだけの zip ツールは黙って取りこぼします。
- **古いビルド** — プロジェクトの `build` と `check` スクリプトを先に実行し、失敗したらアップロードしません。
- **存在しないファイル** — manifest が指しているのに存在しないファイルは、アップロード前に止めます。
- **バージョンの衝突** — 次のバージョンは手元の manifest とストア（公開中と審査中の両方）から決めるので、
  ストアのほうが新しくても却下されません。
- **審査中のバージョン** — 途中で失敗するのではなく、最初に検出します。

## インストール

エージェントのスキルとして（Claude Code、Codex など）:

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Codex: ~/.codex/skills
```

クローンをスキルフォルダの外に置いてリンクすれば、`git pull` でその場で更新でき、普通のプロジェクトと
同じように編集できます。あとは「拡張機能を公開して」「未リリースの変更がある拡張機能は？」と頼むだけです。

コマンドラインツールとして（Node 18 以上、依存関係なし）:

```bash
sh ~/code/xxd-chrome-publish/scripts/install.sh   # ~/.local/bin/xxd-chrome-publish にリンク
```

更新は `git -C ~/code/xxd-chrome-publish pull` だけです。スキルのリンクも CLI もこのクローンを指しています。

## 最初の設定（1 回だけ）

```bash
xxd-chrome-publish setup --publisher-id <ダッシュボード URL に含まれる ID>
xxd-chrome-publish setup --service-account chrome-webstore-publisher@<project>.iam.gserviceaccount.com
#   または CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN を export（OAuth、CI 向け）
cd my-extension && xxd-chrome-publish bind --extension-id <拡張機能 ID またはストア URL>
xxd-chrome-publish doctor
```

2 種類の認証方法の詳しい手順は [references/setup.md](references/setup.md) にあります（英語）。
サービスアカウントはダッシュボードの Account ページにある **service account** 欄に入れてください。
同じページの「Trusted tester accounts」は別の欄で、API の権限はありません（ここに入れると 403 になります）。

## 使い方

```bash
xxd-chrome-publish preflight        # 何が起きるかを確認するだけ。何も変更しない
xxd-chrome-publish                  # 公開: ビルド → チェック → パッケージ → 比較 → アップロード → 提出
xxd-chrome-publish submit           # ダッシュボードを直したあと、アップロード済みの下書きを提出
xxd-chrome-publish scan ~/code      # 全拡張機能の一覧: 手元とストアのバージョン、審査状況、未リリースのコミット
xxd-chrome-publish status | pack | cancel | rollout 50
```

主なオプション: `--minor`、`--major`、`--set-version X`、`--no-bump`、`--skip-build`、`--skip-checks`、
`--dashboard-ready`、`--cancel-pending`、`--upload-only`、`--staged`、`--zip PATH`、`--commit`、`--json`。
終了コード: `0` 成功 · `1` エラー · `2` 審査中のバージョンがある · `3` 先にダッシュボードの作業が必要。

拡張機能ごとの設定は `.chrome-publish.json` に書きます:

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

## できないこと

初回の公開、ストアの説明文やスクリーンショットの編集、プライバシータブの入力。Google はこれらの API を提供しておらず、
Chrome はブラウザ拡張機能（AI ブラウザエージェントを含む）がウェブストアのページを操作することも禁止しています。
代わりに何を入力すればよいかを正確に伝えます。権限の理由の書き方の例は [references/dashboard.md](references/dashboard.md) を参照してください。

## 開発

```bash
npm test   # ユニットテスト + ローカルの偽ウェブストアに対する E2E テスト
```

MIT ライセンス。
