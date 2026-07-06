<div align="center">

<h1>
    <b><a href="https://affine.pro">AFFiNE</a></b>
</h1>

**Schreiben, zeichnen und planen — alles auf einmal.**

Ein datenschutzfreundlicher, local-first, quelloffener Workspace. <br />
Eine eng verschmolzene Plattform für Dokumente, Whiteboards und Datenbanken — eine sofort einsatzbereite Alternative zu Notion & Miro.

<br />

[![Stars][stars-icon]](https://github.com/toeverything/AFFiNE/stargazers)
[![Downloads](https://img.shields.io/github/downloads/toeverything/AFFiNE/total)](https://github.com/toeverything/AFFiNE/releases/latest)
[![All Contributors][all-contributors-badge]](#contributors)
[![TypeScript][typescript-version-icon]](https://www.typescriptlang.org/)
[![BlockSuite][blocksuite-icon]](https://github.com/toeverything/blocksuite)
[![License: MIT + AFFiNE EE](https://img.shields.io/badge/license-MIT%20%2B%20AFFiNE%20EE-blue)](./LICENSE)

[Website](https://affine.pro) · [Live-Demo](https://app.affine.pro) · [Download](https://affine.pro/download) · [Dokumentation](https://docs.affine.pro) · [Blog](https://affine.pro/blog) · [Discord](https://affine.pro/redirect/discord)

[English](README.md) · [简体中文](README.zh-Hans.md) · [繁體中文](README.zh-Hant.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · Deutsch · [Español](README.es.md) · [Português (BR)](README.pt-BR.md) · [Русский](README.ru.md)

<br />

<a href="https://affine.pro/download">
    <img alt="AFFiNE — schreiben, zeichnen und planen, alles auf einmal" src="https://cdn.affine.pro/Github_hero_image2.png" style="width: 100%" />
</a>

<br />
<br />

<em>Dokumente, Canvas und Tabellen verschmelzen in AFFiNE zu einem Ganzen — ganz im Sinne des Wortes „affin“ (englisch affine, əˈfʌɪn | a-fein).</em>

</div>

<br />

## Was ist AFFiNE

[AFFiNE](https://affine.pro) ist ein quelloffener All-in-one-Workspace — ein Betriebssystem für alle Bausteine deiner Wissensbasis: Wiki, Wissensmanagement, Präsentationen und digitale Assets. Dokumente und Whiteboards sind auf einer randlosen Canvas wirklich miteinander verschmolzen — das macht AFFiNE zur besseren Alternative zu Notion und Miro.

<div align="center">
<img alt="Randlose AFFiNE-Canvas mit Dokumenten, Notizen und Datenbanken" src="https://github.com/toeverything/AFFiNE/assets/79301703/49a426bb-8d2b-4216-891a-fa5993642253" style="width: 100%"/>
</div>

## Zentrale Funktionen

**🎨 Eine echte Canvas für Blöcke jeder Art — Dokumente und Whiteboard vollständig vereint**

Viele Editoren bezeichnen sich als Canvas für produktives Arbeiten, aber AFFiNE gehört zu den ganz wenigen, bei denen du jeden Baustein auf einer randlosen Canvas platzieren kannst: Rich Text, Haftnotizen, eingebettete Webseiten, Datenbanken mit mehreren Ansichten, verknüpfte Seiten, Formen — sogar Folien.

**🤖 Ein multimodaler KI-Partner, bereit für jede Aufgabe**

Entwirf einen professionellen Bericht, verwandle eine Gliederung in ausdrucksstarke Folien, fasse einen Artikel in einer sauber strukturierten Mindmap zusammen oder zeichne und programmiere Prototyp-Apps aus einem einzigen Prompt — [AFFiNE AI](https://affine.pro/ai) treibt deine Kreativität bis an die Grenzen deiner Vorstellungskraft.

**🔒 Local-first, mit Echtzeit-Kollaboration**

Deine Daten liegen zuerst auf deiner eigenen Festplatte — und trotzdem unterstützt AFFiNE Echtzeit-Synchronisation und Zusammenarbeit über Web- und plattformübergreifende Clients hinweg.

**🛠️ Open Source, selbst hostbar und ganz nach deinen Vorstellungen formbar**

Du hast die Freiheit, AFFiNE selbst zu verwalten, zu hosten, zu forken und dein eigenes AFFiNE zu bauen. Der Editor basiert auf [BlockSuite](https://blocksuite.io), unserem quelloffenen, blockbasierten Editing-Framework.

## Erste Schritte

Es gibt drei Wege, mit AFFiNE loszulegen:

| Option                  | Am besten für                                                                                       | Hier starten                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ☁️ **AFFiNE Cloud**     | Null Einrichtungsaufwand — registriere dich und erstelle deinen ersten Workspace direkt im Browser. | [app.affine.pro öffnen](https://app.affine.pro)                                                                                 |
| 💻 **Desktop & Mobile** | Native Apps für macOS, Windows, Linux, iOS und Android, mit Local-first-Speicherung.                | [AFFiNE herunterladen](https://affine.pro/download) · [GitHub Releases](https://github.com/toeverything/AFFiNE/releases/latest) |
| 🐳 **Self-Hosted**      | Betreibe die volle Erfahrung auf deiner eigenen Infrastruktur mit Docker Compose.                   | [Zu „AFFiNE selbst hosten“ springen](#affine-selbst-hosten)                                                                     |

> ⭐ **Gib uns einen Stern auf GitHub** — du bekommst alle Release-Benachrichtigungen sofort, und es hilft dem Projekt wirklich beim Wachsen.

<img alt="AFFiNE auf GitHub mit einem Stern markieren" src="https://user-images.githubusercontent.com/79301703/230891830-0110681e-8c7e-483b-b6d9-9e42b291b9ef.gif" style="width: 100%"/>

## AFFiNE selbst hosten

Betreibe dein eigenes, voll ausgestattetes AFFiNE — deine Daten, deine Regeln. Den veröffentlichten Self-Hosting-Stack kannst du kostenlos nutzen; der Editor, die Desktop-App und der Großteil der Codebasis stehen unter MIT-Lizenz, das Backend unter der AFFiNE-Enterprise-Edition-Lizenz.

```sh
mkdir affine && cd affine

wget -O docker-compose.yml https://github.com/toeverything/affine/releases/latest/download/docker-compose.yml
wget -O .env https://github.com/toeverything/affine/releases/latest/download/default.env.example

# Passe in .env deine Zugangsdaten und Speicherpfade an, dann:
docker compose up -d
```

Dein Workspace läuft jetzt unter `http://localhost:3010`.

Für Konfiguration, Upgrades und Fehlerbehebung lies die [Self-Hosting-Dokumentation](https://docs.affine.pro/self-host-affine).

<!-- WHEN affine.pro/self-host SHIPS, append this sentence:
Or learn why teams choose an [open-source, self-hosted knowledge base](https://affine.pro/self-host) in the first place.
-->

**Deployment mit einem Klick:**

[![Run on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/affine)
[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?openapp=system-fastdeploy%3FtemplateName%3Daffine)

Du brauchst SSO, erweiterte Administration, Audit-Funktionen oder kommerzielles Self-Hosting mit Support? Sieh dir die [AFFiNE-Preispläne](https://affine.pro/pricing) an.

## Mitwirken

Entwicklerinnen und Entwickler, Tester, Tech-Writer und alle anderen — Beiträge jeder Art sind willkommen.

| Bug-Reports                                                                                                                                          | Feature-Wünsche                                                                                                                                                 | Fragen & Diskussionen                                                    | Community                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| [Bug-Report erstellen](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=bug%2Cproduct-review&template=BUG-REPORT.yml&title=TITLE) | [Feature-Wunsch einreichen](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=feat%2Cproduct-review&template=FEATURE-REQUEST.yml&title=TITLE) | [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions) | [AFFiNE Discord](https://affine.pro/redirect/discord) |
| Etwas funktioniert nicht wie erwartet                                                                                                                | Ideen für neue Funktionen oder Verbesserungen                                                                                                                   | Fragen stellen und Ideen teilen                                          | Fragen, lernen und sich mit anderen austauschen       |

- Lies [docs/types-of-contributions.md](docs/types-of-contributions.md), um die Art von Beitrag zu finden, die zu dir passt.
- Interesse am Code? Starte mit [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) und dem [Contributor-Tutorial](./docs/contributing/tutorial.md) und such dir dann ein Issue aus.
- Für **Übersetzungen** und **Sprachunterstützung** tritt unserem [Discord](https://affine.pro/redirect/discord) bei.
- Für Meldungen von Sicherheitslücken siehe [SECURITY.md](SECURITY.md).

**Bevor du beiträgst, lies und akzeptiere bitte unser [Contributor License Agreement].** Um deine Zustimmung zu erklären, bearbeite einfach diese Datei und reiche einen Pull Request ein.

### Aus dem Quellcode bauen

- **Codespaces**: Klicke auf der Hauptseite des Repos auf den grünen "Code"-Button und wähle "Create codespace on canary" — das geforkte Repo wird geklont, gebaut und ist sofort startklar.
- **Lokal**: Die vollständige Anleitung findest du in [BUILDING.md].

## Ökosystem

| Paket                                            | Beschreibung                  | Status                                                                                                                                                                       |
| ------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@affine/component](packages/frontend/component) | AFFiNE-Komponenten-Ressourcen | ![Codecov coverage](https://img.shields.io/codecov/c/github/toeverything/affine?style=flat-square)                                                                           |
| [@toeverything/theme](packages/common/theme)     | AFFiNE-Theme                  | [![npm downloads for @toeverything/theme](https://img.shields.io/npm/dm/@toeverything/theme?style=flat-square&color=eee)](https://www.npmjs.com/package/@toeverything/theme) |

AFFiNE wird erst möglich durch diese Open-Source-Projekte, auf denen wir aufbauen — danke:

- [BlockSuite](https://github.com/toeverything/BlockSuite) — 💠 das quelloffene kollaborative Editor-Projekt hinter AFFiNE.
- [y-octo](https://github.com/y-crdt/y-octo) — 🐙 eine native, hochperformante, threadsichere yjs-CRDT-Implementierung, die AFFiNEs Local-first-Sync-Engine antreibt.
- [OctoBase](https://github.com/toeverything/OctoBase) — 🐙 die local-first, kollaborative Datenbank hinter AFFiNE, geschrieben in Rust.
- [yjs](https://github.com/yjs/yjs) — grundlegende CRDT-Unterstützung für State-Management und Datensynchronisation.
- … und viele weitere hervorragende [Abhängigkeiten](https://github.com/toeverything/AFFiNE/network/dependencies).

## Danksagungen

„Wir formen unsere Werkzeuge, und danach formen unsere Werkzeuge uns.“ Viele Pioniere haben uns auf dem Weg inspiriert:

- Quip & Notion mit ihrem großartigen Konzept „Alles ist ein Block“
- Trello mit seinem Kanban
- Airtable & Miro mit ihren programmierbaren No-Code-Datenblättern
- Miro & Whimsical mit ihren randlosen visuellen Whiteboards
- RemNote & Capacities mit ihren objektbasierten Tag-Systemen

Diese Apps teilen sich viele atomare „Bausteine“, doch keine von ihnen ist Open Source, und keine bietet ein Plugin-System wie VS Code für Mitwirkende. Wir wollen etwas, das alle Funktionen vereint, die wir lieben — und dann noch einen Schritt weitergeht.

## Lizenz

- **AFFiNE-Open-Source-Codebasis** — der Editor, die Desktop-App und der Großteil der Codebasis stehen unter MIT-Lizenz; Backend-/Server-Komponenten unterliegen der AFFiNE-Enterprise-Edition-Lizenz.
- **AFFiNE Enterprise / kommerzielle Lizenzierung** — per kommerzieller Vereinbarung erhältlich für unternehmensorientierte Anforderungen wie SSO, erweiterte Administration, Audit, Rebranding und Self-Hosting mit Support. Mehr Informationen unter [affine.pro/pricing](https://affine.pro/pricing).

Details findest du in der [LICENSE].

<a id="contributors"></a>

## Mitwirkende

Wir möchten allen danken, die zu AFFiNE beigetragen haben! Wenn du ein Projekt, eine Dokumentation, ein Tool oder ein Template rund um AFFiNE gebaut hast, füge es gerne unserer kuratierten Liste hinzu: [awesome-affine](https://github.com/toeverything/awesome-affine).

<a href="https://github.com/toeverything/affine/graphs/contributors">
  <img alt="AFFiNE contributors" src="https://contrib.rocks/image?repo=toeverything/AFFiNE" />
</a>

<div align="center">

<br />

**Danke, dass du vorbeigeschaut hast — wir hoffen sehr, dass AFFiNE bei dir einen Nerv trifft! 🎵**

[affine.pro](https://affine.pro) · [Dokumentation](https://docs.affine.pro) · [Discord](https://affine.pro/redirect/discord)

</div>

[all-contributors-badge]: https://img.shields.io/github/contributors/toeverything/AFFiNE
[license]: ./LICENSE
[building.md]: ./docs/BUILDING.md
[contributor license agreement]: https://github.com/toeverything/affine/edit/canary/.github/CLA.md
[stars-icon]: https://img.shields.io/github/stars/toeverything/AFFiNE.svg?style=flat&logo=github&colorB=red&label=stars
[typescript-version-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/affine/dev/typescript
[blocksuite-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/AFFiNE/@blocksuite/store?color=6880ff&filename=packages%2Ffrontend%2Fcore%2Fpackage.json&label=blocksuite
