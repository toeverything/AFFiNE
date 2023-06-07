#!/usr/bin/env node
import { context } from 'esbuild';

import { definePluginServerConfig } from './utils.mjs';

const plugin = await context({
  ...definePluginServerConfig('bookmark-block'),
  external: [
    // server.ts
    'cheerio',
    'electron',
    'node:url',
    'puppeteer',
    // ui.ts
    '@toeverything/plugin-infra',
    '@affine/component',
    '@blocksuite/store',
    '@blocksuite/blocks',
    'react',
    'react-dom',
  ],
});

await plugin.watch();
