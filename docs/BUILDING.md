# Building AFFiNE Web

> **Warning**:
>
> This document is not guaranteed to be up-to-date.
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

> Up to now, the major node.js version is 20.x

#### Option 2: Use node version manager

install [fnm](https://github.com/Schniz/fnm)

```sh
fnm use
```

### Install Rust Tools

Please follow the official guide at https://www.rust-lang.org/tools/install.

### Setup Node.js Environment

This setup requires modern yarn (currently `4.x`), run this if your yarn version is `1.x`

Reference: [Yarn installation doc](https://yarnpkg.com/getting-started/install)

```sh
corepack enable
corepack prepare yarn@stable --activate
```

```sh
# install dependencies
yarn install
```

### Clone repository

#### Linux & MacOS

```sh
git clone https://github.com/toeverything/AFFiNE
```

#### Windows

In our codebase, we use symbolic links. Due to the security design of Windows, the creation of symbolic links requires administrator privileges. This is part of the security policy settings of Windows, and more information can be found at [Security Policy Settings for Creating Symbolic Links](https://learn.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/create-symbolic-links).

For detailed guidance on enabling this feature, please refer to the official documentation: [Enable Developer Mode on Windows](https://learn.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development).

Once Developer Mode is enabled, execute the following command with administrator privileges:

```sh
# Enable symbolic links
git config --global core.symlinks true
# Clone the repository
git clone https://github.com/toeverything/AFFiNE
```

### Build Native Dependencies

Run the following script. It will build the native module at [`/packages/frontend/native`](/packages/frontend/native) and build Node.js binding using [NAPI.rs](https://napi.rs/).
This could take a while if you build it for the first time.
Note: use `strip` from system instead of `binutils` if you are running MacOS. [see problem here](https://github.com/toeverything/AFFiNE/discussions/2840)

```sh
yarn affine @affine/native build
```

### Build Server Dependencies

```sh
yarn affine @affine/server-native build
```

## Testing

Adding test cases is strongly encouraged when you contribute new features and bug fixes.

We use [Playwright](https://playwright.dev/) for E2E test, and [vitest](https://vitest.dev/) for unit test.
To test locally, please make sure browser binaries are already installed via `npx playwright install`.

Start server before tests by following [`docs/developing-server.md`](./developing-server.md) first.

### Unit Test

```sh
yarn test
```

### E2E Test

```shell
# there are `affine-local`, `affine-migration`, `affine-local`, `affine-prototype` e2e tests,
#   which are run under different situations.
yarn workspace @affine-test/affine-local e2e
```
