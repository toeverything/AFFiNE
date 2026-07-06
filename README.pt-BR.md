<div align="center">

<h1>
    <b><a href="https://affine.pro">AFFiNE</a></b>
</h1>

**Escreva, desenhe e planeje — tudo ao mesmo tempo.**

Um espaço de trabalho open source, local-first e focado em privacidade. <br />
Uma plataforma hiperintegrada para documentos, quadros brancos e bancos de dados — uma alternativa pronta para uso ao Notion e ao Miro.

<br />

[![Stars][stars-icon]](https://github.com/toeverything/AFFiNE/stargazers)
[![Downloads](https://img.shields.io/github/downloads/toeverything/AFFiNE/total)](https://github.com/toeverything/AFFiNE/releases/latest)
[![All Contributors][all-contributors-badge]](#contributors)
[![TypeScript][typescript-version-icon]](https://www.typescriptlang.org/)
[![BlockSuite][blocksuite-icon]](https://github.com/toeverything/blocksuite)
[![License: MIT + AFFiNE EE](https://img.shields.io/badge/license-MIT%20%2B%20AFFiNE%20EE-blue)](./LICENSE)

[Site](https://affine.pro) · [Demonstração ao vivo](https://app.affine.pro) · [Download](https://affine.pro/download) · [Documentação](https://docs.affine.pro) · [Blog](https://affine.pro/blog) · [Discord](https://affine.pro/redirect/discord)

[English](README.md) · [简体中文](README.zh-Hans.md) · [繁體中文](README.zh-Hant.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Español](README.es.md) · Português (BR) · [Русский](README.ru.md)

<br />

<a href="https://affine.pro/download">
    <img alt="AFFiNE — escreva, desenhe e planeje, tudo ao mesmo tempo" src="https://cdn.affine.pro/Github_hero_image2.png" style="width: 100%" />
</a>

<br />
<br />

<em>Documentos, canvas e tabelas se fundem por completo no AFFiNE — exatamente como sugere a palavra inglesa affine (əˈfʌɪn | "a-fáin", "afim").</em>

</div>

<br />

## O que é o AFFiNE

O [AFFiNE](https://affine.pro) é um espaço de trabalho open source e completo — um sistema operacional para todos os blocos que compõem a sua base de conhecimento: wiki, gestão de conhecimento, apresentações e ativos digitais. Documentos e quadros brancos se fundem de verdade em um único canvas infinito, o que faz do AFFiNE uma alternativa melhor ao Notion e ao Miro.

<div align="center">
<img alt="Canvas infinito do AFFiNE com documentos, notas e bancos de dados" src="https://github.com/toeverything/AFFiNE/assets/79301703/49a426bb-8d2b-4216-891a-fa5993642253" style="width: 100%"/>
</div>

## Principais recursos

**🎨 Um canvas de verdade para blocos de qualquer tipo — documentos e quadro branco totalmente integrados**

Muitos editores se dizem um canvas para produtividade, mas o AFFiNE é um dos raríssimos que permitem colocar qualquer bloco em um canvas infinito: texto rico, notas adesivas, páginas web incorporadas, bancos de dados com múltiplas visualizações, páginas vinculadas, formas — e até slides.

**🤖 Um parceiro de IA multimodal, pronto para qualquer trabalho**

Redija um relatório profissional, transforme um esboço em slides expressivos, resuma um artigo em um mapa mental bem estruturado, ou desenhe e programe protótipos de aplicativos a partir de um único prompt — o [AFFiNE AI](https://affine.pro/ai) leva a sua criatividade até o limite da sua imaginação.

**🔒 Local-first, com colaboração em tempo real**

Seus dados ficam primeiro no seu próprio disco, e ainda assim o AFFiNE oferece sincronização e colaboração em tempo real na web e em clientes multiplataforma.

**🛠️ Open source, auto-hospedável e moldável do seu jeito**

Você tem a liberdade de gerenciar, hospedar por conta própria, fazer fork e construir o seu próprio AFFiNE. O editor é construído sobre o [BlockSuite](https://blocksuite.io), nosso framework open source de edição baseada em blocos.

## Primeiros passos

Há três maneiras de começar a usar o AFFiNE:

| Opção                   | Ideal para                                                                                    | Comece aqui                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ☁️ **AFFiNE Cloud**     | Zero configuração — cadastre-se e crie seu primeiro espaço de trabalho no navegador.          | [Abrir app.affine.pro](https://app.affine.pro)                                                                                |
| 💻 **Desktop e Mobile** | Aplicativos nativos para macOS, Windows, Linux, iOS e Android, com armazenamento local-first. | [Baixar o AFFiNE](https://affine.pro/download) · [Releases no GitHub](https://github.com/toeverything/AFFiNE/releases/latest) |
| 🐳 **Auto-hospedado**   | Rode a experiência completa na sua própria infraestrutura com Docker Compose.                 | [Ir para Hospede seu próprio AFFiNE](#hospede-seu-próprio-affine)                                                             |

> ⭐ **Dê uma estrela no GitHub** — você recebe todas as notificações de lançamento na hora, e isso ajuda de verdade o projeto a crescer.

<img alt="Dê uma estrela ao AFFiNE no GitHub" src="https://user-images.githubusercontent.com/79301703/230891830-0110681e-8c7e-483b-b6d9-9e42b291b9ef.gif" style="width: 100%"/>

## Hospede seu próprio AFFiNE

Implante o seu próprio AFFiNE completo — seus dados, suas regras. Você pode rodar gratuitamente a stack auto-hospedada publicada; o editor, o aplicativo desktop e a maior parte do código são licenciados sob MIT, enquanto o backend é coberto pela licença AFFiNE Enterprise Edition.

```sh
mkdir affine && cd affine

wget -O docker-compose.yml https://github.com/toeverything/affine/releases/latest/download/docker-compose.yml
wget -O .env https://github.com/toeverything/affine/releases/latest/download/default.env.example

# Edite o .env para definir suas credenciais e caminhos de armazenamento, depois:
docker compose up -d
```

Seu espaço de trabalho já está rodando em `http://localhost:3010`.

Para configuração, atualizações e solução de problemas, leia a [documentação de auto-hospedagem](https://docs.affine.pro/self-host-affine).

<!-- WHEN affine.pro/self-host SHIPS, append this sentence:
Or learn why teams choose an [open-source, self-hosted knowledge base](https://affine.pro/self-host) in the first place.
-->

**Implantação com um clique:**

[![Run on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/affine)
[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?openapp=system-fastdeploy%3FtemplateName%3Daffine)

Precisa de SSO, administração avançada, auditoria ou auto-hospedagem comercial com suporte? Confira os [planos e preços do AFFiNE](https://affine.pro/pricing).

## Como contribuir

Convocamos desenvolvedores, testadores, redatores técnicos e muito mais — contribuições de todos os tipos são bem-vindas.

| Relatos de bugs                                                                                                                                        | Pedidos de recursos                                                                                                                                               | Perguntas e discussões                                                   | Comunidade                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| [Criar um relato de bug](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=bug%2Cproduct-review&template=BUG-REPORT.yml&title=TITLE) | [Enviar um pedido de recurso](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=feat%2Cproduct-review&template=FEATURE-REQUEST.yml&title=TITLE) | [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions) | [Discord do AFFiNE](https://affine.pro/redirect/discord) |
| Algo não está funcionando como esperado                                                                                                                | Ideias de novos recursos ou melhorias                                                                                                                             | Faça perguntas e compartilhe ideias                                      | Pergunte, aprenda e interaja com outras pessoas          |

- Leia [docs/types-of-contributions.md](docs/types-of-contributions.md) para encontrar o tipo de contribuição ideal para você.
- Quer contribuir com código? Comece por [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) e pelo [tutorial para contribuidores](./docs/contributing/tutorial.md), depois escolha uma issue.
- Para **tradução** e **suporte a idiomas**, entre no nosso [Discord](https://affine.pro/redirect/discord).
- Para relatar vulnerabilidades, consulte [SECURITY.md](SECURITY.md).

**Antes de contribuir, certifique-se de ter lido e aceitado o nosso [Contributor License Agreement].** Para indicar sua concordância, basta editar esse arquivo e enviar um pull request.

### Compilando a partir do código-fonte

- **Codespaces**: na página principal do repositório, clique no botão verde "Code" e selecione "Create codespace on canary" — o repositório com fork é clonado, compilado e fica pronto para uso.
- **Local**: consulte [BUILDING.md] para as instruções completas.

## Ecossistema

| Pacote                                           | Descrição                         | Status                                                                                                                                                                       |
| ------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@affine/component](packages/frontend/component) | Recursos de componentes do AFFiNE | ![Codecov coverage](https://img.shields.io/codecov/c/github/toeverything/affine?style=flat-square)                                                                           |
| [@toeverything/theme](packages/common/theme)     | Tema do AFFiNE                    | [![npm downloads for @toeverything/theme](https://img.shields.io/npm/dm/@toeverything/theme?style=flat-square&color=eee)](https://www.npmjs.com/package/@toeverything/theme) |

O AFFiNE só é possível graças a estes projetos open source dos quais dependemos — obrigado:

- [BlockSuite](https://github.com/toeverything/BlockSuite) — 💠 o projeto open source de editor colaborativo por trás do AFFiNE.
- [y-octo](https://github.com/y-crdt/y-octo) — 🐙 uma implementação nativa, de alto desempenho e thread-safe do CRDT yjs, que alimenta o motor de sincronização local-first do AFFiNE.
- [OctoBase](https://github.com/toeverything/OctoBase) — 🐙 o banco de dados colaborativo e local-first por trás do AFFiNE, escrito em Rust.
- [yjs](https://github.com/yjs/yjs) — suporte fundamental de CRDT para gerenciamento de estado e sincronização de dados.
- …e muitas outras excelentes [dependências](https://github.com/toeverything/AFFiNE/network/dependencies).

## Agradecimentos

"Nós moldamos nossas ferramentas e, depois, nossas ferramentas nos moldam." Muitos pioneiros nos inspiraram ao longo do caminho:

- Quip e Notion, com seu ótimo conceito de "tudo é um bloco"
- Trello, com seu Kanban
- Airtable e Miro, com suas planilhas programáveis sem código
- Miro e Whimsical, com seus quadros brancos visuais infinitos
- RemNote e Capacities, com seus sistemas de tags baseados em objetos

Esses aplicativos compartilham boa parte dos mesmos "blocos de construção" atômicos, mas nenhum deles é open source, nem oferece um sistema de plugins ao estilo do VS Code para contribuidores. Queremos algo que reúna todos os recursos que amamos — e que vá um passo além.

## Licença

- **Código open source do AFFiNE** — o editor, o aplicativo desktop e a maior parte do código são licenciados sob MIT; os componentes de backend/servidor são cobertos pela licença AFFiNE Enterprise Edition.
- **AFFiNE Enterprise / licenciamento comercial** — disponível mediante acordo comercial para necessidades corporativas como SSO, administração avançada, auditoria, rebranding e auto-hospedagem com suporte. Consulte [affine.pro/pricing](https://affine.pro/pricing) para mais informações.

Veja [LICENSE] para os detalhes.

<a id="contributors"></a>

## Contribuidores

Gostaríamos de expressar nossa gratidão a todas as pessoas que já contribuíram com o AFFiNE! Se você criou um projeto, documentação, ferramenta ou template relacionado ao AFFiNE, fique à vontade para adicioná-lo à nossa lista curada: [awesome-affine](https://github.com/toeverything/awesome-affine).

<a href="https://github.com/toeverything/affine/graphs/contributors">
  <img alt="Contribuidores do AFFiNE" src="https://contrib.rocks/image?repo=toeverything/AFFiNE" />
</a>

<div align="center">

<br />

**Obrigado por conhecer o projeto — esperamos de coração que o AFFiNE ressoe com você! 🎵**

[affine.pro](https://affine.pro) · [Documentação](https://docs.affine.pro) · [Discord](https://affine.pro/redirect/discord)

</div>

[all-contributors-badge]: https://img.shields.io/github/contributors/toeverything/AFFiNE
[license]: ./LICENSE
[building.md]: ./docs/BUILDING.md
[contributor license agreement]: https://github.com/toeverything/affine/edit/canary/.github/CLA.md
[stars-icon]: https://img.shields.io/github/stars/toeverything/AFFiNE.svg?style=flat&logo=github&colorB=red&label=stars
[typescript-version-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/affine/dev/typescript
[blocksuite-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/AFFiNE/@blocksuite/store?color=6880ff&filename=packages%2Ffrontend%2Fcore%2Fpackage.json&label=blocksuite
