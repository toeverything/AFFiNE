# Building AFFiNE Web

> **Warning**
> This document is not guaranteed to be up-to-date.
> If you find any outdated information, please feel free to open an issue or submit a PR.
>
> **Note**
> This guide covers building and developing the **web app**.
> For the desktop client app, see [building-desktop-client-app.md](./building-desktop-client-app.md).
> For running the server (cloud features) locally, see [developing-server.md](./developing-server.md).

## Table of Contents

- [Sign the CLA first](#sign-the-cla-first)
- [Prerequisites](#prerequisites)
- [Setup Environment](#setup-environment)
- [Start Development Server](#start-development-server)
- [Testing](#testing)
- [Linting and Type Checking](#linting-and-type-checking)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Troubleshooting](#troubleshooting)
- [Related Documents](#related-documents)

## Sign the CLA first

AFFiNE requires every contributor to sign the [Contributor License Agreement](../.github/CLA.md) before a pull request can be **merged**. The `license/cla` status check on your PR stays red — and blocks the merge — until every committer on the PR has signed. Signing takes less than a minute, so do it before (or right after) opening your first PR:

1. Open **<https://cla-assistant.io/toeverything/AFFiNE>**.
2. Sign in with your GitHub account and agree.

If you opened your PR before signing, the CLA-assistant bot will have left a comment on it with a signing link. After signing, click the **recheck** link in that same comment (or push a new commit) to refresh the check.

If `license/cla` is still red after you signed:

- **Every committer must sign.** The bot's comment lists each commit author in the PR — every name marked with :x: still needs to sign, including co-authors.
- **Your commit email must be linked to your GitHub account.** CLA assistant matches commits to GitHub users by the commit author email. Run `git log --format='%an %ae'` and make sure those emails appear in your [GitHub email settings](https://github.com/settings/emails). Otherwise, either add the email to GitHub, or rewrite the commits with the correct identity and force-push.

## Prerequisites

AFFiNE client has both **Node.js** & **Rust** toolchains.

### Node.js

Develop with the Node.js version pinned in [`.nvmrc`](../.nvmrc) (currently Node.js **22**; `package.json` requires `>=22.12.0 <23.0.0`).

The easiest way is a version manager that reads `.nvmrc`:

```sh
# with fnm (https://github.com/Schniz/fnm)
fnm use --install-if-missing

# or with nvm (https://github.com/nvm-sh/nvm)
nvm install && nvm use
```

Alternatively, install Node.js 22 (LTS) manually from <https://nodejs.org/en/download>.

### Yarn

We use modern Yarn (currently **4.x**, pinned by the `packageManager` field in `package.json`). Yarn 1 will not work. Enable it via [Corepack](https://yarnpkg.com/corepack), which ships with Node.js:

```sh
corepack enable
```

After this, `yarn` inside the repository automatically resolves to the pinned version — verify with `yarn -v` (it should print `4.x`, not `1.x`).

### Rust

Install the Rust toolchain via [rustup](https://rustup.rs/). The required version is pinned in [`rust-toolchain.toml`](../rust-toolchain.toml), and rustup installs it automatically the first time you build inside the repository.

## Setup Environment

### Clone the repository

#### Linux & macOS

```sh
git clone https://github.com/toeverything/AFFiNE
cd AFFiNE
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

### Install dependencies

```sh
yarn install
```

This also initializes the workspace (`yarn affine init`) and installs the git hooks through the `postinstall` script.

### Build Native Dependencies

Run the following script. It will build the native module at [`packages/frontend/native`](../packages/frontend/native) and build Node.js binding using [NAPI.rs](https://napi.rs/). This could take a while if you build it for the first time.

```sh
yarn affine @affine/native build
```

> Note: use `strip` from system instead of `binutils` if you are running macOS. [See problem here](https://github.com/toeverything/AFFiNE/discussions/2840)

### Build Server Dependencies

Only needed if you plan to run the local server (cloud features) or the cloud E2E suites:

```sh
yarn affine @affine/server-native build
```

## Start Development Server

```sh
yarn dev
```

You will be prompted to choose which package to run — pick **`@affine/web`** for the web app, then open **<http://localhost:8080>**.

You can skip the prompt with the `-p` (`--package`) flag:

```sh
yarn dev -p @affine/web
```

Other dev targets include `@affine/server`, `@affine/electron`, `@affine/mobile`, `@affine/admin`, `@affine/ios` and `@affine/android`.

Running `@affine/web` alone is enough for most editor and UI work — workspaces are stored locally in the browser. To work on **cloud** features (accounts, sync, collaboration, AI), run the local server as well: follow [developing-server.md](./developing-server.md).

## Testing

Adding test cases is strongly encouraged when you contribute new features and bug fixes.

We use [Vitest](https://vitest.dev/) for unit tests and [Playwright](https://playwright.dev/) for E2E tests.

### Unit Test

```sh
yarn test
```

### E2E Test

Install the browser binaries once before the first run:

```sh
npx playwright install
```

The E2E suites live in [`tests`](../tests):

| Suite                  | Run with                                               | Notes                                               |
| ---------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| `affine-local`         | `yarn workspace @affine-test/affine-local e2e`         | Web app, no server needed                           |
| `affine-cloud`         | `yarn workspace @affine-test/affine-cloud e2e`         | Requires the [local server](./developing-server.md) |
| `affine-cloud-copilot` | `yarn workspace @affine-test/affine-cloud-copilot e2e` | Requires the local server                           |
| `affine-desktop`       | `yarn workspace @affine-test/affine-desktop e2e`       | Desktop (Electron) app                              |
| `affine-desktop-cloud` | `yarn workspace @affine-test/affine-desktop-cloud e2e` | Desktop + local server                              |
| `affine-mobile`        | `yarn workspace @affine-test/affine-mobile e2e`        | Mobile UI                                           |

There is also `@affine-test/blocksuite` (`yarn workspace @affine-test/blocksuite test`) for BlockSuite integration tests.

## Linting and Type Checking

CI runs these checks on every PR — running them locally first saves you a review round trip:

```sh
# lint (oxlint) + format check (oxfmt)
yarn lint

# auto-fix lint & format issues
yarn lint:fix

# TypeScript type check
yarn typecheck
```

## Submitting a Pull Request

1. Make sure you have [signed the CLA](#sign-the-cla-first).
2. Fork the repository and create your branch from **`canary`** (the default development branch).
3. Make your changes. Add or update tests where it makes sense, and run `yarn lint`, `yarn typecheck` and the relevant test suites locally.
4. Open the PR against the `canary` branch of `toeverything/AFFiNE`.
5. Give the PR a title that follows [Conventional Commits](https://www.conventionalcommits.org/) — this is enforced by the `PR Title Lint` CI check:

   ```text
   type(scope): short description

   # examples
   fix(editor): keep text selection after paste
   feat(core): add custom icons for folders
   docs: update building guide
   ```

   - **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
   - **Scopes** (optional; if present, must be one of): `admin`, `electron`, `server`, `core`, `web`, `mobile`, `ios`, `android`, `mobile-native`, `docs`, `component`, `env`, `graphql`, `hooks`, `i18n`, `native`, `templates`, `debug`, `nbstore`, `infra`, `editor`, `tools`, `y-octo`, `client`

6. Your PR can be merged once:
   - the **`license/cla`** check is green — every committer has signed the CLA;
   - CI passes — build & tests, PR title lint;
   - a maintainer has reviewed and approved it. Reviewers are assigned automatically, and an automated reviewer may also leave comments — please address or answer them.

## Troubleshooting

- **`yarn install` fails or complains about the Node/Yarn version** — check that `node -v` matches [`.nvmrc`](../.nvmrc) (`fnm use` / `nvm use`) and that Corepack is enabled (`yarn -v` should print `4.x`, not `1.x`).
- **Native module fails to build on macOS** — make sure `strip` is the system one, not the one from `binutils` ([details](https://github.com/toeverything/AFFiNE/discussions/2840)).
- **`EPERM: operation not permitted, symlink` on Windows** — enable Developer Mode and symlinks before cloning; see [Windows](#windows).
- **App fails to start after pulling the latest `canary`** — dependencies or Rust bindings may have changed: re-run `yarn install` and `yarn affine @affine/native build`.
- **Playwright can't find browsers** — run `npx playwright install`.
- **The `license/cla` check stays red** — see [Sign the CLA first](#sign-the-cla-first).

## Related Documents

- [developing-server.md](./developing-server.md) — run the AFFiNE server locally (cloud features)
- [building-desktop-client-app.md](./building-desktop-client-app.md) — build the desktop (Electron) client
- [contributing/tutorial.md](./contributing/tutorial.md) — a walkthrough of the codebase
- [types-of-contributions.md](./types-of-contributions.md) — ways to contribute beyond code
- [issue-triaging.md](./issue-triaging.md) — how issues are triaged
- [contributing/releases.md](./contributing/releases.md) — how releases are cut
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
