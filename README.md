# Pathfinder

## Prerequisites

- Git
- Node: any 12.x version starting with v12.0.0 or greater
- Pnpm: See [how to installation](https://pnpm.io/installation)

## Development

```
pnpm dev
```

Open https://localhost:3000 in browser.


## Build

```
pnpm build
```

### Replace Modules

You can create `module-resolve.js` in project root dir to replace some package to better implements.

There is a template file in `scripts/module-resolve/module-resolve.tmpl.js`.

Example:

```
function resolve(pkg) {
  if (pkg.dependencies && pkg.dependencies['@toeverything/pathfinder-logger']) {
    pkg.dependencies['@toeverything/pathfinder-logger'] = '^0.0.1';
  }

  return pkg;
}

module.exports = {
  resolve,
};
```

***After modify/create this file, please delete the `node_modules`, then run `pnpm install` again***