<div align="center">

<h1>
    <b><a href="https://affine.pro">AFFiNE</a></b>
</h1>

**Write, draw and plan — all at once.**

A privacy-focused, local-first, open-source workspace. <br />
One hyper-fused platform for docs, whiteboards and databases — a ready-to-use alternative to Notion & Miro.

<br />

[![Stars][stars-icon]](https://github.com/toeverything/AFFiNE/stargazers)
[![Downloads](https://img.shields.io/github/downloads/toeverything/AFFiNE/total)](https://github.com/toeverything/AFFiNE/releases/latest)
[![All Contributors][all-contributors-badge]](#contributors)
[![TypeScript][typescript-version-icon]](https://www.typescriptlang.org/)
[![BlockSuite][blocksuite-icon]](https://github.com/toeverything/blocksuite)
[![License: MIT + AFFiNE EE](https://img.shields.io/badge/license-MIT%20%2B%20AFFiNE%20EE-blue)](./LICENSE)

[Website](https://affine.pro) · [Live Demo](https://app.affine.pro) · [Download](https://affine.pro/download) · [Documentation](https://docs.affine.pro) · [Blog](https://affine.pro/blog) · [Discord](https://affine.pro/redirect/discord)

English · [简体中文](README.zh-Hans.md) · [繁體中文](README.zh-Hant.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português (BR)](README.pt-BR.md) · [Русский](README.ru.md)

<br />

<a href="https://affine.pro/download">
    <img alt="AFFiNE — write, draw and plan all at once" src="https://cdn.affine.pro/Github_hero_image2.png" style="width: 100%" />
</a>

<br />
<br />

<em>Docs, canvas and tables are hyper-merged with AFFiNE — just like the word affine (əˈfʌɪn | a-fine).</em>

</div>

<br />

## What is AFFiNE

[AFFiNE](https://affine.pro) is an open-source, all-in-one workspace — an operating system for all the building blocks of your knowledge base: wiki, knowledge management, presentations and digital assets. Docs and whiteboards are truly merged on one edgeless canvas, making AFFiNE a better alternative to Notion and Miro.

<div align="center">
<img alt="AFFiNE edgeless canvas with docs, notes and databases" src="https://github.com/toeverything/AFFiNE/assets/79301703/49a426bb-8d2b-4216-891a-fa5993642253" style="width: 100%"/>
</div>

## Key Features

**🎨 A true canvas for blocks in any form — docs and whiteboard fully merged**

Many editors claim to be a canvas for productivity, but AFFiNE is one of the very few that lets you place any building block on an edgeless canvas: rich text, sticky notes, embedded web pages, multi-view databases, linked pages, shapes — even slides.

**🤖 A multimodal AI partner, ready for any work**

Draft a professional report, turn an outline into expressive slides, summarize an article into a well-structured mind map, or draw and code prototype apps from a single prompt — [AFFiNE AI](https://affine.pro/ai) pushes your creativity to the edge of your imagination.

**🔒 Local-first, with real-time collaboration**

Your data lives on your own disk first, while AFFiNE still supports real-time sync and collaboration across web and cross-platform clients.

**🛠️ Open-source, self-hostable, and yours to shape**

You have the freedom to manage, self-host, fork and build your own AFFiNE. The editor is built on [BlockSuite](https://blocksuite.io), our open-source block-based editing framework.

## Getting Started

There are three ways to start using AFFiNE:

| Option | Best for | Start here |
| --- | --- | --- |
| ☁️ **AFFiNE Cloud** | Zero setup — sign up and create your first workspace in the browser. | [Open app.affine.pro](https://app.affine.pro) |
| 💻 **Desktop & Mobile** | Native apps for macOS, Windows, Linux, iOS and Android, with local-first storage. | [Download AFFiNE](https://affine.pro/download) · [GitHub Releases](https://github.com/toeverything/AFFiNE/releases/latest) |
| 🐳 **Self-Hosted** | Run the full experience on your own infrastructure with Docker Compose. | [Jump to Self-Host](#self-host-affine) |

> ⭐ **Star us on GitHub** — you'll receive all release notifications instantly, and it genuinely helps the project grow.

<img alt="Star AFFiNE on GitHub" src="https://user-images.githubusercontent.com/79301703/230891830-0110681e-8c7e-483b-b6d9-9e42b291b9ef.gif" style="width: 100%"/>

## Self-Host AFFiNE

Deploy your own feature-rich AFFiNE — your data, your rules. You can run the published self-hosted stack for free; the editor, desktop app, and most of the codebase are MIT-licensed, while the backend is covered by the AFFiNE Enterprise Edition license.

```sh
mkdir affine && cd affine

wget -O docker-compose.yml https://github.com/toeverything/affine/releases/latest/download/docker-compose.yml
wget -O .env https://github.com/toeverything/affine/releases/latest/download/default.env.example

# Edit .env to set your credentials and storage paths, then:
docker compose up -d
```

Your workspace is now running at `http://localhost:3010`.

For configuration, upgrades and troubleshooting, read the [self-hosting documentation](https://docs.affine.pro/self-host-affine).
<!-- WHEN affine.pro/self-host SHIPS, append this sentence:
Or learn why teams choose an [open-source, self-hosted knowledge base](https://affine.pro/self-host) in the first place.
-->

**One-click deploy:**

[![Run on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/affine)
[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?openapp=system-fastdeploy%3FtemplateName%3Daffine)

Need SSO, advanced admin, audit, or supported commercial self-hosting? See the [AFFiNE pricing plans](https://affine.pro/pricing).

## Contributing

Calling all developers, testers, tech writers and more — contributions of all types are welcome.

| Bug Reports | Feature Requests | Questions & Discussions | Community |
| --- | --- | --- | --- |
| [Create a bug report](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=bug%2Cproduct-review&template=BUG-REPORT.yml&title=TITLE) | [Submit a feature request](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=feat%2Cproduct-review&template=FEATURE-REQUEST.yml&title=TITLE) | [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions) | [AFFiNE Discord](https://affine.pro/redirect/discord) |
| Something isn't working as expected | Ideas for new features or improvements | Ask questions and share ideas | Ask, learn, and engage with others |

- Read [docs/types-of-contributions.md](docs/types-of-contributions.md) to find the contribution that fits you.
- Interested in code? Start with [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) and the [contributor tutorial](./docs/contributing/tutorial.md), then pick an issue.
- For **translation** and **language support**, join our [Discord](https://affine.pro/redirect/discord).
- For vulnerability reports, see [SECURITY.md](SECURITY.md).

**Before contributing, please make sure you have read and accepted our [Contributor License Agreement].** To indicate your agreement, simply edit this file and submit a pull request.

### Building from source

- **Codespaces**: from the repo main page, click the green "Code" button and select "Create codespace on canary" — the forked repo is cloned, built, and ready to go.
- **Local**: see [BUILDING.md] for full instructions.

## Ecosystem

| Package | Description | Status |
| --- | --- | --- |
| [@affine/component](packages/frontend/component) | AFFiNE component resources | ![Codecov coverage](https://img.shields.io/codecov/c/github/toeverything/affine?style=flat-square) |
| [@toeverything/theme](packages/common/theme) | AFFiNE theme | [![npm downloads for @toeverything/theme](https://img.shields.io/npm/dm/@toeverything/theme?style=flat-square&color=eee)](https://www.npmjs.com/package/@toeverything/theme) |

AFFiNE is made possible by these open-source upstreams — thank you:

- [BlockSuite](https://github.com/toeverything/BlockSuite) — 💠 the open-source collaborative editor project behind AFFiNE.
- [y-octo](https://github.com/y-crdt/y-octo) — 🐙 a native, high-performance, thread-safe yjs CRDT implementation powering AFFiNE's local-first sync engine.
- [OctoBase](https://github.com/toeverything/OctoBase) — 🐙 the local-first, collaborative database behind AFFiNE, written in Rust.
- [yjs](https://github.com/yjs/yjs) — fundamental CRDT support for state management and data sync.
- …and many more excellent [dependencies](https://github.com/toeverything/AFFiNE/network/dependencies).

## Acknowledgements

"We shape our tools and thereafter our tools shape us." Many pioneers have inspired us along the way:

- Quip & Notion, with their great concept of "everything is a block"
- Trello, with their Kanban
- Airtable & Miro, with their no-code programmable datasheets
- Miro & Whimsical, with their edgeless visual whiteboards
- RemNote & Capacities, with their object-based tag systems

These apps share a large overlap of atomic "building blocks", but none are open source, nor do they offer a VS Code-like plugin system for contributors. We want something that contains all the features we love — and then goes one step further.

## License

- **AFFiNE open-source codebase** — the editor, desktop app, and most of the codebase are MIT-licensed; backend/server components are covered by the AFFiNE Enterprise Edition license.
- **AFFiNE Enterprise / commercial licensing** — available by commercial agreement for enterprise-oriented needs such as SSO, advanced admin, audit, rebranding, and supported self-hosting. See [affine.pro/pricing](https://affine.pro/pricing) for more information.

See [LICENSE] for details.

## Contributors

We would like to express our gratitude to everyone who has contributed to AFFiNE! If you have built an AFFiNE-related project, documentation, tool or template, feel free to add it to our curated list: [awesome-affine](https://github.com/toeverything/awesome-affine).

<a href="https://github.com/toeverything/affine/graphs/contributors">
  <img alt="AFFiNE contributors" src="https://contrib.rocks/image?repo=toeverything/AFFiNE" />
</a>

<div align="center">

<br />

**Thanks for checking us out — we sincerely hope AFFiNE resonates with you! 🎵**

[affine.pro](https://affine.pro) · [Documentation](https://docs.affine.pro) · [Discord](https://affine.pro/redirect/discord)

</div>

[all-contributors-badge]: https://img.shields.io/github/contributors/toeverything/AFFiNE
[license]: ./LICENSE
[building.md]: ./docs/BUILDING.md
[contributor license agreement]: https://github.com/toeverything/affine/edit/canary/.github/CLA.md
[stars-icon]: https://img.shields.io/github/stars/toeverything/AFFiNE.svg?style=flat&logo=github&colorB=red&label=stars
[typescript-version-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/affine/dev/typescript
[blocksuite-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/AFFiNE/@blocksuite/store?color=6880ff&filename=packages%2Ffrontend%2Fcore%2Fpackage.json&label=blocksuite
