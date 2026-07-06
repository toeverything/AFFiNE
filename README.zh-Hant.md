<div align="center">

<h1>
    <b><a href="https://affine.pro">AFFiNE</a></b>
</h1>

**書寫、繪圖、規劃——一次搞定。**

一個重視隱私、本地優先的開源工作空間。<br />
將文件、白板與資料庫深度融合於單一平台——開箱即用的 Notion 與 Miro 替代方案。

<br />

[![Stars][stars-icon]](https://github.com/toeverything/AFFiNE/stargazers)
[![Downloads](https://img.shields.io/github/downloads/toeverything/AFFiNE/total)](https://github.com/toeverything/AFFiNE/releases/latest)
[![All Contributors][all-contributors-badge]](#contributors)
[![TypeScript][typescript-version-icon]](https://www.typescriptlang.org/)
[![BlockSuite][blocksuite-icon]](https://github.com/toeverything/blocksuite)
[![License: MIT + AFFiNE EE](https://img.shields.io/badge/license-MIT%20%2B%20AFFiNE%20EE-blue)](./LICENSE)

[官方網站](https://affine.pro) · [線上體驗](https://app.affine.pro) · [下載](https://affine.pro/download) · [說明文件](https://docs.affine.pro) · [部落格](https://affine.pro/blog) · [Discord](https://affine.pro/redirect/discord)

[English](README.md) · [简体中文](README.zh-Hans.md) · 繁體中文 · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português (BR)](README.pt-BR.md) · [Русский](README.ru.md)

<br />

<a href="https://affine.pro/download">
    <img alt="AFFiNE——書寫、繪圖、規劃，一次搞定" src="https://cdn.affine.pro/Github_hero_image2.png" style="width: 100%" />
</a>

<br />
<br />

<em>在 AFFiNE 中，文件、畫布與表格深度融為一體——正如其名 affine（發音 əˈfʌɪn | a-fine，意為「仿射」）。</em>

</div>

<br />

## AFFiNE 是什麼

[AFFiNE](https://affine.pro) 是一個開源的一體化工作空間——為你知識庫的所有基礎元件打造的作業系統：wiki、知識管理、簡報與數位資產。文件與白板在同一張無邊界畫布上真正融合，讓 AFFiNE 成為比 Notion 和 Miro 更好的選擇。

<div align="center">
<img alt="AFFiNE 無邊界畫布上的文件、筆記與資料庫" src="https://github.com/toeverything/AFFiNE/assets/79301703/49a426bb-8d2b-4216-891a-fa5993642253" style="width: 100%"/>
</div>

## 核心功能

**🎨 容納任何形態區塊的真正畫布——文件與白板完全融合**

許多編輯器都自稱是生產力畫布，但 AFFiNE 是極少數能讓你把任何基礎元件放上無邊界畫布的工具：富文字、便利貼、內嵌網頁、多視圖資料庫、連結頁面、圖形——甚至簡報。

**🤖 多模態 AI 夥伴，勝任各種工作**

撰寫專業報告、把大綱變成生動的簡報、將文章總結為結構清晰的心智圖，或用一句提示詞畫出並寫出原型應用——[AFFiNE AI](https://affine.pro/ai) 讓你的創造力抵達想像力的邊界。

**🔒 本地優先，同時支援即時協作**

你的資料首先儲存在自己的硬碟上，同時 AFFiNE 仍支援跨網頁與各平台用戶端的即時同步與協作。

**🛠️ 開源、可自架，隨你打造**

你可以自由地管理、自架、fork 並打造屬於自己的 AFFiNE。編輯器建構於 [BlockSuite](https://blocksuite.io)——我們開源的區塊式編輯框架。

## 快速上手

有三種方式可以開始使用 AFFiNE：

| 方式                  | 適合對象                                                               | 從這裡開始                                                                                                             |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ☁️ **AFFiNE Cloud**   | 零設定——註冊後即可在瀏覽器中建立你的第一個工作空間。                   | [開啟 app.affine.pro](https://app.affine.pro)                                                                          |
| 💻 **桌面與行動裝置** | macOS、Windows、Linux、iOS 與 Android 原生應用程式，資料本地優先儲存。 | [下載 AFFiNE](https://affine.pro/download) · [GitHub Releases](https://github.com/toeverything/AFFiNE/releases/latest) |
| 🐳 **自架部署**       | 用 Docker Compose 在自己的基礎設施上執行完整功能。                     | [跳至自架 AFFiNE](#自架-affine)                                                                                        |

> ⭐ **在 GitHub 上給我們一顆星**——你會即時收到所有版本發佈通知，這也實實在在地幫助專案成長。

<img alt="在 GitHub 上為 AFFiNE 加星" src="https://user-images.githubusercontent.com/79301703/230891830-0110681e-8c7e-483b-b6d9-9e42b291b9ef.gif" style="width: 100%"/>

## 自架 AFFiNE

部署功能完整、屬於你自己的 AFFiNE——你的資料，你作主。已發佈的自架版本可免費使用；編輯器、桌面應用程式與大部分程式碼採 MIT 授權，後端則適用 AFFiNE Enterprise Edition 授權。

```sh
mkdir affine && cd affine

wget -O docker-compose.yml https://github.com/toeverything/affine/releases/latest/download/docker-compose.yml
wget -O .env https://github.com/toeverything/affine/releases/latest/download/default.env.example

# 編輯 .env 設定你的帳號密碼與儲存路徑，然後執行：
docker compose up -d
```

你的工作空間現已在 `http://localhost:3010` 上執行。

關於設定、升級與疑難排解，請參閱[自架說明文件](https://docs.affine.pro/self-host-affine)。

<!-- WHEN affine.pro/self-host SHIPS, append this sentence:
Or learn why teams choose an [open-source, self-hosted knowledge base](https://affine.pro/self-host) in the first place.
-->

**一鍵部署：**

[![Run on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/affine)
[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?openapp=system-fastdeploy%3FtemplateName%3Daffine)

需要 SSO、進階管理、稽核功能，或附商業支援的自架方案？請參閱 [AFFiNE 定價方案](https://affine.pro/pricing)。

## 參與貢獻

誠摯邀請所有開發者、測試人員、技術寫作者等等——各種形式的貢獻我們都歡迎。

| 錯誤回報                                                                                                                                     | 功能請求                                                                                                                                           | 提問與討論                                                               | 社群                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| [建立錯誤回報](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=bug%2Cproduct-review&template=BUG-REPORT.yml&title=TITLE) | [提交功能請求](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=feat%2Cproduct-review&template=FEATURE-REQUEST.yml&title=TITLE) | [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions) | [AFFiNE Discord](https://affine.pro/redirect/discord) |
| 功能未如預期運作                                                                                                                             | 新功能或改進的想法                                                                                                                                 | 提出問題、分享想法                                                       | 提問、學習，與大家交流                                |

- 閱讀 [docs/types-of-contributions.md](docs/types-of-contributions.md)，找到適合你的貢獻方式。
- 想貢獻程式碼？從 [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) 和[貢獻者教學](./docs/contributing/tutorial.md)開始，然後挑一個 issue 動手。
- 關於**翻譯**與**語言支援**，請加入我們的 [Discord](https://affine.pro/redirect/discord)。
- 回報安全漏洞請參閱 [SECURITY.md](SECURITY.md)。

**在貢獻之前，請務必先閱讀並接受我們的[貢獻者授權協議][contributor license agreement]。** 只需編輯該檔案並提交 pull request，即表示你同意協議內容。

### 從原始碼建置

- **Codespaces**：在儲存庫首頁點擊綠色的 "Code" 按鈕，選擇 "Create codespace on canary"——fork 的儲存庫將自動完成 clone 與建置，即可開始使用。
- **本機建置**：完整步驟請參閱 [BUILDING.md]。

## 生態系

| 套件                                             | 說明            | 狀態                                                                                                                                                                         |
| ------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@affine/component](packages/frontend/component) | AFFiNE 元件資源 | ![Codecov coverage](https://img.shields.io/codecov/c/github/toeverything/affine?style=flat-square)                                                                           |
| [@toeverything/theme](packages/common/theme)     | AFFiNE 主題     | [![npm downloads for @toeverything/theme](https://img.shields.io/npm/dm/@toeverything/theme?style=flat-square&color=eee)](https://www.npmjs.com/package/@toeverything/theme) |

AFFiNE 的誕生離不開這些開源上游專案——由衷感謝：

- [BlockSuite](https://github.com/toeverything/BlockSuite)——💠 支撐 AFFiNE 的開源協作編輯器專案。
- [y-octo](https://github.com/y-crdt/y-octo)——🐙 原生、高效能、執行緒安全的 yjs CRDT 實作，驅動 AFFiNE 本地優先的同步引擎。
- [OctoBase](https://github.com/toeverything/OctoBase)——🐙 AFFiNE 背後以 Rust 寫成、本地優先的協作資料庫。
- [yjs](https://github.com/yjs/yjs)——為狀態管理與資料同步提供基礎的 CRDT 支援。
- ……以及許多優秀的[相依套件](https://github.com/toeverything/AFFiNE/network/dependencies)。

## 致謝

「我們塑造工具，工具反過來塑造我們。」一路走來，許多先行者帶給我們啟發：

- Quip 與 Notion——「萬物皆區塊」的出色理念
- Trello——看板方法
- Airtable 與 Miro——無程式碼的可程式化資料表
- Miro 與 Whimsical——無邊界的視覺化白板
- RemNote 與 Capacities——以物件為基礎的標籤系統

這些應用程式共享許多相同的原子化「基礎元件」，卻沒有一個是開源的，也沒有提供類似 VS Code 的外掛系統供貢獻者參與。我們想要一個涵蓋所有我們喜愛功能的工具——然後再往前多走一步。

## 授權條款

- **AFFiNE 開源程式碼**——編輯器、桌面應用程式與大部分程式碼採 MIT 授權；後端／伺服器元件適用 AFFiNE Enterprise Edition 授權。
- **AFFiNE 企業版／商業授權**——針對 SSO、進階管理、稽核、品牌重塑及附支援的自架等企業需求，可透過商業協議取得。詳情請見 [affine.pro/pricing](https://affine.pro/pricing)。

詳細內容請參閱 [LICENSE]。

<a id="contributors"></a>

## 貢獻者

我們由衷感謝每一位為 AFFiNE 做出貢獻的人！如果你打造了與 AFFiNE 相關的專案、文件、工具或範本，歡迎加入我們的精選清單：[awesome-affine](https://github.com/toeverything/awesome-affine)。

<a href="https://github.com/toeverything/affine/graphs/contributors">
  <img alt="AFFiNE 貢獻者" src="https://contrib.rocks/image?repo=toeverything/AFFiNE" />
</a>

<div align="center">

<br />

**感謝你的關注——真心希望 AFFiNE 能與你產生共鳴！🎵**

[affine.pro](https://affine.pro) · [說明文件](https://docs.affine.pro) · [Discord](https://affine.pro/redirect/discord)

</div>

[all-contributors-badge]: https://img.shields.io/github/contributors/toeverything/AFFiNE
[license]: ./LICENSE
[building.md]: ./docs/BUILDING.md
[contributor license agreement]: https://github.com/toeverything/affine/edit/canary/.github/CLA.md
[stars-icon]: https://img.shields.io/github/stars/toeverything/AFFiNE.svg?style=flat&logo=github&colorB=red&label=stars
[typescript-version-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/affine/dev/typescript
[blocksuite-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/AFFiNE/@blocksuite/store?color=6880ff&filename=packages%2Ffrontend%2Fcore%2Fpackage.json&label=blocksuite
