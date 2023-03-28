'use strict';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const defaultExclude = require('@istanbuljs/schema/default-exclude');

module.exports = {
  extends: '@istanbuljs/nyc-config-typescript',
  all: true,
  exclude: [...defaultExclude],
};
