<div align="center">

<h1>
    <b><a href="https://affine.pro">AFFiNE</a></b>
</h1>

**書く・描く・計画する — すべてを一度に。**

プライバシー重視、ローカルファーストのオープンソースワークスペース。<br />
ドキュメント・ホワイトボード・データベースを一つに融合したプラットフォーム — Notion と Miro に代わる、すぐに使える選択肢です。

<br />

[![Stars][stars-icon]](https://github.com/toeverything/AFFiNE/stargazers)
[![Downloads](https://img.shields.io/github/downloads/toeverything/AFFiNE/total)](https://github.com/toeverything/AFFiNE/releases/latest)
[![All Contributors][all-contributors-badge]](#contributors)
[![TypeScript][typescript-version-icon]](https://www.typescriptlang.org/)
[![BlockSuite][blocksuite-icon]](https://github.com/toeverything/blocksuite)
[![License: MIT + AFFiNE EE](https://img.shields.io/badge/license-MIT%20%2B%20AFFiNE%20EE-blue)](./LICENSE)

[公式サイト](https://affine.pro) · [ライブデモ](https://app.affine.pro) · [ダウンロード](https://affine.pro/download) · [ドキュメント](https://docs.affine.pro) · [ブログ](https://affine.pro/blog) · [Discord](https://affine.pro/redirect/discord)

[English](README.md) · [简体中文](README.zh-Hans.md) · [繁體中文](README.zh-Hant.md) · 日本語 · [한국어](README.ko.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português (BR)](README.pt-BR.md) · [Русский](README.ru.md)

<br />

<a href="https://affine.pro/download">
    <img alt="AFFiNE — write, draw and plan all at once" src="https://cdn.affine.pro/Github_hero_image2.png" style="width: 100%" />
</a>

<br />
<br />

<em>ドキュメント・キャンバス・テーブルが高度に融合した AFFiNE。その名前は英単語 affine(アフィン | əˈfʌɪn | a-fine)に由来しています。</em>

</div>

<br />

## AFFiNE とは

[AFFiNE](https://affine.pro) は、オープンソースのオールインワンワークスペースです。wiki、ナレッジ管理、プレゼンテーション、デジタルアセットなど、ナレッジベースを構成するあらゆるビルディングブロックのためのオペレーティングシステムと言えます。ドキュメントとホワイトボードがひとつのエッジレスキャンバス上で真に融合しており、Notion や Miro に代わるより良い選択肢となります。

<div align="center">
<img alt="AFFiNE edgeless canvas with docs, notes and databases" src="https://github.com/toeverything/AFFiNE/assets/79301703/49a426bb-8d2b-4216-891a-fa5993642253" style="width: 100%"/>
</div>

## 主な特長

**🎨 あらゆる形のブロックを置ける、本物のキャンバス — ドキュメントとホワイトボードの完全な融合**

「生産性のためのキャンバス」を謳うエディタは数多くありますが、リッチテキスト、付箋、埋め込み Web ページ、マルチビューデータベース、リンクされたページ、図形、さらにはスライドまで、あらゆるビルディングブロックをエッジレスキャンバスに配置できるのは、AFFiNE を含むごくわずかなツールだけです。

**🤖 どんな仕事にも応えるマルチモーダル AI パートナー**

プロフェッショナルなレポートの下書き、アウトラインから表現力豊かなスライドへの変換、記事を整理されたマインドマップに要約、ひとつのプロンプトからプロトタイプアプリの描画とコーディングまで — [AFFiNE AI](https://affine.pro/ai) があなたの創造力を想像の限界まで押し広げます。

**🔒 ローカルファースト、それでいてリアルタイム共同編集**

データはまずあなた自身のディスクに保存されます。それでいて AFFiNE は、Web とクロスプラットフォームクライアントをまたいだリアルタイム同期・共同編集にも対応しています。

**🛠️ オープンソースでセルフホスト可能、自由にカスタマイズできる**

AFFiNE は自由に管理・セルフホスト・フォークして、自分だけの AFFiNE を作ることができます。エディタは、当社のオープンソースなブロックベース編集フレームワーク [BlockSuite](https://blocksuite.io) の上に構築されています。

## はじめに

AFFiNE の使い始め方は 3 通りあります。

| 選択肢                         | こんな方に                                                                                                 | はじめる                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ☁️ **AFFiNE Cloud**            | セットアップ不要 — サインアップするだけで、ブラウザ上に最初のワークスペースを作成できます。                | [app.affine.pro を開く](https://app.affine.pro)                                                                                  |
| 💻 **デスクトップ & モバイル** | macOS・Windows・Linux・iOS・Android 向けのネイティブアプリ。ローカルファーストのストレージを備えています。 | [AFFiNE をダウンロード](https://affine.pro/download) · [GitHub Releases](https://github.com/toeverything/AFFiNE/releases/latest) |
| 🐳 **セルフホスト**            | Docker Compose を使い、自分のインフラ上でフル機能を動かせます。                                            | [セルフホストの手順へ](#affine-をセルフホストする)                                                                               |

> ⭐ **GitHub でスターをお願いします** — すべてのリリース通知を即座に受け取れるうえ、プロジェクトの成長への大きな後押しになります。

<img alt="Star AFFiNE on GitHub" src="https://user-images.githubusercontent.com/79301703/230891830-0110681e-8c7e-483b-b6d9-9e42b291b9ef.gif" style="width: 100%"/>

## AFFiNE をセルフホストする

機能豊富な AFFiNE を自分でデプロイしましょう — あなたのデータは、あなたのルールで。公開されているセルフホスト用スタックは無料で運用できます。エディタ・デスクトップアプリを含むコードベースの大部分は MIT ライセンスで、バックエンドは AFFiNE Enterprise Edition ライセンスの対象です。

```sh
mkdir affine && cd affine

wget -O docker-compose.yml https://github.com/toeverything/affine/releases/latest/download/docker-compose.yml
wget -O .env https://github.com/toeverything/affine/releases/latest/download/default.env.example

# .env を編集して認証情報とストレージパスを設定したら、次を実行します:
docker compose up -d
```

これでワークスペースが `http://localhost:3010` で稼働します。

設定・アップグレード・トラブルシューティングについては、[セルフホストのドキュメント](https://docs.affine.pro/self-host-affine)をご覧ください。

<!-- WHEN affine.pro/self-host SHIPS, append this sentence:
Or learn why teams choose an [open-source, self-hosted knowledge base](https://affine.pro/self-host) in the first place.
-->

**ワンクリックデプロイ:**

[![Run on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/affine)
[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?openapp=system-fastdeploy%3FtemplateName%3Daffine)

SSO、高度な管理機能、監査、サポート付きの商用セルフホスティングが必要な場合は、[AFFiNE の料金プラン](https://affine.pro/pricing)をご覧ください。

## コントリビュート

開発者、テスター、テクニカルライターをはじめ、あらゆる形の貢献を歓迎します。

| バグ報告                                                                                                                                           | 機能リクエスト                                                                                                                                             | 質問・ディスカッション                                                   | コミュニティ                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| [バグレポートを作成](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=bug%2Cproduct-review&template=BUG-REPORT.yml&title=TITLE) | [機能リクエストを送信](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=feat%2Cproduct-review&template=FEATURE-REQUEST.yml&title=TITLE) | [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions) | [AFFiNE Discord](https://affine.pro/redirect/discord) |
| 期待どおりに動作しないとき                                                                                                                         | 新機能や改善のアイデア                                                                                                                                     | 質問やアイデアの共有                                                     | 質問し、学び、交流する場                              |

- [docs/types-of-contributions.md](docs/types-of-contributions.md) を読んで、自分に合った貢献の形を見つけてください。
- コードに興味がありますか?まずは [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) と[コントリビューターチュートリアル](./docs/contributing/tutorial.md)を読み、取り組む issue を選びましょう。
- **翻訳**や**言語サポート**については、[Discord](https://affine.pro/redirect/discord) にご参加ください。
- 脆弱性の報告については [SECURITY.md](SECURITY.md) をご覧ください。

**貢献の前に、必ず [Contributor License Agreement] を読み、同意してください。**同意を示すには、該当ファイルを編集してプルリクエストを送るだけで完了です。

### ソースからビルドする

- **Codespaces**: リポジトリのトップページで緑色の "Code" ボタンをクリックし、"Create codespace on canary" を選択します。フォークしたリポジトリのクローンとビルドが自動で行われ、すぐに開発を始められます。
- **ローカル**: 詳しい手順は [BUILDING.md] をご覧ください。

## エコシステム

| パッケージ                                       | 説明                            | ステータス                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@affine/component](packages/frontend/component) | AFFiNE のコンポーネントリソース | ![Codecov coverage](https://img.shields.io/codecov/c/github/toeverything/affine?style=flat-square)                                                                           |
| [@toeverything/theme](packages/common/theme)     | AFFiNE のテーマ                 | [![npm downloads for @toeverything/theme](https://img.shields.io/npm/dm/@toeverything/theme?style=flat-square&color=eee)](https://www.npmjs.com/package/@toeverything/theme) |

AFFiNE は、次のオープンソースプロジェクトの上に成り立っています — 心から感謝します。

- [BlockSuite](https://github.com/toeverything/BlockSuite) — 💠 AFFiNE を支えるオープンソースの共同編集エディタプロジェクト。
- [y-octo](https://github.com/y-crdt/y-octo) — 🐙 AFFiNE のローカルファースト同期エンジンを駆動する、ネイティブで高性能かつスレッドセーフな yjs CRDT 実装。
- [OctoBase](https://github.com/toeverything/OctoBase) — 🐙 Rust で書かれた、AFFiNE を支えるローカルファーストの共同編集データベース。
- [yjs](https://github.com/yjs/yjs) — 状態管理とデータ同期のための基盤となる CRDT サポート。
- ……そのほか多くの優れた[依存パッケージ](https://github.com/toeverything/AFFiNE/network/dependencies)。

## 謝辞

「私たちは道具を形作り、その後、道具が私たちを形作る。」その道のりで、多くの先駆者たちからインスピレーションを受けてきました。

- Quip と Notion — 「すべてはブロックである」という優れたコンセプト
- Trello — カンバン
- Airtable と Miro — ノーコードでプログラマブルなデータシート
- Miro と Whimsical — エッジレスなビジュアルホワイトボード
- RemNote と Capacities — オブジェクトベースのタグシステム

これらのアプリは、原子的な「ビルディングブロック」という点で多くの共通項を持っていますが、いずれもオープンソースではなく、コントリビューター向けの VS Code のようなプラグインシステムも提供していません。私たちが目指すのは、愛するこれらの機能をすべて備え、さらにその一歩先を行くツールです。

## ライセンス

- **AFFiNE オープンソースコードベース** — エディタ・デスクトップアプリを含むコードベースの大部分は MIT ライセンスです。バックエンド/サーバーコンポーネントは AFFiNE Enterprise Edition ライセンスの対象です。
- **AFFiNE Enterprise / 商用ライセンス** — SSO、高度な管理機能、監査、リブランディング、サポート付きセルフホスティングなど、エンタープライズ向けのニーズに対して商用契約で提供しています。詳細は [affine.pro/pricing](https://affine.pro/pricing) をご覧ください。

詳しくは [LICENSE] をご覧ください。

<a id="contributors"></a>

## コントリビューター

AFFiNE に貢献してくださったすべての皆さまに感謝します!AFFiNE に関連するプロジェクト、ドキュメント、ツール、テンプレートを作成した方は、キュレーションリスト [awesome-affine](https://github.com/toeverything/awesome-affine) への追加をぜひご検討ください。

<a href="https://github.com/toeverything/affine/graphs/contributors">
  <img alt="AFFiNE contributors" src="https://contrib.rocks/image?repo=toeverything/AFFiNE" />
</a>

<div align="center">

<br />

**ご覧いただきありがとうございます — AFFiNE があなたの心に響きますように!🎵**

[affine.pro](https://affine.pro) · [ドキュメント](https://docs.affine.pro) · [Discord](https://affine.pro/redirect/discord)

</div>

[all-contributors-badge]: https://img.shields.io/github/contributors/toeverything/AFFiNE
[license]: ./LICENSE
[building.md]: ./docs/BUILDING.md
[contributor license agreement]: https://github.com/toeverything/affine/edit/canary/.github/CLA.md
[stars-icon]: https://img.shields.io/github/stars/toeverything/AFFiNE.svg?style=flat&logo=github&colorB=red&label=stars
[typescript-version-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/affine/dev/typescript
[blocksuite-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/AFFiNE/@blocksuite/store?color=6880ff&filename=packages%2Ffrontend%2Fcore%2Fpackage.json&label=blocksuite
