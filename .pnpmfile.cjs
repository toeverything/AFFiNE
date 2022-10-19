const fs = require('fs');

function getCustomize() {
  const customed = fs.existsSync('./module-resolve.js');
  if (!customed) {
    return null;
  }
  const script = require('./module-resolve.js');
  return script && script.resolve;
}

const customize = getCustomize();

function readPackage(pkg) {
  if (!customize) {
    return pkg;
  }

  const customizedPkg = customize(pkg);

  return customizedPkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};
