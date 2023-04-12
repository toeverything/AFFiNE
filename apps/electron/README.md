# AFFiNE Electron App

# ⚠️ NOTE ⚠️

Due to PNPM related issues, this project is currently using **yarn 3**.
See https://github.com/electron/forge/issues/2633

## Development

```
# in project root, start web app at :8080
yarn dev

# build octobase-node
yarn workspace @affine/octobase-node build

# in /apps/electron, start electron app
yarn dev
```

## Credits

Most of the boilerplate code is generously borrowed from the following

- [vite-electron-builder](https://github.com/cawa-93/vite-electron-builder)
- [Turborepo basic example](https://github.com/vercel/turborepo/tree/main/examples/basic)
- [yerba](https://github.com/t3dotgg/yerba)
