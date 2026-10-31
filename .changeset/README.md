# Changesets

This directory holds [Changesets](https://github.com/changesets/changesets) for
the published `@blocksuite/*` packages. Everything else in the monorepo is
private and is not versioned here.

All `@blocksuite/*` packages form one **fixed group**: they always share the
same version number, so a changeset for any one of them bumps all of them.

## Adding a changeset

```sh
yarn changeset
```

Pick any `@blocksuite/*` package (the whole group is bumped anyway), choose the
bump type, and describe the change for the changelog. Commit the generated
`.changeset/*.md` file with your PR.

## Release flow

See [`blocksuite/RELEASING.md`](../blocksuite/RELEASING.md).
