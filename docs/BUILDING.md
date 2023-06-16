# Building AFFiNE Web

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

install [nvm](https://github.com/nvm-sh/nvm)

```sh
nvm install 18
nvm use 18
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

```
yarn workspace @affine/native build
```

## Debugging the Electron App 

You need to run two scripts to run the app in development mode

Firstly, run the web app which is served at :8080
```
yarn dev # you may want to chose `dev - 100.84.105.99:11001` when selecting the dev server 
```

Secondly, bring up the electron app

```
yarn workspace @affine/electron dev
```

If everything goes well, you should see the AFFiNE App window popping up in a few seconds. 🎉

## Testing

Adding test cases is strongly encouraged when you contribute new features and bug fixes.

We use [Playwright](https://playwright.dev/) for E2E test, and [vitest](https://vitest.dev/) for unit test.
To test locally, please make sure browser binaries are already installed via `npx playwright install`.
Also make sure you have built the `@affine/web` workspace before running E2E tests.

```sh
yarn  build
# run tests in headless mode in another terminal window
yarn test
```

## Troubleshooting

> I ran `yarn start -p 8080` after `yarn build` but the index page returned 404.

Try stopping your development server (initialized by `yarn dev:local` or something) and running `yarn build` again.
