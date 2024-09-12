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
    case 'web':
    case undefined:
    case null:
      return join(projectRoot, 'packages/frontend/apps/web');
    case 'desktop':
      return join(projectRoot, 'packages/frontend/apps/electron/renderer');
    case 'admin':
      return join(projectRoot, 'packages/frontend/admin');
    case 'mobile':
      return join(projectRoot, 'packages/frontend/apps/mobile');
    default: {
      throw new Error(
        'DISTRIBUTION must be one of web, desktop, admin, mobile'
      );
    }
  }
};
