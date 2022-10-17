# Pathfinder

## Build

### Replace Modules
You can create `module-resolve.js` in project root dir to replace some package to better implements. Example:

```
function resolve(pkg) {
  if (pkg.dependencies && pkg.dependencies['@toeverything/track']) {
    pkg.dependencies['@toeverything/track'] = '^0.0.1';
  }

  return pkg;
}

module.exports = {
  resolve,
};
```

***After modify/create this file, please delete the `node_modules`, then run `pnpm install` again***