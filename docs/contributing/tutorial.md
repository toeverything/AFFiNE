# Tutorial

## Introduction

This tutorial will walk you through the codebase of AFFiNE. It is intended for new contributors to AFFiNE.

## Building the project

Make sure you know how to build the project. See [BUILDING](../BUILDING.md) for more information.

For the debugging purpose, you might need use local OctoBase on port 3000.

## Codebase overview

The codebase is organized as follows:

- `packages/` contains all code running in production.
  - `backend/` contains backend code, more information from <https://github.com/toeverything/OctoBase>.
  - `frontend/` contains frontend code, including the web app, the electron app and business libraries.
  - `common` contains the isomorphic code or basic libraries without business.
- `tools/` contains tools to help developing or CI, not used in production.
- `tests/` contains testings across different libraries, including e2e testings and integration testings.

### `@affine/env`

Environment setup for AFFiNE client side.

It includes the global constants, browser and system check.

This package should be imported at the very beginning of the entry point.

#### Design principles

- Each workspace plugin has its state and is isolated from other workspace plugins.
- The workspace plugin is responsible for its own state management, data persistence, synchronization, data backup and recovery.

For the workspace API, see [types.ts](../../packages/frontend/workspace/src/type.ts).

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
