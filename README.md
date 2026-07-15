# AFFiNE

<div align="center">
  <p><strong>The multimodal AI knowledge base for individuals and teams.</strong></p>

  <a href="https://affine.pro/download">
    <img alt="AFFiNE — multimodal AI knowledge base" src="https://cdn.affine.pro/Github_hero_image2.png" style="width: 100%">
  </a>

  <p>
    <a href="https://github.com/toeverything/AFFiNE/releases/latest"><img alt="GitHub release downloads" src="https://img.shields.io/github/downloads/toeverything/AFFiNE/total?style=flat&color=brightgreen"></a>
    <a href="https://github.com/toeverything/AFFiNE/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/toeverything/AFFiNE?style=flat"></a>
    <a href="https://github.com/sponsors/toeverything"><img alt="Sponsor AFFiNE" src="https://img.shields.io/badge/sponsor-GitHub%20Sponsors-ea4aaa?style=flat"></a>
  </p>

  <p>
    <a href="https://app.affine.pro"><strong>Try AFFiNE</strong></a> ·
    <a href="https://docs.affine.pro/self-host-affine"><strong>Self-host</strong></a> ·
    <a href="https://affine.pro/enterprise"><strong>Enterprise</strong></a> ·
    <a href="https://github.com/toeverything/AFFiNE"><strong>Star on GitHub</strong></a>
  </p>

  <p>
    <a href="https://affine.pro/download">Download</a> ·
    <a href="https://docs.affine.pro">Docs</a> ·
    <a href="https://affine.pro/redirect/discord">Discord</a> ·
    <a href="https://github.com/toeverything/AFFiNE/discussions">Discussions</a>
  </p>
</div>

> **TL;DR.** Docs, whiteboards, databases, files, collaboration, and AI context in one local-first workspace — synced across Web, Windows, macOS, Linux, Android, and iOS; self-hostable; Bring Your Own Key (Beta) for eligible workspaces; and upcoming programmable workflows for Claude Code and other agentic tools.

## Choose your path

- Want a multimodal AI knowledge base? Try AFFiNE.
- Want a Notion + Miro alternative? Use AFFiNE's docs, canvas, and databases together.
- Want private AI workflows? Use AFFiNE AI with Bring Your Own Key (Beta) or self-host AFFiNE.
- Using Claude Code or AI agents? Track the upcoming programmable knowledge workflows.
- Building collaborative editors? Explore BlockSuite and y-octo.
- Evaluating for a team? Start with Cloud, self-host, or Enterprise depending on your data and deployment needs.

## What is AFFiNE?

AFFiNE is a multimodal AI knowledge base for individuals and teams. It combines documents, whiteboards, databases, files, tasks, collaboration, and AI context in one block-based workspace. It syncs across Web, Windows, macOS, Linux, Android, and iOS, while giving users the flexibility of canvas thinking, the structure of documents and databases, and the control of local-first and self-hostable knowledge infrastructure.

## Why AFFiNE is different

- Docs, whiteboards, databases, and files share the same block-based workspace.
- Multimodal AI workflows can use supported workspace context across docs, canvas, attachments, files, and structured knowledge where available.
- Local-first design keeps your workspace usable and synced across Web, Windows, macOS, Linux, Android, and iOS.
- Self-hosting is a first-class deployment path, not an afterthought.
- Bring Your Own Key (Beta) gives eligible workspaces more control over AI provider choice, cost, and policy.

## Key features

- Docs, whiteboards, databases, and files in one workspace.
- Multimodal AI workspace context across docs, canvas, images, attachments, databases, and structured knowledge where supported.
- **Bring Your Own Key (Beta).** Route AFFiNE AI through your own provider keys for eligible workspaces, with supported OpenAI, Anthropic, Gemini, and FAL provider routes where configured.
- Local-first storage and real-time collaboration.
- Cross-platform sync: Web, Windows, macOS, Linux, Android, and iOS.
- Self-hosting and private deployment.
- Upcoming programmable knowledge workflows for Claude Code and agentic tools.
- Import/export and knowledge portability.

## Why developers care

- Monorepo with a first-class self-hosting path.
- Local-first storage with both browser (IndexedDB) and native (SQLite) clients via [`nbstore`](./packages/common/nbstore).
- Block-based editor foundation via [`BlockSuite`](./blocksuite).
- CRDT-based real-time collaboration on top of Yjs and [`y-octo`](./packages/common/y-octo).
- NestJS + GraphQL + Prisma backend powering sync, cloud, self-hosting, and AI copilot.
- Cross-platform engineering and sync: Web, Electron desktop for Windows/macOS/Linux, plus Android and iOS clients.
- Workspace-aware AI plumbing with Bring Your Own Key (Beta), designed to extend toward programmable, agent-operable knowledge workflows.

## Coming soon: Claude Code-ready programmable knowledge workflows

**Coming soon: Claude Code-ready programmable knowledge workflows.** We are making AFFiNE operable from terminal scripts and agentic coding tools such as Claude Code. The upcoming CLI-like mode is designed to let AI agents read, search, create, update, import, export, and organize your AFFiNE knowledge base from your computer — turning AFFiNE into a programmable, multimodal knowledge layer for personal and team workflows.

This is an active priority being built, not a shipped CLI feature yet. We do not publish commands here until they are available and verified.

## Run AFFiNE your way

- **Cloud** — Fastest way to start. Best for individuals and teams that want zero setup, automatic updates, and managed AFFiNE AI. → [app.affine.pro](https://app.affine.pro)
- **Desktop & Mobile** — Local-first daily workspace synced across Web, Windows, macOS, Linux, Android, and iOS. → [affine.pro/download](https://affine.pro/download)
- **Self-host** — Own your data and run AFFiNE in your infrastructure, with Bring Your Own Key (Beta) for eligible self-hosted AI workflows where supported. → [docs.affine.pro/self-host-affine](https://docs.affine.pro/self-host-affine)
- **Team & Enterprise** — Admin, policy, security, and support for private-cloud and self-hosted deployments, with workspace-level Bring Your Own Key on eligible plans. → [affine.pro/enterprise](https://affine.pro/enterprise)

## Get started

- **Try AFFiNE online:** [app.affine.pro](https://app.affine.pro)
- **Download apps:** [affine.pro/download](https://affine.pro/download)
- **Self-host with Docker:** [Self-host AFFiNE](https://docs.affine.pro/self-host-affine)
- **Explore Enterprise:** [affine.pro/enterprise](https://affine.pro/enterprise)
- **Build from source:** [docs/BUILDING.md](./docs/BUILDING.md)
- **Join the community:** [Discord](https://affine.pro/redirect/discord) or [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions)

## Self-hosting

Want full control? Start with the official Docker-based self-hosting guide. The self-host stack uses the AFFiNE server image, Postgres/pgvector, Redis, and a migration job.

- Read the official guide: [Self-host AFFiNE](https://docs.affine.pro/self-host-affine)
- Inspect the Docker Compose stack: [`.docker/selfhost/compose.yml`](./.docker/selfhost/compose.yml)

[![Run on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/affine)

[![Run on ClawCloud](https://raw.githubusercontent.com/ClawCloud/Run-Template/refs/heads/main/Run-on-ClawCloud.svg)](https://template.run.claw.cloud/?openapp=system-fastdeploy%3FtemplateName%3Daffine)

## Enterprise deployments

AFFiNE Enterprise is for teams that need private-cloud or self-hosted workspaces, custom procurement, and rollout support. It brings AFFiNE's docs, whiteboards, databases, collaboration, and AI workflows to infrastructure you operate.

- Data residency: workspace docs and uploads can stay on your filesystem, S3-compatible storage, Cloudflare R2, and PostgreSQL infrastructure.
- Deployment: Docker Compose is the supported path for VPS, datacenter, and private-cloud environments.
- Restricted networks: offline and intranet activation are available for team seats.
- Identity and governance: connect OIDC, Google, or GitHub OAuth, then manage workspace roles and per-document access levels.
- AI controls: configure provider keys, base URLs, and model IDs, or keep AFFiNE AI disabled.
- Operations: document database backups, blob backups, exported configuration, and restore tests before rollout.
- Procurement: 100+ seats, custom contracts and invoicing, security review support, self-host/cloud hybrid options, and SLA on request.

Read more on the [AFFiNE Enterprise page](https://affine.pro/enterprise), or start with the [self-hosting guide](https://docs.affine.pro/self-host-affine) for a pilot deployment.

## Development

Prerequisites: Node.js, Yarn 4, and Rust.

- Build from source: [docs/BUILDING.md](./docs/BUILDING.md)
- Desktop build: [docs/building-desktop-client-app.md](./docs/building-desktop-client-app.md)
- Server development: [docs/developing-server.md](./docs/developing-server.md)
- Monorepo CLI for contributors: [tools/cli/README.md](./tools/cli/README.md)

### Open in GitHub Codespaces

Click the green **Code** button on the GitHub repo main page and select **Create codespace on canary**. This will open a new Codespace with the AFFiNE monorepo cloned and ready to go.

## Contributing, community, and security

We welcome contributions from developers, testers, designers, technical writers, template creators, and community members.

- Bug reports: [create a bug report](https://github.com/toeverything/AFFiNE/issues/new?assignees=&labels=bug%2Cproduct-review&template=BUG-REPORT.yml&title=TITLE)
- Feature requests and product ideas: [GitHub Discussions](https://github.com/toeverything/AFFiNE/discussions)
- Code contributions: [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)
- Contribution types: [docs/types-of-contributions.md](./docs/types-of-contributions.md)
- Code of Conduct: [docs/CODE_OF_CONDUCT.md](./docs/CODE_OF_CONDUCT.md)
- Contributor agreement: [.github/CLA.md](./.github/CLA.md)
- Security: [SECURITY.md](./SECURITY.md)
- Sponsor AFFiNE: [GitHub Sponsors](https://github.com/sponsors/toeverything)

Localization help is welcome. Join [Discord](https://affine.pro/redirect/discord) or open a discussion to coordinate language review for AFFiNE docs and UI copy.

## Resources

- [Documentation](https://docs.affine.pro)
- [Templates](https://affine.pro/templates)
- [Blog](https://affine.pro/blog)
- [Roadmap & Discussions](https://github.com/toeverything/AFFiNE/discussions)
- [Awesome AFFiNE](https://github.com/toeverything/awesome-affine)

## License

Client-side code is licensed under MPL-2.0. Backend code is governed by AFFiNE's commercial license. See [LICENSE](./LICENSE) and [packages/backend/server/LICENSE](./packages/backend/server/LICENSE) for details.

## Upstreams

We would also like to thank the projects that make AFFiNE possible:

- [BlockSuite](https://github.com/toeverything/BlockSuite) — the collaborative editor project behind AFFiNE.
- [y-octo](https://github.com/y-crdt/y-octo) — a native, high-performance, thread-safe Yjs CRDT implementation.
- [OctoBase](https://github.com/toeverything/OctoBase) — a local-first collaborative data engine written in Rust.
- [Yjs](https://github.com/yjs/yjs) — CRDT support for state management and data sync on the web.
- [Electron](https://github.com/electron/electron) — cross-platform desktop apps with JavaScript, HTML, and CSS.

## Acknowledgements

> "We shape our tools and thereafter our tools shape us."

AFFiNE stands on the shoulders of pioneers like Notion, Miro, Whimsical, Airtable, Trello, Quip, and many others — projects that taught us what blocks, canvases, and structured knowledge can be. Thanks for checking us out; we appreciate your interest. See [Upstreams](#upstreams) and [Contributors](#contributors) for the full list of projects and people behind AFFiNE.

## Contributors

We would like to express our gratitude to everyone who has contributed to AFFiNE. If you have an AFFiNE-related project, documentation, tool, or template, please share it with the community through [awesome-affine](https://github.com/toeverything/awesome-affine).

<a href="https://github.com/toeverything/AFFiNE/graphs/contributors">
  <img alt="contributors" src="https://opencollective.com/affine/contributors.svg?width=890&button=false" />
</a>
