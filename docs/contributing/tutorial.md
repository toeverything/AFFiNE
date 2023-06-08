# Tutorial

## Introduction

This tutorial will walk you through the codebase of AFFiNE. It is intended for new contributors to AFFiNE.

## Building the project

Make sure you know how to build the project. See [BUILDING](../BUILDING.md) for more information.

For the debugging purpose, you might need use local OctoBase on port 3000.

## Codebase overview

The codebase is organized as follows:

- `apps/` contains the source code for the different entry points of the project.
  - `web/` contains the source code for the web app.
  - `electron/` contains the source code for the Electron app.
  - `server/` backend side for AFFiNE, see <https://github.com/toeverything/OctoBase> instead.
- `packages/` contains the source code for all the packages in the repo.
  - `cli` contains the source code for the CLI. Development only.
  - `component` contains the source code for the UI component library.
  - `debug` contains the source code for the debug helper.
  - `env` contains the source code for the environment setup.
  - `hooks` contains the source code for the custom React hooks.
  - `i18n` contains the source code for the internationalization.
  - `jotai` contains the source code for the Jotai store atoms.
  - `octobase-node` contains the source code for the OctoBase Node.js binding using Rust.
  - `templates` contains the source code for the templates.
  - `workspace` contains the source code for the workspace related code.

### `@affine/env`

Environment setup for AFFiNE client side.

It includes the global constants, browser and system check.

This package should be imported at the very beginning of the entry point.

### `@affine/workspace`

Current we have two workspace plugin:

- `local` for local workspace, which is the default workspace type.
- `affine` for cloud workspace, which is the workspace type for AFFiNE Cloud with OctoBase backend.

#### Design principles

- Each workspace plugin has its state and is isolated from other workspace plugins.
- The workspace plugin is responsible for its own state management, data persistence, synchronization, data backup and recovery.

For the workspace API, see [types.ts](../../packages/workspace/src/type.ts).

### `@affine/component`

The UI component library for AFFiNE.

Each component should be a standalone component which can be used in any context, like the Storybook.

## Debugging Environments

### `@affine/env`

```shell
yarn dev
```

### `@affine/electron`

See [building desktop client app](../building-desktop-client-app.md).

### `@affine/storybook`

```shell
yarn workspace @affine/storybook storybook
```

## What's next?

- [Behind the code](./behind-the-code.md)
