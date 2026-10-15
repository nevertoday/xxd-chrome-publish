# xxd-chrome-publish

[简体中文](README.md) · **繁體中文** · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

**把 Chrome 擴充功能送上線上應用程式商店，從第一次上架到每次更新，都在命令列裡完成。**

| 第一次上架 | 商店圖片 | 每次更新 |
|---|---|---|
| 讀你的程式碼，依資訊主頁的填寫順序備好商店文案、權限說明、隱私答案，一種語言一個資料夾 | 截圖、圖示、宣傳圖，顏色和字型取自擴充功能自己的介面，看起來是同一個產品 | 建置、打包、上傳、送審；**上傳之前**就告訴你商店會不會退回 |

可以當指令用，也可以裝進 Claude Code / Codex，直接說「把這個擴充功能發布」「幫它準備上架資料」。
MIT 開源。本身不依賴任何 npm 套件；截圖和做圖時，才會自動安裝一個 playwright-core 到本機快取。

## 它省掉的麻煩

| 以前 | 用它之後 |
|---|---|
| 上傳成功，送審卻被退：*does not meet the requirements* | 預檢時就指出哪個新權限要寫說明，以及程式碼哪一行用到它 |
| 權限說明、資料揭露不知道怎麼寫，寫了也和程式碼對不上 | 先從程式碼查出每個權限的用途、連了哪些伺服器、有沒有遠端程式碼，再照著寫 |
| 上了 13 種語言，其他語言的商店頁全是空的 | 每種語言一個資料夾，發布前逐一確認；還能加套件裡還沒有的語言（日文、韓文、阿拉伯文……） |
| 商店截圖裡，400px 寬的側邊欄被拉成整張圖 | 側邊欄、彈出視窗自動放回瀏覽器視窗裡截，示範資料、斷網，不碰真實帳號 |
| 宣傳圖另配一套顏色，和介面不像一家 | 顏色、字型、圓角從擴充功能頁面實際算繪的樣式讀出來 |
| 之後才載入的檔案、第三方函式庫的授權沒打進包 | 自動找齊，一起打包 |
| 版本號和商店撞了 | 同時參考程式碼和商店，算出下一個版本號 |
| 記不清哪些擴充功能有改動還沒發 | 一張表全部列出來 |

## 看看效果

用擴充功能「封面拼圖」實際跑出來的：

![宣傳圖：顏色、字型、直角都來自擴充功能介面，主角是它拼出來的封面](assets/examples/promo-marquee.zh.png)

![商店截圖：側邊欄放回瀏覽器視窗，左邊是它工作的網頁](assets/examples/screenshot-sidepanel.png)

發布前的檢查：

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

這次新加了一個網站權限。打開連結寫一句為什麼需要它、儲存，再發布就好——不用等到上傳、送審、被退之後才知道。

![發布流程：上傳前的每一步出問題都會停下](assets/diagrams/flow.zh-Hant.svg)

## 快速開始

**1. 安裝**（需要 Node 18+）

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
sh ~/code/xxd-chrome-publish/scripts/install.sh                       # 當指令用
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # 當 Claude 技能用（Codex 是 ~/.codex/skills）
```

**2. 不用商店帳號就能做的**：在擴充功能資料夾裡

```bash
xxd-chrome-publish listing .        # 準備上架資料（第一次上架）
xxd-chrome-publish style .          # 讀出介面的顏色、字型、圓角
xxd-chrome-publish pack . --patch   # 版本號加一，打一個能上傳的 ZIP
```

**3. 要發布時，連上商店帳號**（只需一次，[詳細步驟](references/setup.md)）

```bash
xxd-chrome-publish setup --publisher-id <資訊主頁網址裡的 ID> --service-account <服務帳戶信箱>
# 每個擴充功能資料夾一次
xxd-chrome-publish bind --extension-id <擴充功能 ID 或商店連結>
# 發布
xxd-chrome-publish
```

## 三種情況，各用哪些指令

### 第一次上架

```bash
xxd-chrome-publish listing . --locales ja,ko,ar   # 查程式碼 + 打包 + 依資訊主頁順序產生填寫骨架
xxd-chrome-publish privacy-page .                 # 隱私權政策發布成公開網頁，網址自動填進資料
xxd-chrome-publish listing . --check              # 驗收：沒寫完的、Markdown 符號、過長摘要、缺的檔案
```

產生的資料夾（放在桌面，不進原始碼）：

```
<擴充功能資料夾>-store-assets/
├── fill-text.md               依資訊主頁順序，從上往下複製貼上
├── upload-files/              圖示、截圖、宣傳圖、隱私網頁、ZIP
├── language-versions/<語言>/  每種上架語言一份：貼上稿、完整說明、隱私權政策
└── working/listing-facts.md   證據：每個權限用在哪一行、連了哪些伺服器
```

接著在資訊主頁新增項目、上傳 ZIP、貼上；拿到 ID 後 `bind`，第一次發布會先檢查登入白名單、審查測試帳號、公開支援頁面。

### 商店圖片

| 你想 | 輸入 |
|---|---|
| 截商店截圖（依情境檔；`--locale ja` 產生日文版） | `xxd-chrome-publish shots . --scenario shots.json` |
| 讀出介面風格，給圖示和宣傳圖用 | `xxd-chrome-publish style .` |
| 產生 16/32/48/128 圖示、商店圖示和檢查圖 | `xxd-chrome-publish icon . --svg icon.svg` |
| 算繪宣傳圖，並檢查文字超出、被裁、換行 | `xxd-chrome-publish tile promo.html --size 1400x560 --out promo.png` |
| 檢查尺寸和透明度，產生一張商店頁預覽 | `xxd-chrome-publish images .` |

上傳用的圖都是商店要求的 24 位元、不含透明的 PNG。截圖需要本機裝有 Google Chrome，第一次使用時會自動安裝 playwright-core 到 `~/.cache`。

### 每次更新

| 你想 | 輸入 |
|---|---|
| 先看看會發生什麼，什麼都不改 | `xxd-chrome-publish preflight` |
| 發布更新 | `xxd-chrome-publish` |
| 資訊主頁補完資料，重新送審 | `xxd-chrome-publish submit` |
| 查審查進度 | `xxd-chrome-publish status` |
| 看一個資料夾裡哪些擴充功能有改動還沒發 | `xxd-chrome-publish scan ~/code` |
| 檢查帳號設定對不對 | `xxd-chrome-publish doctor` |

## 在 AI 助手裡用

裝成技能後直接說：

- 「把 flomo 那個擴充功能發布」「看看哪些擴充功能可以發」
- 「幫這個擴充功能準備上架資料，要日文、韓文、阿拉伯文」
- 「做五張商店截圖和宣傳圖，風格和介面一致」

每次發布結束都有一段固定格式的報告，把三件事分開說：資訊主頁資料存了沒、安裝包傳了沒、送審了沒。它不會把「已送審」說成「已上架」——上架要等 Google 審查通過。

## 它做不到的

![工具自動做的，和只能你在資訊主頁做的](assets/diagrams/roles.zh-Hant.svg)

Google 沒有為這些開放 API，只能在 Chrome 開發人員資訊主頁完成：新增項目、貼上商店文案和隱私答案、上傳圖片。工具會把要貼上的文字和圖片依序備好，並附上資訊主頁連結。Chrome 不允許擴充功能操作商店頁面，所以擴充功能裡的 AI 助手填不了；能直接操作電腦的 AI 可以替你填寫、儲存，再逐項核對。

## 細節（點開看）

<details>
<summary><b>登入方式：兩種選一種</b></summary>

| 方式 | 適合 | 需要什麼 |
|---|---|---|
| gcloud + 服務帳戶 | 自己電腦上用，不存金鑰檔 | 安裝 Google Cloud SDK，建立一個服務帳戶 |
| OAuth refresh token | CI（例如 GitHub Actions） | `CWS_CLIENT_ID`、`CWS_CLIENT_SECRET`、`CWS_REFRESH_TOKEN` 三個環境變數 |

⚠️ 服務帳戶要填在資訊主頁 Account 頁的 **service account** 那一欄，**不是**旁邊的 “Trusted tester accounts”。填錯會一直出現 403。

完整步驟：[references/setup.md](references/setup.md)

</details>

<details>
<summary><b>發布的全部參數</b></summary>

| 參數 | 作用 |
|---|---|
| `--minor` / `--major` | 1.2.3 → 1.3.0 / 2.0.0（預設是 1.2.4） |
| `--set-version 1.5.0` | 就用這個版本號 |
| `--no-bump` | 不改版本號，用 manifest.json 裡現有的 |
| `--skip-build` / `--skip-checks` | 不跑建置 / 測試指令碼 |
| `--dashboard-ready` | 資訊主頁已經填好了，繼續發 |
| `--cancel-pending` | 撤回審查中的版本，改發這一版 |
| `--upload-only` | 只上傳，不送審 |
| `--staged` | 審查通過後先不上架，等你手動發布 |
| `--zip 檔案.zip` | 直接傳這個 ZIP，不重新打包 |
| `--commit` | 發完把新版本號提交到 git |
| `--json` | 輸出 JSON，方便程式讀取 |
| `--lang zh` / `--lang en` | 結尾報告的語言，以及 ZIP 檔名用哪種語言的商店名稱；預設跟系統語言 |

結束碼：`0` 完成 · `1` 出錯 · `2` 有別的版本在審查 · `3` 要先去資訊主頁補資料。
商店圖片指令各自的參數：`xxd-chrome-publish --help`。

</details>

<details>
<summary><b>每個擴充功能的設定</b>（<code>.chrome-publish.json</code>）</summary>

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

| 欄位 | 意思 |
|---|---|
| `extensionId` | 商店連結裡那串 32 個字母 |
| `build` | 建置指令，或 `false`。預設用 package.json 裡的 `build` 指令碼 |
| `check` | 測試指令，或 `false`。預設用 package.json 裡的 `check` 指令碼 |
| `packageDir` | 要打包的資料夾，例如建置輸出到 `dist` 時填它 |
| `include` / `exclude` | 一定要打包 / 一定不打包的檔案 |

</details>

<details>
<summary><b>寫給審查員的說明怎麼寫、出錯怎麼辦</b></summary>

- 第一次上架每個欄位的寫法：[references/first-listing.md](references/first-listing.md)
- 截圖情境檔：[references/screenshots.md](references/screenshots.md) · 圖示和宣傳圖：[references/store-images.md](references/store-images.md)
- 權限說明怎麼寫比較容易過審：[references/dashboard.md](references/dashboard.md)
- 錯誤訊息和解法：[references/troubleshooting.md](references/troubleshooting.md)

</details>

<details>
<summary><b>更新和開發</b></summary>

```bash
git -C ~/code/xxd-chrome-publish pull   # 更新（技能連結和指令都指向這裡）
npm test                                # 跑測試（本機假商店，不會真的發布）
npm run diagrams                        # 改了 build.mjs 裡的文字後，重新產生示意圖
```

</details>

MIT 授權
