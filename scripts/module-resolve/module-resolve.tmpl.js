function resolve(pkg) {
  if (pkg.dependencies && pkg.dependencies['@toeverything/pathfinder-logger']) {
    pkg.dependencies['@toeverything/pathfinder-logger'] = 'latest';
  }

  return pkg;
}

module.exports = {
  resolve,
};
