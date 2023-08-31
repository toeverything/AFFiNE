# Building AFFiNE Web

> **Warning**:
>
> This document has not been updated for a while.
> If you find any outdated information, please feel free to open an issue or submit a PR.

> **Note**
> For developing & building desktop client app, please refer to [building-desktop-client-app.md](./building-desktop-client-app.md)

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup Environment](#setup-environment)
- [Start Development Server](#start-development-server)
- [Testing](#testing)

## Prerequisites

AFFiNE client has both **Node.js** & **Rust** toolchains.

### Install Node.js

We suggest develop our product under node.js LTS(Long-term support) version

#### Option 1: Manually install node.js

install [Node LTS version](https://nodejs.org/en/download)

> Up to now, the major node.js version is 18.x

#### Option 2: Use node version manager

install [fnm](https://github.com/Schniz/fnm)

```sh
fnm use
```

### Install Rust Tools

Please follow the official guide at https://www.rust-lang.org/tools/install.

### Setup Node.js Environment

This setup requires modern yarn (currently `3.x`), run this if your yarn version is `1.x`

Reference: [Yarn installation doc](https://yarnpkg.com/getting-started/install)

```sh
corepack enable
corepack prepare yarn@stable --activate
```

```sh
# install dependencies
yarn install
```

### Build Native Dependencies

Run the following script. It will build the native module at [`/packages/native`](/packages/native) and build Node.js binding using [NAPI.rs](https://napi.rs/).
This could take a while if you build it for the first time.
Note: use `strip` from system instead of `binutils` if you are running MacOS. [see problem here](https://github.com/toeverything/AFFiNE/discussions/2840)

```
yarn workspace @affine/native build
```

### Build Infra

```sh
yarn run build:infra
```

### Build Plugins

```sh
yarn run build:plugins
```

### Build Server Dependencies

```sh
yarn workspace @affine/storage build
```

## Testing

Adding test cases is strongly encouraged when you contribute new features and bug fixes.

We use [Playwright](https://playwright.dev/) for E2E test, and [vitest](https://vitest.dev/) for unit test.
To test locally, please make sure browser binaries are already installed via `npx playwright install`.
Also make sure you have built the `@affine/core` workspace before running E2E tests.

### Unit Test

```sh
yarn test
```

### E2E Test

```shell
# there are `affine-local`, `affine-legacy/*`, `affine-local`, `affine-plugin`, `affine-prototype` e2e tests,
#   which are run under different situations.
cd tests/affine-local
yarn e2e
```
