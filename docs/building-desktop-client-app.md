# Building AFFiNE Desktop Client App

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development](#development)
- [Build](#build)
- [CI](#ci)

## Prerequisites

Before you start building AFFiNE Desktop Client Application, please [install Rust toolchain first](https://www.rust-lang.org/learn/get-started).

Note that if you encounter any issues with installing Rust and crates, try following [this guide (zh-CN)](https://course.rs/first-try/slowly-downloading.html) to set up alternative registries.

## Development

To run AFFiNE Desktop Client Application locally, run the following commands:

```sh

# in repo root
yarn install
yarn dev

# in apps/electron
yarn generate-assets
yarn dev
```

Now you should see the Electron app window popping up shortly.

## Build

To build the desktop client application, run `yarn make` in `apps/electron`.

Note: you may want to comment out `osxSign` and `osxNotarize` in `forge.config.js` to avoid signing and notarizing the app.

Once the build is complete, you can find the paths to the binaries in the terminal output.

```
Finished 2 bundles at:
  › Artifacts available at: <affine-repo>/apps/electron/out/make
```

## CI

Please refer to `.github/workflows/release-desktop-app.yml` for the CI workflow. It will:

- build the app for all supported platforms
- upload the artifacts to GitHub Actions
