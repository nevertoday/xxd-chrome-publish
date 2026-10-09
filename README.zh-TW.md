# xxd-chrome-publish

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md)

為**已經在 Chrome 線上應用程式商店上架**的擴充功能發布更新：在終端機下一行指令，或直接跟 Claude Code / Codex 說一聲，
它就會建置、執行檢查、打包、和商店上的版本比對，然後上傳並送審。

和一般上傳腳本最大的不同是**預檢（preflight）**：上傳之前先告訴你，商店會因為什麼退回這次送審。

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

## 為什麼要做這個

Chrome 線上應用程式商店的 API 只能「上傳套件」和「送審」。權限用途說明、資料使用揭露、隱私權政策網址、商店說明文字，
**只能在開發人員資訊主頁裡修改**。所有命令列工具（包括 chrome-webstore-upload-cli）都過不了這一關，典型症狀是：
上傳成功了，送審時卻出現 `does not meet the requirements`。

這個工具會下載商店上目前的版本，和你本機的 manifest 比對，列出哪些新權限、新網域需要填寫說明，還會指出程式碼裡哪幾行用到它們，
寫說明一分鐘就夠。它也修掉了實際踩過的幾個打包問題：

- **按需注入的檔案**：`executeScript({ files: [...] })`、`{ panel: ["build/panel.js"] }` 這類寫法載入的檔案也會打進套件。只順著引用找檔案的打包工具會悄悄漏掉它們。
- **建置產物過期**：先執行專案自己的 `build` 和 `check`，失敗就不上傳。
- **檔案不存在**：manifest 裡寫了但檔案不存在，上傳前就攔下。
- **版本號衝突**：新版本號同時參考本機和商店（包括已發布和審核中的版本），商店比本機新也不會被退回。
- **審核中**：一開始就發現，不會傳到一半才失敗。

## 安裝

作為 AI 助理的技能（Claude Code、Codex 等）：

```bash
git clone https://github.com/nevertoday/xxd-chrome-publish ~/code/xxd-chrome-publish
ln -s ~/code/xxd-chrome-publish ~/.claude/skills/xxd-chrome-publish   # Codex 用 ~/.codex/skills
```

把儲存庫放在技能資料夾外面再用符號連結接進去，`git pull` 就能原地更新技能，修改起來也和一般專案一樣。
之後直接說「把這個擴充功能發布出去」「看看哪些擴充功能有還沒發布的變更」就行。

作為命令列工具（需要 Node 18 以上，沒有其他相依套件）：

```bash
sh ~/code/xxd-chrome-publish/scripts/install.sh   # 連結成 ~/.local/bin/xxd-chrome-publish
```

之後更新只要 `git -C ~/code/xxd-chrome-publish pull`，技能連結和指令都指向這份儲存庫。

## 一次性設定

```bash
xxd-chrome-publish setup --publisher-id <資訊主頁網址裡的 ID>
xxd-chrome-publish setup --service-account chrome-webstore-publisher@<專案>.iam.gserviceaccount.com
#   或設定 CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN 環境變數（OAuth，適合 CI）
cd 擴充功能目錄 && xxd-chrome-publish bind --extension-id <擴充功能 ID 或商店網址>
xxd-chrome-publish doctor
```

兩種驗證方式的詳細步驟見 [references/setup.md](references/setup.md)（英文）。特別提醒：服務帳戶要填在資訊主頁
Account 頁的 **service account** 欄位，不是旁邊的「Trusted tester accounts」（信任的測試人員）。
那一欄沒有 API 權限，填錯會一直出現 403。

## 日常用法

```bash
xxd-chrome-publish preflight        # 只看會發生什麼，什麼都不改
xxd-chrome-publish                  # 發布：建置 → 檢查 → 打包 → 比對 → 上傳 → 送審
xxd-chrome-publish submit           # 資訊主頁補完資料後，送審已上傳的草稿（不重新上傳）
xxd-chrome-publish scan ~/code      # 一覽所有擴充功能：本機 / 商店版本、審核狀態、尚未發布的提交數
xxd-chrome-publish status | pack | cancel | rollout 50
```

常用參數：`--minor`、`--major`、`--set-version X`、`--no-bump`、`--skip-build`、`--skip-checks`、
`--dashboard-ready`、`--cancel-pending`、`--upload-only`、`--staged`、`--zip 路徑`、`--commit`、`--json`。
結束代碼：`0` 成功 · `1` 錯誤 · `2` 有版本正在審核 · `3` 需要先到資訊主頁補資料。

每個擴充功能自己的設定寫在 `.chrome-publish.json`：

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

## 它做不到的

首次上架、修改商店說明和螢幕截圖、填寫隱私權分頁。Google 沒有提供這些 API，Chrome 也不允許任何瀏覽器擴充功能
（包括 AI 瀏覽器助理）操作商店頁面。工具會告訴你具體要填什麼，權限說明怎麼寫可以參考
[references/dashboard.md](references/dashboard.md)。

## 開發

```bash
npm test   # 單元測試 + 對本機假商店的端對端測試
```

MIT 授權。
