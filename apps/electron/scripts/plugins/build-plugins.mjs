#!/usr/bin/env node
import { build } from 'esbuild';

import { definePluginServerConfig } from './utils.mjs';

await build({
  ...definePluginServerConfig('bookmark-block'),
  external: [
    // server.ts
    'cheerio',
    'electron',
    'node:url',
    // ui.ts
    '@toeverything/plugin-infra',
    '@affine/component',
    '@blocksuite/store',
    '@blocksuite/blocks',
    'react',
    'react-dom',
  ],
});
