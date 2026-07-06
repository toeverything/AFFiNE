<div align="center">

<h1>
    <b><a href="https://affine.pro">AFFiNE</a></b>
</h1>

**Пишите, рисуйте и планируйте — всё сразу.**

Рабочее пространство с открытым исходным кодом, приоритетом приватности и принципом local-first. <br />
Единая гиперобъединённая платформа для документов, досок и баз данных — готовая альтернатива Notion и Miro.

<br />

[![Stars][stars-icon]](https://github.com/toeverything/AFFiNE/stargazers)
[![Downloads](https://img.shields.io/github/downloads/toeverything/AFFiNE/total)](https://github.com/toeverything/AFFiNE/releases/latest)
[![All Contributors][all-contributors-badge]](#contributors)
[![TypeScript][typescript-version-icon]](https://www.typescriptlang.org/)
[![BlockSuite][blocksuite-icon]](https://github.com/toeverything/blocksuite)
[![License: MIT + AFFiNE EE](https://img.shields.io/badge/license-MIT%20%2B%20AFFiNE%20EE-blue)](./LICENSE)

[Сайт](https://affine.pro) · [Онлайн-демо](https://app.affine.pro) · [Скачать](https://affine.pro/download) · [Документация](https://docs.affine.pro) · [Блог](https://affine.pro/blog) · [Discord](https://affine.pro/redirect/discord)

[English](README.md) · [简体中文](README.zh-Hans.md) · [繁體中文](README.zh-Hant.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · [Português (BR)](README.pt-BR.md) · Русский

<br />

<a href="https://affine.pro/download">
    <img alt="AFFiNE — пишите, рисуйте и планируйте всё сразу" src="https://cdn.affine.pro/Github_hero_image2.png" style="width: 100%" />
</a>

<br />
<br />

<em>Документы, холст и таблицы гиперслиты в AFFiNE — как и само слово affine (əˈfʌɪn | а-файн).</em>

</div>

<br />

## Что такое AFFiNE

[AFFiNE](https://affine.pro) — это универсальное рабочее пространство с открытым исходным кодом, операционная система для всех строительных блоков вашей базы знаний: вики, управления знаниями, презентаций и цифровых материалов. Документы и доски здесь по-настоящему слиты на одном безграничном холсте, что делает AFFiNE достойной альтернативой Notion и Miro.

<div align="center">
<img alt="Безграничный холст AFFiNE с документами, заметками и базами данных" src="https://github.com/toeverything/AFFiNE/assets/79301703/49a426bb-8d2b-4216-891a-fa5993642253" style="width: 100%"/>
</div>

## Ключевые возможности

**🎨 Настоящий холст для блоков любого вида — документы и доска полностью слиты воедино**

Многие редакторы называют себя холстом для продуктивной работы, но AFFiNE — один из очень немногих, где на безграничный холст можно поместить любой строительный блок: форматированный текст, стикеры, встроенные веб-страницы, базы данных с несколькими представлениями, связанные страницы, фигуры — и даже слайды.

**🤖 Мультимодальный ИИ-напарник, готовый к любой работе**

Составьте профессиональный отчёт, превратите план в выразительные слайды, сверните статью в хорошо структурированную интеллект-карту или нарисуйте и запрограммируйте прототип приложения по одному запросу — [AFFiNE AI](https://affine.pro/ai) раздвигает границы вашего творчества до пределов воображения.

**🔒 Local-first — и при этом совместная работа в реальном времени**

Ваши данные в первую очередь хранятся на вашем собственном диске, при этом AFFiNE поддерживает синхронизацию и совместную работу в реальном времени в вебе и кроссплатформенных клиентах.

**🛠️ Открытый исходный код, самостоятельный хостинг и полная свобода изменений**

Вы вольны управлять AFFiNE, разворачивать его на своих серверах, делать форки и собирать собственные версии. Редактор построен на [BlockSuite](https://blocksuite.io) — нашем открытом фреймворке блочного редактирования.

## Начало работы

Начать пользоваться AFFiNE можно тремя способами:

| Вариант                               | Кому подходит                                                                                  | С чего начать                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ☁️ **AFFiNE Cloud**                   | Никакой настройки — зарегистрируйтесь и создайте первое рабочее пространство прямо в браузере. | [Открыть app.affine.pro](https://app.affine.pro)                                                                           |
| 💻 **Десктоп и мобильные устройства** | Нативные приложения для macOS, Windows, Linux, iOS и Android с локальным хранением данных.     | [Скачать AFFiNE](https://affine.pro/download) · [Релизы на GitHub](https://github.com/toeverything/AFFiNE/releases/latest) |
| 🐳 **Самостоятельный хостинг**        | Полноценная версия на вашей собственной инфраструктуре с Docker Compose.                       | [Перейти к самостоятельному хостингу](#самостоятельный-хостинг-affine)                                                     |

> ⭐ **Поставьте нам звезду на GitHub** — вы будете мгновенно получать уведомления обо всех релизах, и это по-настоящему помогает проекту расти.

<img alt="Поставьте звезду AFFiNE на GitHub" src="https://user-images.githubusercontent.com/79301703/230891830-0110681e-8c7e-483b-b6d9-9e42b291b9ef.gif" style="width: 100%"/>

## Самостоятельный хостинг AFFiNE

Разверните собственный полнофункциональный AFFiNE — ваши данные, ваши правила. Опубликованный стек для самостоятельного хостинга можно запускать бесплатно: редактор, десктопное приложение и большая часть кодовой базы распространяются под лицензией MIT, а серверная часть — под лицензией AFFiNE Enterprise Edition.

```sh
mkdir affine && cd affine

wget -O docker-compose.yml https://github.com/toeverything/affine/releases/latest/download/docker-compose.yml
wget -O .env https://github.com/toeverything/affine/releases/latest/download/default.env.example

# Отредактируйте .env, указав свои учётные данные и пути хранения, затем:
docker compose up -d
```

Ваше рабочее пространство теперь работает по адресу `http://localhost:3010`.

Настройка, обновление и устранение неполадок описаны в [документации по самостоятельному хостингу](https://docs.affine.pro/self-host-affine).

<!-- WHEN affine.pro/self-host SHIPS, append this sentence:
Or learn why teams choose an [open-source, self-hosted knowledge base](https://affine.pro/self-host) in the first place.
-->

**Развёртывание в один клик:**

[![Run on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/affine)
[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?openapp=system-fastdeploy%3FtemplateName%3Daffine)

Нужны SSO, расширенное администрирование, аудит или коммерческий самостоятельный хостинг с поддержкой? Ознакомьтесь с [тарифами AFFiNE](https://affine.pro/pricing).

## Участие в проекте

Приглашаем разработчиков, тестировщиков, технических писателей и не только — мы рады вкладу любого рода.

| Сообщения об ошибках                                                                                                                               | Запросы функций                                                                                                                                                | Вопросы и обсуждения                                                     | Сообщество                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| [Сообщить об ошибке](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=bug%2Cproduct-review&template=BUG-REPORT.yml&title=TITLE) | [Предложить новую функцию](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=feat%2Cproduct-review&template=FEATURE-REQUEST.yml&title=TITLE) | [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions) | [Discord AFFiNE](https://affine.pro/redirect/discord) |
| Что-то работает не так, как ожидалось                                                                                                              | Идеи новых функций и улучшений                                                                                                                                 | Задавайте вопросы и делитесь идеями                                      | Спрашивайте, учитесь и общайтесь с другими            |

- Прочитайте [docs/types-of-contributions.md](docs/types-of-contributions.md), чтобы найти подходящий именно вам способ участия.
- Интересует код? Начните с [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) и [руководства для контрибьюторов](./docs/contributing/tutorial.md), а затем выберите задачу.
- По вопросам **перевода** и **языковой поддержки** присоединяйтесь к нашему [Discord](https://affine.pro/redirect/discord).
- Об уязвимостях сообщайте согласно [SECURITY.md](SECURITY.md).

**Прежде чем вносить вклад, пожалуйста, прочитайте и примите наше [Лицензионное соглашение контрибьютора][contributor license agreement].** Чтобы подтвердить согласие, просто отредактируйте этот файл и отправьте pull request.

### Сборка из исходного кода

- **Codespaces**: на главной странице репозитория нажмите зелёную кнопку "Code" и выберите "Create codespace on canary" — форк репозитория будет клонирован, собран и готов к работе.
- **Локально**: полные инструкции — в [BUILDING.md].

## Экосистема

| Пакет                                            | Описание          | Статус                                                                                                                                                                       |
| ------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@affine/component](packages/frontend/component) | Компоненты AFFiNE | ![Codecov coverage](https://img.shields.io/codecov/c/github/toeverything/affine?style=flat-square)                                                                           |
| [@toeverything/theme](packages/common/theme)     | Тема AFFiNE       | [![npm downloads for @toeverything/theme](https://img.shields.io/npm/dm/@toeverything/theme?style=flat-square&color=eee)](https://www.npmjs.com/package/@toeverything/theme) |

AFFiNE существует благодаря этим открытым проектам — спасибо им:

- [BlockSuite](https://github.com/toeverything/BlockSuite) — 💠 открытый проект редактора для совместной работы, лежащий в основе AFFiNE.
- [y-octo](https://github.com/y-crdt/y-octo) — 🐙 нативная, высокопроизводительная, потокобезопасная реализация yjs CRDT, на которой работает local-first-движок синхронизации AFFiNE.
- [OctoBase](https://github.com/toeverything/OctoBase) — 🐙 local-first база данных для совместной работы, стоящая за AFFiNE и написанная на Rust.
- [yjs](https://github.com/yjs/yjs) — фундаментальная поддержка CRDT для управления состоянием и синхронизации данных.
- …и множество других замечательных [зависимостей](https://github.com/toeverything/AFFiNE/network/dependencies).

## Благодарности

«Мы создаём наши инструменты, а затем наши инструменты создают нас». На этом пути нас вдохновляли многие первопроходцы:

- Quip и Notion с их замечательной концепцией «всё — это блок»
- Trello с его канбан-досками
- Airtable и Miro с их программируемыми no-code таблицами
- Miro и Whimsical с их безграничными визуальными досками
- RemNote и Capacities с их объектными системами тегов

У этих приложений много общих атомарных «строительных блоков», но ни одно из них не имеет открытого исходного кода и не предлагает контрибьюторам систему плагинов в духе VS Code. Мы хотим инструмент, который объединит все любимые нами возможности — и сделает шаг дальше.

## Лицензия

- **Открытая кодовая база AFFiNE** — редактор, десктопное приложение и большая часть кодовой базы распространяются под лицензией MIT; серверные компоненты покрываются лицензией AFFiNE Enterprise Edition.
- **AFFiNE Enterprise / коммерческое лицензирование** — доступно по коммерческому соглашению для корпоративных потребностей: SSO, расширенное администрирование, аудит, ребрендинг и самостоятельный хостинг с поддержкой. Подробнее — на [affine.pro/pricing](https://affine.pro/pricing).

Подробности — в [LICENSE].

<a id="contributors"></a>

## Контрибьюторы

Мы благодарим всех, кто внёс вклад в развитие AFFiNE! Если вы создали проект, документацию, инструмент или шаблон, связанный с AFFiNE, — смело добавляйте его в нашу подборку [awesome-affine](https://github.com/toeverything/awesome-affine).

<a href="https://github.com/toeverything/affine/graphs/contributors">
  <img alt="Контрибьюторы AFFiNE" src="https://contrib.rocks/image?repo=toeverything/AFFiNE" />
</a>

<div align="center">

<br />

**Спасибо, что заглянули к нам, — мы искренне надеемся, что AFFiNE найдёт у вас отклик! 🎵**

[affine.pro](https://affine.pro) · [Документация](https://docs.affine.pro) · [Discord](https://affine.pro/redirect/discord)

</div>

[all-contributors-badge]: https://img.shields.io/github/contributors/toeverything/AFFiNE
[license]: ./LICENSE
[building.md]: ./docs/BUILDING.md
[contributor license agreement]: https://github.com/toeverything/affine/edit/canary/.github/CLA.md
[stars-icon]: https://img.shields.io/github/stars/toeverything/AFFiNE.svg?style=flat&logo=github&colorB=red&label=stars
[typescript-version-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/affine/dev/typescript
[blocksuite-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/AFFiNE/@blocksuite/store?color=6880ff&filename=packages%2Ffrontend%2Fcore%2Fpackage.json&label=blocksuite
