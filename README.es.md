<div align="center">

<h1>
    <b><a href="https://affine.pro">AFFiNE</a></b>
</h1>

**Escribe, dibuja y planifica — todo a la vez.**

Un espacio de trabajo de código abierto, local-first y centrado en la privacidad. <br />
Una plataforma hiperfusionada de documentos, pizarras y bases de datos — una alternativa lista para usar a Notion y Miro.

<br />

[![Stars][stars-icon]](https://github.com/toeverything/AFFiNE/stargazers)
[![Downloads](https://img.shields.io/github/downloads/toeverything/AFFiNE/total)](https://github.com/toeverything/AFFiNE/releases/latest)
[![All Contributors][all-contributors-badge]](#contributors)
[![TypeScript][typescript-version-icon]](https://www.typescriptlang.org/)
[![BlockSuite][blocksuite-icon]](https://github.com/toeverything/blocksuite)
[![License: MIT + AFFiNE EE](https://img.shields.io/badge/license-MIT%20%2B%20AFFiNE%20EE-blue)](./LICENSE)

[Sitio web](https://affine.pro) · [Demo en vivo](https://app.affine.pro) · [Descargar](https://affine.pro/download) · [Documentación](https://docs.affine.pro) · [Blog](https://affine.pro/blog) · [Discord](https://affine.pro/redirect/discord)

[English](README.md) · [简体中文](README.zh-Hans.md) · [繁體中文](README.zh-Hant.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · Español · [Português (BR)](README.pt-BR.md) · [Русский](README.ru.md)

<br />

<a href="https://affine.pro/download">
    <img alt="AFFiNE — escribe, dibuja y planifica, todo a la vez" src="https://cdn.affine.pro/Github_hero_image2.png" style="width: 100%" />
</a>

<br />
<br />

<em>En AFFiNE, documentos, lienzo y tablas están hiperfusionados — fiel a la palabra inglesa affine (əˈfʌɪn | a-fain), «afín».</em>

</div>

<br />

## Qué es AFFiNE

[AFFiNE](https://affine.pro) es un espacio de trabajo todo en uno y de código abierto: un sistema operativo para todos los bloques que componen tu base de conocimiento — wiki, gestión del conocimiento, presentaciones y activos digitales. Los documentos y las pizarras se funden de verdad en un único lienzo infinito, lo que convierte a AFFiNE en una mejor alternativa a Notion y Miro.

<div align="center">
<img alt="Lienzo infinito de AFFiNE con documentos, notas y bases de datos" src="https://github.com/toeverything/AFFiNE/assets/79301703/49a426bb-8d2b-4216-891a-fa5993642253" style="width: 100%"/>
</div>

## Funciones principales

**🎨 Un verdadero lienzo para bloques de cualquier tipo — documentos y pizarra totalmente fusionados**

Muchos editores presumen de ser un lienzo para la productividad, pero AFFiNE es de los muy pocos que te permiten colocar cualquier bloque sobre un lienzo infinito: texto enriquecido, notas adhesivas, páginas web incrustadas, bases de datos con múltiples vistas, páginas enlazadas, figuras — incluso diapositivas.

**🤖 Un compañero de IA multimodal, listo para cualquier trabajo**

Redacta un informe profesional, convierte un esquema en diapositivas expresivas, resume un artículo en un mapa mental bien estructurado, o dibuja y programa prototipos de aplicaciones a partir de un solo prompt — [AFFiNE AI](https://affine.pro/ai) lleva tu creatividad hasta el límite de tu imaginación.

**🔒 Local-first, con colaboración en tiempo real**

Tus datos viven primero en tu propio disco, y aun así AFFiNE ofrece sincronización y colaboración en tiempo real en la web y en clientes multiplataforma.

**🛠️ De código abierto, autoalojable y tuyo para moldearlo a tu gusto**

Tienes plena libertad para gestionar, autoalojar, hacer fork y construir tu propio AFFiNE. El editor está construido sobre [BlockSuite](https://blocksuite.io), nuestro framework de edición basado en bloques y de código abierto.

## Primeros pasos

Hay tres formas de empezar a usar AFFiNE:

| Opción                    | Ideal para                                                                                      | Empieza aquí                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ☁️ **AFFiNE Cloud**       | Cero configuración: regístrate y crea tu primer espacio de trabajo en el navegador.             | [Abrir app.affine.pro](https://app.affine.pro)                                                                                 |
| 💻 **Escritorio y móvil** | Aplicaciones nativas para macOS, Windows, Linux, iOS y Android, con almacenamiento local-first. | [Descargar AFFiNE](https://affine.pro/download) · [Releases de GitHub](https://github.com/toeverything/AFFiNE/releases/latest) |
| 🐳 **Autoalojado**        | Ejecuta la experiencia completa en tu propia infraestructura con Docker Compose.                | [Ir a Aloja tu propio AFFiNE](#aloja-tu-propio-affine)                                                                         |

> ⭐ **Danos una estrella en GitHub** — recibirás todas las notificaciones de nuevas versiones al instante y, de verdad, ayuda a que el proyecto crezca.

<img alt="Dale una estrella a AFFiNE en GitHub" src="https://user-images.githubusercontent.com/79301703/230891830-0110681e-8c7e-483b-b6d9-9e42b291b9ef.gif" style="width: 100%"/>

## Aloja tu propio AFFiNE

Despliega tu propio AFFiNE con todas sus funciones — tus datos, tus reglas. Puedes ejecutar gratis el stack autoalojado publicado; el editor, la aplicación de escritorio y la mayor parte del código tienen licencia MIT, mientras que el backend está cubierto por la licencia AFFiNE Enterprise Edition.

```sh
mkdir affine && cd affine

wget -O docker-compose.yml https://github.com/toeverything/affine/releases/latest/download/docker-compose.yml
wget -O .env https://github.com/toeverything/affine/releases/latest/download/default.env.example

# Edita .env para configurar tus credenciales y rutas de almacenamiento y, después:
docker compose up -d
```

Tu espacio de trabajo ya está funcionando en `http://localhost:3010`.

Para configuración, actualizaciones y resolución de problemas, consulta la [documentación de autoalojamiento](https://docs.affine.pro/self-host-affine).

<!-- WHEN affine.pro/self-host SHIPS, append this sentence:
Or learn why teams choose an [open-source, self-hosted knowledge base](https://affine.pro/self-host) in the first place.
-->

**Despliegue con un clic:**

[![Run on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/affine)
[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?openapp=system-fastdeploy%3FtemplateName%3Daffine)

¿Necesitas SSO, administración avanzada, auditoría o autoalojamiento comercial con soporte? Consulta los [planes de precios de AFFiNE](https://affine.pro/pricing).

## Cómo contribuir

Buscamos desarrolladores, testers, redactores técnicos y mucho más — las contribuciones de todo tipo son bienvenidas.

| Reportes de errores                                                                                                                                      | Solicitudes de funciones                                                                                                                                             | Preguntas y debates                                                      | Comunidad                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| [Crea un reporte de error](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=bug%2Cproduct-review&template=BUG-REPORT.yml&title=TITLE) | [Envía una solicitud de función](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=feat%2Cproduct-review&template=FEATURE-REQUEST.yml&title=TITLE) | [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions) | [Discord de AFFiNE](https://affine.pro/redirect/discord) |
| Algo no funciona como debería                                                                                                                            | Ideas para nuevas funciones o mejoras                                                                                                                                | Haz preguntas y comparte ideas                                           | Pregunta, aprende y participa con otras personas         |

- Lee [docs/types-of-contributions.md](docs/types-of-contributions.md) para encontrar el tipo de contribución que mejor encaja contigo.
- ¿Te interesa el código? Empieza por [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) y el [tutorial para contribuidores](./docs/contributing/tutorial.md), y luego elige un issue.
- Para **traducción** y **soporte de idiomas**, únete a nuestro [Discord](https://affine.pro/redirect/discord).
- Para reportar vulnerabilidades, consulta [SECURITY.md](SECURITY.md).

**Antes de contribuir, asegúrate de haber leído y aceptado nuestro [Contributor License Agreement].** Para expresar tu conformidad, simplemente edita ese archivo y envía un pull request.

### Compilar desde el código fuente

- **Codespaces**: desde la página principal del repositorio, haz clic en el botón verde "Code" y selecciona "Create codespace on canary" — el repositorio bifurcado se clona, se compila y queda listo para trabajar.
- **Local**: consulta [BUILDING.md] para las instrucciones completas.

## Ecosistema

| Paquete                                          | Descripción                       | Estado                                                                                                                                                                       |
| ------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@affine/component](packages/frontend/component) | Recursos de componentes de AFFiNE | ![Codecov coverage](https://img.shields.io/codecov/c/github/toeverything/affine?style=flat-square)                                                                           |
| [@toeverything/theme](packages/common/theme)     | Tema de AFFiNE                    | [![npm downloads for @toeverything/theme](https://img.shields.io/npm/dm/@toeverything/theme?style=flat-square&color=eee)](https://www.npmjs.com/package/@toeverything/theme) |

AFFiNE es posible gracias a estos proyectos de código abierto — gracias a todos ellos:

- [BlockSuite](https://github.com/toeverything/BlockSuite) — 💠 el proyecto de editor colaborativo de código abierto que hay detrás de AFFiNE.
- [y-octo](https://github.com/y-crdt/y-octo) — 🐙 una implementación nativa, de alto rendimiento y thread-safe del CRDT de yjs que impulsa el motor de sincronización local-first de AFFiNE.
- [OctoBase](https://github.com/toeverything/OctoBase) — 🐙 la base de datos colaborativa y local-first detrás de AFFiNE, escrita en Rust.
- [yjs](https://github.com/yjs/yjs) — el soporte CRDT fundamental para la gestión de estado y la sincronización de datos.
- …y muchas otras excelentes [dependencias](https://github.com/toeverything/AFFiNE/network/dependencies).

## Agradecimientos

«Damos forma a nuestras herramientas y, después, nuestras herramientas nos dan forma a nosotros.» Muchos pioneros nos han inspirado en el camino:

- Quip y Notion, con su gran concepto de «todo es un bloque»
- Trello, con su Kanban
- Airtable y Miro, con sus hojas de datos programables sin código
- Miro y Whimsical, con sus pizarras visuales infinitas
- RemNote y Capacities, con sus sistemas de etiquetas basados en objetos

Estas aplicaciones comparten muchos «bloques de construcción» atómicos, pero ninguna es de código abierto ni ofrece un sistema de plugins al estilo de VS Code para sus contribuidores. Queremos algo que reúna todas las funciones que nos encantan — y que vaya un paso más allá.

## Licencia

- **Código base abierto de AFFiNE** — el editor, la aplicación de escritorio y la mayor parte del código tienen licencia MIT; los componentes de backend/servidor están cubiertos por la licencia AFFiNE Enterprise Edition.
- **AFFiNE Enterprise / licencias comerciales** — disponibles mediante acuerdo comercial para necesidades empresariales como SSO, administración avanzada, auditoría, personalización de marca y autoalojamiento con soporte. Consulta [affine.pro/pricing](https://affine.pro/pricing) para más información.

Consulta [LICENSE] para más detalles.

<a id="contributors"></a>

## Contribuidores

¡Queremos expresar nuestra gratitud a todas las personas que han contribuido a AFFiNE! Si has creado un proyecto, documentación, herramienta o plantilla relacionados con AFFiNE, no dudes en añadirlo a nuestra lista curada: [awesome-affine](https://github.com/toeverything/awesome-affine).

<a href="https://github.com/toeverything/affine/graphs/contributors">
  <img alt="Contribuidores de AFFiNE" src="https://contrib.rocks/image?repo=toeverything/AFFiNE" />
</a>

<div align="center">

<br />

**Gracias por pasarte por aquí — ¡esperamos de corazón que AFFiNE resuene contigo! 🎵**

[affine.pro](https://affine.pro) · [Documentación](https://docs.affine.pro) · [Discord](https://affine.pro/redirect/discord)

</div>

[all-contributors-badge]: https://img.shields.io/github/contributors/toeverything/AFFiNE
[license]: ./LICENSE
[building.md]: ./docs/BUILDING.md
[contributor license agreement]: https://github.com/toeverything/affine/edit/canary/.github/CLA.md
[stars-icon]: https://img.shields.io/github/stars/toeverything/AFFiNE.svg?style=flat&logo=github&colorB=red&label=stars
[typescript-version-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/affine/dev/typescript
[blocksuite-icon]: https://img.shields.io/github/package-json/dependency-version/toeverything/AFFiNE/@blocksuite/store?color=6880ff&filename=packages%2Ffrontend%2Fcore%2Fpackage.json&label=blocksuite
