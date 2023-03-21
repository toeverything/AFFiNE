# Building AFFiNE Web

> **Note**
> For developing & building desktop client app, please refer to [building-desktop-client-app.md](./building-desktop-client-app.md)

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup Environment](#setup-environment)
- [Start Development Server](#start-development-server)
- [Testing](#testing)

## Prerequisites

We suggest develop our product under node.js LTS(Long-term support) version

### Option 1: Manually install node.js

install [Node LTS version](https://nodejs.org/en/download)

> Up to now, the major node.js version is 18.x

### Option 2: Use node version manager

install [nvm](https://github.com/nvm-sh/nvm)

```sh
nvm install 18
nvm use 18
```

## Setup Environment

```sh
# install dependencies
yarn install
```

## Start Development Server

### Option 1: Local OctoBase

```shell
# Run OctoBase container in background
docker pull ghcr.io/toeverything/cloud:nightly-latest
docker run --env=SIGN_KEY=test123 --env=RUST_LOG=debug --env=JWST_DEV=1 --env=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin --workdir=/app -p 3000:3000 --runtime=runc -d ghcr.io/toeverything/cloud:nightly-latest
```

```shell
# Run AFFiNE Web in development mode
yarn dev:local
```

### Option 2: Remote OctoBase

```shell
yarn dev
```

you might need set environment variables in `.env.local` file.
See our [template](../apps/web/.env.local.template).

Then, the playground page should work at [http://localhost:8080/](http://localhost:8080/)

For more details, see [apps/web/README.md](../apps/web/README.md)

## Testing

> Local OctoBase is required for testing. Otherwise, the affine part of the tests will fail.

Adding test cases is strongly encouraged when you contribute new features and bug fixes.

We use [Playwright](https://playwright.dev/) for E2E test, and [vitest](https://vitest.dev/) for unit test.

To test locally, please make sure browser binaries are already installed via `npx playwright install`. Then there are multi commands to choose from:

```sh
# run tests in headless mode in another terminal window
yarn test
```
