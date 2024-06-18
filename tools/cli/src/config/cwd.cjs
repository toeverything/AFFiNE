// @ts-check

const { join } = require('node:path');

const projectRoot = join(__dirname, '../../../..');

module.exports.projectRoot = projectRoot;

/**
 *
 * @param {string | undefined} distribution
 * @returns string
 */
module.exports.getCwdFromDistribution = function getCwdFromDistribution(
  distribution
) {
  switch (distribution) {
    case 'browser':
    case undefined:
    case null:
      return join(projectRoot, 'packages/frontend/web');
    case 'desktop':
      return join(projectRoot, 'packages/frontend/electron/renderer');
    case 'admin':
      return join(projectRoot, 'packages/frontend/admin');
    default: {
      throw new Error('DISTRIBUTION must be one of browser, desktop');
    }
  }
};
