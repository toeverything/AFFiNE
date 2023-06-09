#!/usr/bin/env node
import { context } from 'esbuild';

import { definePluginServerConfig } from './utils.mjs';

const plugin = await context({
  ...definePluginServerConfig('bookmark-block'),
  external: [
    // server.ts
    'link-preview-js',
    // ui.ts
    '@toeverything/plugin-infra',
    '@affine/component',
    '@blocksuite/store',
    '@blocksuite/blocks',
    'react',
    'react-dom',
    'foxact',
  ],
});

await plugin.watch();
