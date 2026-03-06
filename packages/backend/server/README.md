# Server

## Get started

### Install dependencies

```bash
yarn
```

### Build Native binding

```bash
yarn affine @affine/server-native build
```

### Run tests

`yarn test`, `yarn test:copilot`, and `yarn e2e` will automatically build the
native binding before running AVA.

If you need to build it manually, run:

```bash
yarn affine @affine/server-native build
```

### Run server

```bash
yarn dev
```

now you can access the server GraphQL endpoint at http://localhost:3000/graphql
