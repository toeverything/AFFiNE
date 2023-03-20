# Building AFFiNE Desktop Client App

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development](#development)
- [Build](#build)
- [CI](#ci)

## Prerequisites

Before you start building AFFiNE Desktop Client Application, please follow the [Tauri getting started > prerequisites guide](https://tauri.app/v1/guides/getting-started/prerequisites) to set up your environment.

Note that if you encounter any issues with installing Rust and crates, try following [this guide (zh-CN)](https://course.rs/first-try/slowly-downloading.html) to set up alternative registries.

## Development

To run AFFiNE Desktop Client Application locally, run the following commands in apps/desktop:

```sh

pnpm install
pnpm build:preload
pnpm dev:app

```

## Build

To build the desktop client application, run `yarn build:app` in `apps/desktop`.
Once the build is complete, you can find the paths to the binaries in the terminal output.

```
Finished 2 bundles at:
    /Users/affine/Documents/GitHub/AFFiNE/apps/desktop/src-tauri/target/release/bundle/macos/AFFiNE.app
    /Users/affine/Documents/GitHub/AFFiNE/apps/desktop/src-tauri/target/release/bundle/dmg/AFFiNE_0.0.2_aarch64.dmg
```

## CI

Please refer to `.github/workflows/client-app.yml` for the CI workflow. It will:

- run for pull requests and pushes to `master` branch
- build the app for all supported platforms
- upload the artifacts to GitHub Actions
