<div align="center">

<h1>
    <b><a href="https://affine.pro">AFFiNE</a></b>
</h1>

**Écrivez, dessinez et planifiez — tout à la fois.**

Un espace de travail open source, local-first et respectueux de votre vie privée. <br />
Une plateforme hyper-fusionnée pour vos documents, tableaux blancs et bases de données — une alternative prête à l'emploi à Notion et Miro.

<br />

[![Stars][stars-icon]](https://github.com/toeverything/AFFiNE/stargazers)
[![Downloads](https://img.shields.io/github/downloads/toeverything/AFFiNE/total)](https://github.com/toeverything/AFFiNE/releases/latest)
[![All Contributors][all-contributors-badge]](#contributors)
[![TypeScript][typescript-version-icon]](https://www.typescriptlang.org/)
[![BlockSuite][blocksuite-icon]](https://github.com/toeverything/blocksuite)
[![License: MIT + AFFiNE EE](https://img.shields.io/badge/license-MIT%20%2B%20AFFiNE%20EE-blue)](./LICENSE)

[Site web](https://affine.pro) · [Démo en ligne](https://app.affine.pro) · [Télécharger](https://affine.pro/download) · [Documentation](https://docs.affine.pro) · [Blog](https://affine.pro/blog) · [Discord](https://affine.pro/redirect/discord)

[English](README.md) · [简体中文](README.zh-Hans.md) · [繁體中文](README.zh-Hant.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · Français · [Deutsch](README.de.md) · [Español](README.es.md) · [Português (BR)](README.pt-BR.md) · [Русский](README.ru.md)

<br />

<a href="https://affine.pro/download">
    <img alt="AFFiNE — écrivez, dessinez et planifiez tout à la fois" src="https://cdn.affine.pro/Github_hero_image2.png" style="width: 100%" />
</a>

<br />
<br />

<em>Documents, canevas et tableaux sont hyper-fusionnés dans AFFiNE — à l'image du mot affine (əˈfʌɪn | a-fine), qui évoque l'affinité.</em>

</div>

<br />

## Qu'est-ce qu'AFFiNE

[AFFiNE](https://affine.pro) est un espace de travail tout-en-un et open source — un véritable système d'exploitation pour toutes les briques de votre base de connaissances : wiki, gestion des connaissances, présentations et ressources numériques. Documents et tableaux blancs fusionnent réellement sur un même canevas sans bords, faisant d'AFFiNE une meilleure alternative à Notion et Miro.

<div align="center">
<img alt="Le canevas sans bords d'AFFiNE avec documents, notes et bases de données" src="https://github.com/toeverything/AFFiNE/assets/79301703/49a426bb-8d2b-4216-891a-fa5993642253" style="width: 100%"/>
</div>

## Fonctionnalités clés

**🎨 Un vrai canevas pour des blocs de toutes formes — documents et tableau blanc entièrement fusionnés**

Beaucoup d'éditeurs se présentent comme un canevas de productivité, mais AFFiNE fait partie des rares qui vous laissent placer n'importe quelle brique sur un canevas sans bords : texte riche, notes adhésives, pages web intégrées, bases de données multi-vues, pages liées, formes — et même des diapositives.

**🤖 Un partenaire IA multimodal, prêt pour toutes vos tâches**

Rédigez un rapport professionnel, transformez un plan en diapositives expressives, résumez un article en une carte mentale bien structurée, ou dessinez et codez des prototypes d'applications à partir d'une simple consigne — [AFFiNE AI](https://affine.pro/ai) pousse votre créativité aux confins de votre imagination.

**🔒 Local-first, avec collaboration en temps réel**

Vos données vivent d'abord sur votre propre disque, tandis qu'AFFiNE prend aussi en charge la synchronisation et la collaboration en temps réel sur le web et les clients multiplateformes.

**🛠️ Open source, auto-hébergeable, et façonnable à votre guise**

Vous êtes libre de gérer, d'auto-héberger, de forker et de construire votre propre AFFiNE. L'éditeur repose sur [BlockSuite](https://blocksuite.io), notre framework open source d'édition par blocs.

## Premiers pas

Il existe trois façons de commencer à utiliser AFFiNE :

| Option                  | Idéal pour                                                                                        | Commencer ici                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ☁️ **AFFiNE Cloud**     | Aucune installation — inscrivez-vous et créez votre premier espace de travail dans le navigateur. | [Ouvrir app.affine.pro](https://app.affine.pro)                                                                               |
| 💻 **Bureau et mobile** | Applications natives pour macOS, Windows, Linux, iOS et Android, avec stockage local-first.       | [Télécharger AFFiNE](https://affine.pro/download) · [Versions GitHub](https://github.com/toeverything/AFFiNE/releases/latest) |
| 🐳 **Auto-hébergé**     | Exécutez l'expérience complète sur votre propre infrastructure avec Docker Compose.               | [Aller à l'auto-hébergement](#auto-héberger-affine)                                                                           |

> ⭐ **Mettez-nous une étoile sur GitHub** — vous recevrez instantanément toutes les notifications de nouvelles versions, et cela aide réellement le projet à grandir.

<img alt="Mettre une étoile à AFFiNE sur GitHub" src="https://user-images.githubusercontent.com/79301703/230891830-0110681e-8c7e-483b-b6d9-9e42b291b9ef.gif" style="width: 100%"/>

## Auto-héberger AFFiNE

Déployez votre propre AFFiNE, riche en fonctionnalités — vos données, vos règles. Vous pouvez exécuter gratuitement la pile auto-hébergée publiée ; l'éditeur, l'application de bureau et l'essentiel du code sont sous licence MIT, tandis que le backend est couvert par la licence AFFiNE Enterprise Edition.

```sh
mkdir affine && cd affine

wget -O docker-compose.yml https://github.com/toeverything/affine/releases/latest/download/docker-compose.yml
wget -O .env https://github.com/toeverything/affine/releases/latest/download/default.env.example

# Modifiez .env pour définir vos identifiants et chemins de stockage, puis :
docker compose up -d
```

Votre espace de travail tourne désormais sur `http://localhost:3010`.

Pour la configuration, les mises à niveau et le dépannage, consultez la [documentation d'auto-hébergement](https://docs.affine.pro/self-host-affine).

<!-- WHEN affine.pro/self-host SHIPS, append this sentence:
Or learn why teams choose an [open-source, self-hosted knowledge base](https://affine.pro/self-host) in the first place.
-->

**Déploiement en un clic :**

[![Run on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/affine)
[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?openapp=system-fastdeploy%3FtemplateName%3Daffine)

Besoin de SSO, d'administration avancée, d'audit ou d'un auto-hébergement commercial avec support ? Consultez les [offres tarifaires d'AFFiNE](https://affine.pro/pricing).

## Contribuer

Appel à tous les développeurs, testeurs, rédacteurs techniques et autres — les contributions de tous types sont les bienvenues.

| Rapports de bugs                                                                                                                                        | Demandes de fonctionnalités                                                                                                                                                   | Questions et discussions                                                 | Communauté                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| [Créer un rapport de bug](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=bug%2Cproduct-review&template=BUG-REPORT.yml&title=TITLE) | [Soumettre une demande de fonctionnalité](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=feat%2Cproduct-review&template=FEATURE-REQUEST.yml&title=TITLE) | [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions) | [Discord AFFiNE](https://affine.pro/redirect/discord) |
| Quelque chose ne fonctionne pas comme prévu                                                                                                             | Idées de nouvelles fonctionnalités ou d'améliorations                                                                                                                         | Posez vos questions et partagez vos idées                                | Échangez, apprenez et discutez avec les autres        |

- Lisez [docs/types-of-contributions.md](docs/types-of-contributions.md) pour trouver la contribution qui vous convient.
- Le code vous intéresse ? Commencez par [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) et le [tutoriel du contributeur](./docs/contributing/tutorial.md), puis choisissez une issue.
- Pour la **traduction** et le **support linguistique**, rejoignez notre [Discord](https://affine.pro/redirect/discord).
- Pour signaler une vulnérabilité, consultez [SECURITY.md](SECURITY.md).

**Avant de contribuer, assurez-vous d'avoir lu et accepté notre [Contributor License Agreement].** Pour signifier votre accord, il vous suffit de modifier ce fichier et de soumettre une pull request.

### Compiler depuis les sources

- **Codespaces** : depuis la page principale du dépôt, cliquez sur le bouton vert "Code" et sélectionnez "Create codespace on canary" — le dépôt forké est cloné, compilé et prêt à l'emploi.
- **En local** : consultez [BUILDING.md] pour les instructions complètes.

## Écosystème

| Paquet                                           | Description                     | Statut                                                                                                                                                                       |
| ------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@affine/component](packages/frontend/component) | Ressources de composants AFFiNE | ![Codecov coverage](https://img.shields.io/codecov/c/github/toeverything/affine?style=flat-square)                                                                           |
| [@toeverything/theme](packages/common/theme)     | Thème AFFiNE                    | [![npm downloads for @toeverything/theme](https://img.shields.io/npm/dm/@toeverything/theme?style=flat-square&color=eee)](https://www.npmjs.com/package/@toeverything/theme) |

AFFiNE existe grâce à ces projets open source en amont — merci à eux :

- [BlockSuite](https://github.com/toeverything/BlockSuite) — 💠 le projet d'éditeur collaboratif open source au cœur d'AFFiNE.
- [y-octo](https://github.com/y-crdt/y-octo) — 🐙 une implémentation CRDT yjs native, performante et thread-safe qui alimente le moteur de synchronisation local-first d'AFFiNE.
- [OctoBase](https://github.com/toeverything/OctoBase) — 🐙 la base de données collaborative local-first derrière AFFiNE, écrite en Rust.
- [yjs](https://github.com/yjs/yjs) — le support CRDT fondamental pour la gestion d'état et la synchronisation des données.
- …et bien d'autres excellentes [dépendances](https://github.com/toeverything/AFFiNE/network/dependencies).

## Remerciements

« Nous façonnons nos outils, et ensuite nos outils nous façonnent. » De nombreux pionniers nous ont inspirés en chemin :

- Quip et Notion, avec leur formidable concept du « tout est un bloc »
- Trello, avec son Kanban
- Airtable et Miro, avec leurs feuilles de données programmables sans code
- Miro et Whimsical, avec leurs tableaux blancs visuels sans bords
- RemNote et Capacities, avec leurs systèmes de tags orientés objets

Ces applications partagent un large socle de « briques » atomiques, mais aucune n'est open source, et aucune n'offre un système de plugins à la VS Code pour les contributeurs. Nous voulons un outil qui réunisse toutes les fonctionnalités que nous aimons — et qui aille encore un pas plus loin.

## Licence

- **Code open source d'AFFiNE** — l'éditeur, l'application de bureau et l'essentiel du code sont sous licence MIT ; les composants backend/serveur sont couverts par la licence AFFiNE Enterprise Edition.
- **AFFiNE Enterprise / licence commerciale** — disponible par accord commercial pour les besoins d'entreprise tels que le SSO, l'administration avancée, l'audit, la personnalisation de marque et l'auto-hébergement avec support. Consultez [affine.pro/pricing](https://affine.pro/pricing) pour en savoir plus.

Voir [LICENSE] pour les détails.

<a id="contributors"></a>

## Contributeurs

Nous tenons à exprimer notre gratitude à toutes les personnes qui ont contribué à AFFiNE ! Si vous avez créé un projet, une documentation, un outil ou un modèle lié à AFFiNE, n'hésitez pas à l'ajouter à notre liste : [awesome-affine](https://github.com/toeverything/awesome-affine).

<a href="https://github.com/toeverything/affine/graphs/contributors">
  <img alt="AFFiNE contributors" src="https://contrib.rocks/image?repo=toeverything/AFFiNE" />
</a>

<div align="center">

<br />

**Merci de votre visite — nous espérons sincèrement qu'AFFiNE trouvera un écho chez vous ! 🎵**

[affine.pro](https://affine.pro) · [Documentation](https://docs.affine.pro) · [Discord](https://affine.pro/redirect/discord)

</div>

[all-contributors-badge]: https://img.shields.io/github/contributors/toeverything/AFFiNE
[license]: ./LICENSE
[building.md]: ./docs/BUILDING.md
[contributor license agreement]: https://github.com/toeverything/affine/edit/canary/.github/CLA.md
[stars-icon]: https://img.shields.io/github/stars/toeverything/AFFiNE.svg?style=flat&logo=github&colorB=red&label=stars
[typescript-version-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/affine/dev/typescript
[blocksuite-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/AFFiNE/@blocksuite/store?color=6880ff&filename=packages%2Ffrontend%2Fcore%2Fpackage.json&label=blocksuite
