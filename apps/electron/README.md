# AFFiNE Electron App

## Development

To run AFFiNE Desktop Client Application locally, run the following commands:

```sh
# in repo root
yarn install
yarn workspace @affine/native build
yarn dev

# in apps/electron
yarn generate-assets
yarn dev # or yarn prod for production build
```

## Troubleshooting

### better-sqlite3 error

When running tests or starting electron, you may encounter the following error:

> Error: The module 'apps/electron/node_modules/better-sqlite3/build/Release/better_sqlite3.node'

This is due to the fact that the `better-sqlite3` package is built for the Node.js version in Electron & in your machine. To fix this, run the following command based on different cases:

```sh
# for running unit tests, we are not using Electron's node:
yarn rebuild better-sqlite3

# for running Electron, we are using Electron's node:
yarn postinstall
```

## Credits

Most of the boilerplate code is generously borrowed from the following

- [vite-electron-builder](https://github.com/cawa-93/vite-electron-builder)
- [Turborepo basic example](https://github.com/vercel/turborepo/tree/main/examples/basic)
- [yerba](https://github.com/t3dotgg/yerba)
