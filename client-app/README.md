# Client App

AFFiNE App client powered by Tauri.

## Quick Start

Please follow the Tauri [getting started guide](https://tauri.app/v1/guides/getting-started/setup/) for environment setup.

After the environment is ready, start development build:

```sh
pnpm tauri dev
```

## Development

Currently client-app depends on a rapidly developing rust library "Octobase", we use git-submodule to link it currently.

We will provide its binary binding soon, to replace the git-submodule, before Octobase become opensource.

### Scripts

On this folder:

- `pnpm dev:app` will start a vite server
- `pnpm build:prerequisite` will link the Octobase and prepare affine dist html and tauri preload script

On project root folder:

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
