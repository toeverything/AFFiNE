# Building AFFiNE

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup Environment](#setup-environment)
- [Play with Playground](#play-with-playground)
- [Testing](#testing)

## Prerequisites

We suggest develop our product under node.js LTS(Long-term support) version

### Option 1: Manually install node.js

install [Node LTS version](https://nodejs.org/en/download)

> Up to now, the major node.js version is 18.x

### Option 2: Use node version manager

install [nvm](https://github.com/nvm-sh/nvm)

```sh
nvm install --lts
nvm use --lts
```

## Setup Environment

```sh
# install dependencies
pnpm install
```

## Play with Playground

```sh
pnpm dev
```

The playground page should work at [http://localhost:8080/](http://localhost:8080/)

## Testing

Adding test cases is strongly encouraged when you contribute new features and bug fixes.

We use [Playwright](https://playwright.dev/) for E2E test, and [vitest](https://vitest.dev/) for unit test.

To test locally, please make sure browser binaries are already installed via `npx playwright install`. Then there are multi commands to choose from:

```sh
# run tests in headless mode in another terminal window
pnpm test
```
