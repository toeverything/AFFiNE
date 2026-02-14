# Module Registry

> **Last Updated:** 2026-02-14

## Frontend Packages

### Application Entry Points

| Package                     | Path                                       | Purpose                            |
| --------------------------- | ------------------------------------------ | ---------------------------------- |
| `@affine/web`               | `packages/frontend/apps/web`               | Web application entry point (Vite) |
| `@affine/electron`          | `packages/frontend/apps/electron`          | Electron desktop application shell |
| `@affine/electron-renderer` | `packages/frontend/apps/electron-renderer` | Electron renderer process          |
| `@affine/mobile`            | `packages/frontend/apps/mobile`            | Mobile web application             |
| `@affine/ios`               | `packages/frontend/apps/ios`               | iOS Capacitor application          |
| `@affine/android`           | `packages/frontend/apps/android`           | Android Capacitor application      |

### Core Libraries

| Package                | Path                             | Purpose                                                                                                                                  | Key Deps                                                     |
| ---------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `@affine/core`         | `packages/frontend/core`         | Main application logic — 64 feature modules covering the entire app (editor, workbench, cloud sync, AI, search, collections, tags, etc.) | `@toeverything/infra`, `@blocksuite/*`, React 19, Jotai, Yjs |
| `@affine/component`    | `packages/frontend/component`    | Shared React UI component library (buttons, modals, menus, etc.)                                                                         | Radix UI, vanilla-extract                                    |
| `@affine/admin`        | `packages/frontend/admin`        | Admin panel for server management                                                                                                        | React, Radix UI                                              |
| `@affine/i18n`         | `packages/frontend/i18n`         | Internationalization with i18n-codegen                                                                                                   | —                                                            |
| `@affine/track`        | `packages/frontend/track`        | Analytics and event tracking                                                                                                             | —                                                            |
| `@affine/templates`    | `packages/frontend/templates`    | Built-in document templates                                                                                                              | —                                                            |
| `@affine/routes`       | `packages/frontend/routes`       | Route definitions and navigation types                                                                                                   | —                                                            |
| `@affine/electron-api` | `packages/frontend/electron-api` | Type-safe API for Electron IPC                                                                                                           | —                                                            |

### Frontend Core Modules (in `@affine/core`)

| Module                                                       | Purpose                                |
| ------------------------------------------------------------ | -------------------------------------- |
| `workspace`                                                  | Workspace management and lifecycle     |
| `workspace-engine`                                           | Workspace storage engine (cloud/local) |
| `doc`                                                        | Document operations and metadata       |
| `editor`                                                     | BlockSuite editor integration          |
| `editor-setting`                                             | Editor preferences and configuration   |
| `cloud`                                                      | Cloud account, sync, and auth          |
| `permissions`                                                | Permission management UI               |
| `share-doc` / `share-menu` / `share-setting`                 | Document sharing features              |
| `collection` / `collection-rules`                            | Smart collections and filtering        |
| `tag`                                                        | Tag system                             |
| `favorite`                                                   | Favorites management                   |
| `organize`                                                   | Workspace organization (folders)       |
| `journal`                                                    | Journal/daily notes                    |
| `quicksearch`                                                | Quick search (Cmd+K)                   |
| `docs-search` / `search-menu`                                | Full-text document search              |
| `ai-button`                                                  | AI assistant integration               |
| `workbench`                                                  | Multi-tab workbench UI                 |
| `app-sidebar`                                                | Navigation sidebar                     |
| `navigation` / `navigation-panel`                            | Routing and navigation                 |
| `peek-view`                                                  | Preview popups                         |
| `pdf`                                                        | PDF viewer integration                 |
| `comment`                                                    | Document comments                      |
| `notification`                                               | In-app notifications                   |
| `backup`                                                     | Workspace import/export                |
| `blob-management`                                            | Attachment/blob management             |
| `media`                                                      | Media capture and handling             |
| `telemetry`                                                  | Analytics tracking                     |
| `feature-flag`                                               | Feature flag management                |
| `quota` / `paywall`                                          | Subscription and quota UI              |
| `theme` / `theme-editor`                                     | Theming system                         |
| `db`                                                         | Frontend workspace database            |
| `storage`                                                    | Client-side storage                    |
| `global-context`                                             | App-wide context                       |
| `i18n`                                                       | Translation loading                    |
| `lifecycle`                                                  | App lifecycle management               |
| `url`                                                        | URL management                         |
| `open-in-app`                                                | Deep linking                           |
| `desktop-api`                                                | Desktop-specific API layer             |
| `import-template` / `import-clipper`                         | Template and web clipper import        |
| `integration`                                                | Third-party integrations               |
| `workspace-indexer-embedding`                                | AI embedding index                     |
| `workspace-property`                                         | Custom workspace properties            |
| `template-doc`                                               | Template document management           |
| `doc-display-meta` / `doc-info` / `doc-link` / `doc-summary` | Document metadata views                |
| `at-menu-config`                                             | @ mention menu                         |
| `dnd`                                                        | Drag and drop                          |
| `icon-picker` / `explorer-icon`                              | Icon selection                         |
| `system-font-family`                                         | System font detection                  |
| `find-in-page`                                               | In-page search                         |
| `userspace`                                                  | User data management                   |

---

## Common Packages

| Package               | Path                        | Purpose                                                                             | Key Deps                   |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------------- | -------------------------- |
| `@toeverything/infra` | `packages/common/infra`     | Framework: DI container, LiveData (reactive), ORM, op system, storage abstractions  | Jotai, Preact Signals, Yjs |
| `@affine/nbstore`     | `packages/common/nbstore`   | Notebook storage abstraction with sync — supports IndexedDB, SQLite, Cloud backends | Yjs                        |
| `@affine/graphql`     | `packages/common/graphql`   | Auto-generated GraphQL client from server schema                                    | GraphQL                    |
| `@affine/debug`       | `packages/common/debug`     | Debug logging utilities                                                             | —                          |
| `@affine/env`         | `packages/common/env`       | Environment detection and configuration                                             | —                          |
| `@affine/error`       | `packages/common/error`     | Shared error types                                                                  | —                          |
| `@affine/reader`      | `packages/common/reader`    | Document reader/parser for import                                                   | —                          |
| `@affine/s3-compat`   | `packages/common/s3-compat` | S3-compatible storage client                                                        | —                          |

---

## Backend Packages

| Package                 | Path                      | Purpose                                                      | Key Deps                                       |
| ----------------------- | ------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| `@affine/server`        | `packages/backend/server` | NestJS server with GraphQL, WebSocket sync, scheduled jobs   | NestJS, Prisma, Apollo, BullMQ, Stripe, AI SDK |
| `@affine/server-native` | `packages/backend/native` | Rust native bindings for server (NAPI) — PDF, docx, indexing | NAPI-RS                                        |

### Server Internal Architecture

#### Base Infrastructure (18 modules)

`cache`, `config`, `error`, `event`, `graphql`, `guard`, `helpers`, `job` (BullMQ), `logger` (Winston), `metrics` (OpenTelemetry), `mutex`, `nestjs`, `prisma`, `redis`, `storage`, `throttler`, `utils`, `websocket`

#### Core Modules (24)

`access-token`, `auth`, `comment`, `config`, `doc` (storage), `doc-renderer`, `doc-service`, `features`, `mail`, `monitor`, `notification`, `permission`, `queue-dashboard`, `quota`, `selfhost`, `static-files`, `storage`, `sync`, `telemetry`, `user`, `utils`, `version`, `workspaces`, `common`

#### Plugins (10)

`calendar`, `captcha`, `copilot` (AI assistant), `customerio`, `gcloud`, `indexer`, `license`, `oauth`, `payment` (Stripe), `worker`

#### Models (33 data models)

`user`, `workspace`, `doc`, `blob`, `comment`, `notification`, `session`, `access-token`, `feature`, `quota`, `history`, `copilot-session`, `copilot-context`, `copilot-job`, `copilot-workspace`, `calendar-*`, `workspace-analytics`, `workspace-feature`, `workspace-user`, etc.

---

## BlockSuite Packages (Editor Framework)

| Package                         | Path                           | Purpose                                                                                         |
| ------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `@blocksuite/affine`            | `blocksuite/affine/all`        | Aggregate package for all AFFiNE blocks                                                         |
| `@blocksuite/affine-block-*`    | `blocksuite/affine/blocks/`    | Individual block implementations (paragraph, list, code, image, embed, database, surface, etc.) |
| `@blocksuite/affine-components` | `blocksuite/affine/components` | Shared editor UI components                                                                     |
| `@blocksuite/affine-data-view`  | `blocksuite/affine/data-view`  | Database/kanban/table view                                                                      |
| `@blocksuite/affine-gfx`        | `blocksuite/affine/gfx`        | Graphics layer (whiteboard, shapes, connectors)                                                 |
| `@blocksuite/affine-model`      | `blocksuite/affine/model`      | Block data models and schemas                                                                   |
| `@blocksuite/affine-shared`     | `blocksuite/affine/shared`     | Shared utilities                                                                                |
| `@blocksuite/affine-inlines`    | `blocksuite/affine/inlines`    | Inline elements (bold, italic, link, etc.)                                                      |
| `@blocksuite/affine-rich-text`  | `blocksuite/affine/rich-text`  | Rich text editing                                                                               |
| `@blocksuite/affine-widgets`    | `blocksuite/affine/widgets`    | Toolbars, slash menu, etc.                                                                      |
| `@blocksuite/global`            | `blocksuite/framework/global`  | Global types and utilities                                                                      |
| `@blocksuite/std`               | `blocksuite/framework/std`     | Standard library for blocks                                                                     |
| `@blocksuite/store`             | `blocksuite/framework/store`   | Document store (Yjs-backed)                                                                     |
| `@blocksuite/sync`              | `blocksuite/framework/sync`    | Sync providers                                                                                  |

---

## Rust Native Crates

| Crate                   | Path                                     | Purpose                                 |
| ----------------------- | ---------------------------------------- | --------------------------------------- |
| `affine_native`         | `packages/frontend/native`               | Desktop Electron native bindings (NAPI) |
| `affine_nbstore`        | `packages/frontend/native/nbstore`       | SQLite-backed notebook store            |
| `affine_schema`         | `packages/frontend/native/schema`        | Data schema definitions                 |
| `affine_sqlite_v1`      | `packages/frontend/native/sqlite_v1`     | SQLite v1 compatibility                 |
| `affine_media_capture`  | `packages/frontend/native/media_capture` | Audio/video capture                     |
| `affine_mobile_native`  | `packages/frontend/mobile-native`        | Mobile-specific native code (UniFFI)    |
| `affine_common`         | `packages/common/native`                 | Shared native utilities                 |
| `@affine/server-native` | `packages/backend/native`                | Server-side native bindings             |
| `y-octo`                | `packages/common/y-octo/core`            | High-performance Yjs-compatible CRDT    |
| `y-octo-utils`          | `packages/common/y-octo/utils`           | y-octo utilities                        |

---

## Test Packages

| Package                             | Path                         | Purpose                      |
| ----------------------------------- | ---------------------------- | ---------------------------- |
| `@affine-test/affine-cloud`         | `tests/affine-cloud`         | Cloud E2E tests              |
| `@affine-test/affine-cloud-copilot` | `tests/affine-cloud-copilot` | Copilot E2E tests            |
| `@affine-test/affine-desktop`       | `tests/affine-desktop`       | Desktop E2E tests            |
| `@affine-test/affine-desktop-cloud` | `tests/affine-desktop-cloud` | Desktop cloud E2E tests      |
| `@affine-test/affine-local`         | `tests/affine-local`         | Local E2E tests              |
| `@affine-test/affine-mobile`        | `tests/affine-mobile`        | Mobile E2E tests             |
| `@affine-test/blocksuite`           | `tests/blocksuite`           | BlockSuite integration tests |
| `@affine-test/kit`                  | `tests/kit`                  | Test utilities               |

---

## Tools

| Package                       | Path                        | Purpose                                       |
| ----------------------------- | --------------------------- | --------------------------------------------- |
| `@affine-tools/cli`           | `tools/cli`                 | Build, bundle, and dev CLI (`affine` command) |
| `@affine-tools/utils`         | `tools/utils`               | Shared build utilities                        |
| `@affine/changelog`           | `tools/changelog`           | Changelog generation                          |
| `@affine/doc-diff`            | `tools/doc-diff`            | Yjs snapshot diffing                          |
| `@affine/revert-update`       | `tools/revert-update`       | Yjs snapshot revert                           |
| `@affine/copilot-result`      | `tools/copilot-result`      | Copilot test reporting                        |
| `@affine/playstore-auto-bump` | `tools/playstore-auto-bump` | Android version bumping                       |
