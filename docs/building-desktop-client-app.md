# Building AFFiNE Desktop Client App

> This document focuses on the current desktop packaging flow, especially signed macOS DMG generation with signing data kept on a local Mac instead of stored in GitHub.

## Table of Contents

- [What gets built](#what-gets-built)
- [Prerequisites](#prerequisites)
- [Local desktop build](#local-desktop-build)
- [Recommended signed macOS DMG flow](#recommended-signed-macos-dmg-flow)
- [Set up a local self-hosted macOS runner](#set-up-a-local-self-hosted-macos-runner)
- [Keep signing data local on the runner](#keep-signing-data-local-on-the-runner)
- [Trigger the signed DMG workflow](#trigger-the-signed-dmg-workflow)
- [Standalone local scripts](#standalone-local-scripts)
- [Outputs and verification](#outputs-and-verification)

## What gets built

AFFiNE Desktop is an Electron app that depends on three build parts:

1. `packages/frontend/core`: the web application
2. `packages/frontend/native`: the Rust native module
3. `packages/frontend/apps/electron`: the Electron shell and packager

The release workflows that build desktop artifacts live in:

- `/.github/workflows/release.yml`
- `/.github/workflows/release-desktop.yml`
- `/.github/workflows/release-desktop-platform.yml`

The macOS signing and notarization behavior is driven by:

- `packages/frontend/apps/electron/forge.config.mjs`
- the runtime environment of the macOS runner that performs the signing job

## Prerequisites

Before building desktop artifacts, make sure you have:

- Node.js 22
- Corepack enabled
- Rust toolchain installed
- Xcode command line tools installed on macOS

You can use the repository's pinned Node version:

```bash
fnm use
corepack enable
```

Install dependencies:

```bash
yarn install
```

Build the native module:

```bash
yarn affine @affine/native build
```

## Local desktop build

Use this path when you only need a local desktop package and do not need formal Apple signing.

### 1. Build Electron layers and web assets

```bash
BUILD_TYPE=canary yarn affine @affine/electron build
BUILD_TYPE=canary RELEASE_VERSION=$(node -p 'require("./packages/frontend/apps/electron/package.json").version') yarn affine @affine/electron generate-assets
```

### 2. Reconfigure Yarn for Electron packaging

```bash
yarn config set nmMode classic
yarn config set nmHoistingLimits workspaces
yarn install
```

### 3. Make the desktop package

For macOS:

```bash
BUILD_TYPE=canary SKIP_WEB_BUILD=1 HOIST_NODE_MODULES=1 yarn affine @affine/electron make --platform=darwin --arch=arm64
```

For Linux:

```bash
BUILD_TYPE=canary SKIP_WEB_BUILD=1 HOIST_NODE_MODULES=1 yarn affine @affine/electron make --platform=linux --arch=x64
```

The generated desktop artifacts are written under:

```text
packages/frontend/apps/electron/out/<build-type>/make
```

## Recommended signed macOS DMG flow

If you do not want Apple signing data stored in GitHub, the recommended flow is:

1. keep the signing certificate in the local macOS keychain
2. keep `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, and optionally `APPLE_CODESIGN_IDENTITY` in the local runner environment
3. register your Mac as a GitHub self-hosted runner with a custom label
4. trigger the existing `Release` workflow manually
5. route the macOS job to your local runner and use `local-runner-env` signing mode

This gives you:

- the existing release workflow and artifact pipeline
- local-only Apple signing data
- no Apple signing secrets stored in GitHub Actions secrets

## Set up a local self-hosted macOS runner

### Quick start with the helper script

If you want a one-shot local setup flow, use the helper script at repository root:

```bash
./setup-local-macos-runner.sh
```

The script is now designed for zero hand-editing in the common case.

After you run it, it will prompt you interactively for:

- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

If the local login keychain does not already contain a `Developer ID Application` certificate, the script will also ask whether you want to import a `.p12` file and then prompt for the `.p12` path and password.

Defaults already baked into the script:

- repository: `toeverything/AFFiNE`
- runner label: `affine-macos-signing`
- runner directory: `$HOME/actions-runner-affine`
- local keychain path: `~/Library/Keychains/login.keychain-db`

If the `Developer ID Application` certificate is already in the local login keychain, keep `P12_FILE` empty and the script will reuse the existing identity.

The script will:

1. collect Apple notarization inputs interactively
2. install `gh` with Homebrew when possible and you approve it
3. log in with `gh auth login` when needed
4. fetch the GitHub Actions runner automatically, or open the runner page and ask you to paste the runner values manually
5. run `config.sh`
6. optionally import a `.p12` certificate into the local login keychain
7. write the runner-local `.env`
8. optionally validate `notarytool`
9. run `svc.sh install` and `svc.sh start`
10. optionally trigger the `Release` workflow for a signed macOS DMG immediately after runner setup

If `gh` is installed and already authenticated, the script will try to fetch the runner download URL and registration token automatically. If the current GitHub account/token does not have repository runner API permission and returns errors such as HTTP 403, the script will automatically fall back to opening the GitHub runner page and asking you to paste the runner values manually.

### 1. Open the runner page in GitHub

1. Open the GitHub repository.
2. Click `Settings`.
3. Click `Actions`.
4. Click `Runners`.
5. Click `New self-hosted runner`.
6. Choose macOS.

GitHub will show you the exact download and registration commands for your repository.

### 2. Install the runner on your Mac

Run the commands GitHub shows you in a dedicated directory on your Mac.

When GitHub shows the `config.sh` command, give the runner a custom label dedicated to desktop signing. Recommended label:

```text
affine-macos-signing
```

Example shape:

```bash
./config.sh --url https://github.com/OWNER/REPO --token YOUR_TOKEN --labels affine-macos-signing
```

Notes:

- the runner also keeps GitHub's default labels such as `self-hosted`, `macOS`, and `ARM64` or `x64`
- prefer an Apple Silicon Mac if you want the existing workflow matrix to build both `arm64` and `x64`

### 3. Install the runner as a service

Inside the runner directory, install and start the service:

```bash
./svc.sh install
./svc.sh start
```

If you later change the runner environment, restart it:

```bash
./svc.sh stop
./svc.sh start
```

## Keep signing data local on the runner

This is the core requirement for the local-only signing model.

### What stays local

For the macOS signing job, keep these values only on the Mac that hosts the self-hosted runner:

- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`
- `APPLE_CODESIGN_IDENTITY` (recommended)
- the `Developer ID Application` certificate in the local keychain

### What can still remain in GitHub

The current release workflow still uses GitHub-hosted jobs for some non-signing steps, such as web asset preparation. Those jobs can continue using non-Apple secrets already present in GitHub, such as Sentry-related values.

If you also want to migrate non-Apple secrets off GitHub, that is a separate workflow change and is not required for local-only Apple signing.

### 1. Import the signing certificate into the local keychain

On the Mac that runs the self-hosted runner:

1. Open `Keychain Access`.
2. Select the `login` keychain.
3. Import or verify the certificate whose name starts with `Developer ID Application:`.
4. Double-check that the private key is present together with the certificate.

You can verify the identity from Terminal:

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

### 2. Generate the Apple app-specific password

1. Open [account.apple.com](https://account.apple.com/).
2. Sign in with the Apple account used for notarization.
3. Make sure two-factor authentication is enabled.
4. In `Sign-In and Security`, click `App-Specific Passwords`.
5. Click `Generate an app-specific password`.
6. Enter a label such as `AFFiNE local runner notarization`.
7. Copy the generated password immediately.

### 3. Find the Team ID

1. Open [developer.apple.com](https://developer.apple.com/).
2. Sign in.
3. Click `Account`.
4. Click `Membership`.
5. Copy the `Team ID` shown in membership details.

### 4. Create the runner-local environment file

In the root directory of the self-hosted runner installation, create a file named:

```text
.env
```

Add the Apple signing values there in `KEY=VALUE` format:

```bash
APPLE_ID=your-apple-account@example.com
APPLE_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=ABCDE12345
APPLE_CODESIGN_IDENTITY=Developer ID Application: YOUR COMPANY NAME (ABCDE12345)
```

If you also need additional local-only variables for the runner, add them to the same `.env` file.

After editing `.env`, restart the runner service:

```bash
./svc.sh stop
./svc.sh start
```

### 5. Optional: keep a stable PATH for the runner service

If your runner service does not see the same PATH as your login shell, also make sure the runner environment contains a stable PATH. For example, you can add this to the runner `.env` file:

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin
```

## Trigger the signed DMG workflow

If you say yes when `setup-local-macos-runner.sh` asks whether it should trigger the release workflow now, the script can submit the macOS signed DMG release for you automatically.

If you prefer to trigger it later or manually, the repository supports choosing both:

- which runner label handles the macOS build
- where Apple signing data comes from

### Workflow inputs to use

1. Open the repository on GitHub.
2. Click `Actions`.
3. Click `Release`.
4. Click `Run workflow`.
5. Choose the branch you want to release from.
6. Set the inputs as follows when you want local-only Apple signing:
   - `Desktop - macOS` = `true`
   - `Desktop - Windows` = `false` if you only want macOS
   - `Desktop - Linux` = `false` if you only want macOS
   - `desktop_macos_runner` = `affine-macos-signing`
   - `desktop_macos_signing_mode` = `local-runner-env`
7. Click `Run workflow`.

### What these two new inputs mean

- `desktop_macos_runner`
  - routes the macOS build job to the runner label you control locally
  - use your custom label such as `affine-macos-signing`

- `desktop_macos_signing_mode`
  - `github-secrets`: legacy mode, Apple signing data comes from GitHub secrets
  - `local-runner-env`: local-only mode, Apple signing data comes from the self-hosted runner environment and local keychain

### What the workflow now does in local-runner-env mode

For the macOS release job, the workflow now:

1. skips importing Apple signing credentials from GitHub secrets
2. uses `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, and `APPLE_CODESIGN_IDENTITY` already present on the runner
3. resolves the signing identity from the keychain if you did not set `APPLE_CODESIGN_IDENTITY`
4. signs the DMG
5. staples app and DMG
6. validates the final artifacts before uploading them

## Standalone local scripts

If you do not want to route through the GitHub `Release` workflow at all, two helper scripts exist at repository root:

- `build-dmg.sh`: interactive local flow
- `build-dmg-ci.sh`: non-interactive local/CI flow

### Interactive local flow

```bash
./build-dmg.sh
```

This path is useful when:

- you are building on a local Mac
- your signing certificate already exists in your keychain
- you prefer prompts over preloaded environment variables

### Non-interactive local flow

```bash
APPLE_ID="..." \
APPLE_PASSWORD="..." \
APPLE_TEAM_ID="..." \
APPLE_CODESIGN_IDENTITY="Developer ID Application: YOUR COMPANY NAME (TEAMID1234)" \
./build-dmg-ci.sh
```

Use this path when:

- you want to stay entirely outside GitHub Actions
- you want a fully scripted signed DMG build
- all signing data should stay on the local machine

If you want the script to import a `.p12` dynamically instead of using an already-installed keychain certificate, you may still provide:

- `APPLE_CERT_P12_BASE64`
- `APPLE_CERT_P12_PASSWORD`
- `KEYCHAIN_PASSWORD`

That path is optional. For the local-only runner model, the simpler and safer approach is usually to keep the certificate installed in the local keychain and not pass the `.p12` around on every run.

## Outputs and verification

### Where the GitHub release pipeline uploads artifacts

The macOS artifacts are uploaded as GitHub Actions artifacts and later included in the GitHub release bundle.

The filenames follow this pattern:

```text
affine-<version>-<build-type>-macos-arm64.dmg
affine-<version>-<build-type>-macos-x64.dmg
```

### What the workflow validates before upload

The macOS release pipeline validates:

- the `.app` exists
- the `.dmg` exists
- the DMG container is signed
- the app is stapled
- the DMG is stapled
- `spctl` accepts the app
- `stapler validate` succeeds for both app and DMG

### Local verification commands

If you want to verify a generated DMG manually on macOS:

```bash
codesign -dv --verbose=4 /path/to/AFFiNE.dmg
xcrun stapler validate /path/to/AFFiNE.dmg
spctl -a -t open --context context:primary-signature -vv /path/to/AFFiNE.dmg
```
