# Bump Blocksuite

```shell
pnpm update:core
```

## Understand the version number

### Stable

You can see all the stable version tags [here](https://github.com/toeverything/blocksuite/tags).

### Nightly

If it's nightly version, the version will follow `${version}-${date}-${hash}`.

For example, `0.4.0-20230203030233-b22bea7` means that
the version is based on `0.4.0`, the building date is `20230203030233`,
and the commit hash is `b22bea7`.

> For the source code, see [here](https://github.com/toeverything/set-build-version/blob/master/src/version.ts)

Using this version format, you can easily check the diff between each version.

For example, the diff from old version `0.4.0-20230201063624-4e0463b` to new version `0.4.0-20230203030233-b22bea7`
is <https://github.com/toeverything/blocksuite/compare/4e0463b...b22bea7>.

## Fix the breaking change

You can follow this file to keep updated:

https://github.com/toeverything/blocksuite/blob/master/packages/playground/src/main.ts
