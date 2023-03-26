'use strict';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const defaultExclude = require('@istanbuljs/schema/default-exclude');

module.exports = {
  exclude: [
    ...defaultExclude,
    // data-center will be removed in the future, we don't need to coverage it
    'packages/data-center/**',
  ],
};
