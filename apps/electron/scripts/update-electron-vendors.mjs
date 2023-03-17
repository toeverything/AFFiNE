/**
 * This script should be run in electron context
 * @example
 *  ELECTRON_RUN_AS_NODE=1 electron scripts/update-electron-vendors.mjs
 */

import { writeFileSync } from 'fs';

const electronRelease = process.versions;

const node = electronRelease.node.split('.')[0];
const chrome = electronRelease.v8.split('.').splice(0, 2).join('');

writeFileSync(
  './electron-vendors.autogen.json',
  JSON.stringify({ chrome, node })
);
