# AFFiNE Electron App

## Development

To run AFFiNE Desktop Client Application locally, run the following commands:

```sh
# in repo root
yarn install
yarn dev

# in apps/electron
yarn generate-assets
yarn dev # or yarn prod for production build
```

## Troubleshooting

### Tests

Due to Electron's embedded Node.js may not be compatible with the version of Node.js used to run the tests, you need to rebuild some packages for tests to work.

For example:

```sh
yarn rebuild better-sqlite3
```

## Credits

Most of the boilerplate code is generously borrowed from the following

- [vite-electron-builder](https://github.com/cawa-93/vite-electron-builder)
- [Turborepo basic example](https://github.com/vercel/turborepo/tree/main/examples/basic)
- [yerba](https://github.com/t3dotgg/yerba)
