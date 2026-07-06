<div align="center">

<h1>
    <b><a href="https://affine.pro">AFFiNE</a></b>
</h1>

**写作、绘图、规划，一气呵成。**

一个注重隐私、本地优先的开源工作空间。 <br />
将文档、白板与数据库深度融合于一体的平台 —— 开箱即用的 Notion 与 Miro 替代品。

<br />

[![Stars][stars-icon]](https://github.com/toeverything/AFFiNE/stargazers)
[![Downloads](https://img.shields.io/github/downloads/toeverything/AFFiNE/total)](https://github.com/toeverything/AFFiNE/releases/latest)
[![All Contributors][all-contributors-badge]](#contributors)
[![TypeScript][typescript-version-icon]](https://www.typescriptlang.org/)
[![BlockSuite][blocksuite-icon]](https://github.com/toeverything/blocksuite)
[![License: MIT + AFFiNE EE](https://img.shields.io/badge/license-MIT%20%2B%20AFFiNE%20EE-blue)](./LICENSE)

[官网](https://affine.pro) · [在线体验](https://app.affine.pro) · [下载](https://affine.pro/download) · [文档](https://docs.affine.pro) · [博客](https://affine.pro/blog) · [Discord](https://affine.pro/redirect/discord)

[English](README.md) · 简体中文 · [繁體中文](README.zh-Hant.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português (BR)](README.pt-BR.md) · [Русский](README.ru.md)

<br />

<a href="https://affine.pro/download">
    <img alt="AFFiNE —— 写作、绘图、规划，一气呵成" src="https://cdn.affine.pro/Github_hero_image2.png" style="width: 100%" />
</a>

<br />
<br />

<em>在 AFFiNE 中，文档、画布与表格深度融合 —— 正如它的名字 affine（仿射，读作 əˈfʌɪn | a-fine）所寓意的那样。</em>

</div>

<br />

## AFFiNE 是什么

[AFFiNE](https://affine.pro) 是一个开源的一体化工作空间 —— 承载你知识库全部基础组件的操作系统：wiki、知识管理、演示文稿与数字资产。文档与白板在同一块无边界画布上真正融为一体，使 AFFiNE 成为比 Notion 和 Miro 更好的选择。

<div align="center">
<img alt="AFFiNE 无边界画布，承载文档、笔记与数据库" src="https://github.com/toeverything/AFFiNE/assets/79301703/49a426bb-8d2b-4216-891a-fa5993642253" style="width: 100%"/>
</div>

## 核心特性

**🎨 真正容纳任意形态区块的画布 —— 文档与白板完全融合**

许多编辑器都自称是生产力画布，但 AFFiNE 是极少数能让你在无边界画布上放置任意基础区块的产品之一：富文本、便签、嵌入网页、多视图数据库、关联页面、图形 —— 甚至演示幻灯片。

**🤖 多模态 AI 伙伴，胜任任何工作**

起草一份专业报告，把大纲变成生动的幻灯片，将文章总结为结构清晰的思维导图，或是用一句提示词画出并编写应用原型 —— [AFFiNE AI](https://affine.pro/ai) 让你的创造力抵达想象力的边界。

**🔒 本地优先，兼具实时协作**

你的数据首先保存在自己的磁盘上，同时 AFFiNE 依然支持跨网页端与各平台客户端的实时同步与协作。

**🛠️ 开源、可自托管，随你塑造**

你可以自由地管理、自托管、fork 并构建属于自己的 AFFiNE。编辑器基于 [BlockSuite](https://blocksuite.io) 构建 —— 我们开源的块状编辑框架。

## 快速开始

有三种方式开始使用 AFFiNE：

| 方式                | 适合场景                                                       | 从这里开始                                                                                                             |
| ------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ☁️ **AFFiNE Cloud** | 零配置 —— 注册后即可在浏览器中创建你的第一个工作空间。         | [打开 app.affine.pro](https://app.affine.pro)                                                                          |
| 💻 **桌面与移动端** | macOS、Windows、Linux、iOS 和 Android 原生应用，本地优先存储。 | [下载 AFFiNE](https://affine.pro/download) · [GitHub Releases](https://github.com/toeverything/AFFiNE/releases/latest) |
| 🐳 **自托管**       | 使用 Docker Compose 在自己的基础设施上运行完整体验。           | [跳转到自托管](#自托管-affine)                                                                                         |

> ⭐ **在 GitHub 上给我们点个 Star** —— 你会第一时间收到所有版本发布通知，这也实实在在地帮助项目成长。

<img alt="在 GitHub 上为 AFFiNE 点 Star" src="https://user-images.githubusercontent.com/79301703/230891830-0110681e-8c7e-483b-b6d9-9e42b291b9ef.gif" style="width: 100%"/>

## 自托管 AFFiNE

部署一个功能完整、由你做主的 AFFiNE —— 你的数据，你的规则。已发布的自托管套件可以免费运行；编辑器、桌面应用及大部分代码库采用 MIT 许可，后端则适用 AFFiNE Enterprise Edition 许可。

```sh
mkdir affine && cd affine

wget -O docker-compose.yml https://github.com/toeverything/affine/releases/latest/download/docker-compose.yml
wget -O .env https://github.com/toeverything/affine/releases/latest/download/default.env.example

# 编辑 .env 设置你的凭据和存储路径，然后执行：
docker compose up -d
```

现在，你的工作空间已运行在 `http://localhost:3010`。

关于配置、升级与故障排查，请阅读[自托管文档](https://docs.affine.pro/self-host-affine)。

<!-- WHEN affine.pro/self-host SHIPS, append this sentence:
Or learn why teams choose an [open-source, self-hosted knowledge base](https://affine.pro/self-host) in the first place.
-->

**一键部署：**

[![Run on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/affine)
[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?openapp=system-fastdeploy%3FtemplateName%3Daffine)

需要 SSO、高级管理、审计功能，或带商业支持的自托管服务？请查看 [AFFiNE 定价方案](https://affine.pro/pricing)。

## 参与贡献

开发者、测试者、技术写作者…… 我们欢迎任何形式的贡献。

| Bug 反馈                                                                                                                                      | 功能建议                                                                                                                                           | 提问与讨论                                                               | 社区                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| [提交 bug 报告](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=bug%2Cproduct-review&template=BUG-REPORT.yml&title=TITLE) | [提交功能建议](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=feat%2Cproduct-review&template=FEATURE-REQUEST.yml&title=TITLE) | [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions) | [AFFiNE Discord](https://affine.pro/redirect/discord) |
| 有什么地方不符合预期                                                                                                                          | 新功能或改进的想法                                                                                                                                 | 提出问题、分享想法                                                       | 提问、学习、与他人交流                                |

- 阅读 [docs/types-of-contributions.md](docs/types-of-contributions.md)，找到适合你的贡献方式。
- 想参与代码贡献？从 [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) 和[贡献者教程](./docs/contributing/tutorial.md)开始，然后挑选一个 issue。
- 关于**翻译**与**多语言支持**，请加入我们的 [Discord](https://affine.pro/redirect/discord)。
- 如需报告安全漏洞，请参阅 [SECURITY.md](SECURITY.md)。

**在参与贡献之前，请确保你已阅读并接受我们的[贡献者许可协议][contributor license agreement]。**只需编辑该文件并提交一个 pull request，即表示你同意该协议。

### 从源码构建

- **Codespaces**：在仓库主页点击绿色的 "Code" 按钮，选择 "Create codespace on canary" —— fork 后的仓库会自动克隆、构建，随时可用。
- **本地构建**：完整步骤见 [BUILDING.md]。

## 生态系统

| 包                                               | 说明            | 状态                                                                                                                                                                         |
| ------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@affine/component](packages/frontend/component) | AFFiNE 组件资源 | ![Codecov coverage](https://img.shields.io/codecov/c/github/toeverything/affine?style=flat-square)                                                                           |
| [@toeverything/theme](packages/common/theme)     | AFFiNE 主题     | [![npm downloads for @toeverything/theme](https://img.shields.io/npm/dm/@toeverything/theme?style=flat-square&color=eee)](https://www.npmjs.com/package/@toeverything/theme) |

AFFiNE 的实现离不开这些开源上游项目 —— 感谢你们：

- [BlockSuite](https://github.com/toeverything/BlockSuite) —— 💠 AFFiNE 背后的开源协作编辑器项目。
- [y-octo](https://github.com/y-crdt/y-octo) —— 🐙 原生、高性能、线程安全的 yjs CRDT 实现，驱动 AFFiNE 的本地优先同步引擎。
- [OctoBase](https://github.com/toeverything/OctoBase) —— 🐙 AFFiNE 背后的本地优先协作数据库，以 Rust 编写。
- [yjs](https://github.com/yjs/yjs) —— 为状态管理与数据同步提供底层 CRDT 支持。
- ……以及众多优秀的[依赖项](https://github.com/toeverything/AFFiNE/network/dependencies)。

## 致谢

"我们塑造工具，工具随后也塑造我们。"一路走来，许多先行者给了我们启发：

- Quip 与 Notion，以及它们"万物皆区块"的杰出理念
- Trello 的看板
- Airtable 与 Miro 的无代码可编程数据表
- Miro 与 Whimsical 的无边界可视化白板
- RemNote 与 Capacities 的基于对象的标签系统

这些应用在原子化"基础区块"上有大量重叠，但它们都不开源，也没有为贡献者提供类似 VS Code 的插件体系。我们想要的，是一个囊括所有我们喜爱的功能、并再向前迈进一步的产品。

## 许可协议

- **AFFiNE 开源代码库** —— 编辑器、桌面应用及大部分代码库采用 MIT 许可；后端/服务器组件适用 AFFiNE Enterprise Edition 许可。
- **AFFiNE 企业版 / 商业授权** —— 面向企业需求（如 SSO、高级管理、审计、品牌定制及带支持的自托管）提供商业协议授权。详情请见 [affine.pro/pricing](https://affine.pro/pricing)。

详见 [LICENSE]。

<a id="contributors"></a>

## 贡献者

我们衷心感谢每一位为 AFFiNE 做出贡献的人！如果你构建了与 AFFiNE 相关的项目、文档、工具或模板，欢迎将它添加到我们的精选列表：[awesome-affine](https://github.com/toeverything/awesome-affine)。

<a href="https://github.com/toeverything/affine/graphs/contributors">
  <img alt="AFFiNE contributors" src="https://contrib.rocks/image?repo=toeverything/AFFiNE" />
</a>

<div align="center">

<br />

**感谢你的关注 —— 真诚希望 AFFiNE 能与你产生共鸣！🎵**

[affine.pro](https://affine.pro) · [文档](https://docs.affine.pro) · [Discord](https://affine.pro/redirect/discord)

</div>

[all-contributors-badge]: https://img.shields.io/github/contributors/toeverything/AFFiNE
[license]: ./LICENSE
[building.md]: ./docs/BUILDING.md
[contributor license agreement]: https://github.com/toeverything/affine/edit/canary/.github/CLA.md
[stars-icon]: https://img.shields.io/github/stars/toeverything/AFFiNE.svg?style=flat&logo=github&colorB=red&label=stars
[typescript-version-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/affine/dev/typescript
[blocksuite-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/AFFiNE/@blocksuite/store?color=6880ff&filename=packages%2Ffrontend%2Fcore%2Fpackage.json&label=blocksuite
